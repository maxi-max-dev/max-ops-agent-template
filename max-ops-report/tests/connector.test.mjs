import assert from "node:assert/strict";
import test from "node:test";
import { FeishuBaseDirectAdapter, isoToEpochMilliseconds } from "../adapters/feishu-base-direct.mjs";
import { WebhookWriteAdapter } from "../adapters/webhook-write.mjs";
import { createEvent } from "../lib/contract.mjs";
import { DEFAULT_FIELDS } from "../lib/config.mjs";
import { run } from "../scripts/maxops.mjs";
import { directConfig, directEnv, makeFeishuFixture } from "./helpers.mjs";

function seedTask(fixture, instanceId, taskId, title) {
  return fixture.seed("tbl_tasks", {
    [DEFAULT_FIELDS.instanceId]: instanceId,
    [DEFAULT_FIELDS.taskId]: taskId,
    [DEFAULT_FIELDS.taskTitle]: title,
    [DEFAULT_FIELDS.taskStatus]: "进行中",
  });
}

test("Direct time serializer accepts real ISO instants and rejects invalid calendar values", () => {
  assert.equal(isoToEpochMilliseconds("2026-08-31T01:02:03.456Z"), Date.parse("2026-08-31T01:02:03.456Z"));
  assert.equal(isoToEpochMilliseconds("2026-08-31T11:02:03.456+10:00"), Date.parse("2026-08-31T11:02:03.456+10:00"));
  assert.throws(() => isoToEpochMilliseconds("2026-02-30T01:02:03.000Z"), (error) => error.code === "INVALID_TIME" && /invalid calendar/.test(error.message));
  assert.throws(() => isoToEpochMilliseconds("2026-08-31T01:02:03"), (error) => error.code === "INVALID_TIME" && /explicit timezone/.test(error.message));
});

test("direct adapter scopes task reads and idempotency to each copied instance", async () => {
  const fixture = makeFeishuFixture();
  seedTask(fixture, "copy-alpha", "task-shared-name", "Alpha task");
  seedTask(fixture, "copy-beta", "task-shared-name", "Beta task");
  seedTask(fixture, "copy-beta", "task-beta-only", "Beta only");

  const alpha = new FeishuBaseDirectAdapter(directConfig("copy-alpha"), { fetchImpl: fixture.fetchImpl });
  const beta = new FeishuBaseDirectAdapter(directConfig("copy-beta"), { fetchImpl: fixture.fetchImpl });
  assert.equal((await alpha.readTask("task-shared-name")).title, "Alpha task");
  assert.equal((await beta.readTask("task-shared-name")).title, "Beta task");
  await assert.rejects(alpha.readTask("task-beta-only"), (error) => error.code === "TASK_IDENTITY_MISMATCH");

  const common = {
    agentId: "test-agent",
    agentName: "Test Agent",
    runId: "test-agent:run-copy",
    taskId: "task-shared-name",
    kind: "run_started",
    title: "Started",
    detail: "Scoped start",
    occurredAt: "2026-08-31T01:02:03.456Z",
  };
  await alpha.writeEvent(createEvent({ ...common, instanceId: "copy-alpha" }), "shared-key:start:001");
  await beta.writeEvent(createEvent({ ...common, instanceId: "copy-beta" }), "shared-key:start:001");
  assert.equal(fixture.table("tbl_events").length, 2);
  assert.equal(fixture.table("tbl_events")[0].fields.occurred_at, Date.parse(common.occurredAt));
  assert.equal(typeof fixture.table("tbl_events")[0].fields.occurred_at, "number");
  assert.deepEqual(new Set(fixture.table("tbl_events").map((row) => row.fields.instance_id)), new Set(["copy-alpha", "copy-beta"]));
});

test("direct adapter replays identical idempotency keys once and rejects changed payloads", async () => {
  const fixture = makeFeishuFixture();
  seedTask(fixture, "copy-alpha", "task-1", "Replay task");
  const env = directEnv("copy-alpha");
  const args = ["progress", "--task", "task-1", "--run", "test-agent:run-1", "--title", "Progress", "--detail", "Same logical work", "--key", "test-agent:progress:001"];

  const first = await run(args, { env, fetchImpl: fixture.fetchImpl });
  const replay = await run(args, { env, fetchImpl: fixture.fetchImpl });
  assert.equal(first.duplicate, false);
  assert.equal(replay.duplicate, true);
  assert.equal(fixture.table("tbl_events").length, 1);

  await assert.rejects(
    run(["progress", "--task", "task-1", "--run", "test-agent:run-1", "--title", "Progress", "--detail", "Changed payload", "--key", "test-agent:progress:001"], { env, fetchImpl: fixture.fetchImpl }),
    (error) => error.code === "IDEMPOTENCY_CONFLICT",
  );
  assert.equal(fixture.table("tbl_events").length, 1);
});

test("wrong task identity is rejected before a direct event write", async () => {
  const fixture = makeFeishuFixture();
  seedTask(fixture, "copy-alpha", "task-allowed", "Allowed");
  await assert.rejects(
    run(["start", "--task", "task-wrong", "--run", "test-agent:run-1", "--title", "Start", "--detail", "Wrong task", "--key", "test-agent:start:wrong"], {
      env: directEnv("copy-alpha"),
      fetchImpl: fixture.fetchImpl,
    }),
    (error) => error.code === "TASK_IDENTITY_MISMATCH",
  );
  assert.equal(fixture.table("tbl_events").length, 0);
});

test("status-request remains a question event and never updates the task row", async () => {
  const fixture = makeFeishuFixture();
  const task = seedTask(fixture, "copy-alpha", "task-status", "Status task");
  const before = structuredClone(task.fields);
  const result = await run([
    "status-request",
    "--task", "task-status",
    "--run", "test-agent:run-status",
    "--from", "进行中",
    "--to", "待验收",
    "--detail", "Implementation is verified.",
    "--key", "run-status:proposal:01",
  ], { env: directEnv("copy-alpha"), fetchImpl: fixture.fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(fixture.table("tbl_events")[0].fields.kind, "question");
  assert.match(fixture.table("tbl_events")[0].fields.detail, /Agent proposal only/);
  assert.deepEqual(task.fields, before);
});

test("finish with an artifact writes two independently idempotent events", async () => {
  const fixture = makeFeishuFixture();
  seedTask(fixture, "copy-alpha", "task-finish", "Finish task");
  const args = [
    "finish",
    "--task", "task-finish",
    "--run", "test-agent:run-finish",
    "--title", "Finished",
    "--detail", "Verified",
    "--artifact", "https://artifacts.example.test/final",
    "--artifact-key", "run-finish:artifact:01",
    "--finish-key", "run-finish:finish:001",
  ];
  await run(args, { env: directEnv("copy-alpha"), fetchImpl: fixture.fetchImpl });
  await run(args, { env: directEnv("copy-alpha"), fetchImpl: fixture.fetchImpl });
  const events = fixture.table("tbl_events");
  assert.equal(events.length, 2);
  assert.equal(events[0].fields.kind, "artifact");
  assert.equal(events[0].fields.artifact_url, "https://artifacts.example.test/final");
  assert.equal(events[0].fields.status, "pending_review");
  assert.equal(events[1].fields.kind, "run_finished");
  assert.equal("artifact_url" in events[1].fields, false);
});

test("direct adapter rejects an event from a different configured Agent identity", async () => {
  const fixture = makeFeishuFixture();
  seedTask(fixture, "copy-alpha", "task-allowed", "Allowed");
  const adapter = new FeishuBaseDirectAdapter(directConfig("copy-alpha"), { fetchImpl: fixture.fetchImpl });
  const foreign = createEvent({
    instanceId: "copy-alpha",
    taskId: "task-allowed",
    agentId: "other-agent",
    agentName: "Other Agent",
    runId: "other-agent:run-1",
    kind: "progress",
    title: "Foreign",
    detail: "Must fail",
  });
  await assert.rejects(adapter.writeEvent(foreign, "other-agent:progress:1"), (error) => error.code === "TASK_IDENTITY_MISMATCH");
  assert.equal(fixture.table("tbl_events").length, 0);
});

test("direct adapter refuses to write configured connection values into Base fields", async () => {
  const fixture = makeFeishuFixture();
  seedTask(fixture, "copy-alpha", "task-allowed", "Allowed");
  const config = directConfig("copy-alpha");
  const adapter = new FeishuBaseDirectAdapter(config, { fetchImpl: fixture.fetchImpl });
  const leaking = createEvent({
    instanceId: "copy-alpha",
    taskId: "task-allowed",
    agentId: "test-agent",
    agentName: "Test Agent",
    runId: "test-agent:run-1",
    kind: "progress",
    title: "Must fail",
    detail: config.appSecret,
  });
  await assert.rejects(adapter.writeEvent(leaking, "test-agent:leak:001"), (error) => error.code === "SECRET_EGRESS");
  assert.equal(fixture.calls.length, 0);
  assert.equal(fixture.table("tbl_events").length, 0);
});

test("direct adapter fails closed on invalid event time before any Feishu request", async () => {
  const fixture = makeFeishuFixture();
  seedTask(fixture, "copy-alpha", "task-allowed", "Allowed");
  const adapter = new FeishuBaseDirectAdapter(directConfig("copy-alpha"), { fetchImpl: fixture.fetchImpl });
  const invalid = createEvent({
    instanceId: "copy-alpha",
    taskId: "task-allowed",
    agentId: "test-agent",
    agentName: "Test Agent",
    runId: "test-agent:run-invalid-time",
    kind: "progress",
    title: "Invalid time",
    detail: "Must fail",
    occurredAt: "2026-02-30T01:02:03.000Z",
  });
  await assert.rejects(adapter.writeEvent(invalid, "test-agent:invalid-time:001"), (error) => error.code === "INVALID_TIME");
  assert.equal(fixture.calls.length, 0);
  assert.equal(fixture.table("tbl_events").length, 0);
});

test("feishu_base_direct completes start through feedback ack and receipt", async () => {
  const fixture = makeFeishuFixture();
  const env = directEnv("copy-alpha");
  seedTask(fixture, "copy-alpha", "task-42", "Full chain");
  const context = ["--task", "task-42", "--run", "test-agent:run-42"];
  const acknowledgementTime = 1_788_137_723_456;

  const connected = await run(["connect", ...context], { env, fetchImpl: fixture.fetchImpl });
  assert.equal(connected.connected, true);
  assert.equal(connected.task.task_id, "task-42");
  assert.equal("record_id" in connected.task, false);

  await run(["start", ...context, "--title", "Started", "--detail", "Read scope", "--key", "run-42:start:0001"], { env, fetchImpl: fixture.fetchImpl });
  await run(["progress", ...context, "--title", "Progress", "--detail", "Implemented", "--key", "run-42:progress:01"], { env, fetchImpl: fixture.fetchImpl });
  await run(["blocked", ...context, "--title", "Decision", "--detail", "Need input", "--question", "Which option?", "--key", "run-42:blocked:001", "--question-key", "run-42:question:01"], { env, fetchImpl: fixture.fetchImpl });
  await run(["artifact", ...context, "--title", "Artifact", "--detail", "Result ready", "--artifact", "https://artifacts.example.test/result", "--key", "run-42:artifact:001"], { env, fetchImpl: fixture.fetchImpl });

  const feedback = fixture.seed("tbl_feedback", {
    instance_id: "copy-alpha",
    message_id: "message-42",
    task_id: "task-42",
    agent_id: "test-agent",
    run_id: "test-agent:run-42",
    reply: "Use option A",
    status: "已回复",
    replied_at: "2026-08-31T01:02:03.000Z",
  });
  const localizedInbox = await run(["inbox", ...context], { env, fetchImpl: fixture.fetchImpl });
  assert.equal(localizedInbox.messages.length, 0);
  feedback.fields.status = "replied";
  const inbox = await run(["inbox", ...context], { env, fetchImpl: fixture.fetchImpl });
  assert.equal(inbox.messages.length, 1);
  assert.equal(inbox.messages[0].body, "Use option A");

  const ackArgs = ["ack", ...context, "--message", "message-42", "--key", "run-42:ack:message-42"];
  const acknowledgement = await run(ackArgs, { env, fetchImpl: fixture.fetchImpl, now: () => acknowledgementTime });
  const replay = await run(ackArgs, { env, fetchImpl: fixture.fetchImpl });
  const replayWithNewKey = await run(["ack", ...context, "--message", "message-42", "--key", "run-42:ack:alternate"], { env, fetchImpl: fixture.fetchImpl });
  assert.equal(acknowledgement.duplicate, false);
  assert.equal(replay.duplicate, true);
  assert.equal(replay.receipt_id, acknowledgement.receipt_id);
  assert.equal(replayWithNewKey.duplicate, true);
  assert.equal(replayWithNewKey.receipt_id, acknowledgement.receipt_id);

  const emptyInbox = await run(["inbox", ...context], { env, fetchImpl: fixture.fetchImpl });
  assert.equal(emptyInbox.messages.length, 0);

  const receipt = await run(["receipt", ...context, "--receipt", acknowledgement.receipt_id], { env, fetchImpl: fixture.fetchImpl });
  assert.equal(receipt.receipt.message_id, "message-42");
  assert.equal(receipt.receipt.kind, "acknowledged");

  await run(["finish", ...context, "--title", "Finished", "--detail", "Verified", "--key", "run-42:finish:0001"], { env, fetchImpl: fixture.fetchImpl });
  assert.deepEqual(fixture.table("tbl_events").map((row) => row.fields.kind), [
    "run_started", "progress", "blocked", "question", "artifact", "run_finished",
  ]);
  assert.equal(fixture.table("tbl_receipts").length, 1);
  assert.equal(fixture.table("tbl_receipts")[0].fields.status, "acknowledged");
  assert.equal(fixture.table("tbl_receipts")[0].fields.submitted_at, acknowledgementTime);
  assert.equal(fixture.table("tbl_receipts")[0].fields.acknowledged_at, acknowledgementTime);
  assert.equal(typeof fixture.table("tbl_receipts")[0].fields.submitted_at, "number");
  assert.equal(typeof fixture.table("tbl_receipts")[0].fields.acknowledged_at, "number");
  for (const call of fixture.calls.filter((item) => new URL(item.url).pathname.endsWith("/search"))) {
    const body = JSON.parse(call.options.body);
    assert.ok(body.filter.conditions.some((condition) => condition.field_name === "instance_id" && condition.value[0] === "copy-alpha"));
  }
});

test("webhook_write sends credentials only in headers and exposes no read/ack capability", async () => {
  const deliveries = new Map();
  const requests = [];
  const secret = "fixture-webhook-secret";
  const fetchImpl = async (url, options) => {
    assert.equal(url, "https://hooks.example.test/events");
    assert.equal(options.headers.Authorization, `Bearer ${secret}`);
    assert.equal(options.body.includes(secret), false);
    const body = JSON.parse(options.body);
    requests.push(body);
    const scopedKey = `${body.instance_id}:${body.idempotency_key}`;
    const duplicate = deliveries.has(scopedKey);
    if (duplicate) assert.equal(deliveries.get(scopedKey).payload_digest, body.payload_digest);
    if (!duplicate) deliveries.set(scopedKey, body);
    return Response.json({ instance_id: body.instance_id, event: body.event, duplicate, receipt_id: `delivery:${scopedKey}` });
  };
  const config = {
    adapter: "webhook_write",
    instanceId: "copy-webhook",
    agentId: "test-agent",
    agentName: "Test Agent",
    webhookUrl: "https://hooks.example.test/events",
    webhookToken: secret,
  };
  const adapter = new WebhookWriteAdapter(config, { fetchImpl });
  const connectorEvent = createEvent({
    instanceId: "copy-webhook",
    taskId: "task-webhook",
    agentId: "test-agent",
    agentName: "Test Agent",
    runId: "test-agent:run-webhook",
    kind: "progress",
    title: "Progress",
    detail: "Written",
  });
  assert.equal((await adapter.writeEvent(connectorEvent, "webhook:progress:01")).duplicate, false);
  assert.equal(typeof requests[0].event.occurred_at, "string");
  assert.equal(requests[0].event.occurred_at, connectorEvent.occurred_at);
  const semanticReplay = createEvent({
    instanceId: "copy-webhook",
    taskId: "task-webhook",
    agentId: "test-agent",
    agentName: "Test Agent",
    runId: "test-agent:run-webhook",
    kind: "progress",
    title: "Progress",
    detail: "Written",
  });
  assert.notEqual(semanticReplay.event_id, connectorEvent.event_id);
  assert.equal((await adapter.writeEvent(semanticReplay, "webhook:progress:01")).duplicate, true);
  assert.equal(requests[0].payload_digest, requests[1].payload_digest);
  assert.equal(deliveries.size, 1);
  const leaking = createEvent({
    instanceId: "copy-webhook",
    taskId: "task-webhook",
    agentId: "test-agent",
    agentName: "Test Agent",
    runId: "test-agent:run-webhook",
    kind: "progress",
    title: "Must fail",
    detail: secret,
  });
  await assert.rejects(adapter.writeEvent(leaking, "webhook:leak:0001"), (error) => error.code === "SECRET_EGRESS");
  assert.throws(() => adapter.inbox(), (error) => error.code === "UNSUPPORTED_OPERATION");
  assert.throws(() => adapter.acknowledge(), (error) => error.code === "UNSUPPORTED_OPERATION");
});

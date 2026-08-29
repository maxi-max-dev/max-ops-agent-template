#!/usr/bin/env node

import assert from "node:assert/strict";
import { parseArgs, run } from "./maxops.mjs";
import { loadAndValidateManifest } from "./validate-adapter.mjs";

const manifestResult = await loadAndValidateManifest();
assert.equal(manifestResult.adapter_id, "codex-reference");
assert.equal(manifestResult.required_operations.length, 10);

assert.deepEqual(parseArgs(["task", "--record", "rec-demo", "--dry-run"]), {
  command: "task",
  options: { record: "rec-demo", dryRun: true },
});
assert.throws(
  () => parseArgs(["connect", "--task", "rec-demo", "--token", "must-not-enter-history"]),
  /Do not pass secrets/,
);
assert.throws(
  () => parseArgs(["connect", "--task", "rec-demo", "--maxops-agent-token", "must-not-enter-history"]),
  /Do not pass secrets/,
);

const noConfigDoctor = await run(["doctor"]);
assert.equal(noConfigDoctor.url_configured, false);

const dryRead = await run(["task", "--url", "https://example.test", "--record", "rec/demo", "--dry-run"]);
assert.equal(dryRead.method, "GET");
assert.equal(dryRead.url, "https://example.test/api/agent/v1/tasks/rec%2Fdemo");

const adapterContext = ["--url", "https://example.test", "--agent-id", "future-agent", "--agent-name", "Future Agent", "--run", "future-agent:run-001"];
const dryStart = await run(["start", ...adapterContext, "--task", "task-demo", "--record", "rec-demo", "--title", "Started", "--detail", "Scoped task read", "--key", "future-agent:run-001:start:001", "--dry-run"]);
assert.equal(dryStart.body.agent_id, "future-agent");
assert.equal(dryStart.body.agent_name, "Future Agent");
assert.equal(dryStart.body.run_id, "future-agent:run-001");
assert.equal(dryStart.body.task_id, "task-demo");
assert.equal(dryStart.body.record_id, "rec-demo");
assert.equal(dryStart.body.kind, "run_started");

const dryProgress = await run(["progress", ...adapterContext, "--task", "rec-demo", "--title", "Progress", "--detail", "Meaningful change", "--key", "future-agent:run-001:progress:001", "--dry-run"]);
assert.equal(dryProgress.body.kind, "progress");

const dryBlocked = await run(["blocked", ...adapterContext, "--task", "rec-demo", "--title", "Blocked", "--detail", "Needs a decision", "--question", "Continue?", "--key", "future-agent:run-001:blocked:001", "--question-key", "future-agent:run-001:question:001", "--dry-run"]);
assert.equal(dryBlocked.event.body.kind, "blocked");
assert.equal(dryBlocked.question.body.question, "Continue?");

const dryStatusRequest = await run(["status-request", ...adapterContext, "--task", "rec-demo", "--from", "待处理", "--to", "进行中", "--detail", "已完成任务读取并开始执行。", "--key", "future-agent:run-001:status-request:001", "--dry-run"]);
assert.equal(dryStatusRequest.url, "https://example.test/api/agent/v1/questions");
assert.match(dryStatusRequest.body.question, /待处理 → 进行中/);
assert.match(dryStatusRequest.body.question, /Agent 不直接写入飞书/);

const dryArtifact = await run(["artifact", ...adapterContext, "--task", "rec-demo", "--title", "Artifact", "--detail", "Result", "--artifact", "https://example.test/result", "--key", "future-agent:run-001:artifact:001", "--dry-run"]);
assert.equal(dryArtifact.body.artifact_url, "https://example.test/result");

const dryFinish = await run(["finish", ...adapterContext, "--task", "rec-demo", "--title", "Finished", "--detail", "Verified locally", "--key", "future-agent:run-001:finish:001", "--dry-run"]);
assert.equal(dryFinish.results.at(-1).body.kind, "run_finished");

const dryInbox = await run(["inbox", ...adapterContext, "--dry-run"]);
assert.match(dryInbox.url, /agent_id=future-agent/);
assert.match(dryInbox.url, /run_id=future-agent%3Arun-001/);

const dryAck = await run(["ack", ...adapterContext, "--message", "amsg-demo", "--key", "future-agent:run-001:ack:001", "--dry-run"]);
assert.equal(dryAck.body.agent_id, "future-agent");
assert.equal(dryAck.body.kind, "acknowledged");

const previousToken = process.env.MAXOPS_AGENT_TOKEN;
process.env.MAXOPS_AGENT_TOKEN = "self-test-token";
const previousFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const payload = url.endsWith("/api/agent/v1/tasks/rec-1")
    ? { ok: true, task: { task_id: "task-1", record_id: "rec-1", title: "Fake task" } }
    : { ok: true, url, authorization: options.headers.Authorization };
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

try {
  await assert.rejects(
    run(["progress", "--url", "https://mock.maxops.test", "--task", "rec-1", "--run", "future-agent:run-001", "--title", "self-test-token", "--detail", "must not leak", "--dry-run"]),
    /Refusing to place MAXOPS_AGENT_TOKEN/,
  );

  const connected = await run(["connect", "--url", "https://mock.maxops.test", "--record", "rec-1", "--agent-id", "future-agent", "--agent-name", "Future Agent", "--run", "future-agent:run-001"]);
  assert.equal(connected.ok, true);
  assert.equal(connected.adapter, "codex-reference");
  assert.equal(connected.session.task_id, "task-1");
  assert.equal(connected.session.record_id, "rec-1");
  assert.equal(connected.session.run_id, "future-agent:run-001");
  assert.equal(connected.checks.manifest, "passed");

  const result = await run(["task", "--url", "https://mock.maxops.test", "--record", "rec-1"]);
  assert.equal(result.task.task_id, "task-1");
  assert.equal(result.task.record_id, "rec-1");
} finally {
  globalThis.fetch = previousFetch;
  if (previousToken === undefined) delete process.env.MAXOPS_AGENT_TOKEN;
  else process.env.MAXOPS_AGENT_TOKEN = previousToken;
}

process.stdout.write("MAX OPS Agent template self-test: PASS (manifest + arbitrary identity + lifecycle + inbox/ack)\n");

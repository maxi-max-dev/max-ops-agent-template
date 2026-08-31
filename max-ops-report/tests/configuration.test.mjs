import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DEFAULT_FIELDS, inspectConfiguration, loadConfiguration } from "../lib/config.mjs";
import { run } from "../scripts/maxops.mjs";
import { loadAndValidateManifest } from "../scripts/validate-adapter.mjs";

test("missing configuration fails closed as not_connected", async () => {
  const inspection = inspectConfiguration({});
  assert.equal(inspection.ok, false);
  assert.equal(inspection.connection_state, "not_connected");
  assert.ok(inspection.missing.includes("MAXOPS_ADAPTER"));

  const doctor = await run(["doctor"], { env: {} });
  assert.equal(doctor.ok, false);
  assert.equal(doctor.connection_state, "not_connected");
  assert.equal(doctor.product_route.default_route, "feishu_base_direct");
  assert.equal(doctor.product_route.explicit_adapter_selection_required, true);
  assert.equal(doctor.product_route.webhook_write, "capability_dependent_optional");
  assert.equal("preview" in doctor, false);

  await assert.rejects(
    run(["start", "--task", "task-1", "--run", "test-agent:run-1", "--title", "Start", "--detail", "Begin", "--key", "test-agent:start:001"], { env: {} }),
    (error) => error.code === "NOT_CONNECTED",
  );
});

test("credentials and connection identifiers cannot be passed as CLI arguments", async () => {
  await assert.rejects(
    run(["connect", "--token", "do-not-put-secrets-in-history"], { env: {} }),
    /Do not pass connection values/,
  );
  await assert.rejects(
    run(["connect", "--webhook-url", "https:\/\/invalid.example"], { env: {} }),
    /Do not pass connection values/,
  );
});

test("default field contract uses snake_case machine fields and mapped human task columns", () => {
  assert.equal(DEFAULT_FIELDS.instanceId, "instance_id");
  assert.equal(DEFAULT_FIELDS.taskId, "task_id");
  assert.equal(DEFAULT_FIELDS.idempotencyKey, "idempotency_key");
  assert.equal(DEFAULT_FIELDS.reply, "reply");
  assert.equal(DEFAULT_FIELDS.receipt, "receipt");
  assert.equal(DEFAULT_FIELDS.taskTitle, "任务名");
  assert.equal(DEFAULT_FIELDS.taskStatus, "五态");
});

test("machine status enums stay language-neutral and connector-exact", async () => {
  const manifest = JSON.parse(await readFile(new URL("../adapter-manifest.json", import.meta.url), "utf8"));
  await loadAndValidateManifest();
  assert.deepEqual(manifest.status_enums.feedback, ["open", "replied", "processing", "resolved"]);
  assert.deepEqual(manifest.status_enums.receipt_ack, ["acknowledged"]);
  assert.deepEqual(manifest.status_enums.artifact_review, ["pending_review", "approved", "changes_requested"]);
  assert.equal(manifest.status_enums.localized_values_in_machine_status, false);
  assert.equal(manifest.time_serialization.public_event_occurred_at, "iso8601_string_with_timezone");
  assert.equal(manifest.time_serialization.webhook_write_event_occurred_at, "unchanged_iso8601_string");
  assert.equal(manifest.time_serialization.feishu_base_direct_occurred_at, "epoch_milliseconds_number");
  assert.equal(manifest.time_serialization.feishu_base_direct_submitted_at, "epoch_milliseconds_number");
  assert.equal(manifest.time_serialization.feishu_base_direct_acknowledged_at, "epoch_milliseconds_number");
  assert.equal(manifest.time_serialization.invalid_time_fallback, false);
  assert.deepEqual(manifest.product_routing, {
    default_route: "feishu_base_direct",
    explicit_adapter_selection_required: true,
    feishu_base_direct: "cross_plan_full_route",
    webhook_write: "capability_dependent_optional",
  });
  assert.equal(manifest.adapters.webhook_write.native_feishu_receiver.template_copy_guarantees_endpoint_token, false);
});

test("webhook URL rejects embedded credentials and query tokens", () => {
  const env = {
    MAXOPS_ADAPTER: "webhook_write",
    MAXOPS_INSTANCE_ID: "copy-alpha",
    MAXOPS_AGENT_ID: "test-agent",
    MAXOPS_AGENT_NAME: "Test Agent",
    MAXOPS_WEBHOOK_URL: "https://hooks.example.test/write?token=embedded",
    MAXOPS_WEBHOOK_TOKEN: "local-secret",
  };
  assert.throws(() => loadConfiguration(env), /must not contain credentials, query parameters, or fragments/);
  assert.throws(() => loadConfiguration({ ...env, MAXOPS_WEBHOOK_URL: "http://hooks.example.test/write" }), /must use HTTPS/);
});

test("doctor keeps native webhook mode not_connected until a plan-provided receiver exists", async () => {
  const env = {
    MAXOPS_ADAPTER: "webhook_write",
    MAXOPS_INSTANCE_ID: "copy-alpha",
    MAXOPS_AGENT_ID: "test-agent",
    MAXOPS_AGENT_NAME: "Test Agent",
  };
  const doctor = await run(["doctor"], { env });
  assert.equal(doctor.ok, false);
  assert.equal(doctor.connection_state, "not_connected");
  assert.deepEqual(doctor.missing, ["MAXOPS_WEBHOOK_URL", "MAXOPS_WEBHOOK_TOKEN"]);
  assert.equal(doctor.webhook_receiver.endpoint_configured, false);
  assert.equal(doctor.webhook_receiver.token_configured, false);
  assert.equal(doctor.webhook_receiver.state, "not_connected");
  assert.equal(doctor.product_route.default_route, "feishu_base_direct");
  assert.match(doctor.webhook_receiver.requirement, /Base plan.*接收到 Webhook 时/);
  assert.match(doctor.webhook_receiver.unavailable_plan_action, /do not substitute Feishu messages or forms/);
});

test("doctor labels a supplied webhook receiver configured_not_verified, never connected", async () => {
  const env = {
    MAXOPS_ADAPTER: "webhook_write",
    MAXOPS_INSTANCE_ID: "copy-alpha",
    MAXOPS_AGENT_ID: "test-agent",
    MAXOPS_AGENT_NAME: "Test Agent",
    MAXOPS_WEBHOOK_URL: "https://hooks.example.test/events",
    MAXOPS_WEBHOOK_TOKEN: "fixture-webhook-secret",
  };
  const doctor = await run(["doctor"], { env });
  assert.equal(doctor.ok, true);
  assert.equal(doctor.connection_state, "configured_not_verified");
  assert.equal(doctor.webhook_receiver.state, "configured_not_verified");
  assert.equal("connected" in doctor.webhook_receiver, false);
});

test("direct credentials can only be sent to an official Feishu Open Platform host", () => {
  const env = {
    MAXOPS_ADAPTER: "feishu_base_direct",
    MAXOPS_INSTANCE_ID: "copy-alpha",
    MAXOPS_AGENT_ID: "test-agent",
    MAXOPS_AGENT_NAME: "Test Agent",
    MAXOPS_FEISHU_APP_ID: "fixture-id",
    MAXOPS_FEISHU_APP_SECRET: "fixture-secret",
    MAXOPS_FEISHU_APP_TOKEN: "fixture-base",
    MAXOPS_FEISHU_TASKS_TABLE_ID: "tasks",
    MAXOPS_FEISHU_EVENTS_TABLE_ID: "events",
    MAXOPS_FEISHU_FEEDBACK_TABLE_ID: "feedback",
    MAXOPS_FEISHU_RECEIPTS_TABLE_ID: "receipts",
    MAXOPS_FEISHU_API_BASE: "https://untrusted.example.test",
  };
  assert.throws(() => loadConfiguration(env), /official Feishu or Lark/);
});

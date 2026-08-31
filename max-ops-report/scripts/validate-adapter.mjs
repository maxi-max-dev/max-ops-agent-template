#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DEFAULT_FIELDS } from "../lib/config.mjs";

const lifecycle = ["start", "progress", "blocked", "question", "artifact", "finish"];
const machineFields = [
  "instance_id", "task_id", "event_id", "idempotency_key", "payload_digest",
  "agent_id", "agent_name", "run_id", "kind", "state", "title", "detail",
  "artifact_url", "occurred_at", "message_id", "body", "reply", "status",
  "created_at", "replied_at", "receipt_id", "receipt", "submitted_at", "acknowledged_at",
];

export function validateManifest(manifest) {
  assert.equal(manifest.schema_version, "maxops-agent-connector/2", "unsupported schema_version");
  for (const field of ["connector_id", "display_name", "contract", "self_check"]) {
    assert.equal(typeof manifest[field], "string", `missing ${field}`);
    assert.ok(manifest[field].trim(), `empty ${field}`);
  }
  assert.equal(manifest.default_adapter, null, "connector must not silently select an adapter");
  assert.equal(manifest.product_routing?.default_route, "feishu_base_direct");
  assert.equal(manifest.product_routing?.explicit_adapter_selection_required, true);
  assert.equal(manifest.product_routing?.feishu_base_direct, "cross_plan_full_route");
  assert.equal(manifest.product_routing?.webhook_write, "capability_dependent_optional");
  assert.deepEqual(Object.keys(manifest.adapters).sort(), ["feishu_base_direct", "webhook_write"]);
  assert.equal(manifest.adapters.webhook_write.mode, "write_only");
  assert.equal(manifest.adapters.webhook_write.availability, "capability_dependent_optional");
  assert.deepEqual(manifest.adapters.webhook_write.capabilities, lifecycle);
  assert.equal(manifest.adapters.webhook_write.native_feishu_receiver?.requires_base_plan_webhook_trigger, true);
  assert.equal(manifest.adapters.webhook_write.native_feishu_receiver?.trigger_label, "接收到 Webhook 时");
  assert.equal(manifest.adapters.webhook_write.native_feishu_receiver?.must_confirm_before_selection, true);
  assert.equal(manifest.adapters.webhook_write.native_feishu_receiver?.template_copy_guarantees_endpoint_token, false);
  assert.equal(manifest.adapters.webhook_write.native_feishu_receiver?.missing_endpoint_state, "not_connected");
  assert.equal(manifest.adapters.webhook_write.native_feishu_receiver?.message_or_form_fallback, false);
  assert.equal(manifest.adapters.feishu_base_direct.availability, "cross_plan_full_route");
  assert.deepEqual(manifest.adapters.feishu_base_direct.capabilities, ["read_task", ...lifecycle, "inbox", "ack", "receipt"]);
  for (const operation of lifecycle) {
    assert.equal(typeof manifest.event_semantics?.[operation]?.kind, "string", `missing event kind: ${operation}`);
    assert.equal(typeof manifest.event_semantics?.[operation]?.state, "string", `missing event state: ${operation}`);
  }
  assert.equal(manifest.event_semantics?.artifact?.status, "pending_review");
  assert.equal(manifest.identity?.record_id_required, false, "record_id must not be required");
  assert.equal(manifest.identity?.board_enumeration, false, "board enumeration must be disabled");
  assert.equal(manifest.identity?.agent_status_write, false, "Agent must not own task-state writes");
  assert.deepEqual(manifest.machine_fields, machineFields, "machine-field contract drift");
  assert.deepEqual(manifest.status_enums?.feedback, ["open", "replied", "processing", "resolved"]);
  assert.deepEqual(manifest.status_enums?.receipt_ack, ["acknowledged"]);
  assert.deepEqual(manifest.status_enums?.artifact_review, ["pending_review", "approved", "changes_requested"]);
  assert.equal(manifest.status_enums?.connector_dependencies?.inbox_reads, "replied");
  assert.equal(manifest.status_enums?.connector_dependencies?.ack_receipt_writes, "acknowledged");
  assert.equal(manifest.status_enums?.connector_dependencies?.artifact_initial_write, "pending_review");
  assert.equal(manifest.status_enums?.localized_values_in_machine_status, false);
  assert.equal(manifest.time_serialization?.public_event_occurred_at, "iso8601_string_with_timezone");
  assert.equal(manifest.time_serialization?.webhook_write_event_occurred_at, "unchanged_iso8601_string");
  assert.equal(manifest.time_serialization?.feishu_base_direct_occurred_at, "epoch_milliseconds_number");
  assert.equal(manifest.time_serialization?.feishu_base_direct_submitted_at, "epoch_milliseconds_number");
  assert.equal(manifest.time_serialization?.feishu_base_direct_acknowledged_at, "epoch_milliseconds_number");
  assert.equal(manifest.time_serialization?.invalid_time_fallback, false);
  assert.equal(manifest.authentication?.environment_or_secret_store_only, true);
  assert.equal(manifest.authentication?.secret_cli_arguments, false);
  assert.equal(manifest.authentication?.secret_in_template_fields, false);
  assert.equal(manifest.authentication?.secret_in_urls, false);
  assert.equal(manifest.authentication?.secret_in_logs_or_results, false);
  assert.equal(manifest.authentication?.secret_in_repository, false);
  assert.equal(manifest.idempotency?.required_for_every_mutation, true);
  assert.deepEqual(manifest.idempotency?.scope, ["instance_id", "idempotency_key"]);
  assert.equal(manifest.failure_mode?.missing_configuration, "not_connected");
  assert.equal(manifest.failure_mode?.preview_fallback, false);
  assert.equal(manifest.failure_mode?.simulated_success, false);
  assert.equal(DEFAULT_FIELDS.instanceId, "instance_id");
  assert.equal(DEFAULT_FIELDS.taskId, "task_id");
  assert.equal(DEFAULT_FIELDS.taskTitle, "任务名");
  assert.equal(DEFAULT_FIELDS.taskStatus, "五态");
  for (const field of machineFields) {
    assert.ok(Object.values(DEFAULT_FIELDS).includes(field), `default field mapping missing: ${field}`);
  }
  return { ok: true, connector_id: manifest.connector_id, adapters: Object.keys(manifest.adapters), lifecycle };
}

export async function loadAndValidateManifest(url = new URL("../adapter-manifest.json", import.meta.url)) {
  const manifest = JSON.parse(await readFile(url, "utf8"));
  return validateManifest(manifest);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  loadAndValidateManifest()
    .then((result) => process.stdout.write(`MAX OPS connector manifest: PASS (${result.adapters.join(" + ")})\n`))
    .catch((error) => {
      process.stderr.write(`MAX OPS connector manifest: FAIL (${error.message})\n`);
      process.exitCode = 1;
    });
}

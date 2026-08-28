#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const requiredOperations = ["read", "start", "progress", "blocker", "question", "artifact", "finish", "inbox", "ack", "receipt"];

export function validateManifest(manifest) {
  assert.equal(manifest.schema_version, "maxops-adapter/1", "unsupported schema_version");
  for (const field of ["adapter_id", "display_name", "reference_runtime", "contract", "self_check"]) {
    assert.equal(typeof manifest[field], "string", `missing ${field}`);
    assert.ok(manifest[field].trim(), `empty ${field}`);
  }
  assert.equal(manifest.identity?.configurable, true, "identity must be configurable");
  assert.ok(manifest.identity?.agent_id?.environment, "missing agent_id environment mapping");
  assert.ok(manifest.identity?.agent_name?.environment, "missing agent_name environment mapping");
  assert.equal(manifest.task_scope?.mode, "single_explicit_record", "task scope must be one explicit record");
  assert.equal(manifest.task_scope?.requires_user_supplied_record_id, true, "record_id must be user supplied");
  assert.equal(manifest.task_scope?.board_enumeration, false, "board enumeration must be disabled");
  for (const capability of ["connect", "read_scoped_task", "report_lifecycle", "propose_status", "receive_inbox", "acknowledge_message", "preserve_receipt"]) {
    assert.ok(manifest.capabilities?.includes(capability), `missing capability: ${capability}`);
  }
  for (const operation of requiredOperations) {
    assert.equal(typeof manifest.operations?.[operation], "string", `missing operation: ${operation}`);
    assert.ok(manifest.operations[operation].trim(), `empty operation: ${operation}`);
  }
  assert.equal(typeof manifest.operations?.status_request, "string", "missing optional safe status_request operation");
  assert.equal(manifest.authentication?.secret_must_not_enter_chat_or_artifacts, true, "secret handling boundary missing");
  assert.equal(manifest.authentication?.secret_cli_argument, false, "secret must not be accepted as a CLI argument");
  assert.equal(manifest.authentication?.reject_secret_in_url_or_body, true, "secret egress guard missing");
  assert.equal(manifest.onboarding?.mutates_remote_state, false, "onboarding must be read-only");
  assert.deepEqual(manifest.onboarding?.sequence, ["validate_manifest", "authenticated_health", "read_scoped_task", "return_stable_run_id"], "unsafe or incomplete onboarding sequence");
  assert.equal(manifest.idempotency?.required_for_mutations, true, "mutation idempotency must be required");
  assert.equal(manifest.idempotency?.reuse_only_for_same_logical_action, true, "unsafe idempotency reuse policy");
  assert.equal(manifest.source_of_truth?.agent_direct_status_write, false, "adapter must not own Feishu status writes");
  assert.equal(manifest.source_of_truth?.private_feishu_credentials, false, "adapter must not use private Feishu credentials");
  return { ok: true, adapter_id: manifest.adapter_id, required_operations: requiredOperations };
}

export async function loadAndValidateManifest(url = new URL("../adapter-manifest.json", import.meta.url)) {
  const manifest = JSON.parse(await readFile(url, "utf8"));
  return validateManifest(manifest);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  loadAndValidateManifest()
    .then((result) => process.stdout.write(`MAX OPS adapter manifest: PASS (${result.adapter_id}; ${result.required_operations.length} operations)\n`))
    .catch((error) => {
      process.stderr.write(`MAX OPS adapter manifest: FAIL (${error.message})\n`);
      process.exitCode = 1;
    });
}

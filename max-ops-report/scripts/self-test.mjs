#!/usr/bin/env node

import assert from "node:assert/strict";
import { parseArgs, run } from "./maxops.mjs";

assert.deepEqual(parseArgs(["task", "--task", "rec-demo", "--dry-run"]), {
  command: "task",
  options: { task: "rec-demo", dryRun: true },
});

const dryRead = await run(["task", "--url", "https://example.test", "--task", "rec/demo", "--dry-run"]);
assert.equal(dryRead.method, "GET");
assert.equal(dryRead.url, "https://example.test/api/agent/v1/tasks/rec%2Fdemo");

const previousToken = process.env.MAXOPS_AGENT_TOKEN;
process.env.MAXOPS_AGENT_TOKEN = "self-test-token";
const previousFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => new Response(JSON.stringify({ ok: true, url, authorization: options.headers.Authorization }), {
  status: 200,
  headers: { "content-type": "application/json" },
});

try {
  const result = await run(["task", "--url", "https://mock.maxops.test", "--task", "rec-1"]);
  assert.equal(result.url, "https://mock.maxops.test/api/agent/v1/tasks/rec-1");
  assert.equal(result.authorization, "Bearer self-test-token");
} finally {
  globalThis.fetch = previousFetch;
  if (previousToken === undefined) delete process.env.MAXOPS_AGENT_TOKEN;
  else process.env.MAXOPS_AGENT_TOKEN = previousToken;
}

process.stdout.write("MAX OPS Agent template self-test: PASS\n");

#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["--test", new URL("../tests/configuration.test.mjs", import.meta.url).pathname, new URL("../tests/connector.test.mjs", import.meta.url).pathname], {
  cwd: new URL("../../", import.meta.url),
  encoding: "utf8",
});
if (result.status !== 0) {
  process.stderr.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.status || 1;
} else {
  process.stdout.write("MAX OPS Agent Connector self-test: PASS (fail-closed + isolation + idempotency + identity + full chain)\n");
}

#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

async function collect(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await collect(path));
    else if (entry.isFile() && entry.name.endsWith(".mjs")) files.push(path);
  }
  return files;
}

for (const file of await collect(root)) {
  execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
}
process.stdout.write("MAX OPS Agent Connector lint: PASS (node --check)\n");

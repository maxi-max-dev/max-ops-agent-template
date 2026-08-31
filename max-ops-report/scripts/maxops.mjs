#!/usr/bin/env node

import { createAdapter } from "../adapters/index.mjs";
import { createEvent, createRunId, requireIdempotencyKey, requireString, requireTaskId } from "../lib/contract.mjs";
import { inspectConfiguration, loadConfiguration } from "../lib/config.mjs";
import { ConfigurationError } from "../lib/errors.mjs";
import { loadAndValidateManifest } from "./validate-adapter.mjs";

const commands = new Set([
  "doctor",
  "connect",
  "new-run",
  "task",
  "start",
  "progress",
  "blocked",
  "question",
  "status-request",
  "artifact",
  "finish",
  "inbox",
  "ack",
  "receipt",
]);
const forbiddenSecretOptions = /(?:token|secret|authorization|bearer|credential|app-id|app-token|table-id|url)/i;

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (!value.startsWith("--")) throw new ConfigurationError("Unexpected positional argument.");
    const key = value.slice(2);
    if (forbiddenSecretOptions.test(key)) {
      throw new ConfigurationError(`Do not pass connection values with --${key}. Inject them through the local environment or a secret manager.`);
    }
    const next = rest[index + 1];
    if (!next || next.startsWith("--")) throw new ConfigurationError(`Missing value for --${key}.`);
    options[key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = next;
    index += 1;
  }
  return { command, options };
}

function runIdentity(config, options, { needsRun = true, needsTask = true } = {}) {
  const runId = options.run || process.env.MAXOPS_RUN_ID;
  const taskId = options.task || process.env.MAXOPS_TASK_ID;
  return {
    instanceId: config.instanceId,
    agentId: config.agentId,
    agentName: config.agentName,
    runId: needsRun ? requireString(runId, "run identity (--run or MAXOPS_RUN_ID)") : runId,
    taskId: needsTask ? requireTaskId(taskId) : taskId,
  };
}

function event(config, options, kind, overrides = {}) {
  return createEvent({
    ...runIdentity(config, options),
    kind,
    title: overrides.title ?? options.title,
    detail: overrides.detail ?? options.detail,
    artifactUrl: Object.hasOwn(overrides, "artifactUrl") ? overrides.artifactUrl : options.artifact,
  });
}

async function write(adapter, connectorEvent, key, label = "idempotency key (--key)") {
  return adapter.writeEvent(connectorEvent, requireIdempotencyKey(key, label));
}

export async function run(argv, runtime = {}) {
  const env = runtime.env || process.env;
  const { command, options } = parseArgs(argv);
  if (!commands.has(command)) {
    throw new ConfigurationError("Usage: maxops.mjs <doctor|connect|new-run|task|start|progress|blocked|question|status-request|artifact|finish|inbox|ack|receipt> [options].");
  }
  if (command === "doctor") {
    const manifest = await loadAndValidateManifest();
    return { ...inspectConfiguration(env, options.adapter), manifest: "passed", connector: manifest.connector_id };
  }
  if (command === "new-run") {
    const agentId = requireString(env.MAXOPS_AGENT_ID, "MAXOPS_AGENT_ID");
    return createRunId(agentId);
  }

  const config = loadConfiguration(env, options.adapter);
  const adapter = createAdapter(config, { fetchImpl: runtime.fetchImpl || globalThis.fetch, now: runtime.now || Date.now });
  options.task ||= env.MAXOPS_TASK_ID;
  options.run ||= env.MAXOPS_RUN_ID;

  if (command === "connect") {
    const taskId = requireTaskId(options.task || env.MAXOPS_TASK_ID);
    const runId = options.run || env.MAXOPS_RUN_ID || createRunId(config.agentId);
    if (config.adapter === "webhook_write") {
      return {
        ok: true,
        connected: false,
        connection_state: "configured_not_verified",
        adapter: config.adapter,
        task_id: taskId,
        run_id: runId,
        instruction: "This adapter is write-only. A successful start event is the first remote delivery proof; it is not task-read or feedback access.",
      };
    }
    const task = await adapter.readTask(taskId);
    return {
      ok: true,
      connected: true,
      connection_state: "connected",
      adapter: config.adapter,
      task,
      session: {
        instance_id: config.instanceId,
        task_id: task.task_id,
        agent_id: config.agentId,
        agent_name: config.agentName,
        run_id: runId,
      },
    };
  }
  if (command === "task") {
    return adapter.readTask(requireTaskId(options.task || env.MAXOPS_TASK_ID));
  }

  if (command === "start") return write(adapter, event(config, options, "run_started"), options.key);
  if (command === "progress") return write(adapter, event(config, options, "progress"), options.key);
  if (command === "artifact") return write(adapter, event(config, options, "artifact"), options.key);
  if (command === "question") return write(adapter, event(config, options, "question"), options.key);
  if (command === "blocked") {
    const blocked = await write(adapter, event(config, options, "blocked"), options.key);
    if (!options.question) return { blocked };
    const questionEvent = event(config, options, "question", {
      title: options.questionTitle || options.title,
      detail: options.question,
      artifactUrl: undefined,
    });
    const question = await write(adapter, questionEvent, options.questionKey, "question idempotency key (--question-key)");
    return { blocked, question };
  }
  if (command === "status-request") {
    const fromStatus = requireString(options.from, "--from");
    const toStatus = requireString(options.to, "--to");
    const reason = requireString(options.detail, "--detail");
    const proposal = event(config, options, "question", {
      title: options.title || "Task status proposal",
      detail: `Agent proposal only: ${fromStatus} → ${toStatus}. ${reason} A human or Feishu workflow must confirm the task-state change.`,
      artifactUrl: undefined,
    });
    return write(adapter, proposal, options.key);
  }
  if (command === "finish") {
    const results = [];
    if (options.artifact) {
      results.push(await write(
        adapter,
        event(config, options, "artifact"),
        options.artifactKey,
        "artifact idempotency key (--artifact-key)",
      ));
    }
    results.push(await write(
      adapter,
      event(config, options, "run_finished", { artifactUrl: undefined }),
      options.finishKey || (!options.artifact ? options.key : undefined),
      options.artifact ? "finish idempotency key (--finish-key)" : "idempotency key (--key)",
    ));
    return { results };
  }
  if (command === "inbox") {
    const identity = runIdentity(config, options);
    return adapter.inbox(identity);
  }
  if (command === "ack") {
    const identity = runIdentity(config, options);
    return adapter.acknowledge({ ...identity, messageId: options.message, key: options.key });
  }
  if (command === "receipt") {
    const identity = runIdentity(config, options);
    return adapter.readReceipt({ ...identity, receiptId: options.receipt });
  }
  throw new ConfigurationError(`Command is not implemented: ${command}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv.slice(2))
    .then((result) => process.stdout.write(`${typeof result === "string" ? result : JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      const payload = { ok: false, connection_state: error.code === "NOT_CONNECTED" ? "not_connected" : "failed", error: error.code || "CONNECTOR_ERROR", message: error.message };
      process.stderr.write(`${JSON.stringify(payload)}\n`);
      process.exitCode = 1;
    });
}

#!/usr/bin/env node

import { randomUUID } from "node:crypto";

const DEFAULT_URL = "https://max-ops-personal-war-room.maxorila.chatgpt.site";
const commands = new Set(["doctor", "health", "new-run", "task", "start", "progress", "blocked", "artifact", "finish", "inbox", "ack"]);

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (!value.startsWith("--")) throw new Error(`Unexpected argument: ${value}`);
    const key = value.slice(2);
    if (key === "dry-run") {
      options.dryRun = true;
      continue;
    }
    const next = rest[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`Missing value for --${key}`);
    options[key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = next;
    index += 1;
  }
  return { command, options };
}

function required(value, label) {
  if (!value) throw new Error(`Missing ${label}`);
  return value;
}

function idempotency(agentId, runId, action, supplied) {
  return supplied || `${agentId}:${runId}:${action}:${randomUUID()}`;
}

function context(options, needsRun = true) {
  const agentId = options.agentId || process.env.MAXOPS_AGENT_ID || "codex";
  const agentName = options.agentName || process.env.MAXOPS_AGENT_NAME || "Codex";
  const runId = options.run || process.env.MAXOPS_RUN_ID;
  return {
    baseUrl: (options.url || process.env.MAXOPS_URL || DEFAULT_URL).replace(/\/$/, ""),
    token: process.env.MAXOPS_AGENT_TOKEN,
    agentId,
    agentName,
    runId: needsRun ? required(runId, "--run or MAXOPS_RUN_ID") : runId,
  };
}

async function request(ctx, path, { method = "GET", body, key, dryRun = false } = {}) {
  const url = `${ctx.baseUrl}${path}`;
  if (dryRun) return { dry_run: true, method, url, idempotency_key: key ?? null, body: body ?? null };
  required(ctx.token, "MAXOPS_AGENT_TOKEN");
  const headers = { Authorization: `Bearer ${ctx.token}` };
  if (body) headers["Content-Type"] = "application/json";
  if (key) headers["Idempotency-Key"] = key;
  let response;
  try {
    response = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch (error) {
    throw new Error(`Network outcome unknown. Retry with the same --key${key ? ` (${key})` : ""}. ${error.message}`);
  }
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
  if (!response.ok) {
    const retry = response.status >= 500 ? ` Retry with the same --key${key ? ` (${key})` : ""}.` : "";
    throw new Error(`HTTP ${response.status}: ${payload.error || payload.message || text || response.statusText}.${retry}`);
  }
  return payload;
}

function eventBody(ctx, options, kind, state) {
  return {
    agent_id: ctx.agentId,
    agent_name: ctx.agentName,
    run_id: ctx.runId,
    task_id: required(options.task, "--task"),
    kind,
    state,
    title: required(options.title, "--title"),
    detail: required(options.detail, "--detail"),
    ...(options.artifact ? { artifact_url: options.artifact } : {}),
  };
}

async function postEvent(ctx, options, kind, state, action = kind) {
  const key = idempotency(ctx.agentId, ctx.runId, action, options.key);
  return request(ctx, "/api/agent/v1/events", {
    method: "POST", body: eventBody(ctx, options, kind, state), key, dryRun: options.dryRun,
  });
}

async function run(argv) {
  const { command, options } = parseArgs(argv);
  if (!commands.has(command)) throw new Error("Usage: maxops.mjs <doctor|health|new-run|task|start|progress|blocked|artifact|finish|inbox|ack> [options]");
  if (command === "doctor") {
    const ctx = context(options, false);
    const tokenConfigured = Boolean(ctx.token);
    return {
      ok: tokenConfigured,
      maxops_url: ctx.baseUrl,
      agent_id: ctx.agentId,
      agent_name: ctx.agentName,
      token_configured: tokenConfigured,
      next: tokenConfigured ? "Run: node scripts/maxops.mjs health" : "Set MAXOPS_AGENT_TOKEN in the runtime environment or secret manager; never paste it into chat.",
    };
  }
  if (command === "new-run") {
    const agentId = options.agentId || process.env.MAXOPS_AGENT_ID || "codex";
    return `${agentId}:${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}:${randomUUID().slice(0, 8)}`;
  }
  if (command === "health") {
    const ctx = context(options, false);
    return request(ctx, "/api/agent/v1/health", { dryRun: options.dryRun });
  }
  if (command === "task") {
    const ctx = context(options, false);
    const taskId = required(options.task, "--task");
    return request(ctx, `/api/agent/v1/tasks/${encodeURIComponent(taskId)}`, { dryRun: options.dryRun });
  }

  const ctx = context(options);
  if (command === "start") return postEvent(ctx, options, "run_started", "running");
  if (command === "progress") return postEvent(ctx, options, "progress", "running");
  if (command === "artifact") return postEvent(ctx, options, "artifact", "done");
  if (command === "blocked") {
    const event = await postEvent(ctx, options, "blocked", "blocked", "blocked");
    if (!options.question) return { event };
    const questionKey = idempotency(ctx.agentId, ctx.runId, "question", options.questionKey);
    const question = await request(ctx, "/api/agent/v1/questions", {
      method: "POST", key: questionKey, dryRun: options.dryRun,
      body: {
        agent_id: ctx.agentId, agent_name: ctx.agentName, run_id: ctx.runId,
        task_id: required(options.task, "--task"), question: options.question,
      },
    });
    return { event, question };
  }
  if (command === "finish") {
    const results = [];
    if (options.artifact) {
      const artifactOptions = { ...options, key: options.artifactKey || (options.key ? `${options.key}:artifact` : undefined) };
      results.push(await postEvent(ctx, artifactOptions, "artifact", "done", "artifact"));
    }
    const finishOptions = { ...options, artifact: undefined, key: options.finishKey || (options.artifact && options.key ? `${options.key}:finish` : options.key) };
    results.push(await postEvent(ctx, finishOptions, "run_finished", "done", "finish"));
    return { results };
  }
  if (command === "inbox") {
    const query = new URLSearchParams({ agent_id: ctx.agentId, run_id: ctx.runId });
    return request(ctx, `/api/agent/v1/inbox?${query}`, { dryRun: options.dryRun });
  }
  if (command === "ack") {
    const messageId = required(options.message, "--message");
    const key = idempotency(ctx.agentId, ctx.runId, `ack:${messageId}`, options.key);
    return request(ctx, `/api/agent/v1/messages/${encodeURIComponent(messageId)}/receipts`, {
      method: "POST", key, dryRun: options.dryRun,
      body: { agent_id: ctx.agentId, kind: options.kind || "acknowledged" },
    });
  }
}

export { parseArgs, run };

if (import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv.slice(2))
    .then((result) => process.stdout.write(`${typeof result === "string" ? result : JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`MAX OPS Reporter: ${error.message}\n`);
      process.exitCode = 1;
    });
}

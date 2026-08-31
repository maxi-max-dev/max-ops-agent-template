import { createHash, randomUUID } from "node:crypto";
import { ConfigurationError, IdentityError } from "./errors.mjs";

export const ADAPTERS = Object.freeze(["webhook_write", "feishu_base_direct"]);
export const EVENT_KINDS = Object.freeze([
  "run_started",
  "progress",
  "blocked",
  "question",
  "artifact",
  "run_finished",
]);

const KIND_STATES = Object.freeze({
  run_started: "running",
  progress: "running",
  blocked: "blocked",
  question: "blocked",
  artifact: "done",
  run_finished: "done",
});

export function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ConfigurationError(`Missing ${label}.`);
  }
  return value.trim();
}

export function requireTaskId(value) {
  const taskId = requireString(value, "task identity (--task or MAXOPS_TASK_ID)");
  if (taskId.length > 200 || /[\r\n]/.test(taskId)) {
    throw new IdentityError("Task identity is invalid.");
  }
  return taskId;
}

export function requireIdempotencyKey(value, label = "idempotency key (--key)") {
  const key = requireString(value, label);
  if (key.length < 12 || key.length > 200 || /[\r\n]/.test(key)) {
    throw new ConfigurationError(`${label} must contain 12–200 characters and no line breaks.`);
  }
  return key;
}

export function normalizeHttpUrl(value, label, { allowQuery = false, httpsOnly = false } = {}) {
  const raw = requireString(value, label);
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ConfigurationError(`${label} must be an absolute HTTP(S) URL.`);
  }
  if (!new Set(["http:", "https:"]).has(parsed.protocol)) {
    throw new ConfigurationError(`${label} must use HTTP(S).`);
  }
  if (httpsOnly && parsed.protocol !== "https:") {
    throw new ConfigurationError(`${label} must use HTTPS.`);
  }
  if (parsed.username || parsed.password || parsed.hash || (!allowQuery && parsed.search)) {
    throw new ConfigurationError(`${label} must not contain credentials, query parameters, or fragments.`);
  }
  return parsed.href.replace(/\/$/, "");
}

export function normalizeArtifactUrl(value) {
  if (!value) return undefined;
  return normalizeHttpUrl(value, "artifact URL");
}

export function payloadDigest(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function semanticEventDigest(event) {
  const { event_id: ignoredEventId, occurred_at: ignoredOccurredAt, ...semanticEvent } = event;
  return payloadDigest(semanticEvent);
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function createRunId(agentId, now = new Date()) {
  const timestamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `${agentId}:${timestamp}:${randomUUID().slice(0, 8)}`;
}

export function createEvent({
  instanceId,
  agentId,
  agentName,
  runId,
  taskId,
  kind,
  title,
  detail,
  artifactUrl,
  occurredAt = new Date().toISOString(),
}) {
  if (!EVENT_KINDS.includes(kind)) throw new ConfigurationError(`Unsupported event kind: ${kind}.`);
  const event = {
    schema_version: "maxops-agent-event/1",
    instance_id: requireString(instanceId, "MAXOPS_INSTANCE_ID"),
    event_id: randomUUID(),
    task_id: requireTaskId(taskId),
    agent_id: requireString(agentId, "MAXOPS_AGENT_ID"),
    agent_name: requireString(agentName, "MAXOPS_AGENT_NAME"),
    run_id: requireString(runId, "run identity (--run or MAXOPS_RUN_ID)"),
    kind,
    state: KIND_STATES[kind],
    title: requireString(title, "--title"),
    detail: requireString(detail, "--detail"),
    occurred_at: occurredAt,
  };
  const normalizedArtifact = normalizeArtifactUrl(artifactUrl);
  if (normalizedArtifact) event.artifact_url = normalizedArtifact;
  if (kind === "artifact") event.status = "pending_review";
  return event;
}

export function assertEventIdentity(actual, expected) {
  for (const key of ["instance_id", "task_id", "agent_id", "run_id"]) {
    if (actual?.[key] !== expected?.[key]) {
      throw new IdentityError(`Stored ${key} does not match the current operation.`);
    }
  }
}

export function redact(text, secrets = []) {
  let output = String(text ?? "");
  for (const secret of secrets.filter(Boolean)) output = output.split(secret).join("[REDACTED]");
  return output;
}

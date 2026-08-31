import { ADAPTERS, normalizeHttpUrl, requireString } from "./contract.mjs";
import { ConfigurationError } from "./errors.mjs";

const COMMON = ["MAXOPS_ADAPTER", "MAXOPS_INSTANCE_ID", "MAXOPS_AGENT_ID", "MAXOPS_AGENT_NAME"];
const WEBHOOK = ["MAXOPS_WEBHOOK_URL", "MAXOPS_WEBHOOK_TOKEN"];
const DIRECT = [
  "MAXOPS_FEISHU_APP_ID",
  "MAXOPS_FEISHU_APP_SECRET",
  "MAXOPS_FEISHU_APP_TOKEN",
  "MAXOPS_FEISHU_TASKS_TABLE_ID",
  "MAXOPS_FEISHU_EVENTS_TABLE_ID",
  "MAXOPS_FEISHU_FEEDBACK_TABLE_ID",
  "MAXOPS_FEISHU_RECEIPTS_TABLE_ID",
];

export const DEFAULT_FIELDS = Object.freeze({
  instanceId: "instance_id",
  taskId: "task_id",
  taskTitle: "任务名",
  taskStatus: "五态",
  eventId: "event_id",
  idempotencyKey: "idempotency_key",
  payloadDigest: "payload_digest",
  agentId: "agent_id",
  agentName: "agent_name",
  runId: "run_id",
  kind: "kind",
  state: "state",
  title: "title",
  detail: "detail",
  artifactUrl: "artifact_url",
  occurredAt: "occurred_at",
  messageId: "message_id",
  body: "body",
  reply: "reply",
  status: "status",
  createdAt: "created_at",
  repliedAt: "replied_at",
  receiptId: "receipt_id",
  receipt: "receipt",
  submittedAt: "submitted_at",
  acknowledgedAt: "acknowledged_at",
});

function missing(env, names) {
  return names.filter((name) => typeof env[name] !== "string" || !env[name].trim());
}

function requireSecret(value, label) {
  const secret = requireString(value, label);
  if (secret.length < 16) throw new ConfigurationError(`${label} must contain at least 16 characters.`);
  return secret;
}

function fieldMap(env) {
  if (!env.MAXOPS_FEISHU_FIELD_MAP_JSON) return { ...DEFAULT_FIELDS };
  let custom;
  try {
    custom = JSON.parse(env.MAXOPS_FEISHU_FIELD_MAP_JSON);
  } catch {
    throw new ConfigurationError("MAXOPS_FEISHU_FIELD_MAP_JSON must be valid JSON.");
  }
  if (!custom || Array.isArray(custom) || typeof custom !== "object") {
    throw new ConfigurationError("MAXOPS_FEISHU_FIELD_MAP_JSON must be a JSON object.");
  }
  for (const [key, value] of Object.entries(custom)) {
    if (!(key in DEFAULT_FIELDS)) throw new ConfigurationError(`Unknown field mapping: ${key}.`);
    requireString(value, `field mapping ${key}`);
  }
  return { ...DEFAULT_FIELDS, ...custom };
}

export function inspectConfiguration(env = process.env, adapterOverride) {
  const adapter = adapterOverride || env.MAXOPS_ADAPTER || "";
  const common = adapterOverride ? COMMON.filter((name) => name !== "MAXOPS_ADAPTER") : COMMON;
  const required = [...common, ...(adapter === "webhook_write" ? WEBHOOK : adapter === "feishu_base_direct" ? DIRECT : [])];
  const missingVariables = missing(env, required);
  if (!ADAPTERS.includes(adapter) && !missingVariables.includes("MAXOPS_ADAPTER")) missingVariables.unshift("MAXOPS_ADAPTER(valid value)");
  const webhookEndpointConfigured = typeof env.MAXOPS_WEBHOOK_URL === "string" && Boolean(env.MAXOPS_WEBHOOK_URL.trim());
  const webhookTokenConfigured = typeof env.MAXOPS_WEBHOOK_TOKEN === "string" && Boolean(env.MAXOPS_WEBHOOK_TOKEN.trim());
  return {
    ok: missingVariables.length === 0 && ADAPTERS.includes(adapter),
    connection_state: missingVariables.length === 0 && ADAPTERS.includes(adapter) ? "configured_not_verified" : "not_connected",
    adapter: ADAPTERS.includes(adapter) ? adapter : null,
    instance_id_configured: Boolean(env.MAXOPS_INSTANCE_ID),
    agent_id: env.MAXOPS_AGENT_ID || null,
    agent_name: env.MAXOPS_AGENT_NAME || null,
    missing: missingVariables,
    product_route: {
      default_route: "feishu_base_direct",
      explicit_adapter_selection_required: true,
      feishu_base_direct: "cross_plan_full_route",
      webhook_write: "capability_dependent_optional",
    },
    webhook_receiver: adapter === "webhook_write" ? {
      requirement: "Feishu native webhook receiver requires a Base plan that exposes the '接收到 Webhook 时' trigger.",
      endpoint_configured: webhookEndpointConfigured,
      token_configured: webhookTokenConfigured,
      state: webhookEndpointConfigured && webhookTokenConfigured ? "configured_not_verified" : "not_connected",
      unavailable_plan_action: "Use feishu_base_direct or a compatible user-owned receiver; do not substitute Feishu messages or forms.",
    } : null,
    secrets: {
      webhook_token_configured: webhookTokenConfigured,
      feishu_app_secret_configured: Boolean(env.MAXOPS_FEISHU_APP_SECRET),
    },
  };
}

export function loadConfiguration(env = process.env, adapterOverride) {
  const inspection = inspectConfiguration(env, adapterOverride);
  if (!inspection.ok) {
    throw new ConfigurationError(`Connector is not connected. Missing or invalid configuration: ${inspection.missing.join(", ")}.`, {
      missing: inspection.missing,
    });
  }
  const common = {
    adapter: inspection.adapter,
    instanceId: requireString(env.MAXOPS_INSTANCE_ID, "MAXOPS_INSTANCE_ID"),
    agentId: requireString(env.MAXOPS_AGENT_ID, "MAXOPS_AGENT_ID"),
    agentName: requireString(env.MAXOPS_AGENT_NAME, "MAXOPS_AGENT_NAME"),
  };
  if (inspection.adapter === "webhook_write") {
    return {
      ...common,
      webhookUrl: normalizeHttpUrl(env.MAXOPS_WEBHOOK_URL, "MAXOPS_WEBHOOK_URL", { httpsOnly: true }),
      webhookToken: requireSecret(env.MAXOPS_WEBHOOK_TOKEN, "MAXOPS_WEBHOOK_TOKEN"),
    };
  }
  const apiBase = normalizeHttpUrl(env.MAXOPS_FEISHU_API_BASE || "https://open.feishu.cn", "MAXOPS_FEISHU_API_BASE", { httpsOnly: true });
  if (!new Set(["open.feishu.cn", "open.larksuite.com"]).has(new URL(apiBase).hostname)) {
    throw new ConfigurationError("MAXOPS_FEISHU_API_BASE must be the official Feishu or Lark Open Platform host.");
  }
  return {
    ...common,
    apiBase,
    appId: requireString(env.MAXOPS_FEISHU_APP_ID, "MAXOPS_FEISHU_APP_ID"),
    appSecret: requireSecret(env.MAXOPS_FEISHU_APP_SECRET, "MAXOPS_FEISHU_APP_SECRET"),
    appToken: requireString(env.MAXOPS_FEISHU_APP_TOKEN, "MAXOPS_FEISHU_APP_TOKEN"),
    tables: {
      tasks: requireString(env.MAXOPS_FEISHU_TASKS_TABLE_ID, "MAXOPS_FEISHU_TASKS_TABLE_ID"),
      events: requireString(env.MAXOPS_FEISHU_EVENTS_TABLE_ID, "MAXOPS_FEISHU_EVENTS_TABLE_ID"),
      feedback: requireString(env.MAXOPS_FEISHU_FEEDBACK_TABLE_ID, "MAXOPS_FEISHU_FEEDBACK_TABLE_ID"),
      receipts: requireString(env.MAXOPS_FEISHU_RECEIPTS_TABLE_ID, "MAXOPS_FEISHU_RECEIPTS_TABLE_ID"),
    },
    fields: fieldMap(env),
  };
}

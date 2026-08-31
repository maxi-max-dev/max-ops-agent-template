import { randomUUID } from "node:crypto";
import {
  assertEventIdentity,
  payloadDigest,
  requireIdempotencyKey,
  requireString,
  requireTaskId,
  semanticEventDigest,
} from "../lib/contract.mjs";
import { ConflictError, ConnectorError, IdentityError } from "../lib/errors.mjs";

const locks = new Map();

function fieldText(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => typeof item === "string" ? item : item?.text ?? item?.name ?? "").join("").trim();
  }
  if (value && typeof value === "object") return value.text ?? value.name ?? "";
  return "";
}

async function serialize(key, action) {
  const previous = locks.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  const tail = previous.then(() => current);
  locks.set(key, tail);
  await previous;
  try {
    return await action();
  } finally {
    release();
    if (locks.get(key) === tail) locks.delete(key);
  }
}

export function isoToEpochMilliseconds(value, label = "event.occurred_at") {
  if (typeof value !== "string" || value !== value.trim()) {
    throw new ConnectorError("INVALID_TIME", `${label} must be a valid ISO-8601 timestamp with an explicit timezone.`);
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) {
    throw new ConnectorError("INVALID_TIME", `${label} must be a valid ISO-8601 timestamp with an explicit timezone.`);
  }

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fractionText = "", zone, sign, offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const millisecond = Number(fractionText.padEnd(3, "0"));
  const offsetHour = Number(offsetHourText || 0);
  const offsetMinute = Number(offsetMinuteText || 0);
  if (
    month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59
    || offsetHour > 23 || offsetMinute > 59
  ) {
    throw new ConnectorError("INVALID_TIME", `${label} contains an invalid calendar or clock value.`);
  }

  const local = new Date(0);
  local.setUTCFullYear(year, month - 1, day);
  local.setUTCHours(hour, minute, second, millisecond);
  if (
    local.getUTCFullYear() !== year || local.getUTCMonth() !== month - 1 || local.getUTCDate() !== day
    || local.getUTCHours() !== hour || local.getUTCMinutes() !== minute || local.getUTCSeconds() !== second
    || local.getUTCMilliseconds() !== millisecond
  ) {
    throw new ConnectorError("INVALID_TIME", `${label} contains an invalid calendar or clock value.`);
  }

  const offset = zone === "Z" ? 0 : (offsetHour * 60 + offsetMinute) * 60_000 * (sign === "+" ? 1 : -1);
  const epochMilliseconds = local.getTime() - offset;
  if (!Number.isSafeInteger(epochMilliseconds) || !Number.isFinite(epochMilliseconds)) {
    throw new ConnectorError("INVALID_TIME", `${label} is outside the supported epoch-millisecond range.`);
  }
  return epochMilliseconds;
}

function requireEpochMilliseconds(value, label) {
  if (!Number.isSafeInteger(value) || !Number.isFinite(value)) {
    throw new ConnectorError("INVALID_TIME", `${label} must be a finite epoch-millisecond integer.`);
  }
  return value;
}

export class FeishuBaseDirectAdapter {
  constructor(config, { fetchImpl = globalThis.fetch, now = Date.now } = {}) {
    this.name = "feishu_base_direct";
    this.config = config;
    this.fetch = fetchImpl;
    this.now = now;
    this.tenantToken = null;
  }

  get connectionValues() {
    return [
      this.config.appId,
      this.config.appSecret,
      this.config.appToken,
      this.tenantToken,
      ...Object.values(this.config.tables),
    ].filter(Boolean);
  }

  assertNoConnectionValue(value, context) {
    const serialized = JSON.stringify(value);
    if (this.connectionValues.some((connectionValue) => serialized.includes(connectionValue))) {
      throw new ConnectorError("SECRET_EGRESS", `Refusing to expose a connection value through ${context}.`);
    }
  }

  async authenticate() {
    if (this.tenantToken) return this.tenantToken;
    const response = await this.rawRequest("/open-apis/auth/v3/tenant_access_token/internal", {
      method: "POST",
      body: { app_id: this.config.appId, app_secret: this.config.appSecret },
      authenticated: false,
      operation: "Feishu authentication",
    });
    const token = requireString(response.tenant_access_token, "tenant_access_token in Feishu response");
    this.tenantToken = token;
    return token;
  }

  async rawRequest(path, { method = "GET", body, authenticated = true, operation = "Feishu request" } = {}) {
    const headers = {};
    if (authenticated) headers.Authorization = `Bearer ${await this.authenticate()}`;
    if (body) headers["Content-Type"] = "application/json";
    let response;
    try {
      response = await this.fetch(`${this.config.apiBase}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      throw new ConnectorError("NETWORK_OUTCOME_UNKNOWN", `${operation} outcome is unknown.`);
    }
    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = {};
    }
    if (!response.ok || (typeof payload.code === "number" && payload.code !== 0)) {
      const code = typeof payload.code === "number" ? ` / Feishu ${payload.code}` : "";
      const retry = response.status >= 500 ? " Retry the same logical mutation with the same idempotency key." : "";
      throw new ConnectorError("FEISHU_REJECTED", `${operation} failed with HTTP ${response.status}${code}.${retry}`);
    }
    return payload;
  }

  tablePath(tableId, suffix = "") {
    return `/open-apis/bitable/v1/apps/${encodeURIComponent(this.config.appToken)}/tables/${encodeURIComponent(tableId)}/records${suffix}`;
  }

  async search(tableId, conditions, { pageSize = 100 } = {}) {
    const items = [];
    let pageToken = "";
    for (let page = 0; page < 10; page += 1) {
      const query = new URLSearchParams({ page_size: String(pageSize) });
      if (pageToken) query.set("page_token", pageToken);
      const payload = await this.rawRequest(this.tablePath(tableId, `/search?${query}`), {
        method: "POST",
        operation: "Feishu Base search",
        body: {
          filter: {
            conjunction: "and",
            conditions: conditions.map(({ field, value }) => ({
              field_name: field,
              operator: "is",
              value: [String(value)],
            })),
          },
        },
      });
      items.push(...(payload.data?.items ?? []));
      if (!payload.data?.has_more) return items;
      pageToken = requireString(payload.data?.page_token, "page_token in paginated Feishu response");
    }
    throw new ConnectorError("PAGINATION_LIMIT", "Feishu Base search exceeded the connector's bounded page limit.");
  }

  async create(tableId, fields, operation) {
    const payload = await this.rawRequest(this.tablePath(tableId), {
      method: "POST",
      operation,
      body: { fields },
    });
    const recordId = payload.data?.record?.record_id;
    if (!recordId) throw new ConnectorError("INVALID_FEISHU_RESPONSE", `${operation} did not return a record identity.`);
    return { recordId, fields: payload.data.record.fields ?? fields };
  }

  identityConditions(taskId, agentId, runId) {
    const f = this.config.fields;
    return [
      { field: f.instanceId, value: this.config.instanceId },
      { field: f.taskId, value: taskId },
      ...(agentId ? [{ field: f.agentId, value: agentId }] : []),
      ...(runId ? [{ field: f.runId, value: runId }] : []),
    ];
  }

  async readTask(taskId) {
    const normalizedTaskId = requireTaskId(taskId);
    const f = this.config.fields;
    const matches = await this.search(this.config.tables.tasks, this.identityConditions(normalizedTaskId));
    if (matches.length !== 1) {
      throw new IdentityError(matches.length === 0
        ? "No task matches this instance and task identity."
        : "Task identity is ambiguous inside this instance.");
    }
    const fields = matches[0].fields ?? {};
    const returnedTaskId = fieldText(fields[f.taskId]);
    const returnedInstanceId = fieldText(fields[f.instanceId]);
    if (returnedTaskId !== normalizedTaskId || returnedInstanceId !== this.config.instanceId) {
      throw new IdentityError("Feishu returned a task outside the configured instance/task scope.");
    }
    const task = {
      task_id: returnedTaskId,
      title: fieldText(fields[f.taskTitle]),
      status: fieldText(fields[f.taskStatus]),
      instance_id: returnedInstanceId,
    };
    this.assertNoConnectionValue(task, "task output");
    return task;
  }

  eventFields(event, key, digest, occurredAtMilliseconds) {
    const f = this.config.fields;
    return {
      [f.instanceId]: event.instance_id,
      [f.idempotencyKey]: key,
      [f.payloadDigest]: digest,
      [f.eventId]: event.event_id,
      [f.taskId]: event.task_id,
      [f.agentId]: event.agent_id,
      [f.agentName]: event.agent_name,
      [f.runId]: event.run_id,
      [f.kind]: event.kind,
      [f.state]: event.state,
      ...(event.status ? { [f.status]: event.status } : {}),
      [f.title]: event.title,
      [f.detail]: event.detail,
      ...(event.artifact_url ? { [f.artifactUrl]: event.artifact_url } : {}),
      [f.occurredAt]: occurredAtMilliseconds,
    };
  }

  async writeEvent(event, key) {
    const idempotencyKey = requireIdempotencyKey(key);
    const occurredAtMilliseconds = isoToEpochMilliseconds(event.occurred_at);
    this.assertNoConnectionValue(event, "an event");
    if (event.instance_id !== this.config.instanceId) {
      throw new IdentityError("Event instance identity does not match the configured Feishu copy.");
    }
    if (event.agent_id !== this.config.agentId || event.agent_name !== this.config.agentName) {
      throw new IdentityError("Event Agent identity does not match the configured Agent.");
    }
    assertEventIdentity(event, {
      instance_id: this.config.instanceId,
      task_id: event.task_id,
      agent_id: event.agent_id,
      run_id: event.run_id,
    });
    await this.readTask(event.task_id);
    const digest = semanticEventDigest(event);
    const lockKey = `${this.config.appToken}:${this.config.tables.events}:${this.config.instanceId}:${idempotencyKey}`;
    return serialize(lockKey, async () => {
      const f = this.config.fields;
      const prior = await this.search(this.config.tables.events, [
        { field: f.instanceId, value: this.config.instanceId },
        { field: f.idempotencyKey, value: idempotencyKey },
      ], { pageSize: 2 });
      if (prior.length > 1) throw new ConflictError("Duplicate stored rows already exist for this idempotency key.");
      if (prior.length === 1) {
        const stored = prior[0].fields ?? {};
        const storedIdentity = {
          instance_id: fieldText(stored[f.instanceId]),
          task_id: fieldText(stored[f.taskId]),
          agent_id: fieldText(stored[f.agentId]),
          run_id: fieldText(stored[f.runId]),
        };
        assertEventIdentity(storedIdentity, event);
        if (fieldText(stored[f.payloadDigest]) !== digest) {
          throw new ConflictError("Idempotency key was already used for a different event payload.");
        }
        return {
          ok: true,
          adapter: this.name,
          duplicate: true,
          receipt_id: `event:${fieldText(stored[f.eventId])}`,
          idempotency_key: idempotencyKey,
        };
      }
      await this.create(
        this.config.tables.events,
        this.eventFields(event, idempotencyKey, digest, occurredAtMilliseconds),
        "Feishu event write",
      );
      return {
        ok: true,
        adapter: this.name,
        duplicate: false,
        receipt_id: `event:${event.event_id}`,
        idempotency_key: idempotencyKey,
      };
    });
  }

  async inbox({ taskId, agentId, runId }) {
    const normalizedTaskId = requireTaskId(taskId);
    await this.readTask(normalizedTaskId);
    const f = this.config.fields;
    const identity = this.identityConditions(normalizedTaskId, requireString(agentId, "agent identity"), requireString(runId, "run identity"));
    const messages = await this.search(
      this.config.tables.feedback,
      [...identity, { field: f.status, value: "replied" }],
    );
    const receipts = await this.search(
      this.config.tables.receipts,
      [...identity, { field: f.status, value: "acknowledged" }],
    );
    const acknowledged = new Set(receipts.map((item) => fieldText(item.fields?.[f.messageId])));
    const result = {
      ok: true,
      adapter: this.name,
      task_id: normalizedTaskId,
      messages: messages.filter((item) => !acknowledged.has(fieldText(item.fields?.[f.messageId]))).map((item) => ({
        message_id: fieldText(item.fields?.[f.messageId]),
        task_id: fieldText(item.fields?.[f.taskId]),
        agent_id: fieldText(item.fields?.[f.agentId]),
        run_id: fieldText(item.fields?.[f.runId]),
        body: fieldText(item.fields?.[f.reply]),
        status: fieldText(item.fields?.[f.status]),
        created_at: fieldText(item.fields?.[f.repliedAt] ?? item.fields?.[f.createdAt]),
      })),
    };
    this.assertNoConnectionValue(result, "inbox output");
    return result;
  }

  receiptFields({ receiptId, messageId, taskId, agentId, runId, key, digest }) {
    const f = this.config.fields;
    const acknowledgedAt = requireEpochMilliseconds(this.now(), "receipt acknowledgement time");
    return {
      [f.instanceId]: this.config.instanceId,
      [f.idempotencyKey]: key,
      [f.payloadDigest]: digest,
      [f.receiptId]: receiptId,
      [f.messageId]: messageId,
      [f.taskId]: taskId,
      [f.agentId]: agentId,
      [f.runId]: runId,
      [f.status]: "acknowledged",
      [f.receipt]: "Agent accepted this feedback message.",
      [f.submittedAt]: acknowledgedAt,
      [f.acknowledgedAt]: acknowledgedAt,
    };
  }

  async acknowledge({ taskId, agentId, runId, messageId, key }) {
    const normalizedTaskId = requireTaskId(taskId);
    const normalizedAgentId = requireString(agentId, "agent identity");
    const normalizedRunId = requireString(runId, "run identity");
    const normalizedMessageId = requireString(messageId, "message identity (--message)");
    const idempotencyKey = requireIdempotencyKey(key);
    await this.readTask(normalizedTaskId);
    const f = this.config.fields;
    const messages = await this.search(this.config.tables.feedback, [
      ...this.identityConditions(normalizedTaskId, normalizedAgentId, normalizedRunId),
      { field: f.messageId, value: normalizedMessageId },
      { field: f.status, value: "replied" },
    ], { pageSize: 2 });
    if (messages.length !== 1) throw new IdentityError("Feedback message does not match the current instance, task, Agent, and run.");

    const ackPayload = {
      instance_id: this.config.instanceId,
      task_id: normalizedTaskId,
      agent_id: normalizedAgentId,
      run_id: normalizedRunId,
      message_id: normalizedMessageId,
      kind: "acknowledged",
    };
    const digest = payloadDigest(ackPayload);
    const lockKey = `${this.config.appToken}:${this.config.tables.receipts}:${this.config.instanceId}:message:${normalizedMessageId}`;
    return serialize(lockKey, async () => {
      const prior = await this.search(this.config.tables.receipts, [
        { field: f.instanceId, value: this.config.instanceId },
        { field: f.idempotencyKey, value: idempotencyKey },
      ], { pageSize: 2 });
      if (prior.length > 1) throw new ConflictError("Duplicate receipt rows already exist for this idempotency key.");
      if (prior.length === 1) {
        const stored = prior[0].fields ?? {};
        if (fieldText(stored[f.payloadDigest]) !== digest) {
          throw new ConflictError("Idempotency key was already used for a different acknowledgement.");
        }
        return {
          ok: true,
          adapter: this.name,
          duplicate: true,
          receipt_id: fieldText(stored[f.receiptId]),
          message_id: normalizedMessageId,
        };
      }
      const priorMessage = await this.search(this.config.tables.receipts, [
        ...this.identityConditions(normalizedTaskId, normalizedAgentId, normalizedRunId),
        { field: f.messageId, value: normalizedMessageId },
        { field: f.status, value: "acknowledged" },
      ], { pageSize: 2 });
      if (priorMessage.length > 1) throw new ConflictError("Duplicate acknowledgement receipts already exist for this feedback message.");
      if (priorMessage.length === 1) {
        const stored = priorMessage[0].fields ?? {};
        if (fieldText(stored[f.payloadDigest]) !== digest) {
          throw new ConflictError("Feedback message already has a receipt with a different identity payload.");
        }
        return {
          ok: true,
          adapter: this.name,
          duplicate: true,
          receipt_id: fieldText(stored[f.receiptId]),
          message_id: normalizedMessageId,
        };
      }
      const receiptId = `receipt:${randomUUID()}`;
      await this.create(
        this.config.tables.receipts,
        this.receiptFields({
          receiptId,
          messageId: normalizedMessageId,
          taskId: normalizedTaskId,
          agentId: normalizedAgentId,
          runId: normalizedRunId,
          key: idempotencyKey,
          digest,
        }),
        "Feishu acknowledgement receipt write",
      );
      return { ok: true, adapter: this.name, duplicate: false, receipt_id: receiptId, message_id: normalizedMessageId };
    });
  }

  async readReceipt({ taskId, agentId, runId, receiptId }) {
    const normalizedTaskId = requireTaskId(taskId);
    const normalizedAgentId = requireString(agentId, "agent identity");
    const normalizedRunId = requireString(runId, "run identity");
    const normalizedReceiptId = requireString(receiptId, "receipt identity (--receipt)");
    const f = this.config.fields;
    const matches = await this.search(this.config.tables.receipts, [
      ...this.identityConditions(normalizedTaskId, normalizedAgentId, normalizedRunId),
      { field: f.receiptId, value: normalizedReceiptId },
    ], { pageSize: 2 });
    if (matches.length !== 1) throw new IdentityError("Receipt does not match the current instance, task, Agent, and run.");
    const fields = matches[0].fields ?? {};
    const result = {
      ok: true,
      adapter: this.name,
      receipt: {
        receipt_id: fieldText(fields[f.receiptId]),
        message_id: fieldText(fields[f.messageId]),
        task_id: fieldText(fields[f.taskId]),
        agent_id: fieldText(fields[f.agentId]),
        run_id: fieldText(fields[f.runId]),
        kind: fieldText(fields[f.status]),
        receipt: fieldText(fields[f.receipt]),
        created_at: fieldText(fields[f.acknowledgedAt]),
      },
    };
    this.assertNoConnectionValue(result, "receipt output");
    return result;
  }
}

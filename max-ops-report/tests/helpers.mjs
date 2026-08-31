import { DEFAULT_FIELDS } from "../lib/config.mjs";

function comparable(value) {
  if (Array.isArray(value)) return value.map(comparable).join("");
  if (value && typeof value === "object") return value.text ?? value.name ?? JSON.stringify(value);
  return String(value ?? "");
}

export function directConfig(instanceId = "copy-alpha") {
  return {
    adapter: "feishu_base_direct",
    instanceId,
    agentId: "test-agent",
    agentName: "Test Agent",
    apiBase: "https://open.feishu.cn",
    appId: "fixture-app-id",
    appSecret: "fixture-app-secret",
    appToken: "fixture-base",
    tables: {
      tasks: "tbl_tasks",
      events: "tbl_events",
      feedback: "tbl_feedback",
      receipts: "tbl_receipts",
    },
    fields: { ...DEFAULT_FIELDS },
  };
}

export function directEnv(instanceId = "copy-alpha") {
  return {
    MAXOPS_ADAPTER: "feishu_base_direct",
    MAXOPS_INSTANCE_ID: instanceId,
    MAXOPS_AGENT_ID: "test-agent",
    MAXOPS_AGENT_NAME: "Test Agent",
    MAXOPS_FEISHU_APP_ID: "fixture-app-id",
    MAXOPS_FEISHU_APP_SECRET: "fixture-app-secret",
    MAXOPS_FEISHU_APP_TOKEN: "fixture-base",
    MAXOPS_FEISHU_TASKS_TABLE_ID: "tbl_tasks",
    MAXOPS_FEISHU_EVENTS_TABLE_ID: "tbl_events",
    MAXOPS_FEISHU_FEEDBACK_TABLE_ID: "tbl_feedback",
    MAXOPS_FEISHU_RECEIPTS_TABLE_ID: "tbl_receipts",
  };
}

export function makeFeishuFixture() {
  const tables = new Map();
  const calls = [];
  let sequence = 0;

  function table(id) {
    if (!tables.has(id)) tables.set(id, []);
    return tables.get(id);
  }

  function seed(tableId, fields) {
    const record = { record_id: `rec_${++sequence}`, fields: { ...fields } };
    table(tableId).push(record);
    return record;
  }

  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    const parsed = new URL(url);
    if (parsed.pathname === "/open-apis/auth/v3/tenant_access_token/internal") {
      return Response.json({ code: 0, tenant_access_token: "fixture-tenant-access" });
    }
    const match = parsed.pathname.match(/\/tables\/([^/]+)\/records(\/search)?$/);
    if (!match) return Response.json({ code: 404, msg: "not found" }, { status: 404 });
    const tableId = decodeURIComponent(match[1]);
    const body = options.body ? JSON.parse(options.body) : {};
    if (match[2]) {
      const conditions = body.filter?.conditions ?? [];
      const items = table(tableId).filter((record) => conditions.every((condition) => {
        const expected = comparable(condition.value?.[0]);
        return comparable(record.fields?.[condition.field_name]) === expected;
      }));
      return Response.json({ code: 0, data: { items, has_more: false } });
    }
    if (options.method === "POST") {
      const record = seed(tableId, body.fields ?? {});
      return Response.json({ code: 0, data: { record } });
    }
    return Response.json({ code: 405, msg: "method not allowed" }, { status: 405 });
  };

  return { fetchImpl, tables, calls, seed, table };
}

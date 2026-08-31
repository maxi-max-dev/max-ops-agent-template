# MAX OPS Agent Connector

这是一个连接**用户自己飞书模板副本**的运行时无关 Connector。它不需要 Max 托管的域名、共享 Agent token、Feishu `record_id`、ChatGPT 或任何指定模型 API；AI 由用户自己的 Codex、Claude Code、OpenClaw 或其他 Agent 提供。

Connector 保留六类生命周期语义：`start`、`progress`、`blocked`、`question`、`artifact`、`finish`。用户必须显式选择适配器，没有默认生产 endpoint，也不会在配置失败时回退到 PREVIEW 或模拟成功。

## 两种适配器

| 适配器 | 用途 | 能力 | 明确不做 |
|---|---|---|---|
| `webhook_write` | capability-dependent 可选写入模式 | 安全写入六类 Agent 事件 | 不读任务、不读反馈、不 ack、不伪造 receipt |
| `feishu_base_direct` | 跨套餐完整默认路线 | 读一条任务、写事件、读 feedback inbox、写 ack/receipt | 不枚举整张任务表、不改任务五态 |

两种模式都用 `instance_id + task_id` 绑定模板副本和逻辑任务，不要求 Feishu 记录 ID。任务五态始终由人或飞书工作流维护；`status-request` 只是写入一条 `question` 事件。

产品默认路线是 `feishu_base_direct`：它不依赖 Base 原生 webhook trigger，并提供完整 feedback/ack/receipt 闭环。为避免静默误连，CLI 仍要求显式设置 `MAXOPS_ADAPTER`；只有在复制前确认租户套餐开放“接收到 Webhook 时”并实际生成新 endpoint/token 后，才选择可选的 `webhook_write`。

## 本地自检

需要 Node.js 20 或更高版本，无第三方依赖：

```bash
npm run validate
npm test
npm run lint
```

这些命令不访问网络、不读取真实飞书、不需要任何凭据。通过只说明客户端合同和离线 fixture 正常，不代表某个飞书副本已连接。

## 从飞书模板副本实例化

1. 复制飞书模板，在该副本中生成一个稳定且唯一的 `instance_id`；同一副本的任务、事件、反馈和回执都使用它。
2. 确认机器字段与 [飞书 Base 字段合同](max-ops-report/references/feishu-base-contract.md) 一致。机器字段使用 snake_case；机器 `status` 必须用英文枚举，中文只放独立展示列；任务的人类展示列默认是“任务名”和“五态”。
3. 默认选择跨套餐完整路线 `feishu_base_direct`。只有先确认租户能力并生成副本自有 endpoint/token，才选择 `webhook_write`。在本机环境或 secret manager 注入配置，不要把值写进飞书字段、仓库、聊天、命令参数或 artifact URL。
4. 运行 `doctor`。缺项时输出 `connection_state: not_connected` 并退出；不会生成假结果。
5. 完整模式运行 `connect --task <task_id>` 验证凭据和唯一任务身份；写入模式只会返回 `configured_not_verified`，第一条成功事件才是远端写入证据。
6. 用一个稳定 `run_id` 和每次 mutation 的显式 idempotency key 完成生命周期。

### `webhook_write`

由用户自己的飞书自动化或接收器提供一个干净的 HTTPS URL 和 Bearer token。接收器必须实现 [webhook contract](max-ops-report/references/webhook-contract.md)，特别是任务校验与 `(instance_id, idempotency_key)` 去重。

**套餐前置条件：** Feishu native webhook receiver requires a Base plan that exposes the “接收到 Webhook 时” trigger。部分账号/套餐会在选择该触发器时要求升级，此时不会生成副本自有 endpoint/token；保持 `MAXOPS_WEBHOOK_URL`/`MAXOPS_WEBHOOK_TOKEN` 未配置，`doctor` 必须返回 `not_connected`。不要填占位值冒充连接，也不要降级为飞书消息、表单或其他不兼容入口。可改用 `feishu_base_direct`，或使用严格实现本仓库合同的用户自有接收器。

```bash
export MAXOPS_ADAPTER='webhook_write'
export MAXOPS_INSTANCE_ID='copy-your-own-stable-id'
export MAXOPS_AGENT_ID='codex'
export MAXOPS_AGENT_NAME='Codex'
# MAXOPS_WEBHOOK_URL 与 MAXOPS_WEBHOOK_TOKEN 由本机环境或 secret manager 注入

node max-ops-report/scripts/maxops.mjs doctor
```

URL 必须使用 HTTPS，且不得包含 query、fragment、用户名或密码；token 至少 16 字符并只进入 `Authorization` header。
`doctor.webhook_receiver` 会显示套餐前置条件、endpoint/token 是否已配置及 `not_connected`/`configured_not_verified` 状态；它不会把仅有 UI 配置意图当作已连接。

### `feishu_base_direct`

创建用户自己的飞书企业自建应用，按 [最小权限说明](max-ops-report/references/minimum-permissions.md) 授权并把应用添加为该 Base 的文档应用/可编辑协作者。然后在本机配置：

```bash
export MAXOPS_ADAPTER='feishu_base_direct'
export MAXOPS_INSTANCE_ID='copy-your-own-stable-id'
export MAXOPS_AGENT_ID='codex'
export MAXOPS_AGENT_NAME='Codex'
# 以下值由本机环境或 secret manager 注入；不要粘贴到聊天或命令参数：
# MAXOPS_FEISHU_APP_ID
# MAXOPS_FEISHU_APP_SECRET
# MAXOPS_FEISHU_APP_TOKEN
# MAXOPS_FEISHU_TASKS_TABLE_ID
# MAXOPS_FEISHU_EVENTS_TABLE_ID
# MAXOPS_FEISHU_FEEDBACK_TABLE_ID
# MAXOPS_FEISHU_RECEIPTS_TABLE_ID

node max-ops-report/scripts/maxops.mjs doctor
node max-ops-report/scripts/maxops.mjs connect --task 'task-your-own-id'
```

如模板复制后更改了字段名，可用 `MAXOPS_FEISHU_FIELD_MAP_JSON` 覆盖映射；它只能包含字段名，不能放凭据。默认值已经与模板支线的 snake_case 机器合同一致。

直接模式只允许向官方 `https://open.feishu.cn`（或 Lark 的 `https://open.larksuite.com`）发送应用凭据；自定义到其他 host 会 fail closed。

时间合同：公共事件和 `webhook_write` 保持 ISO-8601 字符串 `occurred_at`；`feishu_base_direct` 写飞书日期字段时转换为 epoch milliseconds number。回执的 `submitted_at`/`acknowledged_at` 写入同一个毫秒值。非法事件时间会以 `INVALID_TIME` 失败，不会静默改成当前时间。

## 生命周期示例

先生成或自行保存一个稳定 run ID：

```bash
node max-ops-report/scripts/maxops.mjs new-run
```

将输出保存到本地 `MAXOPS_RUN_ID`，并为每个逻辑 mutation 提供 12–200 字符的唯一 key：

```bash
node max-ops-report/scripts/maxops.mjs start --task "$MAXOPS_TASK_ID" --run "$MAXOPS_RUN_ID" --title '开始处理' --detail '已读取范围并开始。' --key "$MAXOPS_RUN_ID:start:001"
node max-ops-report/scripts/maxops.mjs progress --task "$MAXOPS_TASK_ID" --run "$MAXOPS_RUN_ID" --title '完成关键步骤' --detail '描述可验证变化。' --key "$MAXOPS_RUN_ID:progress:001"
node max-ops-report/scripts/maxops.mjs blocked --task "$MAXOPS_TASK_ID" --run "$MAXOPS_RUN_ID" --title '需要决定' --detail '说明阻塞。' --question '需要用户回答的问题。' --key "$MAXOPS_RUN_ID:blocked:001" --question-key "$MAXOPS_RUN_ID:question:001"
node max-ops-report/scripts/maxops.mjs artifact --task "$MAXOPS_TASK_ID" --run "$MAXOPS_RUN_ID" --title '产物' --detail '产物已生成。' --artifact 'https://artifacts.example/result' --key "$MAXOPS_RUN_ID:artifact:001"
node max-ops-report/scripts/maxops.mjs finish --task "$MAXOPS_TASK_ID" --run "$MAXOPS_RUN_ID" --title '完成' --detail '测试与检查通过。' --key "$MAXOPS_RUN_ID:finish:001"
```

完整模式的 feedback 闭环：

```bash
node max-ops-report/scripts/maxops.mjs inbox --task "$MAXOPS_TASK_ID" --run "$MAXOPS_RUN_ID"
node max-ops-report/scripts/maxops.mjs ack --task "$MAXOPS_TASK_ID" --run "$MAXOPS_RUN_ID" --message 'message-id-from-inbox' --key "$MAXOPS_RUN_ID:ack:message-id"
node max-ops-report/scripts/maxops.mjs receipt --task "$MAXOPS_TASK_ID" --run "$MAXOPS_RUN_ID" --receipt 'receipt-id-from-ack'
```

重试相同逻辑动作必须复用原 key；同 key、同 payload 返回 replay，不新增记录。同 key、不同 payload 会失败为 `IDEMPOTENCY_CONFLICT`。

## 仓库内容

- `max-ops-report/SKILL.md`：给 Agent 的安全运行流程。
- `max-ops-report/adapter-manifest.json`：机器可读双适配器合同。
- `max-ops-report/adapters/`：`webhook_write` 与 `feishu_base_direct` 实现。
- `max-ops-report/scripts/maxops.mjs`：零依赖 CLI。
- `max-ops-report/references/`：adapter、webhook、Base 字段与最小权限合同。
- `max-ops-report/tests/`：隔离、幂等、错误身份、缺凭据和完整链路测试。

更完整的首次验收步骤见 [REPRODUCE.md](REPRODUCE.md)。MIT License。

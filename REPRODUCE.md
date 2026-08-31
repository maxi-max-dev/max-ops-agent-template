# MAX OPS Agent Connector 复现与验收

本仓库的目标是让每个用户连接自己的飞书模板副本。公开自检不需要账号；真实连接只使用该用户本地注入的配置和凭据。

## A. 离线合同验收

```bash
git clone <this-repository>
cd max-ops-agent-template
npm run validate
npm test
npm run lint
```

预期结果：

- manifest 同时声明 `webhook_write` 和 `feishu_base_direct`，且没有默认 adapter。
- 缺配置明确得到 `not_connected`，无 PREVIEW 或模拟成功。
- 两个 `instance_id` 即使复用同一个 task ID 和 idempotency key 也互相隔离。
- 同副本重放相同 key 不重复写入；变更 payload 后复用 key 会冲突。
- 错误 task identity 在写事件之前被拒绝。
- 完整模式可在 fixture 中走完 `start → progress → blocked/question → reply → inbox → ack/receipt → artifact → finish`。
- 中文 `已回复` 不会被误当成机器状态；只有精确 `status=replied` 才进入 inbox，ack 与 artifact 分别断言 `acknowledged`、`pending_review`。
- Direct fixture 断言 `occurred_at`、`submitted_at`、`acknowledged_at` 为正确的 epoch-milliseconds number；webhook fixture 断言公开事件仍是原始 ISO 字符串；非法日期在发起网络请求前失败。

这一步不证明任何真实飞书副本已经连接。

## B. 新副本实例化

1. 复制用户自己的飞书模板。
2. 给副本设置新的 `instance_id`，不要沿用另一个副本的值。
3. 检查任务、事件、反馈、回执表的机器字段；以 `max-ops-report/references/feishu-base-contract.md` 为准。
4. 默认走跨套餐完整路线 `feishu_base_direct`。只有套餐实际开放原生 webhook trigger 时才选择可选的 `webhook_write`；只在本机环境/secret store 配置连接信息。
5. 运行 `doctor`。若 `ok: false` 或 `connection_state: not_connected`，停止并补配置。

## C. `webhook_write` 真实写入验收

1. 先确认该 Base 套餐实际开放原生“接收到 Webhook 时”触发器。若界面提示升级且未生成 endpoint/token，停止：`doctor` 应为 `not_connected`。不要改用飞书消息或表单冒充 webhook。
2. 在用户自己的飞书环境创建事件写入 webhook/自动化接收器。
3. 让接收器验证 Bearer token、`instance_id` 和 task allowlist，并按 `(instance_id, idempotency_key)` 去重。
4. 只有真实生成后才注入 `MAXOPS_WEBHOOK_URL` 与 `MAXOPS_WEBHOOK_TOKEN`，URL 不得携带 secret。
5. 运行 `doctor`；它只证明配置结构完整，状态仍是 `configured_not_verified`。
6. 对一个虚构任务写 `start`，确认用户自己的事件表出现且字段身份一致。
7. 使用相同 key 重放，确认没有第二行；更换错误 task ID，确认接收器拒绝。

该模式不应能读取任务、inbox、ack 或 receipt。

## D. `feishu_base_direct` 完整链路验收

1. 创建用户自己的飞书企业自建应用，仅授予 `base:record:retrieve` 和 `base:record:create`，发布应用，并把它添加为该 Base 的文档应用/可编辑协作者。
2. 从本地环境或 secret manager 注入 App ID、App Secret、Base app token 和四张表 ID。
3. 在任务表建一条虚构任务，确保 `instance_id` 和 `task_id` 唯一。
4. 运行 `doctor`，再运行 `connect --task <task_id>`。成功应返回逻辑 task ID，不依赖或暴露 Feishu `record_id`。
5. 用稳定 run ID 写入 start、progress、question。
6. 人在反馈表对同一个 `instance_id/task_id/agent_id/run_id` 填写 `reply`。
7. Agent 运行 `inbox`，只接受完整身份一致的消息；再运行 `ack` 并保存 `receipt_id`。
8. 运行 `receipt` 读回同一回执，再写 artifact 和 finish。
9. 重放一个已成功 key，确认表中未新增；用另一副本的 `instance_id` 或错误 task ID，确认读取/写入失败。

## E. 安全审计

- `git grep` 不应出现真实 App Secret、webhook token、tenant access token、Base app token 或表 ID。
- 飞书模板字段、artifact URL、CLI 参数和日志中不得出现凭据。
- 浏览器/Agent 网络请求只能到用户配置的 webhook 或飞书开放平台，不请求任何 Max 控制的生产域名。
- Agent 不写任务五态；状态建议只能作为 `question` 事件交给人或飞书工作流处理。

真实 Base 的字段类型、应用发布状态和文档应用权限必须在用户租户中单独验收；离线 fixture 不能替代这一步。

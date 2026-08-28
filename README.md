# MAX OPS Agent Template

把这个 GitHub 仓库发给一个从没用过 MAX OPS 的 AI，它就能按同一套协议读取指定任务、汇报进度、提问、接收 Max 的回复并确认收到。

## 直接复制给 AI

```text
请读取并使用这个 MAX OPS Agent 模板：
https://github.com/maxi-max-dev/max-ops-agent-template/tree/main/max-ops-report

把当前工作连接到受控 MAX OPS Agent API <maxops_url> 的任务 <record_id>。
使用模板的 connect 命令完成合同自检、连接检查、单任务读取并生成稳定 run_id，再汇报开工、重要进度、受阻/问题、artifact 和完成；有 Max 回复时收取并 ack。
如果运行环境没有 MAXOPS_AGENT_TOKEN，请告诉我如何在本机环境变量或 secret manager 中设置，不要要求我把 token 粘贴进聊天，也不要读取整张飞书作战板或直接修改任务五态。
```

把 `<maxops_url>` 换成明确授权且提供 Agent API 的 MAX OPS 部署，把 `<record_id>` 换成 MAX OPS / 飞书任务的记录 ID。公开 GitHub Skill 只是接入说明和客户端，静态 PairDesk Demo 也不是 Agent API。缺少 URL 或 ID 时，AI 应向任务发起人索取，不能自行猜测。

## 第一次测试

```bash
git clone https://github.com/maxi-max-dev/max-ops-agent-template.git
cd max-ops-agent-template/max-ops-report
node scripts/validate-adapter.mjs
node scripts/self-test.mjs
```

然后在本机安全设置环境变量：

```bash
export MAXOPS_URL='https://the-authorized-maxops-deployment.example'
export MAXOPS_TASK_ID='rec...'
export MAXOPS_AGENT_ID='codex'
export MAXOPS_AGENT_NAME='Codex'
read -s MAXOPS_AGENT_TOKEN && export MAXOPS_AGENT_TOKEN
```

一条命令完成真实连接检查、读取已授权任务并返回本次 `run_id`：

```bash
node scripts/maxops.mjs connect --url "$MAXOPS_URL" --task "$MAXOPS_TASK_ID"
```

也可以由运行环境或 secret manager 预先注入 `MAXOPS_AGENT_TOKEN`；不要使用 `--token`，客户端会拒绝任何把 secret 放进命令参数的做法。

## 里面有什么

- `max-ops-report/SKILL.md`：给 AI 读的完整工作流程。
- `max-ops-report/adapter-manifest.json`：Codex reference adapter 的机器可读身份、能力、任务范围与真源边界。
- `max-ops-report/scripts/maxops.mjs`：零依赖 CLI。
- `max-ops-report/scripts/validate-adapter.mjs`：不接生产的合同完整性检查。
- `max-ops-report/scripts/self-test.mjs`：不接触生产数据的自检。
- `max-ops-report/references/adapter-contract.md`：未来任意 Agent 都可实现的开放合同。
- `max-ops-report/references/api.md`：接口、状态和重试规则。
- `max-ops-report/references/other-agents.md`：Codex / Claude Code / OpenClaw 的身份示例。

## 安全边界

- 模板不包含 token、飞书表 ID、私人任务或聊天记录。
- Agent 只能按已知 `record_id` 读取一条白名单任务投影，不能枚举整板。
- Agent API 只报告协作证据，不直接改变飞书五态。
- `agent_id` 可配置；Codex 是第一条 reference adapter，不是 API allowlist。
- 当前 MAX OPS 使用共享 Agent token；不要把它公开、写入 prompt、提交到 GitHub 或放进 artifact URL。

MIT License。

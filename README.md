# MAX OPS Agent Template

把这个 GitHub 仓库发给一个从没用过 MAX OPS 的 AI，它就能按同一套协议读取指定任务、汇报进度、提问、接收 Max 的回复并确认收到。

## 直接复制给 AI

```text
请读取并使用这个 MAX OPS Agent 模板：
https://github.com/maxi-max-dev/max-ops-agent-template/tree/main/max-ops-report

把当前工作连接到 MAX OPS 任务 <record_id>。
先运行模板自检并读取该任务，再用一个稳定 run_id 汇报开工、重要进度、受阻/问题、artifact 和完成；有 Max 回复时收取并 ack。
如果运行环境没有 MAXOPS_AGENT_TOKEN，请告诉我如何在本机环境变量或 secret manager 中设置，不要要求我把 token 粘贴进聊天，也不要读取整张飞书作战板或直接修改任务五态。
```

只需把 `<record_id>` 换成 MAX OPS / 飞书任务的记录 ID。没有这个 ID 时，AI 应先向任务发起人索取，不能靠标题猜。

## 第一次测试

```bash
git clone https://github.com/maxi-max-dev/max-ops-agent-template.git
cd max-ops-agent-template/max-ops-report
node scripts/self-test.mjs
node scripts/maxops.mjs doctor
```

然后在本机安全设置环境变量：

```bash
export MAXOPS_URL='https://max-ops-personal-war-room.maxorila.chatgpt.site'
export MAXOPS_AGENT_ID='codex'
export MAXOPS_AGENT_NAME='Codex'
read -s MAXOPS_AGENT_TOKEN && export MAXOPS_AGENT_TOKEN
```

真实读取一条已授权任务：

```bash
node scripts/maxops.mjs health
node scripts/maxops.mjs task --task rec...
```

## 里面有什么

- `max-ops-report/SKILL.md`：给 AI 读的完整工作流程。
- `max-ops-report/scripts/maxops.mjs`：零依赖 CLI。
- `max-ops-report/scripts/self-test.mjs`：不接触生产数据的自检。
- `max-ops-report/references/api.md`：接口、状态和重试规则。
- `max-ops-report/references/other-agents.md`：Codex / Claude Code / OpenClaw 的身份示例。

## 安全边界

- 模板不包含 token、飞书表 ID、私人任务或聊天记录。
- Agent 只能按已知 `record_id` 读取一条白名单任务投影，不能枚举整板。
- Agent API 只报告协作证据，不直接改变飞书五态。
- 当前 MAX OPS 使用共享 Agent token；不要把它公开、写入 prompt、提交到 GitHub 或放进 artifact URL。

MIT License。

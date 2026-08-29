# 第一次使用 PairDesk / MAX OPS Agent Adapter

这页给评委和第一次接触的人看。你不需要 Max 的私人数据，也不需要飞书凭据，就能先确认公开 Adapter 是否完整。

PairDesk 是比赛原型工作名。当前生产和 UI 仍叫 MAX OPS。

## 先选你要验证哪一层

- A，公开自检：任何人都能 clone 仓库，验证 Adapter manifest、客户端和模拟生命周期。无需账号、token、飞书或 MAX OPS 服务。
- B，实现合同：任意 Agent 可以按公开 manifest 和 contract 为自己实现 Adapter，并用 validator/self-test 验证；本轮还没有完成独立第三方 Adapter 的实机接入。
- C，真实任务：需要任务拥有者提供受控 `MAXOPS_URL`、一条演示任务的 `record_id`，并把受限 token 安全注入运行环境。
- D，完全一键接入：陌生人自己注册、自动拿 token、自动绑定 workspace 和任务作用域。当前没有实现。

本仓库现在可以直接验证 A，也给出了 B 的合同与工具。C 需要拥有者邀请；D 是后续产品能力。

## 1 分钟公开自检

本轮已验证环境：Git 与 Node.js 22。其他 Node.js 版本需要在各自环境中重新运行下面两条自检。

```bash
git clone https://github.com/maxi-max-dev/max-ops-agent-template.git
cd max-ops-agent-template/max-ops-report
node scripts/validate-adapter.mjs
node scripts/self-test.mjs
```

成功时你会看到：

- manifest 通过，包含 read、start、progress、blocker、question、artifact、finish、inbox、ack 和 receipt。
- 非 Codex 的稳定 `agent_id` 也能完成模拟生命周期。
- question、回复、inbox、ack 和 receipt 能在模拟服务中连起来。
- 没有网络请求、真实飞书写入或私人数据读取。

这一步证明的是公开 Adapter 客户端和合同，不是生产飞书已经连接。

## 拥有者授权的真实连接

任务拥有者先在自己的测试 Base 里准备一条完全虚构的演示任务，然后给使用者两项普通信息：

- `MAXOPS_URL`：明确授权、真正提供 Agent API 的部署地址。
- `MAXOPS_RECORD_ID`：这条虚构演示任务的 `record_id`。

受限 `MAXOPS_AGENT_TOKEN` 通过本机环境变量或 secret manager 注入，不能粘贴进聊天、截图、URL 或命令参数。

```bash
export MAXOPS_URL='https://the-authorized-maxops-deployment.example'
export MAXOPS_RECORD_ID='rec...'
export MAXOPS_AGENT_ID='codex'
export MAXOPS_AGENT_NAME='Codex'
read -s MAXOPS_AGENT_TOKEN && export MAXOPS_AGENT_TOKEN

node scripts/maxops.mjs connect --url "$MAXOPS_URL" --record "$MAXOPS_RECORD_ID"
```

`connect` 只做四件事：验证本地 manifest、检查受控 API、读取指定任务、创建或复用稳定 `run_id`。它会同时返回 `record_id` 和真实 `task_id`；后续命令必须分别保留两者。它不枚举任务板，也不修改飞书五态。

连接成功后，再按 `max-ops-report/SKILL.md` 报告 start、真实进度、question 或 artifact、finish；有回复时读取 inbox 并 ack。最后的任务状态仍由人确认。

## 录比赛 Demo 时怎么用假数据

假数据不等于静态截图。安全做法是：

1. 在真实测试 Base 中新建一个虚构 Project 和虚构 Task。
2. 用上面的 C 级连接读取它。
3. 现场报告 start/progress/question 或 artifact。
4. 人在同一任务旁回复。
5. Agent 读取 inbox、ack，并留下 receipt。
6. 人确认最终五态，再回飞书检查同一条记录。

这样不暴露个人数据，同时仍然是在真实系统里跑核心过程。

## 当前明确没有的能力

- 本仓库不会自动给陌生人发 MAX OPS URL、token 或任务权限。
- 静态 PairDesk 网页不是 Agent API。
- Agent API 不直接改变飞书人工五态。
- 当前没有聊天创建新 Project/Task 的接口。
- 公开自检通过不等于某个生产部署或飞书租户已经通过实机验收。

---
name: max-ops-report
description: Connect an explicitly authorized AI Agent to MAX OPS so it can read one scoped Feishu task and report start, meaningful progress, blockers, questions, artifacts, completion, inbox delivery, and acknowledgement. Use when a user shares this template, invokes $max-ops-report, asks to sync/report work into MAX OPS, or supplies a MAX OPS/Feishu task record ID. Do not use for ordinary tasks or silently enroll work.
---

# MAX OPS Reporter

Use the bundled zero-dependency CLI. Keep Max, Codex, Claude Code, OpenClaw, and future Agents inside the same task and receipt model.

## Start safely

1. Run `node scripts/self-test.mjs`.
2. Run `node scripts/maxops.mjs doctor`.
3. Require a real task `record_id` supplied by the user. Never infer one from a title.
4. If `MAXOPS_AGENT_TOKEN` is absent, tell the user to set it in the runtime environment or secret manager. Never ask them to paste it into chat.
5. Read the live task with `node scripts/maxops.mjs task --task rec...` before acting.
6. Generate and retain one stable run ID for this execution.

## Respect the boundary

- Connect only when the user explicitly supplies a MAX OPS task identity or asks to connect the work.
- Read only that task identity. Never enumerate the full Feishu board.
- Never print, log, commit, or embed `MAXOPS_AGENT_TOKEN` in prompts or artifact URLs.
- Never mutate Feishu task state through the Agent API. Report evidence; Max or the MAX OPS UI owns five-state writeback.
- Treat message delivery as communication evidence, not proof that work finished.

## Configure the runtime

```bash
export MAXOPS_URL='https://max-ops-personal-war-room.maxorila.chatgpt.site'
export MAXOPS_AGENT_ID='codex'
export MAXOPS_AGENT_NAME='Codex'
read -s MAXOPS_AGENT_TOKEN && export MAXOPS_AGENT_TOKEN

MAXOPS_RUN_ID="$(node scripts/maxops.mjs new-run)"
export MAXOPS_RUN_ID
```

Change only the stable Agent identity for another runtime.

## Report the lifecycle

```bash
node scripts/maxops.mjs task --task rec...
node scripts/maxops.mjs start --task rec... --title '开始处理' --detail '已读取任务背景与边界。'
node scripts/maxops.mjs progress --task rec... --title '完成关键步骤' --detail '描述已完成且可验证的变化。'
node scripts/maxops.mjs blocked --task rec... --title '需要回复' --detail '说明真实阻塞。' --question '写出会改变结果的问题。'
node scripts/maxops.mjs inbox
node scripts/maxops.mjs ack --message amsg_...
node scripts/maxops.mjs finish --task rec... --title '已交付' --detail '说明验证结果。' --artifact 'https://example.com/result'
```

Use `--run`, `--agent-id`, and `--agent-name` when environment values are unavailable. Keep one `run_id` per execution. Use `--key` to retry an uncertain mutation with the exact same idempotency key.

## Close a feedback loop

1. Report the blocker and question.
2. Poll `inbox` for the same Agent and run.
3. Apply the answer only inside the current authorization boundary.
4. Acknowledge the accepted message.
5. Report the resulting progress, artifact, or completion.

Read [references/api.md](references/api.md) for the endpoint contract and [references/other-agents.md](references/other-agents.md) when adapting the template to another Agent runtime.

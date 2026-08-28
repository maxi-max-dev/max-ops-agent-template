---
name: max-ops-report
description: Connect an explicitly authorized AI Agent to MAX OPS so it can read one scoped Feishu task and report start, meaningful progress, blockers, questions, artifacts, completion, inbox delivery, and acknowledgement. Use when a user shares this template, invokes $max-ops-report, asks to sync/report work into MAX OPS, or supplies a MAX OPS/Feishu task record ID. Do not use for ordinary tasks or silently enroll work.
---

# MAX OPS Reporter

Use the bundled zero-dependency CLI. Keep Max, Codex, Claude Code, OpenClaw, and future Agents inside the same task and receipt model.

## Start safely

1. Require an authorized MAX OPS URL and real task `record_id` supplied by the user. Never infer either from a title.
2. Require `MAXOPS_AGENT_TOKEN` to be injected by the runtime environment or secret manager. Never ask the user to paste it into chat or pass it as a CLI argument.
3. From this Skill directory, run one read-only bootstrap:

   ```bash
   node scripts/maxops.mjs connect --url "$MAXOPS_URL" --task "$MAXOPS_TASK_ID"
   ```

4. Treat success as proof of four checks only: manifest validation, authenticated API health, one scoped task read, and creation/reuse of one stable `run_id`.
5. Retain the returned `session.run_id` and pass it with `--run` for every later command. If `connect` is repeated for the same execution, pass that same `--run`.
6. If the supplied URL is a static Demo and does not expose `/api/agent/v1/health`, stop and explain that it cannot connect Agents. Do not invent an API URL or claim FEISHU LIVE.

Run `node scripts/self-test.mjs` when installing, changing, or diagnosing the adapter. It is an offline test, not a prerequisite on every ordinary run.

## Respect the boundary

- Connect only when the user explicitly supplies a MAX OPS task identity or asks to connect the work.
- Read only that task identity. Never enumerate the full Feishu board.
- Never print, log, commit, or embed `MAXOPS_AGENT_TOKEN` in prompts or artifact URLs.
- Never mutate Feishu task state through the Agent API. Report evidence; Max or the MAX OPS UI owns five-state writeback.
- Treat message delivery as communication evidence, not proof that work finished.

## Configure the runtime

```bash
export MAXOPS_URL='https://the-authorized-maxops-deployment.example'
export MAXOPS_TASK_ID='rec...'
export MAXOPS_AGENT_ID='codex'
export MAXOPS_AGENT_NAME='Codex'
# MAXOPS_AGENT_TOKEN is already injected by the runtime/secret manager.
```

Change only the stable Agent identity for another runtime.

## Report the lifecycle

```bash
node scripts/maxops.mjs start --task "$MAXOPS_TASK_ID" --run "$MAXOPS_RUN_ID" --title '开始处理' --detail '已读取任务背景与边界。' --key "$MAXOPS_RUN_ID:start:001"
node scripts/maxops.mjs progress --task "$MAXOPS_TASK_ID" --run "$MAXOPS_RUN_ID" --title '完成关键步骤' --detail '描述已完成且可验证的变化。' --key "$MAXOPS_RUN_ID:progress:001"
node scripts/maxops.mjs blocked --task "$MAXOPS_TASK_ID" --run "$MAXOPS_RUN_ID" --title '需要回复' --detail '说明真实阻塞。' --question '写出会改变结果的问题。' --key "$MAXOPS_RUN_ID:blocked:001" --question-key "$MAXOPS_RUN_ID:question:001"
node scripts/maxops.mjs status-request --task "$MAXOPS_TASK_ID" --run "$MAXOPS_RUN_ID" --from '待处理' --to '进行中' --detail '已读取任务并开始执行。' --key "$MAXOPS_RUN_ID:status-request:001"
node scripts/maxops.mjs inbox --run "$MAXOPS_RUN_ID"
node scripts/maxops.mjs ack --run "$MAXOPS_RUN_ID" --message amsg_... --key "$MAXOPS_RUN_ID:ack:amsg_..."
node scripts/maxops.mjs finish --task "$MAXOPS_TASK_ID" --run "$MAXOPS_RUN_ID" --title '已交付' --detail '说明验证结果。' --artifact 'https://example.com/result' --artifact-key "$MAXOPS_RUN_ID:artifact:001" --finish-key "$MAXOPS_RUN_ID:finish:001"
```

Set `MAXOPS_RUN_ID` internally to the `connect` result or keep passing `--run`; do not ask the user to do this wiring. Use `--agent-id` and `--agent-name` only for non-secret identity configuration. Reuse an idempotency key only when retrying the exact same logical mutation after an unknown outcome.

Use `status-request` only to propose a visible before/after change through the existing questions API. It sends Max a request; it does not create a Gate or update Feishu by itself. Max must confirm and perform the status change through the existing MAX OPS / Feishu Gate. After Max replies, poll `inbox`, apply the confirmed instruction inside scope, and `ack` it.

## Close a feedback loop

1. Report the blocker and question.
2. Poll `inbox` for the same Agent and run.
3. Accept only a message tied to the current task, Agent, and run.
4. Apply the answer only inside the current authorization boundary.
5. Acknowledge the accepted message and preserve the returned `receipt_id`.
6. Report the resulting progress, artifact, or completion.

Read [references/api.md](references/api.md) for the endpoint contract and [references/other-agents.md](references/other-agents.md) when adapting the template to another Agent runtime.

The machine-readable implementation is [adapter-manifest.json](adapter-manifest.json). [references/adapter-contract.md](references/adapter-contract.md) defines the runtime-neutral contract. Passing both local checks means manifest-valid and API-shape compatible; only a real authorized task can prove FEISHU LIVE.

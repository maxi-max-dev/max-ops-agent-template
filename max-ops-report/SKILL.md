---
name: max-ops-report
description: Connect an explicitly authorized Agent run to the user's own MAX OPS Feishu template copy through webhook_write or feishu_base_direct, then report lifecycle events and, in full mode, process feedback acknowledgements and receipts.
---

# MAX OPS Agent Connector

Use the bundled zero-dependency CLI. Never assume a hosted endpoint or shared credential exists.

## Start safely

1. Use `feishu_base_direct` as the cross-plan full default route. The CLI still requires explicit `MAXOPS_ADAPTER` configuration and never selects one silently.
2. Select optional `webhook_write` only after confirming the tenant plan exposes `接收到 Webhook 时` and a new copy-owned endpoint/token was actually generated.
3. Require an explicit logical `task_id` from the user or delegated task. Never infer it from a title and never require a Feishu `record_id`.
4. Run `node scripts/maxops.mjs doctor`. If it reports `not_connected`, stop the connection attempt and list only the missing environment-variable names. Never claim PREVIEW, FEISHU LIVE, or success.
5. Accept all credentials and connection identifiers only from the local environment or secret manager. Never ask for them in chat or accept them as CLI arguments.
6. Keep the configured `instance_id`, logical `task_id`, stable `agent_id`, and one `run_id` for the execution.
7. For `feishu_base_direct`, run `connect --task <task_id>` and require `connected: true` before mutations. For `webhook_write`, `connect` can only return `configured_not_verified`; the first successful event is write-delivery evidence, not task-read evidence.
8. Every mutation needs a 12–200 character idempotency key. Reuse it only for the exact same logical action after an unknown outcome.

Run `npm run validate && npm test && npm run lint` when installing, changing, or diagnosing this Connector. Those checks are offline.

## Adapter boundary

- `webhook_write` may write `start`, `progress`, `blocked`, `question`, `artifact`, and `finish`. It must not read tasks/feedback or acknowledge messages.
- A native Feishu webhook receiver requires a Base plan that exposes `接收到 Webhook 时`. If no new endpoint/token was generated, keep the adapter `not_connected`; do not substitute messages, forms, or bot hooks.
- `feishu_base_direct` uses the user's own Feishu app to read one scoped task, write events, read matching feedback, and write/read acknowledgement receipts.
- Neither adapter writes the task's five-state field. `status-request` is a `question` event only.
- Never enumerate the task table. Accept feedback only when `instance_id`, `task_id`, `agent_id`, and `run_id` all match.
- Treat machine status values as exact: inbox requires `replied`, ack writes `acknowledged`, and artifact starts at `pending_review`. Never substitute localized labels in the machine field.
- Keep public/webhook `occurred_at` as ISO-8601. The Direct adapter alone serializes Base date-time fields to epoch milliseconds; `INVALID_TIME` is a hard failure and must never fall back to the current time.

## Report lifecycle

```bash
node scripts/maxops.mjs start --task "$MAXOPS_TASK_ID" --run "$MAXOPS_RUN_ID" --title '开始处理' --detail '已读取范围并开始执行。' --key "$MAXOPS_RUN_ID:start:001"
node scripts/maxops.mjs progress --task "$MAXOPS_TASK_ID" --run "$MAXOPS_RUN_ID" --title '完成关键步骤' --detail '描述真实且可验证的变化。' --key "$MAXOPS_RUN_ID:progress:001"
node scripts/maxops.mjs blocked --task "$MAXOPS_TASK_ID" --run "$MAXOPS_RUN_ID" --title '需要回复' --detail '说明真实阻塞。' --question '写出会改变结果的问题。' --key "$MAXOPS_RUN_ID:blocked:001" --question-key "$MAXOPS_RUN_ID:question:001"
node scripts/maxops.mjs artifact --task "$MAXOPS_TASK_ID" --run "$MAXOPS_RUN_ID" --title '产物' --detail '说明产物。' --artifact 'https://artifacts.example/result' --key "$MAXOPS_RUN_ID:artifact:001"
node scripts/maxops.mjs finish --task "$MAXOPS_TASK_ID" --run "$MAXOPS_RUN_ID" --title '已完成' --detail '说明验证结果。' --key "$MAXOPS_RUN_ID:finish:001"
```

Artifact URLs must be HTTP(S) without credentials, query parameters, or fragments.

## Close a full-mode feedback loop

1. Write the blocker and question with separate idempotency keys.
2. Run `inbox --task ... --run ...` in `feishu_base_direct` mode.
3. Accept only a message tied to the current instance, task, Agent, and run.
4. Apply the answer inside the current authorization boundary.
5. Run `ack --message ... --key ...`, preserve its `receipt_id`, and optionally verify it with `receipt --receipt ...`.
6. Report resulting progress, artifact, or completion.

Read `references/adapter-contract.md`, then the selected adapter's reference. `references/minimum-permissions.md` defines the complete-mode Feishu permission floor.

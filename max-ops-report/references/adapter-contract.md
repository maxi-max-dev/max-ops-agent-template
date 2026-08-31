# MAX OPS Agent Connector Contract v2

This contract connects one Agent run to one logical task inside one user-owned Feishu template copy. It is runtime-neutral and has no hosted default.

The product's cross-plan full default route is `feishu_base_direct`; `webhook_write` is capability-dependent and optional. Runtime configuration must still select an adapter explicitly, so “default route” never means silent fallback or simulated connection.

## Adapter interface

An adapter receives validated local configuration and implements:

```text
writeEvent(event, idempotencyKey) -> delivery/receipt result
readTask(taskId)                 -> one whitelisted task       [full mode]
inbox(identity)                  -> matching feedback messages [full mode]
acknowledge(identity, messageId, idempotencyKey) -> receipt    [full mode]
readReceipt(identity, receiptId) -> one receipt                [full mode]
```

`webhook_write` implements only `writeEvent`. `feishu_base_direct` implements the full interface. Calling an unavailable method must fail with `UNSUPPORTED_OPERATION`; it must never return empty simulated data.

For a native Feishu receiver, the copied Base plan must expose the `接收到 Webhook 时` trigger. If it does not generate a new endpoint/token, `webhook_write` remains `not_connected`; messages, forms, and bot hooks are not compatible fallbacks for this adapter contract.

## Identity and isolation

Every operation is scoped by a user-generated `instance_id`. Task reads and full-mode mutations additionally require one explicit logical `task_id`. Feedback and receipts require the full tuple:

```text
instance_id + task_id + agent_id + run_id
```

Do not infer tasks from titles, enumerate the task table, or require/expose Feishu `record_id`. An empty, multiple, or mismatched result is `TASK_IDENTITY_MISMATCH`.

The stable machine fields are:

```text
instance_id, task_id, event_id, idempotency_key, payload_digest,
agent_id, agent_name, run_id, kind, state, title, detail, artifact_url,
occurred_at, message_id, body, reply, status, created_at, replied_at,
receipt_id, receipt, submitted_at, acknowledged_at
```

Human-facing task columns default to `任务名` and `五态` and may be remapped locally.

The machine `status` field uses exact language-neutral enums: feedback `open/replied/processing/resolved`, receipt ack `acknowledged`, and artifact review `pending_review/approved/changes_requested`. The Connector reads only `replied`, writes ack `acknowledged`, and initializes artifacts as `pending_review`. Localized values belong in separate display columns.

## Event semantics

| CLI operation | `kind` | `state` |
|---|---|---|
| `start` | `run_started` | `running` |
| `progress` | `progress` | `running` |
| `blocked` | `blocked` | `blocked` |
| `question` | `question` | `blocked` |
| `artifact` | `artifact` | `done` |
| `finish` | `run_finished` | `done` |

`blocked --question` writes two separately idempotent events. `status-request` maps to a `question` event and does not write the task five-state field. An artifact URL must be HTTP(S) without credentials, query parameters, or fragments.

## Time serialization

The public `maxops-agent-event/1` envelope represents `occurred_at` as an ISO-8601 string with an explicit timezone. `webhook_write` sends that string unchanged.

Only `feishu_base_direct` performs storage serialization: it validates `event.occurred_at` and writes a finite epoch-milliseconds number to the Base `occurred_at` date-time field. Receipt `submitted_at` and `acknowledged_at` are also epoch-milliseconds numbers and receive the same clock value. Invalid time is a closed `INVALID_TIME` failure; the adapter must not substitute the current time for an invalid event timestamp.

## Idempotency

Every mutation requires a 12–200 character key. Its scope is `(instance_id, idempotency_key)`.

- Same key and same semantic payload: return the existing delivery/receipt and do not create a row.
- Same key and different payload or identity: fail `IDEMPOTENCY_CONFLICT` or `TASK_IDENTITY_MISMATCH`.
- Timeout, network error, or `5xx`: retry the same logical mutation with the same key.
- Validation, authentication, identity, or conflict error: fix the cause; do not generate a new key to bypass it.

The direct adapter serializes same-process attempts and checks Base before create. A deployment with concurrent writers on different machines needs the webhook receiver or optional Runtime Pack to provide an atomic idempotency store; this client does not pretend Feishu Base offers a uniqueness constraint.

## Credential boundary and failure state

Credentials and connection identifiers come only from the local environment or secret manager. The CLI rejects credential-bearing arguments. App secrets and access tokens must not enter template fields, URLs, logs, results, snapshots, artifacts, or the repository.

No adapter is selected by default. Missing or invalid configuration is `connection_state: not_connected`; there is no PREVIEW fallback or simulated success.

## Source of truth

Agent events, feedback, and receipts are collaboration evidence. A delivery receipt proves that a write was accepted or stored; it does not prove the task's five-state field changed. That field belongs to a human or Feishu workflow.

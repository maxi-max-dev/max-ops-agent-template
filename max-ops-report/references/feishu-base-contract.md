# Feishu Base field contract

The direct adapter expects four tables from the user's copied template. Machine columns use stable snake_case names; human views can hide them and show Chinese labels separately.

Unless noted, machine values are plain text. The copied template's `occurred_at`, `submitted_at`, and `acknowledged_at` columns are Feishu date-time fields, not text fields.

The public Agent event keeps `occurred_at` as an ISO-8601 string with an explicit timezone. Before `feishu_base_direct` creates a Base record, it strictly validates that string and writes the equivalent finite epoch-milliseconds **number** to the `occurred_at` date-time field. It never replaces an invalid Agent timestamp with the current time.

For an acknowledgement receipt, the Direct adapter takes one `Date.now()` epoch-millisecond number and writes that exact same number to both `submitted_at` and `acknowledged_at`. `webhook_write` does no Base-specific conversion and keeps the public event's ISO string unchanged.

## Machine `status` enums

The `status` machine field is language-neutral and case-sensitive:

- Feedback: `open`, `replied`, `processing`, `resolved`.
- Acknowledgement receipt: `acknowledged`.
- Artifact review: `pending_review`, `approved`, `changes_requested`.

The Connector depends on exact values: inbox reads only feedback with `status=replied`; ack receipts write `status=acknowledged`; new artifact events write `status=pending_review`. Values such as `已回复`, `已确认`, or `待验收` are not aliases and will not match. Put Chinese/localized labels in a separate display column or derive them with a formula; never put them in the machine `status` field.

## Tasks

Required machine fields:

- `instance_id`: unique template-copy scope.
- `task_id`: unique logical task identity inside the copy.

Human display fields default to:

- `任务名`: task title.
- `五态`: human/workflow-owned task state.

The pair `(instance_id, task_id)` must match exactly one row.

## Agent events

Required fields:

```text
instance_id, task_id, event_id, idempotency_key, payload_digest,
agent_id, agent_name, run_id, kind, state, title, detail,
artifact_url, occurred_at, status
```

The template should index or expose views by `instance_id`, `task_id`, `run_id`, and `occurred_at`. `occurred_at` is a date-time field populated with epoch milliseconds by the Direct adapter. An artifact row starts with `status=pending_review`; a human/workflow may move it only to `approved` or `changes_requested`. `idempotency_key` and `payload_digest` may be hidden from human views but must be preserved.

## Feedback inbox

Required fields:

```text
instance_id, message_id, task_id, agent_id, run_id,
body, reply, status, created_at, replied_at
```

`body` is the Agent-facing question/context copied by a human or workflow; `reply` is the answer read by the Connector. A reply enters the inbox only when `status` is `replied`. The direct adapter filters on the full identity tuple and hides messages that already have an `acknowledged` receipt.

## Acknowledgement receipts

Required fields:

```text
instance_id, idempotency_key, payload_digest, receipt_id, message_id,
task_id, agent_id, run_id, status, receipt, submitted_at, acknowledged_at
```

`status` is exactly `acknowledged` for an accepted feedback message. `receipt` is non-secret acknowledgement evidence. The pair `(instance_id, idempotency_key)` identifies a replay; `receipt_id` identifies the durable receipt.

`submitted_at` and `acknowledged_at` are date-time fields. The Direct adapter writes the same epoch-milliseconds number to both.

## Local remapping

If a copied Base deliberately renames fields, set `MAXOPS_FEISHU_FIELD_MAP_JSON` in the local environment. Example with no connection values:

```bash
export MAXOPS_FEISHU_FIELD_MAP_JSON='{"taskTitle":"任务标题","taskStatus":"状态"}'
```

The mapping accepts only known contract keys. Never place App ID, App Secret, Base app token, table IDs, tenant tokens, webhook tokens, or URLs in this JSON or in Base fields.

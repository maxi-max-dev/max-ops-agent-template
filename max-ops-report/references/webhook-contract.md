# `webhook_write` receiver contract

The receiver belongs to the user and writes only Agent events into that user's Feishu template copy. It is not a shared service.

`webhook_write` is a capability-dependent optional adapter, not the cross-plan default route. `feishu_base_direct` is the full default route when native webhook capability has not been proven.

## Native Feishu plan prerequisite

Feishu native webhook receiver requires a Base plan that exposes the `接收到 Webhook 时` trigger. If the current account/plan shows an upgrade prompt, no copy-owned endpoint/token exists: leave both webhook environment variables unset and remain `not_connected`.

Do not replace this contract with a Feishu message, form, bot hook, or another entry point that cannot preserve HTTPS + Bearer authentication and the nested `maxops-agent-event/1` payload. Use `feishu_base_direct` or a compatible user-owned receiver instead.

## Required behavior

1. Accept HTTPS `POST` only and authenticate the Bearer token (at least 16 characters) from the header.
2. Reject any `instance_id` outside the receiver's configured copy.
3. Validate `task_id` against an explicit allowlist or the receiver's own scoped task lookup. Never infer a task from title.
4. Validate the `maxops-agent-event/1` envelope and six allowed kinds.
   Artifact events must carry the machine value `status=pending_review`; later human/workflow review may use only `approved` or `changes_requested`.
   `event.occurred_at` remains an ISO-8601 string with an explicit timezone. Epoch-millisecond conversion is Direct-Base storage behavior and must not change this webhook JSON contract.
5. Deduplicate atomically by `(instance_id, idempotency_key)` and compare the supplied `payload_digest`. The digest covers the semantic event and intentionally excludes retry-volatile `event_id` and `occurred_at`.
6. Return the existing result for same-key/same-semantic-payload replay; return a conflict for same-key/different-payload or identity.
7. Write no credential, Authorization header, or raw request header into Feishu fields or logs.
8. Never edit the task five-state field.

## Response

A successful receiver may return:

```json
{
  "instance_id": "copy-scope",
  "duplicate": false,
  "receipt_id": "receiver-generated-id"
}
```

`receipt_id` is optional in write-only mode. If the receiver echoes `event`, the Connector verifies its instance/task/Agent/run identity. A `2xx` proves only webhook acceptance; it does not grant read, feedback, acknowledgement, or task-state capabilities.

## Error handling

- `400`: invalid event or key; fix request.
- `401`/`403`: invalid token or scope; fix local configuration/receiver policy.
- `404`: wrong task identity.
- `409`: idempotency or identity conflict.
- `5xx`/timeout: retry the exact event with the same key.

# Transport and Feishu API mapping

## `webhook_write`

The Connector sends one `POST` to the user-configured clean HTTPS URL:

A native Feishu URL/token exists only when the user's Base plan exposes the `接收到 Webhook 时` trigger and the receiver has actually been created. Missing values are `not_connected`; the Connector does not synthesize them or route events through messages/forms.

```http
Authorization: Bearer <local secret>
Content-Type: application/json
Idempotency-Key: <key>
X-MAXOPS-Instance-ID: <instance_id>
```

```json
{
  "schema_version": "maxops-webhook-write/1",
  "instance_id": "copy-scope",
  "idempotency_key": "agent:run:progress:001",
  "payload_digest": "sha256-of-semantic-event",
  "event": { "schema_version": "maxops-agent-event/1" }
}
```

The token appears only in the header. The webhook URL may not contain credentials, query parameters, or fragments. See `webhook-contract.md` for receiver requirements.

## `feishu_base_direct`

The direct adapter calls only the user's Feishu Open Platform:

| Purpose | Method and route |
|---|---|
| Obtain short-lived tenant token | `POST /open-apis/auth/v3/tenant_access_token/internal` |
| Search scoped records | `POST /open-apis/bitable/v1/apps/:app_token/tables/:table_id/records/search` |
| Create event/receipt | `POST /open-apis/bitable/v1/apps/:app_token/tables/:table_id/records` |

The App Secret is used only in the authentication request body; the resulting tenant token is used only in the `Authorization` header and is never returned or logged. Base app token and table IDs are resource locators loaded from the local environment; they are never embedded in the repository or output.

Search requests use server-side `and` filters over stable machine fields. The adapter never lists unfiltered task, feedback, event, or receipt tables.

The transport event keeps ISO-8601 `occurred_at`. At the Direct Base boundary only, the adapter converts it to an epoch-milliseconds number for Feishu's date-time field. Receipt `submitted_at` and `acknowledged_at` are the same `Date.now()` millisecond number. Invalid event time fails before any scoped read or mutation; it is never replaced with the current time.

Feishu returns HTTP success plus a body `code`; both must indicate success. Network/`5xx` mutation outcomes are unknown and should be retried with the same idempotency key. Authentication, permission, identity, validation, or conflict failures are closed failures, not preview states.

Relevant official references:

- [Get custom app tenant_access_token](https://open.feishu.cn/document/server-docs/authentication-management/access-token/tenant_access_token_internal)
- [Search Base records](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record/search)
- [Create a Base record](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record/create)

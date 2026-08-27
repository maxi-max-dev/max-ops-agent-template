# MAX OPS Agent API

Default production URL: `https://max-ops-personal-war-room.maxorila.chatgpt.site`

Override it with `MAXOPS_URL` or CLI `--url` when connecting to another MAX OPS deployment.

| CLI command | Endpoint | Meaning |
|---|---|---|
| `health` | `GET /api/agent/v1/health` | authenticated connectivity check |
| `task` | `GET /api/agent/v1/tasks/<record_id>` | read one scoped Feishu task projection |
| `start` | `POST /api/agent/v1/events` | run started / running |
| `progress` | `POST /api/agent/v1/events` | meaningful progress / running |
| `blocked` | events, then optionally questions | blocker plus Max-facing question |
| `artifact` | `POST /api/agent/v1/events` | artifact delivered |
| `finish` | artifact when supplied, then finished | run finished |
| `inbox` | `GET /api/agent/v1/inbox` | instructions and answers for this Agent/run |
| `ack` | `POST /api/agent/v1/messages/<id>/receipts` | Agent accepted a message |

Every mutation requires a 12–200 character `Idempotency-Key`. Reuse a key only when retrying the same logical action after an uncertain network outcome.

Task reads require a Base record ID supplied by the user. They return a whitelisted project/task projection, never raw Feishu fields, notes, credentials, or a full-board listing.

Required event fields are `agent_id`, `agent_name`, `run_id`, `task_id`, `kind`, `state`, `title`, and `detail`. Optional artifact URLs must use HTTP(S) and contain no secrets.

HTTP handling:

- `200`: successful read or idempotent replay.
- `201`: new durable record.
- `400`: invalid input; fix it.
- `401`: missing or invalid Agent token.
- `404`: wrong route, task, or message identity.
- `409`: identity mismatch or idempotency-key reuse; stop.
- `5xx` or timeout: retry the same action with the same key.

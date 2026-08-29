# MAX OPS Agent API

Supply the authorized Agent-API deployment with `MAXOPS_URL` or CLI `--url`. There is no implicit public default. The URL must serve the endpoints below; a static PairDesk Demo URL is not sufficient.

| CLI command | Endpoint | Meaning |
|---|---|---|
| `connect` | manifest + health + scoped task read | read-only bootstrap that returns one stable `run_id` |
| `health` | `GET /api/agent/v1/health` | authenticated connectivity check |
| `task` | `GET /api/agent/v1/tasks/<record_id>` | read one scoped Feishu task projection |
| `start` | `POST /api/agent/v1/events` | run started / running |
| `progress` | `POST /api/agent/v1/events` | meaningful progress / running |
| `blocked` | events, then optionally questions | blocker plus Max-facing question |
| `status-request` | `POST /api/agent/v1/questions` | before/after status proposal; asks Max to use the separate Gate and never writes Feishu directly |
| `artifact` | `POST /api/agent/v1/events` | artifact delivered |
| `finish` | artifact when supplied, then finished | run finished |
| `inbox` | `GET /api/agent/v1/inbox` | instructions and answers for this Agent/run |
| `ack` | `POST /api/agent/v1/messages/<id>/receipts` | Agent accepted a message |

Every mutation requires a 12–200 character `Idempotency-Key`. Reuse a key only when retrying the same logical action after an uncertain network outcome.

`connect` performs no mutation. It validates the bundled manifest, calls authenticated `health`, reads exactly the supplied `record_id`, and returns a session containing the returned `task_id`, confirmed `record_id`, and `run_id` to retain. A successful `connect` does not prove Feishu state writeback.

`status-request` creates an Agent question only. It does not create a pending Gate command. Max must confirm and perform any five-state change through the existing MAX OPS / Feishu Gate, then answer the Agent through the inbox path.

Task reads require a Base record ID supplied by the user. They return a whitelisted project/task projection, never raw Feishu fields, notes, credentials, or a full-board listing.

Required event fields are `agent_id`, `agent_name`, `run_id`, `task_id`, `kind`, `state`, `title`, and `detail`. Send the `record_id` returned by `connect` as well; it is required whenever `record_id` and `task_id` differ. Optional artifact URLs must use HTTP(S) and contain no secrets.

HTTP handling:

- `200`: successful read or idempotent replay.
- `201`: new durable record.
- `400`: invalid input; fix it.
- `401`: missing or invalid Agent token.
- `404`: wrong route, task, or message identity.
- `409`: identity mismatch or idempotency-key reuse; stop.
- `5xx` or timeout: retry the same action with the same key.

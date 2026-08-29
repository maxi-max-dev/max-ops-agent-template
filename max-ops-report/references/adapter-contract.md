# MAX OPS Agent Adapter Contract v1

This adapter connects one explicitly authorized Agent run to one MAX OPS task. Codex is the first reference runtime; the protocol is not Codex-specific.

## Required identity and scope

- Use a stable, configurable `agent_id` and readable `agent_name`.
- Require a `record_id` supplied by Max. Never infer it from a title.
- Preserve both the returned `task_id` and the supplied `record_id`; lifecycle mutations must send the pair and must not assume they are equal.
- Read only that task projection. Never enumerate the Feishu board.
- Keep one stable `run_id` for the execution.

## Required operations

Every manifest declares `read`, `start`, `progress`, `blocker`, `question`, `artifact`, `finish`, `inbox`, `ack`, and `receipt`.

Events, questions, replies, acknowledgements, and receipts stay tied to the same task, Agent, and run. Progress means a meaningful work change, not “online”. An artifact URL must be HTTP(S) and must not carry secrets.

The reference adapter may expose a read-only `connect` bootstrap before those operations. It must validate its manifest, authenticate against health, read only the supplied task, and return one stable `run_id`. It must not create a project/task or mutate Feishu state. A static Demo that lacks the Agent API cannot pass this check.

An adapter may also expose `status-request` as client-side syntax over the existing questions endpoint. State the visible before/after and reason, label it as an Agent proposal, and ask Max to use the separate MAX OPS / Feishu Gate. The question does not create that Gate and is not a direct status-write capability.

## Idempotency and retries

Every mutation uses a 12–200 character idempotency key. Reuse a key only for the exact same action after a timeout, network error, or `5xx`. Stop and fix the request on `400`, `401`, `404`, or `409`.

Accept the Agent token only from the runtime environment or secret manager. Never accept it as a CLI argument, request it in chat, or place it in shell history, URLs, logs, artifacts, or receipts. The adapter never needs a Feishu app secret or Base token.

## Feishu source-of-truth boundary

The Agent API records collaboration evidence. It does not directly change the Feishu five-state task fields. Max, the MAX OPS UI, or a confirmed Gate owns those writes. Never use private Feishu credentials or call a Feishu status-write endpoint from an adapter. A receipt proves that an event or message was stored; it does not prove the task state changed.

## Acceptance levels

1. `node scripts/validate-adapter.mjs` proves the manifest contains the required declarations.
2. `node scripts/self-test.mjs` proves the zero-dependency CLI can construct every required action for a non-Codex identity without production access.
3. Only a real authorized Feishu task can prove the FEISHU LIVE chain: task read → start/progress/question or artifact → Max reply → inbox → ack/receipt → synchronized overview.

The canonical product-side contract lives in the public `max-ops-agent-control` repository as `ADAPTER-CONTRACT.md`.

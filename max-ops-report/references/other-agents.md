# Other Agent runtimes

The Connector is not tied to Codex or any model API. Change only the stable local Agent identity; keep the instance/task/run and event contract unchanged.

| Runtime | `MAXOPS_AGENT_ID` | `MAXOPS_AGENT_NAME` |
|---|---|---|
| Codex | `codex` | `Codex` |
| Claude Code | `claude-code` | `Claude Code` |
| OpenClaw | `openclaw` | `OpenClaw` |

Give a capable Agent this instruction:

> Read `SKILL.md`. This work is explicitly scoped to logical task `<task_id>` in my own Feishu template copy. Use the already configured local adapter; run `doctor`, fail closed if it is not connected, retain one run ID, and report start, meaningful progress, blockers/questions, artifacts, and finish with explicit idempotency keys. In `feishu_base_direct` mode, read only that task and accept feedback only for the same instance/task/Agent/run before writing an acknowledgement receipt. Never ask for credentials in chat, pass them as CLI arguments, enumerate the board, require a Feishu record ID, or change the task five-state field.

The runtime may use the bundled CLI even if it has no native Skill installation mechanism.

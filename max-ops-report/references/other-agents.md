# Other Agent runtimes

Keep the task and run model unchanged. Change only the stable Agent identity.

Do not treat the examples below as an allowlist. Any runtime may implement `adapter-manifest.json` and the ten required operations in `adapter-contract.md` with a stable identity.

| Runtime | `MAXOPS_AGENT_ID` | `MAXOPS_AGENT_NAME` |
|---|---|---|
| Codex | `codex` | `Codex` |
| Claude Code | `claude-code` | `Claude Code` |
| OpenClaw | `openclaw` | `OpenClaw` |

Give any capable Agent this instruction:

> Read `SKILL.md` in this template. This work is explicitly connected to MAX OPS task `<record_id>` at `<maxops_url>`. With `MAXOPS_AGENT_TOKEN` already injected by the runtime, run the read-only `connect` command, retain its `run_id`, and report start, meaningful progress, blockers/questions, artifacts, and completion. Poll the inbox after asking a question, acknowledge an accepted answer, preserve its receipt, and report what changed. Do not list the full Feishu board, accept a token in chat or CLI arguments, update task state through the Agent API, or enroll unrelated work.

The token belongs in the runtime environment or secret manager. The Agent may use the bundled CLI from the cloned repository even if its runtime does not have a native Skill installation mechanism.

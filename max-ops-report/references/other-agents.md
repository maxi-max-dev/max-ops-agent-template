# Other Agent runtimes

Keep the task and run model unchanged. Change only the stable Agent identity.

| Runtime | `MAXOPS_AGENT_ID` | `MAXOPS_AGENT_NAME` |
|---|---|---|
| Codex | `codex` | `Codex` |
| Claude Code | `claude-code` | `Claude Code` |
| OpenClaw | `openclaw` | `OpenClaw` |

Give any capable Agent this instruction:

> Read `SKILL.md` in this template. This work is explicitly connected to MAX OPS task `<record_id>`. Run the self-test, read that task, create one stable run ID, and report start, meaningful progress, blockers/questions, artifacts, and completion. Poll the inbox after asking a question, acknowledge an accepted answer, and report what changed. Do not list the full Feishu board, request a token in chat, update task state through the Agent API, or enroll unrelated work.

The token belongs in the runtime environment or secret manager. The Agent may use the bundled CLI from the cloned repository even if its runtime does not have a native Skill installation mechanism.

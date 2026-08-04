# tstreams

Task coordination layer for multi-agent workflows.

No daemon. No distributed database. No git hooks. No repo mutation.  
Just SQLite + a FastAPI server + a live dashboard + a `ts` CLI.

---

## Install

```bash
# Install globally as a tool (recommended)
uv tool install .

# Or run directly from the repo without installing
uv run ts --help
```

---

## Quick start

```bash
# Start the server (DB defaults to ~/.tstreams/tstreams.db)
ts server start

# Open the dashboard
open http://localhost:8765/dashboard

# Create work
ts epic create "Agent Runtime"
ts task create "Build parser" --epic 1
ts task create "Build scheduler" --epic 1 --deps 1

# Agents pick up work
export TSTREAMS_AGENT=claude-1
ts agent register claude-1
ts task list --status pending
ts task claim 1
ts task heartbeat 1        # every 5 min while working
ts task complete 1

# Human view
ts status
```

---

## CLI reference

```
ts server start [--db PATH] [--port 8765] [--host 127.0.0.1]

ts epic create TITLE
ts epic list

ts task create TITLE [--epic ID] [--deps 1,2,3] [--desc TEXT]
ts task list   [--epic ID] [--status pending|in_progress|done|blocked] [--owner AGENT]
ts task show   TASK_ID
ts task claim  TASK_ID --agent AGENT_ID
ts task heartbeat TASK_ID --agent AGENT_ID
ts task complete  TASK_ID --agent AGENT_ID
ts task block     TASK_ID --agent AGENT_ID --reason TEXT
ts task unblock   TASK_ID

ts decision add TITLE --content TEXT [--epic ID]
ts decision list [--epic ID]

ts agent register AGENT_ID
ts agent list

ts status
```

Set `TSTREAMS_AGENT` to avoid passing `--agent` on every command.

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `TSTREAMS_URL` | `http://localhost:8765` | API base URL for CLI |
| `TSTREAMS_DB` | `~/.tstreams/tstreams.db` | SQLite database path |
| `TSTREAMS_PORT` | `8765` | Server port |
| `TSTREAMS_LEASE_TTL` | `600` | Lease duration in seconds |
| `TSTREAMS_AGENT` | — | Default agent ID for CLI |
| `TSTREAMS_GITHUB_TOKEN` | — | GitHub PAT (repo scope) for sync |
| `TSTREAMS_GITHUB_REPO` | — | `owner/repo` for GitHub sync |
| `TSTREAMS_SYNC_INTERVAL` | `30` | GitHub sync poll interval (seconds) |

---

## Optional: per-project config

```toml
# .tstreams.toml (optional — only needed for GitHub sync)
github_token = "${GITHUB_TOKEN}"
github_repo  = "SonicDMG/my-project"
```

tstreams does **not** require this file. It does **not** create, modify, or inject any files into your project.

---

## GitHub sync

When `TSTREAMS_GITHUB_TOKEN` and `TSTREAMS_GITHUB_REPO` are set, a background worker:

1. Watches for tasks with a `github_sync` mapping
2. Closes the linked GitHub issue when the task is marked `done`
3. Adds a comment: `✅ Completed via tstreams: <task title>`

Sync is one-way (tstreams → GitHub). GitHub Issues are the human view; tstreams is the agent coordination layer.

---

## Agent system prompt snippet

Add this to your agent's global system prompt (once — applies to all projects):

```
You have access to a task coordination system via the `ts` CLI.

Before starting any work:
  ts task claim <id> --agent <your-agent-id>

Every 5 minutes while working:
  ts task heartbeat <id> --agent <your-agent-id>

When done:
  ts task complete <id> --agent <your-agent-id>

When blocked:
  ts task block <id> --agent <your-agent-id> --reason "<why>"

Check available work:
  ts task list --status pending
```

Or set `TSTREAMS_AGENT=<your-agent-id>` and omit `--agent` from every command.

---

## Architecture

```
GitHub Issues  ←── one-way sync ───┐
                                    │
                         ┌──────────────────┐
                         │   tstreams API   │
                         │                  │
                         │  SQLite + WAL    │
                         │  Atomic claims   │
                         │  Leases          │
                         │  Heartbeats      │
                         │  Event stream    │
                         └──────────────────┘
                              ▲       ▲
                         CLI  │       │  Dashboard (SSE)
                              │       │
                         Agents     Browser
```

---

## License

MIT

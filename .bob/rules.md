# tstreams project rules

## Task coordination

This project uses **tstreams** for all epic, design, and task tracking.
The server runs at `http://localhost:8765`. The project name is `tstreams`.

### Before starting any feature or significant work

1. Check for an existing epic: `ts epic list`
2. If none exists, create one: `ts epic create "<feature name>"`
3. Break work into tasks: `ts task create "<task>" --epic <id>`
4. Wire dependencies: use `--deps <id,id>` on creation

### Agent workflow (mandatory for every task)

**The dashboard shows LIVE agent status. Every state change must be reported immediately — not at the end.**

```bash
# Pick up work
ts task list --status pending

# 1. CLAIM before touching any code (atomic — prevents agent collisions)
ts task claim <id> --agent <your-agent-id>

# 2. HEARTBEAT every 5 minutes while working — keeps the dashboard live
ts task heartbeat <id> --agent <your-agent-id>

# 3. COMPLETE immediately when done — do not batch completions at the end
ts task complete <id> --agent <your-agent-id>

# 4. BLOCK immediately if stuck — do not silently continue
ts task block <id> --agent <your-agent-id> --reason "<why>"
ts task unblock <id>  # once resolved
```

Set `TSTREAMS_AGENT=<your-agent-id>` to avoid repeating `--agent` on every command.

### Live update discipline

- **Claim → work → complete** must happen in that order, one task at a time.
- Do not claim multiple tasks at once unless they are truly parallel and independent.
- Do not complete a task until the work is fully done and validated.
- Send a heartbeat before any long operation (file writes, shell commands, API calls).
- If you finish a task and immediately start the next, claim the next **before** doing any work on it.
- The dashboard is the human's view of what you are doing right now — keep it accurate.

### Design decisions

Record significant architecture or design choices before implementing:

```bash
ts decision add "<title>" --content "<rationale>" --epic <id>
```

### Dashboard

Live operational view: http://localhost:8765/dashboard
Filter to this project using the project dropdown → select `tstreams`.

### Rules

- **Never start coding without claiming a task first.**
- **Never create markdown TODO files** — use `ts task create` instead.
- One task = one coherent unit of work (ideally ≤ 2 files changed).
- If you discover new work mid-task, create a new task rather than expanding scope.
- If the server is not running: `ts server start` (runs in background on port 8765).

---
name: tstreams
description: Load tstreams project context at the start of a session — checks server status, lists epics, shows current task state, and prepares Bob to work under the tstreams agent workflow. Trigger phrases: "tstreams", "load project context", "check epics", "what are we working on", "sprint status", "ts status".
metadata:
  argument-hint: "[epic-id]"
---

# tstreams Session Skill

Activate at the start of any tstreams work session to orient Bob and surface live project state.

## Step 1 — Verify server is running

```bash
ts status
```

If the command fails or returns a connection error, start the server first:

```bash
ts server start
```

Then re-run `ts status`.

## Step 2 — Show all epics

```bash
ts epic list
```

Present the list to the user in a concise table: ID, title, and task counts if available.
Note any epics that are marked inactive, on-hold, or have no tasks.

## Step 3 — Show task landscape

For each epic the user seems interested in (or all, if none specified), run:

```bash
ts task list --epic <id>
```

Summarise by status bucket: **pending / in_progress / blocked / done**.
Call out any `blocked` tasks and their reasons — these need human attention first.
Call out any `in_progress` tasks that may have stale leases (no recent heartbeat).

## Step 4 — Identify what to work on next

Apply this priority order:
1. Unblock any `blocked` tasks if the blocker is resolvable now.
2. Continue any `in_progress` tasks that are stale (claim them fresh if the lease expired).
3. Pick the next `pending` task with all dependencies satisfied.

Use `ts task show <id>` on candidates to read full description and deps before recommending.

## Step 5 — Register as agent (if not already set)

Check if `TSTREAMS_AGENT` is set:

```bash
echo $TSTREAMS_AGENT
```

If empty, suggest the user export it:

```bash
export TSTREAMS_AGENT=bob
ts agent register bob
```

## Step 6 — Brief the user

Produce a short session brief:
- Server: ✅ running / ❌ down
- Epics: list with task counts
- Blocked: list any blocked tasks
- Recommended next task: ID + title
- Agent ID in use

---

## Agent workflow reminder (apply to all work this session)

```bash
ts task claim <id>          # BEFORE touching any code
ts task heartbeat <id>      # every 5 min while working
ts task complete <id>       # immediately when done
ts task block <id> --reason "<why>"   # immediately if stuck
```

One task at a time. Claim → work → complete. The dashboard is the human's live view — keep it accurate.

Record architectural decisions before implementing:

```bash
ts decision add "<title>" --content "<rationale>" --epic <id>
```

Dashboard: http://localhost:8765/dashboard

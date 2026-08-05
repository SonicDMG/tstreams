"""
api.py — FastAPI application for tstreams.

Exposes REST endpoints for task coordination and an SSE stream
that the dashboard consumes for real-time updates.
"""

import asyncio
import concurrent.futures
import json
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncGenerator, Optional

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

import db as database
import github as github_sync
from models import (
    AgentOut,
    AgentRegister,
    DecisionCreate,
    DecisionOut,
    EpicCreate,
    EpicOut,
    EventOut,
    GithubSyncOut,
    IssueLink,
    OkResponse,
    TaskBlock,
    TaskClaim,
    TaskComplete,
    TaskCreate,
    TaskHeartbeat,
    TaskOut,
)

# ── Config ────────────────────────────────────────────────────────────────────

DB_PATH = Path(os.environ.get("TSTREAMS_DB", database.DEFAULT_DB))
PORT = int(os.environ.get("TSTREAMS_PORT", 8765))
LEASE_TTL = int(os.environ.get("TSTREAMS_LEASE_TTL", database.LEASE_TTL))

# ── DB connection (single shared connection with WAL) ─────────────────────────

_conn = None


def get_conn():
    return _conn


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _conn
    _conn = database.get_db(DB_PATH)
    database.init_schema(_conn)
    github_sync.start_sync_worker(_conn)
    yield
    _conn.close()


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="tstreams", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Dashboard (served from dashboard/index.html) ──────────────────────────────

DASHBOARD_PATH = Path(__file__).parent / "dashboard" / "index.html"


@app.get("/dashboard", response_class=HTMLResponse, include_in_schema=False)
async def dashboard():
    if not DASHBOARD_PATH.exists():
        return HTMLResponse("<h1>Dashboard not found</h1><p>Run from the tstreams repo root.</p>", status_code=404)
    return HTMLResponse(DASHBOARD_PATH.read_text())


# ── SSE event stream ──────────────────────────────────────────────────────────

async def _event_generator(conn, last_id: int, project: str = None) -> AsyncGenerator[str, None]:
    """Tail the events table and push new rows as SSE messages."""
    cursor = last_id
    while True:
        rows = database.tail_events(conn, since_id=cursor, project=project)
        for row in rows:
            cursor = row["id"]
            data = json.dumps({
                "id": row["id"],
                "project": row["project"],
                "task_id": row["task_id"],
                "agent_id": row["agent_id"],
                "type": row["type"],
                "payload": row["payload"],
                "ts": row["ts"],
            })
            yield f"data: {data}\n\n"
        await asyncio.sleep(0.5)


@app.get("/events", include_in_schema=False)
async def events(
    last_event_id: int = Query(0, alias="lastEventId"),
    project: Optional[str] = Query(None),
    conn=Depends(get_conn),
):
    return StreamingResponse(
        _event_generator(conn, last_event_id, project=project),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ── Epics ─────────────────────────────────────────────────────────────────────

@app.get("/projects")
async def list_projects(conn=Depends(get_conn)):
    return database.list_projects(conn)


@app.post("/epics", response_model=EpicOut, status_code=201)
async def create_epic(body: EpicCreate, conn=Depends(get_conn)):
    epic_id = database.create_epic(conn, body.title, body.project or "default")
    epic = database.get_epic(conn, epic_id)
    return {**dict(epic), "task_count": 0, "done_count": 0}


@app.get("/epics", response_model=list[EpicOut])
async def list_epics(project: Optional[str] = None, conn=Depends(get_conn)):
    rows = database.list_epics(conn, project=project)
    return [dict(r) for r in rows]


@app.get("/epics/{epic_id}", response_model=EpicOut)
async def get_epic(epic_id: int, conn=Depends(get_conn)):
    row = database.get_epic(conn, epic_id)
    if not row:
        raise HTTPException(404, "Epic not found")
    tasks = database.list_tasks(conn, epic_id=epic_id)
    done = sum(1 for t in tasks if t["status"] == "done")
    return {**dict(row), "task_count": len(tasks), "done_count": done}


@app.post("/epics/{epic_id}/close", response_model=EpicOut)
async def close_epic(epic_id: int, conn=Depends(get_conn)):
    ok = database.close_epic(conn, epic_id)
    if not ok:
        raise HTTPException(404, "Epic not found")
    row = database.get_epic(conn, epic_id)
    tasks = database.list_tasks(conn, epic_id=epic_id)
    done = sum(1 for t in tasks if t["status"] == "done")
    return {**dict(row), "task_count": len(tasks), "done_count": done}


# ── Tasks ─────────────────────────────────────────────────────────────────────

def _task_with_issue(conn, row) -> dict:
    """Enrich a task row with github_issue_number from github_sync."""
    d = dict(row)
    gs = conn.execute(
        "SELECT issue_number FROM github_sync WHERE task_id = ?", (d["id"],)
    ).fetchone()
    d["github_issue_number"] = gs["issue_number"] if gs else None
    return d


@app.post("/tasks", response_model=TaskOut, status_code=201)
async def create_task(body: TaskCreate, conn=Depends(get_conn)):
    task_id = database.create_task(
        conn, body.title, body.description, body.epic_id, body.deps,
        project=body.project or "default",
    )
    return _task_with_issue(conn, database.get_task(conn, task_id))


@app.get("/tasks", response_model=list[TaskOut])
async def list_tasks(
    epic_id: Optional[int] = None,
    status: Optional[str] = None,
    owner: Optional[str] = None,
    project: Optional[str] = None,
    conn=Depends(get_conn),
):
    rows = database.list_tasks(conn, epic_id=epic_id, status=status, owner=owner, project=project)
    return [_task_with_issue(conn, r) for r in rows]


@app.get("/tasks/{task_id}", response_model=TaskOut)
async def get_task(task_id: int, conn=Depends(get_conn)):
    row = database.get_task(conn, task_id)
    if not row:
        raise HTTPException(404, "Task not found")
    return _task_with_issue(conn, row)


@app.get("/tasks/{task_id}/deps")
async def get_task_deps(task_id: int, conn=Depends(get_conn)):
    """Return IDs and titles of tasks this task depends on."""
    rows = conn.execute(
        """SELECT t.id, t.title, t.status FROM tasks t
           JOIN task_deps d ON t.id = d.depends_on
           WHERE d.task_id = ?""",
        (task_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def _trigger_immediate_sync(conn, task_id: int) -> None:
    """Fire an immediate GitHub sync in the background if this task has a linked issue."""
    gs = conn.execute(
        "SELECT issue_number FROM github_sync WHERE task_id = ?", (task_id,)
    ).fetchone()
    if not gs:
        return
    token, repo = github_sync._resolve_config()
    if not token or not repo:
        return
    last_poll_ts = [int(time.time())]
    concurrent.futures.ThreadPoolExecutor(max_workers=1).submit(
        github_sync._sync_once, conn, token, repo, last_poll_ts
    )


@app.post("/tasks/{task_id}/claim", response_model=OkResponse)
async def claim_task(task_id: int, body: TaskClaim, conn=Depends(get_conn)):
    ok = database.claim_task(conn, task_id, body.agent_id, LEASE_TTL)
    if not ok:
        raise HTTPException(409, "Task already claimed or not pending")
    _trigger_immediate_sync(conn, task_id)
    return {"ok": True}


@app.post("/tasks/{task_id}/heartbeat", response_model=OkResponse)
async def heartbeat(task_id: int, body: TaskHeartbeat, conn=Depends(get_conn)):
    ok = database.heartbeat(conn, task_id, body.agent_id, LEASE_TTL)
    if not ok:
        raise HTTPException(404, "No active lease for this task/agent")
    return {"ok": True}


@app.post("/tasks/{task_id}/complete", response_model=OkResponse)
async def complete_task(task_id: int, body: TaskComplete, conn=Depends(get_conn)):
    ok = database.complete_task(conn, task_id, body.agent_id)
    if not ok:
        raise HTTPException(409, "Task not owned by this agent")
    _trigger_immediate_sync(conn, task_id)
    return {"ok": True}


@app.post("/tasks/{task_id}/block", response_model=OkResponse)
async def block_task(task_id: int, body: TaskBlock, conn=Depends(get_conn)):
    ok = database.block_task(conn, task_id, body.agent_id, body.reason)
    if not ok:
        raise HTTPException(409, "Task not owned by this agent")
    _trigger_immediate_sync(conn, task_id)
    return {"ok": True}


@app.post("/tasks/{task_id}/unblock", response_model=OkResponse)
async def unblock_task(task_id: int, conn=Depends(get_conn)):
    ok = database.unblock_task(conn, task_id)
    if not ok:
        raise HTTPException(409, "Task is not blocked")
    _trigger_immediate_sync(conn, task_id)
    return {"ok": True}


@app.post("/tasks/{task_id}/link", response_model=OkResponse)
async def link_issue(task_id: int, body: IssueLink, conn=Depends(get_conn)):
    """Link a task to a GitHub issue."""
    row = database.get_task(conn, task_id)
    if not row:
        raise HTTPException(404, "Task not found")
    repo = body.repo or GITHUB_REPO
    if not repo:
        raise HTTPException(400, "repo required (set body.repo or TSTREAMS_GITHUB_REPO)")
    database.enroll_issue(conn, task_id, body.issue_number, repo)
    return {"ok": True}


@app.delete("/tasks/{task_id}/link", response_model=OkResponse)
async def unlink_issue(task_id: int, conn=Depends(get_conn)):
    """Remove the GitHub issue link for a task."""
    database.unenroll_issue(conn, task_id)
    return {"ok": True}


@app.post("/tasks/{task_id}/github-issue", response_model=OkResponse)
async def create_github_issue_for_task(task_id: int, conn=Depends(get_conn)):
    """Create a GitHub issue for an existing task (used by --github CLI flag)."""
    token, repo = github_sync._resolve_config()
    if not token or not repo:
        raise HTTPException(400, "TSTREAMS_GITHUB_TOKEN and TSTREAMS_GITHUB_REPO must be set")
    issue_number = github_sync.create_issue_for_task(conn, token, repo, task_id)
    if issue_number is None:
        raise HTTPException(500, "Failed to create GitHub issue")
    return {"ok": True, "message": f"https://github.com/{repo}/issues/{issue_number}"}


@app.get("/issues", response_model=list[GithubSyncOut])
async def list_issues(conn=Depends(get_conn)):
    """List all enrolled task↔issue pairs."""
    rows = database.get_all_enrolled(conn)
    return [dict(r) for r in rows]


@app.post("/issues/sync", response_model=OkResponse)
async def trigger_sync(conn=Depends(get_conn)):
    """Trigger an immediate sync cycle in the background."""
    token, repo = github_sync._resolve_config()
    if not token or not repo:
        raise HTTPException(400, "TSTREAMS_GITHUB_TOKEN and TSTREAMS_GITHUB_REPO must be set")
    last_poll_ts = [0]
    asyncio.get_event_loop().run_in_executor(
        None, lambda: github_sync._sync_once(conn, token, repo, last_poll_ts)
    )
    return {"ok": True, "message": "sync triggered"}


# ── Decisions ─────────────────────────────────────────────────────────────────

@app.post("/decisions", response_model=DecisionOut, status_code=201)
async def create_decision(body: DecisionCreate, conn=Depends(get_conn)):
    dec_id = database.create_decision(conn, body.title, body.content, body.epic_id)
    rows = database.list_decisions(conn)
    row = next(r for r in rows if r["id"] == dec_id)
    return dict(row)


@app.get("/decisions", response_model=list[DecisionOut])
async def list_decisions(epic_id: Optional[int] = None, conn=Depends(get_conn)):
    rows = database.list_decisions(conn, epic_id=epic_id)
    return [dict(r) for r in rows]


@app.post("/decisions/{decision_id}/resolve", response_model=DecisionOut)
async def resolve_decision(decision_id: int, conn=Depends(get_conn)):
    row = database.resolve_decision(conn, decision_id)
    if not row:
        raise HTTPException(status_code=404, detail="Decision not found")
    return dict(row)


# ── Agents ────────────────────────────────────────────────────────────────────

@app.post("/agents", response_model=AgentOut, status_code=201)
async def register_agent(body: AgentRegister, conn=Depends(get_conn)):
    database.register_agent(conn, body.agent_id)
    rows = database.list_agents(conn)
    row = next(r for r in rows if r["id"] == body.agent_id)
    return dict(row)


@app.get("/agents", response_model=list[AgentOut])
async def list_agents(conn=Depends(get_conn)):
    rows = database.list_agents(conn)
    return [dict(r) for r in rows]


# ── Stats ─────────────────────────────────────────────────────────────────────

@app.get("/stats")
async def get_stats(project: Optional[str] = None, conn=Depends(get_conn)):
    """Lightweight KPI counts — avoids fetching all task/decision rows."""
    rows = database.list_epics(conn, project=project)
    tasks_done  = sum(r["done_count"] or 0 for r in rows)
    tasks_total = sum(r["task_count"] or 0 for r in rows)
    tasks_open  = tasks_total - tasks_done
    if project:
        dec_rows = conn.execute(
            "SELECT COUNT(*) AS n FROM decisions WHERE status != 'decided'"
            " AND epic_id IN (SELECT id FROM epics WHERE project = ?)",
            (project,)
        ).fetchone()
    else:
        dec_rows = conn.execute(
            "SELECT COUNT(*) AS n FROM decisions WHERE status != 'decided'"
        ).fetchone()
    return {
        "tasks_done":      tasks_done,
        "tasks_open":      tasks_open,
        "tasks_total":     tasks_total,
        "decisions_open":  dec_rows["n"],
    }


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "ts": int(time.time())}

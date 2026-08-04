"""
db.py — SQLite schema and all query helpers for tstreams.

WAL mode is enabled for safe concurrent reads from multiple agents
while the API server writes. All mutations go through this module.
"""

import sqlite3
import time
from pathlib import Path
from typing import Optional

DEFAULT_DB = Path.home() / ".tstreams" / "tstreams.db"
LEASE_TTL = 600  # seconds (10 minutes)


def get_db(path: Path = DEFAULT_DB) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS epics (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            project     TEXT NOT NULL DEFAULT 'default',
            title       TEXT NOT NULL,
            status      TEXT NOT NULL DEFAULT 'open',
            github_issue INTEGER,
            created_at  INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            project     TEXT NOT NULL DEFAULT 'default',
            title       TEXT NOT NULL,
            description TEXT,
            epic_id     INTEGER REFERENCES epics(id),
            status      TEXT NOT NULL DEFAULT 'pending',
            owner       TEXT,
            blocked_reason TEXT,
            created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
            updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS task_deps (
            task_id     INTEGER NOT NULL REFERENCES tasks(id),
            depends_on  INTEGER NOT NULL REFERENCES tasks(id),
            PRIMARY KEY (task_id, depends_on)
        );

        CREATE TABLE IF NOT EXISTS decisions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            epic_id     INTEGER REFERENCES epics(id),
            title       TEXT NOT NULL,
            content     TEXT NOT NULL,
            status      TEXT NOT NULL DEFAULT 'open',
            created_at  INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS agents (
            id          TEXT PRIMARY KEY,
            last_heartbeat INTEGER NOT NULL DEFAULT (unixepoch()),
            current_task INTEGER REFERENCES tasks(id),
            registered_at INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS leases (
            task_id     INTEGER PRIMARY KEY REFERENCES tasks(id),
            agent_id    TEXT NOT NULL REFERENCES agents(id),
            claimed_at  INTEGER NOT NULL DEFAULT (unixepoch()),
            heartbeat_at INTEGER NOT NULL DEFAULT (unixepoch()),
            expires_at  INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS events (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            project     TEXT,
            task_id     INTEGER REFERENCES tasks(id),
            agent_id    TEXT,
            type        TEXT NOT NULL,
            payload     TEXT,
            ts          INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS github_sync (
            task_id     INTEGER PRIMARY KEY REFERENCES tasks(id),
            issue_number INTEGER NOT NULL,
            synced_at   INTEGER NOT NULL DEFAULT (unixepoch())
        );
    """)
    conn.commit()
    # Migrate existing DBs — add project column if absent
    _migrate(conn)


def _migrate(conn: sqlite3.Connection) -> None:
    """Non-destructive migrations for existing databases."""
    existing = {row[1] for row in conn.execute("PRAGMA table_info(epics)")}
    if "project" not in existing:
        conn.execute("ALTER TABLE epics ADD COLUMN project TEXT NOT NULL DEFAULT 'default'")
    existing = {row[1] for row in conn.execute("PRAGMA table_info(tasks)")}
    if "project" not in existing:
        conn.execute("ALTER TABLE tasks ADD COLUMN project TEXT NOT NULL DEFAULT 'default'")
    existing = {row[1] for row in conn.execute("PRAGMA table_info(events)")}
    if "project" not in existing:
        conn.execute("ALTER TABLE events ADD COLUMN project TEXT")
    conn.commit()


def list_projects(conn) -> list[str]:
    rows = conn.execute(
        "SELECT DISTINCT project FROM epics ORDER BY project"
    ).fetchall()
    return [r["project"] for r in rows] or ["default"]


# ── Epics ────────────────────────────────────────────────────────────────────

def create_epic(conn, title: str, project: str = "default") -> int:
    cur = conn.execute("INSERT INTO epics (title, project) VALUES (?, ?)", (title, project))
    conn.commit()
    _emit(conn, project, None, None, "epic_created", f'{{"epic_id": {cur.lastrowid}, "title": "{title}"}}')
    return cur.lastrowid


def list_epics(conn, project: str = None) -> list:
    if project:
        return conn.execute("""
            SELECT e.*,
                   COUNT(t.id) AS task_count,
                   SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS done_count
            FROM epics e
            LEFT JOIN tasks t ON t.epic_id = e.id
            WHERE e.project = ?
            GROUP BY e.id
            ORDER BY e.created_at DESC
        """, (project,)).fetchall()
    return conn.execute("""
        SELECT e.*,
               COUNT(t.id) AS task_count,
               SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS done_count
        FROM epics e
        LEFT JOIN tasks t ON t.epic_id = e.id
        GROUP BY e.id
        ORDER BY e.project, e.created_at DESC
    """).fetchall()


def get_epic(conn, epic_id: int):
    return conn.execute("SELECT * FROM epics WHERE id = ?", (epic_id,)).fetchone()


# ── Tasks ────────────────────────────────────────────────────────────────────

def create_task(conn, title: str, description: str = None, epic_id: int = None,
                deps: list[int] = None, project: str = "default") -> int:
    cur = conn.execute(
        "INSERT INTO tasks (title, description, epic_id, project) VALUES (?, ?, ?, ?)",
        (title, description, epic_id, project),
    )
    task_id = cur.lastrowid
    if deps:
        conn.executemany(
            "INSERT OR IGNORE INTO task_deps (task_id, depends_on) VALUES (?, ?)",
            [(task_id, d) for d in deps],
        )
    conn.commit()
    _emit(conn, project, task_id, None, "task_created", f'{{"title": "{title}"}}')
    return task_id


def list_tasks(conn, epic_id: int = None, status: str = None, owner: str = None,
               project: str = None) -> list:
    where, params = [], []
    if project:
        where.append("project = ?"); params.append(project)
    if epic_id is not None:
        where.append("epic_id = ?"); params.append(epic_id)
    if status:
        where.append("status = ?"); params.append(status)
    if owner:
        where.append("owner = ?"); params.append(owner)
    clause = ("WHERE " + " AND ".join(where)) if where else ""
    return conn.execute(f"SELECT * FROM tasks {clause} ORDER BY id", params).fetchall()


def get_task(conn, task_id: int):
    return conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()


def claim_task(conn, task_id: int, agent_id: str, ttl: int = LEASE_TTL) -> bool:
    """Atomic claim. Returns True if claimed, False if already owned."""
    now = int(time.time())
    # expire stale leases first
    conn.execute("DELETE FROM leases WHERE expires_at < ?", (now,))
    conn.execute(
        "UPDATE tasks SET owner = NULL, status = 'pending' WHERE id IN "
        "(SELECT task_id FROM leases WHERE expires_at < ?)",
        (now,),
    )
    cur = conn.execute(
        """UPDATE tasks SET owner = ?, status = 'in_progress', updated_at = unixepoch()
           WHERE id = ? AND owner IS NULL AND status = 'pending'""",
        (agent_id, task_id),
    )
    if cur.rowcount == 0:
        return False
    conn.execute(
        "INSERT OR REPLACE INTO leases (task_id, agent_id, claimed_at, heartbeat_at, expires_at) VALUES (?, ?, ?, ?, ?)",
        (task_id, agent_id, now, now, now + ttl),
    )
    conn.execute(
        "UPDATE agents SET last_heartbeat = ?, current_task = ? WHERE id = ?",
        (now, task_id, agent_id),
    )
    conn.commit()
    task = get_task(conn, task_id)
    project = task["project"] if task else None
    _emit(conn, project, task_id, agent_id, "task_claimed", None)
    return True


def heartbeat(conn, task_id: int, agent_id: str, ttl: int = LEASE_TTL) -> bool:
    now = int(time.time())
    cur = conn.execute(
        "UPDATE leases SET heartbeat_at = ?, expires_at = ? WHERE task_id = ? AND agent_id = ?",
        (now, now + ttl, task_id, agent_id),
    )
    if cur.rowcount == 0:
        return False
    conn.execute("UPDATE agents SET last_heartbeat = ? WHERE id = ?", (now, agent_id))
    conn.commit()
    task = get_task(conn, task_id)
    project = task["project"] if task else None
    _emit(conn, project, task_id, agent_id, "heartbeat", None)
    return True


def complete_task(conn, task_id: int, agent_id: str) -> bool:
    cur = conn.execute(
        "UPDATE tasks SET status = 'done', updated_at = unixepoch() WHERE id = ? AND owner = ?",
        (task_id, agent_id),
    )
    if cur.rowcount == 0:
        return False
    task = get_task(conn, task_id)
    project = task["project"] if task else None
    conn.execute("DELETE FROM leases WHERE task_id = ?", (task_id,))
    conn.execute("UPDATE agents SET current_task = NULL WHERE id = ?", (agent_id,))
    conn.commit()
    _emit(conn, project, task_id, agent_id, "task_completed", None)
    return True


def block_task(conn, task_id: int, agent_id: str, reason: str) -> bool:
    cur = conn.execute(
        "UPDATE tasks SET status = 'blocked', blocked_reason = ?, updated_at = unixepoch() WHERE id = ? AND owner = ?",
        (reason, task_id, agent_id),
    )
    if cur.rowcount == 0:
        return False
    task = get_task(conn, task_id)
    project = task["project"] if task else None
    conn.commit()
    _emit(conn, project, task_id, agent_id, "task_blocked", f'{{"reason": "{reason}"}}')
    return True


def unblock_task(conn, task_id: int) -> bool:
    cur = conn.execute(
        "UPDATE tasks SET status = 'pending', blocked_reason = NULL, updated_at = unixepoch() WHERE id = ? AND status = 'blocked'",
        (task_id,),
    )
    conn.commit()
    return cur.rowcount > 0


# ── Decisions ─────────────────────────────────────────────────────────────────

def create_decision(conn, title: str, content: str, epic_id: int = None) -> int:
    cur = conn.execute(
        "INSERT INTO decisions (title, content, epic_id) VALUES (?, ?, ?)",
        (title, content, epic_id),
    )
    conn.commit()
    _emit(conn, None, None, None, "decision_created", f'{{"decision_id": {cur.lastrowid}}}')
    return cur.lastrowid


def list_decisions(conn, epic_id: int = None) -> list:
    if epic_id:
        return conn.execute("SELECT * FROM decisions WHERE epic_id = ? ORDER BY id", (epic_id,)).fetchall()
    return conn.execute("SELECT * FROM decisions ORDER BY id").fetchall()


# ── Agents ────────────────────────────────────────────────────────────────────

def register_agent(conn, agent_id: str) -> None:
    conn.execute(
        "INSERT OR REPLACE INTO agents (id, last_heartbeat, registered_at) VALUES (?, unixepoch(), unixepoch())",
        (agent_id,),
    )
    conn.commit()
    _emit(conn, None, None, agent_id, "agent_registered", None)


def list_agents(conn) -> list:
    return conn.execute("SELECT * FROM agents ORDER BY last_heartbeat DESC").fetchall()


# ── Events ────────────────────────────────────────────────────────────────────

def _emit(conn, project: Optional[str], task_id: Optional[int], agent_id: Optional[str],
          event_type: str, payload: Optional[str]) -> None:
    conn.execute(
        "INSERT INTO events (project, task_id, agent_id, type, payload) VALUES (?, ?, ?, ?, ?)",
        (project, task_id, agent_id, event_type, payload),
    )
    conn.commit()


def tail_events(conn, since_id: int = 0, project: str = None) -> list:
    if project:
        return conn.execute(
            "SELECT * FROM events WHERE id > ? AND (project = ? OR project IS NULL) ORDER BY id",
            (since_id, project),
        ).fetchall()
    return conn.execute(
        "SELECT * FROM events WHERE id > ? ORDER BY id", (since_id,)
    ).fetchall()


def get_last_event_id(conn) -> int:
    row = conn.execute("SELECT MAX(id) FROM events").fetchone()
    return row[0] or 0

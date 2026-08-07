"""
cli.py — Click CLI for tstreams.

All commands call the tstreams API (default: http://localhost:8765).
Set TSTREAMS_URL to override.

Usage examples:
  ts server start
  ts epic create "Agent Runtime"
  ts task create "Build parser" --epic 1 --deps 3,4
  ts task claim 42 --agent claude-1
  ts task heartbeat 42 --agent claude-1
  ts task complete 42 --agent claude-1
  ts task block 42 --agent claude-1 --reason "waiting on #17"
  ts task list
  ts task list --epic 1 --status pending
  ts decision add "Use SQLite WAL" --content "WAL mode for concurrent reads" --epic 1
  ts agent register claude-1
  ts status
"""

import json
import os
import subprocess
import sys
import time
from pathlib import Path

import click
import httpx

BASE_URL = os.environ.get("TSTREAMS_URL", "http://localhost:8765")


def _detect_project() -> str:
    """
    Auto-detect the current project name. Resolution order:
    1. TSTREAMS_PROJECT env var
    2. .tstreams.toml `project` key in cwd or any parent
    3. git remote 'origin' repo name  (e.g. SonicDMG/tstreams → tstreams)
    4. Current directory name
    """
    if val := os.environ.get("TSTREAMS_PROJECT"):
        return val

    # Walk up to find .tstreams.toml
    cwd = Path.cwd()
    for directory in [cwd, *cwd.parents]:
        toml_path = directory / ".tstreams.toml"
        if toml_path.exists():
            try:
                import tomllib
            except ImportError:
                try:
                    import tomli as tomllib
                except ImportError:
                    tomllib = None
            if tomllib:
                with open(toml_path, "rb") as f:
                    cfg = tomllib.load(f)
                if project := cfg.get("project"):
                    return project
            break

    # Try git remote
    try:
        result = subprocess.run(
            ["git", "remote", "get-url", "origin"],
            capture_output=True, text=True, timeout=2,
        )
        if result.returncode == 0:
            url = result.stdout.strip()
            # handles https://github.com/owner/repo.git and git@github.com:owner/repo.git
            name = url.rstrip("/").rstrip(".git").split("/")[-1].split(":")[-1]
            if name:
                return name
    except Exception:
        pass

    return Path.cwd().name

STATUS_EMOJI = {
    "pending":     "○",
    "in_progress": "⟳",
    "done":        "✔",
    "blocked":     "✘",
}

STATUS_COLOR = {
    "pending":     "white",
    "in_progress": "cyan",
    "done":        "green",
    "blocked":     "red",
}


def _api(method: str, path: str, **kwargs):
    url = f"{BASE_URL}{path}"
    try:
        r = httpx.request(method, url, timeout=10, **kwargs)
        r.raise_for_status()
        return r.json()
    except httpx.ConnectError:
        click.echo(click.style("✘ Cannot connect to tstreams server. Run: ts server start", fg="red"), err=True)
        sys.exit(1)
    except httpx.HTTPStatusError as e:
        msg = e.response.text
        try:
            msg = e.response.json().get("detail", msg)
        except Exception:
            pass
        click.echo(click.style(f"✘ {e.response.status_code}: {msg}", fg="red"), err=True)
        sys.exit(1)


# ── Root group ────────────────────────────────────────────────────────────────

@click.group()
def cli():
    """tstreams — task coordination for multi-agent workflows."""
    pass


# ── Server ────────────────────────────────────────────────────────────────────

@cli.group()
def server():
    """Start and stop the tstreams server."""
    pass


@server.command("start")
@click.option("--db", default=None, help="Path to SQLite database file.")
@click.option("--port", default=8765, show_default=True, help="Port to listen on.")
@click.option("--host", default="127.0.0.1", show_default=True, help="Host to bind.")
def server_start(db, port, host):
    """Start the tstreams API server."""
    env = os.environ.copy()
    if db:
        env["TSTREAMS_DB"] = db
    env["TSTREAMS_PORT"] = str(port)
    click.echo(f"Starting tstreams on {host}:{port} …")
    click.echo(f"Dashboard → http://{host}:{port}/dashboard")
    # Prefer a directly-importable uvicorn; fall back to `uv run` if not installed.
    import importlib.util, shutil
    if importlib.util.find_spec("uvicorn") is not None:
        cmd = [sys.executable, "-m", "uvicorn", "api:app", "--host", host, "--port", str(port)]
    else:
        uv = shutil.which("uv")
        if uv:
            cmd = [uv, "run", "uvicorn", "api:app", "--host", host, "--port", str(port)]
        else:
            cmd = [sys.executable, "-m", "uvicorn", "api:app", "--host", host, "--port", str(port)]
    subprocess.run(cmd, env=env)


# ── Project ───────────────────────────────────────────────────────────────────

@cli.group()
def project():
    """Manage projects."""
    pass


@project.command("list")
def project_list():
    """List all known projects."""
    rows = _api("GET", "/projects")
    if not rows:
        click.echo("No projects yet.")
        return
    for p in rows:
        click.echo(f"  {p}")


@project.command("detect")
def project_detect():
    """Show which project tstreams would auto-detect from the current directory."""
    p = _detect_project()
    click.echo(click.style(f"✔ Detected project: {p}", fg="cyan"))


# ── Epic ─────────────────────────────────────────────────────────────────────

@cli.group()
def epic():
    """Manage epics."""
    pass


@epic.command("create")
@click.argument("title")
@click.option("--project", "proj", default=None, help="Project name (default: auto-detect)")
def epic_create(title, proj):
    """Create a new epic."""
    data = _api("POST", "/epics", json={"title": title, "project": proj or _detect_project()})
    click.echo(click.style(f"✔ Epic #{data['id']} created: [{data['project']}] {data['title']}", fg="green"))


@epic.command("close")
@click.argument("epic_id", type=int)
def epic_close(epic_id):
    """Close an epic."""
    data = _api("POST", f"/epics/{epic_id}/close")
    click.echo(click.style(f"✔ Epic #{data['id']} closed: {data['title']}", fg="green"))


@epic.command("list")
@click.option("--project", "proj", default=None, help="Filter by project (default: auto-detect). Use --all for all projects.")
@click.option("--all", "all_projects", is_flag=True, help="Show epics from all projects.")
def epic_list(proj, all_projects):
    """List all epics."""
    params = {} if all_projects else {"project": proj or _detect_project()}
    rows = _api("GET", "/epics", params=params)
    if not rows:
        click.echo("No epics yet.")
        return
    click.echo(f"{'ID':<5} {'PROJECT':<16} {'STATUS':<12} {'PROGRESS':<12} TITLE")
    click.echo("─" * 72)
    for e in rows:
        done = e["done_count"] or 0
        total = e["task_count"] or 0
        pct = f"{done}/{total}"
        color = "green" if e["status"] == "done" else "white"
        click.echo(click.style(f"{e['id']:<5} {e['project']:<16} {e['status']:<12} {pct:<12} {e['title']}", fg=color))


# ── Task ──────────────────────────────────────────────────────────────────────

@cli.group()
def task():
    """Manage tasks."""
    pass


@task.command("create")
@click.argument("title")
@click.option("--epic", "epic_id", type=int, default=None, help="Parent epic ID.")
@click.option("--deps", default=None, help="Comma-separated dependency task IDs.")
@click.option("--desc", default=None, help="Task description.")
@click.option("--project", "proj", default=None, help="Project name (default: auto-detect)")
@click.option("--github", is_flag=True, default=False, help="Create a linked GitHub issue after task creation.")
def task_create(title, epic_id, deps, desc, proj, github):
    """Create a new task."""
    dep_list = [int(d.strip()) for d in deps.split(",")] if deps else None
    data = _api("POST", "/tasks", json={
        "title": title,
        "description": desc,
        "epic_id": epic_id,
        "deps": dep_list,
        "project": proj or _detect_project(),
    })
    click.echo(click.style(f"✔ Task #{data['id']} created: {data['title']}", fg="green"))
    if github:
        result = _api("POST", f"/tasks/{data['id']}/github-issue")
        if result.get("message"):
            click.echo(click.style(f"  ↳ GitHub issue: {result['message']}", fg="cyan"))


@task.command("list")
@click.option("--epic", "epic_id", type=int, default=None)
@click.option("--status", default=None, help="Filter by status: pending, in_progress, done, blocked")
@click.option("--owner", default=None, help="Filter by agent owner.")
@click.option("--project", "proj", default=None, help="Filter by project (default: auto-detect). Use --all for all projects.")
@click.option("--all", "all_projects", is_flag=True, help="Show tasks from all projects.")
def task_list(epic_id, status, owner, proj, all_projects):
    """List tasks."""
    params = {}
    if not all_projects:
        params["project"] = proj or _detect_project()
    if epic_id:
        params["epic_id"] = epic_id
    if status:
        params["status"] = status
    if owner:
        params["owner"] = owner
    rows = _api("GET", "/tasks", params=params)
    if not rows:
        click.echo("No tasks found.")
        return
    click.echo(f"{'ID':<5} {'STATUS':<12} {'OWNER':<15} TITLE")
    click.echo("─" * 65)
    for t in rows:
        icon = STATUS_EMOJI.get(t["status"], "?")
        color = STATUS_COLOR.get(t["status"], "white")
        owner_str = t["owner"] or "—"
        line = f"{t['id']:<5} {icon} {t['status']:<10} {owner_str:<15} {t['title']}"
        click.echo(click.style(line, fg=color))
        if t["status"] == "blocked" and t.get("blocked_reason"):
            click.echo(click.style(f"      ↳ {t['blocked_reason']}", fg="yellow"))


@task.command("claim")
@click.argument("task_id", type=int)
@click.option("--agent", "agent_id", required=True, envvar="TSTREAMS_AGENT", help="Agent identifier.")
def task_claim(task_id, agent_id):
    """Claim a task (atomic)."""
    _api("POST", f"/tasks/{task_id}/claim", json={"agent_id": agent_id})
    click.echo(click.style(f"✔ Task #{task_id} claimed by {agent_id}", fg="cyan"))


@task.command("heartbeat")
@click.argument("task_id", type=int)
@click.option("--agent", "agent_id", required=True, envvar="TSTREAMS_AGENT", help="Agent identifier.")
def task_heartbeat(task_id, agent_id):
    """Extend the lease on a claimed task."""
    _api("POST", f"/tasks/{task_id}/heartbeat", json={"agent_id": agent_id})
    click.echo(f"♥ Heartbeat sent for task #{task_id}")


@task.command("complete")
@click.argument("task_id", type=int)
@click.option("--agent", "agent_id", required=True, envvar="TSTREAMS_AGENT", help="Agent identifier.")
def task_complete(task_id, agent_id):
    """Mark a task as done."""
    _api("POST", f"/tasks/{task_id}/complete", json={"agent_id": agent_id})
    click.echo(click.style(f"✔ Task #{task_id} completed by {agent_id}", fg="green"))


@task.command("block")
@click.argument("task_id", type=int)
@click.option("--agent", "agent_id", required=True, envvar="TSTREAMS_AGENT", help="Agent identifier.")
@click.option("--reason", required=True, help="Why the task is blocked.")
def task_block(task_id, agent_id, reason):
    """Mark a task as blocked."""
    _api("POST", f"/tasks/{task_id}/block", json={"agent_id": agent_id, "reason": reason})
    click.echo(click.style(f"✘ Task #{task_id} blocked: {reason}", fg="yellow"))


@task.command("unblock")
@click.argument("task_id", type=int)
def task_unblock(task_id):
    """Unblock a task (reset to pending)."""
    _api("POST", f"/tasks/{task_id}/unblock")
    click.echo(click.style(f"✔ Task #{task_id} unblocked", fg="green"))


@task.command("move")
@click.argument("task_id", type=int)
@click.option("--epic", "epic_id", type=int, required=True, help="Target epic ID.")
def task_move(task_id, epic_id):
    """Reassign a task to a different epic."""
    _api("PATCH", f"/tasks/{task_id}", json={"epic_id": epic_id})
    click.echo(click.style(f"✔ Task #{task_id} moved to epic #{epic_id}", fg="green"))


@task.command("show")
@click.argument("task_id", type=int)
def task_show(task_id):
    """Show full details of a task."""
    t = _api("GET", f"/tasks/{task_id}")
    icon = STATUS_EMOJI.get(t["status"], "?")
    color = STATUS_COLOR.get(t["status"], "white")
    click.echo(click.style(f"\n{icon} Task #{t['id']}: {t['title']}", fg=color, bold=True))
    click.echo(f"  Status:  {t['status']}")
    click.echo(f"  Owner:   {t['owner'] or '—'}")
    click.echo(f"  Epic:    {t['epic_id'] or '—'}")
    if t.get("description"):
        click.echo(f"  Desc:    {t['description']}")
    if t.get("blocked_reason"):
        click.echo(click.style(f"  Blocked: {t['blocked_reason']}", fg="red"))
    click.echo()


# ── Issue ─────────────────────────────────────────────────────────────────────

@cli.group()
def issue():
    """Manage GitHub issue links."""
    pass


@issue.command("link")
@click.argument("task_id", type=int)
@click.argument("issue_number", type=int)
@click.option("--repo", default=None, help="GitHub repo (owner/repo). Defaults to TSTREAMS_GITHUB_REPO.")
def issue_link(task_id, issue_number, repo):
    """Link a task to a GitHub issue."""
    payload = {"issue_number": issue_number}
    if repo:
        payload["repo"] = repo
    _api("POST", f"/tasks/{task_id}/link", json=payload)
    click.echo(click.style(f"✔ Task #{task_id} linked to issue #{issue_number}", fg="green"))


@issue.command("unlink")
@click.argument("task_id", type=int)
def issue_unlink(task_id):
    """Remove the GitHub issue link from a task."""
    _api("DELETE", f"/tasks/{task_id}/link")
    click.echo(click.style(f"✔ Task #{task_id} unlinked from GitHub", fg="green"))


@issue.command("list")
def issue_list():
    """List all enrolled task↔issue pairs."""
    rows = _api("GET", "/issues")
    if not rows:
        click.echo("No linked issues.")
        return
    click.echo(f"{'TASK':<6} {'ISSUE':<8} {'REPO':<30} {'SYNCED':<20} STATUS")
    click.echo("─" * 75)
    now = int(time.time())
    for r in rows:
        synced = r.get("synced_at") or 0
        synced_str = f"{now - synced}s ago" if synced else "never"
        ts_updated = r.get("tstreams_updated_at") or 0
        gh_updated = r.get("github_updated_at") or 0
        newer = "local newer" if ts_updated > gh_updated else ("gh newer" if gh_updated > ts_updated else "in sync")
        click.echo(f"#{r['task_id']:<5} #{r['issue_number']:<7} {r['repo']:<30} {synced_str:<20} {newer}")


@issue.command("sync")
def issue_sync():
    """Trigger an immediate GitHub sync cycle."""
    _api("POST", "/issues/sync")
    click.echo(click.style("✔ Sync triggered", fg="green"))


# ── Decision ──────────────────────────────────────────────────────────────────

@cli.group()
def decision():
    """Manage decisions."""
    pass


@decision.command("add")
@click.argument("title")
@click.option("--content", required=True, help="Decision content / rationale.")
@click.option("--epic", "epic_id", type=int, default=None)
def decision_add(title, content, epic_id):
    """Record a decision."""
    data = _api("POST", "/decisions", json={"title": title, "content": content, "epic_id": epic_id})
    click.echo(click.style(f"✔ Decision #{data['id']} recorded: {data['title']}", fg="green"))


@decision.command("list")
@click.option("--epic", "epic_id", type=int, default=None)
def decision_list(epic_id):
    """List decisions."""
    params = {"epic_id": epic_id} if epic_id else {}
    rows = _api("GET", "/decisions", params=params)
    if not rows:
        click.echo("No decisions yet.")
        return
    for d in rows:
        click.echo(click.style(f"#{d['id']} {d['title']}", bold=True))
        click.echo(f"   {d['content']}")


@decision.command("resolve")
@click.argument("decision_id", type=int)
def decision_resolve(decision_id):
    """Mark a decision as decided."""
    data = _api("POST", f"/decisions/{decision_id}/resolve")
    click.echo(click.style(f"✔ Decision #{data['id']} resolved: {data['title']}", fg="green"))


@decision.command("update")
@click.argument("decision_id", type=int)
@click.option("--title",   default=None, help="New title.")
@click.option("--content", default=None, help="New content (markdown supported).")
def decision_update(decision_id, title, content):
    """Update a decision's title or content."""
    if not title and not content:
        raise click.UsageError("Provide at least --title or --content.")
    data = _api("PATCH", f"/decisions/{decision_id}", json={
        k: v for k, v in {"title": title, "content": content}.items() if v is not None
    })
    click.echo(click.style(f"✔ Decision #{data['id']} updated: {data['title']}", fg="green"))


# ── Version ───────────────────────────────────────────────────────────────────

@cli.group()
def version():
    """Tag software versions and generate changelogs."""
    pass


@version.command("tag")
@click.argument("name")
@click.option("--desc", default=None, help="Optional description for this version.")
@click.option("--project", "proj", default=None, help="Project name (default: auto-detect)")
@click.option("--epic", "epic_ids", multiple=True, type=int, help="Scope to epic ID(s). Repeatable: --epic 3 --epic 5")
def version_tag(name, desc, proj, epic_ids):
    """Snapshot done tasks as a named version tag (optionally scoped to epics)."""
    data = _api("POST", "/versions", json={
        "name": name,
        "description": desc,
        "project": proj or _detect_project(),
        "epic_ids": list(epic_ids) if epic_ids else None,
    })
    click.echo(click.style(
        f"✔ Version '{data['name']}' tagged for [{data['project']}] — {data['task_count']} task(s) captured",
        fg="green",
    ))


@version.command("list")
@click.option("--project", "proj", default=None, help="Filter by project (default: auto-detect). Use --all for all projects.")
@click.option("--all", "all_projects", is_flag=True, help="Show versions from all projects.")
def version_list(proj, all_projects):
    """List all version tags."""
    params = {} if all_projects else {"project": proj or _detect_project()}
    rows = _api("GET", "/versions", params=params)
    if not rows:
        click.echo("No versions tagged yet.")
        return
    click.echo(f"{'ID':<5} {'PROJECT':<16} {'NAME':<20} {'TASKS':<8} CREATED")
    click.echo("─" * 70)
    now = int(time.time())
    for v in rows:
        age = now - v["created_at"]
        age_str = f"{age // 86400}d ago" if age >= 86400 else f"{age // 3600}h ago" if age >= 3600 else f"{age // 60}m ago"
        desc = f"  {v['description']}" if v.get("description") else ""
        click.echo(f"{v['id']:<5} {v['project']:<16} {v['name']:<20} {v['task_count']:<8} {age_str}{desc}")


@version.command("delete")
@click.argument("version_id", type=int)
def version_delete(version_id):
    """Delete a version tag."""
    data = _api("DELETE", f"/versions/{version_id}")
    click.echo(click.style(f"✔ {data['message']}", fg="yellow"))


@version.command("diff")
@click.argument("to_version")
@click.option("--from", "from_version", default=None, help="Base version (omit for initial release).")
@click.option("--project", "proj", default=None, help="Project name (default: auto-detect)")
@click.option("--format", "fmt", default="text", type=click.Choice(["text", "markdown"]), show_default=True)
def version_diff(to_version, from_version, proj, fmt):
    """Show tasks added between two version tags (changelog diff)."""
    project = proj or _detect_project()
    params = {"project": project, "to": to_version}
    if from_version:
        params["from"] = from_version
    data = _api("GET", "/versions/diff", params=params)

    frm = data.get("from_version")
    to = data["to_version"]
    tasks = data["tasks"]

    if fmt == "markdown":
        header = f"## Changelog: {to['name']}"
        if frm:
            header += f" (since {frm['name']})"
        click.echo(header)
        click.echo()
        # Group by epic
        by_epic: dict[str, list] = {}
        for t in tasks:
            key = str(t.get("epic_id") or "no epic")
            by_epic.setdefault(key, []).append(t)
        for epic_key, epic_tasks in by_epic.items():
            click.echo(f"### Epic {epic_key}")
            for t in epic_tasks:
                desc = f" — {t['description']}" if t.get("description") else ""
                click.echo(f"- **{t['title']}** (#{t['id']}){desc}")
            click.echo()
    else:
        from_label = frm["name"] if frm else "(initial)"
        click.echo(click.style(
            f"\nChangelog: {project}  {from_label} → {to['name']}  ({len(tasks)} change(s))\n",
            bold=True,
        ))
        if not tasks:
            click.echo("  No new tasks between these versions.")
            return
        current_epic = None
        for t in tasks:
            if t.get("epic_id") != current_epic:
                current_epic = t.get("epic_id")
                click.echo(click.style(f"  Epic #{current_epic or '—'}", fg="cyan", bold=True))
            icon = STATUS_EMOJI.get(t["status"], "?")
            color = STATUS_COLOR.get(t["status"], "white")
            click.echo(click.style(f"    {icon} #{t['id']} {t['title']}", fg=color))
            if t.get("description"):
                click.echo(f"       {t['description']}")
        click.echo()


# ── Agent ─────────────────────────────────────────────────────────────────────

@cli.group()
def agent():
    """Manage agents."""
    pass


@agent.command("register")
@click.argument("agent_id")
def agent_register(agent_id):
    """Register an agent."""
    _api("POST", "/agents", json={"agent_id": agent_id})
    click.echo(click.style(f"✔ Agent '{agent_id}' registered", fg="green"))


@agent.command("list")
def agent_list():
    """List registered agents."""
    rows = _api("GET", "/agents")
    if not rows:
        click.echo("No agents registered.")
        return
    now = int(time.time())
    click.echo(f"{'AGENT':<20} {'LAST SEEN':<15} CURRENT TASK")
    click.echo("─" * 55)
    for a in rows:
        age = now - a["last_heartbeat"]
        age_str = f"{age}s ago"
        task_str = f"#{a['current_task']}" if a["current_task"] else "idle"
        color = "green" if age < 120 else "yellow" if age < 600 else "red"
        click.echo(click.style(f"{a['id']:<20} {age_str:<15} {task_str}", fg=color))


# ── Status (live feed in terminal) ────────────────────────────────────────────

@cli.command("status")
@click.option("--lines", default=20, show_default=True, help="Number of recent events to show.")
def status(lines):
    """Show current operational status."""
    epics = _api("GET", "/epics", params={"status": "open"})
    active = _api("GET", "/tasks", params={"status": "in_progress"})
    blocked = _api("GET", "/tasks", params={"status": "blocked"})
    pending = _api("GET", "/tasks", params={"status": "pending"})
    agents = _api("GET", "/agents")

    now = int(time.time())

    click.echo(click.style("\n── Epics ─────────────────────────────────────", bold=True))
    for e in epics:
        done = e["done_count"] or 0
        total = e["task_count"] or 0
        bar_len = 20
        filled = int((done / total) * bar_len) if total else 0
        bar = "█" * filled + "░" * (bar_len - filled)
        pct = f"{int((done/total)*100)}%" if total else "0%"
        click.echo(f"  #{e['id']} {e['title'][:30]:<30} [{bar}] {pct}")

    click.echo(click.style("\n── Active Tasks ──────────────────────────────", bold=True))
    if not active and not blocked:
        click.echo("  No active tasks.")
    for t in active:
        click.echo(click.style(f"  ⟳ #{t['id']} [{t['owner']}] {t['title']}", fg="cyan"))
    for t in blocked:
        click.echo(click.style(f"  ✘ #{t['id']} BLOCKED — {t.get('blocked_reason','')}", fg="red"))

    click.echo(click.style("\n── Agents ────────────────────────────────────", bold=True))
    if not agents:
        click.echo("  No agents registered.")
    for a in agents:
        age = now - a["last_heartbeat"]
        task_str = f"task #{a['current_task']}" if a["current_task"] else "idle"
        color = "green" if age < 120 else "yellow" if age < 600 else "red"
        click.echo(click.style(f"  {a['id']:<20} {task_str}  (last seen {age}s ago)", fg=color))

    click.echo(click.style("\n── Pending ───────────────────────────────────", bold=True))
    click.echo(f"  {len(pending)} task(s) waiting to be claimed.")
    click.echo()


if __name__ == "__main__":
    cli()

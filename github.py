"""
github.py — Bidirectional GitHub sync worker for tstreams.

Runs as a background thread inside the API process.
Syncs tasks ↔ GitHub Issues in both directions.

Activation: only runs when TSTREAMS_GITHUB_TOKEN and
TSTREAMS_GITHUB_REPO are set (or defined in .tstreams.toml).

Config (env vars or .tstreams.toml):
  TSTREAMS_GITHUB_TOKEN  — personal access token (repo scope)
  TSTREAMS_GITHUB_REPO   — "owner/repo" e.g. "SonicDMG/my-project"
  TSTREAMS_SYNC_INTERVAL — polling interval in seconds (default: 30)
"""

import logging
import os
import threading
import time
from pathlib import Path

import httpx

logger = logging.getLogger("tstreams.github")

GITHUB_API = "https://api.github.com"
DEFAULT_INTERVAL = 30

# Status → GitHub label mapping
STATUS_LABELS = {
    "pending":     "ts:pending",
    "in_progress": "ts:in_progress",
    "blocked":     "ts:blocked",
    "done":        "ts:done",
}

# GitHub issue state → tstreams status (inbound)
_GITHUB_STATE_MAP = {
    "open": "pending",   # open issues without assignee → pending
    "closed": "done",
}


def _github_headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


# ── Low-level GitHub API calls ────────────────────────────────────────────────

def close_issue(token: str, repo: str, issue_number: int, task_title: str) -> bool:
    """Close a GitHub issue and add a completion comment."""
    headers = _github_headers(token)
    base = f"{GITHUB_API}/repos/{repo}/issues/{issue_number}"
    try:
        httpx.post(
            f"{base}/comments",
            headers=headers,
            json={"body": f"✅ Completed via tstreams: **{task_title}**"},
            timeout=10,
        )
        r = httpx.patch(base, headers=headers, json={"state": "closed"}, timeout=10)
        return r.status_code == 200
    except Exception as e:
        logger.error("Failed to close issue #%d: %s", issue_number, e)
        return False


def create_issue(token: str, repo: str, title: str, body: str = "",
                 labels: list = None) -> int | None:
    """Create a GitHub issue and return its number."""
    headers = _github_headers(token)
    payload = {"title": title, "body": body or ""}
    if labels:
        payload["labels"] = labels
    try:
        r = httpx.post(
            f"{GITHUB_API}/repos/{repo}/issues",
            headers=headers,
            json=payload,
            timeout=10,
        )
        if r.status_code == 201:
            return r.json()["number"]
        logger.error("Failed to create issue: %s", r.text)
        return None
    except Exception as e:
        logger.error("Failed to create issue: %s", e)
        return None


def _patch_issue(token: str, repo: str, issue_number: int, **kwargs) -> bool:
    """PATCH arbitrary fields on a GitHub issue."""
    try:
        r = httpx.patch(
            f"{GITHUB_API}/repos/{repo}/issues/{issue_number}",
            headers=_github_headers(token),
            json=kwargs,
            timeout=10,
        )
        return r.status_code == 200
    except Exception as e:
        logger.error("Failed to patch issue #%d: %s", issue_number, e)
        return False


def _set_labels(token: str, repo: str, issue_number: int, labels: list) -> None:
    """Replace the label set on a GitHub issue."""
    try:
        httpx.put(
            f"{GITHUB_API}/repos/{repo}/issues/{issue_number}/labels",
            headers=_github_headers(token),
            json={"labels": labels},
            timeout=10,
        )
    except Exception as e:
        logger.error("Failed to set labels on #%d: %s", issue_number, e)


def _fetch_issues_since(token: str, repo: str, since_ts: int) -> list:
    """Fetch all issues updated since a unix timestamp (inbound poll)."""
    headers = _github_headers(token)
    params = {"state": "all", "per_page": 100}
    if since_ts > 0:
        import datetime
        dt = datetime.datetime.utcfromtimestamp(since_ts).strftime("%Y-%m-%dT%H:%M:%SZ")
        params["since"] = dt
    try:
        r = httpx.get(
            f"{GITHUB_API}/repos/{repo}/issues",
            headers=headers,
            params=params,
            timeout=15,
        )
        if r.status_code == 200:
            return r.json()
        logger.error("Failed to fetch issues: %s", r.text)
        return []
    except Exception as e:
        logger.error("Failed to fetch issues: %s", e)
        return []


# ── Sync logic ────────────────────────────────────────────────────────────────

def create_issue_for_task(conn, token: str, repo: str, task_id: int) -> int | None:
    """
    Create a GitHub issue for an existing task and enroll it.
    Returns the issue number or None on failure.
    """
    import db as database
    task = database.get_task(conn, task_id)
    if not task:
        return None
    issue_number = create_issue(token, repo, task["title"], task["description"] or "")
    if issue_number is None:
        return None
    database.enroll_issue(conn, task_id, issue_number, repo)
    database._emit(conn, task["project"], task_id, None,
                   "task_github_linked",
                   f'{{"issue_number": {issue_number}, "repo": "{repo}"}}')
    logger.info("Created GitHub issue #%d for task #%d", issue_number, task_id)
    return issue_number


def _sync_once(conn, token: str, repo: str, last_poll_ts: list) -> None:
    """
    Run one full bidirectional sync cycle.
    last_poll_ts is a 1-element list used as a mutable cell.
    """
    import db as database

    # ── OUTBOUND: tstreams → GitHub ──────────────────────────────────────────
    rows = database.get_synced_tasks(conn, repo)
    for row in rows:
        task_id = row["id"]
        issue_number = row["issue_number"]
        status = row["status"]
        synced_at = row["synced_at"] or 0
        ts_updated = row["tstreams_updated_at"] or 0

        # Push whenever local state is newer than last outbound sync
        needs_push = ts_updated > synced_at or synced_at == 0

        if not needs_push:
            continue

        if status == "done":
            ok = close_issue(token, repo, issue_number, row["title"])
            if ok:
                conn.execute(
                    "UPDATE github_sync SET synced_at = unixepoch() WHERE task_id = ?",
                    (task_id,),
                )
                conn.commit()
                logger.info("Outbound: closed issue #%d for task #%d", issue_number, task_id)
        else:
            # Sync title + body
            _patch_issue(token, repo, issue_number,
                         title=row["title"],
                         body=row["description"] or "",
                         state="open")
            # Sync assignees
            assignees = [row["owner"]] if row["owner"] else []
            _patch_issue(token, repo, issue_number, assignees=assignees)
            # Sync status label
            label = STATUS_LABELS.get(status)
            if label:
                _set_labels(token, repo, issue_number, [label])
            conn.execute(
                "UPDATE github_sync SET synced_at = unixepoch() WHERE task_id = ?",
                (task_id,),
            )
            conn.commit()
            logger.info("Outbound: synced issue #%d for task #%d (status=%s)",
                        issue_number, task_id, status)

    # ── INBOUND: GitHub → tstreams ───────────────────────────────────────────
    issues = _fetch_issues_since(token, repo, last_poll_ts[0])
    now = int(time.time())
    for issue in issues:
        # skip pull requests
        if "pull_request" in issue:
            continue
        issue_number = issue["number"]
        row = database.get_task_by_issue(conn, repo, issue_number)
        if not row:
            continue

        # Parse GitHub updated_at to unix ts
        import datetime
        gh_updated_str = issue.get("updated_at", "")
        try:
            gh_ts = int(datetime.datetime.strptime(
                gh_updated_str, "%Y-%m-%dT%H:%M:%SZ"
            ).timestamp())
        except Exception:
            gh_ts = now

        gh_state = issue.get("state", "open")
        new_status = "done" if gh_state == "closed" else row["status"]
        assignees = issue.get("assignees", [])
        new_owner = assignees[0]["login"] if assignees else None

        applied = database.update_task_from_github(
            conn,
            task_id=row["id"],
            title=issue.get("title", row["title"]),
            description=issue.get("body") or row["description"],
            status=new_status,
            owner=new_owner,
            github_updated_at=gh_ts,
        )
        if applied:
            logger.info("Inbound: updated task #%d from issue #%d", row["id"], issue_number)
        else:
            logger.debug("Inbound: skipped task #%d (local is newer)", row["id"])

    last_poll_ts[0] = now


def _worker(conn, token: str, repo: str, interval: int) -> None:
    logger.info("GitHub sync worker started for %s (every %ds)", repo, interval)
    last_poll_ts = [0]  # reset to 0 on start to catch up
    while True:
        try:
            _sync_once(conn, token, repo, last_poll_ts)
        except Exception as e:
            logger.error("Sync error: %s", e)
        time.sleep(interval)


def _resolve_config() -> tuple[str, str]:
    """
    Resolve (token, repo) from env vars, .tstreams.toml, or `gh auth token`.
    Returns ('', '') if not configured.
    """
    token = os.environ.get("TSTREAMS_GITHUB_TOKEN", "")
    repo  = os.environ.get("TSTREAMS_GITHUB_REPO", "")

    if not token or not repo:
        toml_path = Path(".tstreams.toml")
        if toml_path.exists():
            try:
                import tomllib  # Python 3.11+
            except ImportError:
                try:
                    import tomli as tomllib
                except ImportError:
                    tomllib = None

            if tomllib:
                with open(toml_path, "rb") as f:
                    cfg = tomllib.load(f)
                token = token or cfg.get("github_token", "")
                repo  = repo  or cfg.get("github_repo", "")
                if token and token.startswith("${") and token.endswith("}"):
                    token = os.environ.get(token[2:-1], "")
                if repo and repo.startswith("${") and repo.endswith("}"):
                    repo = os.environ.get(repo[2:-1], "")

    # Last resort: try `gh auth token` (GitHub CLI)
    if not token:
        import subprocess
        try:
            result = subprocess.run(
                ["gh", "auth", "token"],
                capture_output=True, text=True, timeout=5,
            )
            if result.returncode == 0:
                token = result.stdout.strip()
                if token:
                    logger.info("GitHub token obtained from `gh auth token`")
        except Exception:
            pass

    return token or "", repo or ""


def start_sync_worker(conn) -> threading.Thread | None:
    """
    Start the background sync thread if GitHub config is present.
    Returns the thread, or None if config is missing.
    """
    token, repo = _resolve_config()

    if not token or not repo:
        logger.info("GitHub sync disabled (no TSTREAMS_GITHUB_TOKEN / TSTREAMS_GITHUB_REPO)")
        return None

    interval = int(os.environ.get("TSTREAMS_SYNC_INTERVAL", DEFAULT_INTERVAL))
    t = threading.Thread(target=_worker, args=(conn, token, repo, interval), daemon=True)
    t.start()
    return t

"""
github.py — One-way GitHub sync worker for tstreams.

Runs as a background thread inside the API process.
Watches for completed tasks that have a github_issue mapping
and closes the corresponding GitHub issue.

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


def _github_headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def close_issue(token: str, repo: str, issue_number: int, task_title: str) -> bool:
    """Close a GitHub issue and add a comment."""
    headers = _github_headers(token)
    base = f"{GITHUB_API}/repos/{repo}/issues/{issue_number}"

    try:
        # Add a comment first
        httpx.post(
            f"{base}/comments",
            headers=headers,
            json={"body": f"✅ Completed via tstreams: **{task_title}**"},
            timeout=10,
        )
        # Close the issue
        r = httpx.patch(base, headers=headers, json={"state": "closed"}, timeout=10)
        return r.status_code == 200
    except Exception as e:
        logger.error("Failed to close issue #%d: %s", issue_number, e)
        return False


def create_issue(token: str, repo: str, title: str, body: str = "", labels: list = None) -> int | None:
    """Create a GitHub issue and return its number."""
    headers = _github_headers(token)
    payload = {"title": title, "body": body}
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


def _sync_once(conn, token: str, repo: str) -> None:
    """Find completed tasks with github_issue mappings and close them."""
    import db as database

    # Tasks that are done and have a github_sync row that hasn't been synced
    rows = conn.execute("""
        SELECT t.id, t.title, gs.issue_number
        FROM tasks t
        JOIN github_sync gs ON gs.task_id = t.id
        WHERE t.status = 'done'
          AND gs.synced_at = 0
    """).fetchall()

    for row in rows:
        task_id, title, issue_number = row["id"], row["title"], row["issue_number"]
        ok = close_issue(token, repo, issue_number, title)
        if ok:
            conn.execute(
                "UPDATE github_sync SET synced_at = unixepoch() WHERE task_id = ?",
                (task_id,),
            )
            conn.commit()
            logger.info("Synced task #%d → closed issue #%d", task_id, issue_number)


def _worker(conn, token: str, repo: str, interval: int) -> None:
    logger.info("GitHub sync worker started for %s (every %ds)", repo, interval)
    while True:
        try:
            _sync_once(conn, token, repo)
        except Exception as e:
            logger.error("Sync error: %s", e)
        time.sleep(interval)


def start_sync_worker(conn) -> threading.Thread | None:
    """
    Start the background sync thread if GitHub config is present.
    Returns the thread, or None if config is missing.
    """
    token = os.environ.get("TSTREAMS_GITHUB_TOKEN")
    repo  = os.environ.get("TSTREAMS_GITHUB_REPO")

    # Also check .tstreams.toml if env vars not set
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
                token = token or cfg.get("github_token")
                repo  = repo  or cfg.get("github_repo")
                # resolve env var references like "${GITHUB_TOKEN}"
                if token and token.startswith("${") and token.endswith("}"):
                    token = os.environ.get(token[2:-1], "")
                if repo and repo.startswith("${") and repo.endswith("}"):
                    repo = os.environ.get(repo[2:-1], "")

    if not token or not repo:
        logger.info("GitHub sync disabled (no TSTREAMS_GITHUB_TOKEN / TSTREAMS_GITHUB_REPO)")
        return None

    interval = int(os.environ.get("TSTREAMS_SYNC_INTERVAL", DEFAULT_INTERVAL))
    t = threading.Thread(target=_worker, args=(conn, token, repo, interval), daemon=True)
    t.start()
    return t

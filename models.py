"""
models.py — Pydantic request/response models for tstreams API.
"""

from typing import Optional
from pydantic import BaseModel


# ── Request bodies ────────────────────────────────────────────────────────────

class EpicCreate(BaseModel):
    title: str
    project: Optional[str] = "default"


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    epic_id: Optional[int] = None
    deps: Optional[list[int]] = None
    project: Optional[str] = "default"
    task_type: Optional[str] = "implementation"


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    task_type: Optional[str] = None


class TaskClaim(BaseModel):
    agent_id: str


class TaskComplete(BaseModel):
    agent_id: str


class TaskBlock(BaseModel):
    agent_id: str
    reason: str


class CodePathCreate(BaseModel):
    file_path: str
    function_name: Optional[str] = None
    commit_hash: str
    commit_date: int
    notes: Optional[str] = None


class TaskVerify(BaseModel):
    agent_id: str
    verification_status: str
    verification_method: Optional[str] = None
    code_paths: Optional[list[CodePathCreate]] = None


class TaskTestingUpdate(BaseModel):
    tested_by: str
    testing_status: str
    test_method: Optional[str] = None
    test_result: Optional[str] = None
    notes: Optional[str] = None


class TaskHeartbeat(BaseModel):
    agent_id: str


class VersionCreate(BaseModel):
    name: str
    description: Optional[str] = None
    project: Optional[str] = "default"
    epic_ids: Optional[list[int]] = None


class DecisionCreate(BaseModel):
    title: str
    content: str
    epic_id: Optional[int] = None


class AgentRegister(BaseModel):
    agent_id: str


# ── Response shapes ───────────────────────────────────────────────────────────

class EpicOut(BaseModel):
    id: int
    project: str
    title: str
    status: str
    github_issue: Optional[int]
    task_count: int
    done_count: int
    decisions_open_count: int = 0
    created_at: int


class CodePathOut(BaseModel):
    id: int
    file_path: str
    function_name: Optional[str]
    commit_hash: str
    commit_date: int
    notes: Optional[str]


class TaskOut(BaseModel):
    id: int
    project: str
    title: str
    description: Optional[str]
    epic_id: Optional[int]
    status: str
    owner: Optional[str]
    blocked_reason: Optional[str]
    created_at: int
    updated_at: int
    github_issue_number: Optional[int] = None
    task_type: Optional[str] = "implementation"
    verification_status: Optional[str] = "unverified"
    verified_at: Optional[int] = None
    verified_by: Optional[str] = None
    verification_method: Optional[str] = None
    code_paths: Optional[list[CodePathOut]] = None
    testing_status: Optional[str] = None
    tested_by: Optional[str] = None
    test_method: Optional[str] = None
    test_result: Optional[str] = None


class DecisionOut(BaseModel):
    id: int
    epic_id: Optional[int]
    title: str
    content: str
    status: str
    created_at: int


class AgentOut(BaseModel):
    id: str
    last_heartbeat: int
    current_task: Optional[int]
    registered_at: int


class EventOut(BaseModel):
    id: int
    project: Optional[str]
    task_id: Optional[int]
    agent_id: Optional[str]
    type: str
    payload: Optional[str]
    ts: int


class OkResponse(BaseModel):
    ok: bool
    message: Optional[str] = None


class VerificationOut(BaseModel):
    task_id: int
    verification_status: str
    verified_at: Optional[int] = None
    verified_by: Optional[str] = None
    verification_method: Optional[str] = None
    code_paths: Optional[list[CodePathOut]] = None


class GithubSyncOut(BaseModel):
    task_id: int
    issue_number: int
    repo: str
    synced_at: int
    github_updated_at: int
    tstreams_updated_at: int


class IssueLink(BaseModel):
    issue_number: int
    repo: Optional[str] = None


class VersionOut(BaseModel):
    id: int
    project: str
    name: str
    description: Optional[str]
    created_at: int
    task_count: int = 0


class VersionDiffOut(BaseModel):
    from_version: Optional[VersionOut]
    to_version: VersionOut
    tasks: list[TaskOut]

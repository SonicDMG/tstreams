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


class TaskClaim(BaseModel):
    agent_id: str


class TaskComplete(BaseModel):
    agent_id: str


class TaskBlock(BaseModel):
    agent_id: str
    reason: str


class TaskHeartbeat(BaseModel):
    agent_id: str


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
    created_at: int


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

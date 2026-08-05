# Code Verification Feature

Enables agents to audit task implementations and link them to specific git commits. Separates **task completion status** from **code verification status**, allowing queries like "Task X is complete but unverified—where's the code?"

## Overview

- **Independent verification status**: Tasks can be `done` but `unverified`, or `in_progress` but `verified`
- **Commit tracking**: Store file paths, function names, and commit hashes for each implementation
- **Audit trail**: Record who verified, when, and what method (manual_audit, automated_scan, code_review)
- **Flexible statuses**: `unverified`, `verified`, `partial`, `needs_review`

## API Endpoints

### POST /tasks/{task_id}/verify
Mark task code as verified and store code locations.

**Request:**
```json
{
  "agent_id": "bob",
  "verification_status": "verified",
  "verification_method": "manual_audit",
  "code_paths": [
    {
      "file_path": "src/auth/verify.py",
      "function_name": "verify_user_token",
      "commit_hash": "abc123def456",
      "commit_date": 1705270800,
      "notes": "Main auth verification logic"
    }
  ]
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Task verified with status: verified"
}
```

**Verification statuses:**
- `unverified` — default, no code verification done
- `verified` — code found and verified
- `partial` — some code found but incomplete
- `needs_review` — code found but flagged for review

**Verification methods:**
- `manual_audit` — human reviewed code
- `automated_scan` — AI or tool found code
- `code_review` — formal code review completed

### GET /tasks/{task_id}/verification
Fetch verification details for a task.

**Response:**
```json
{
  "task_id": 86,
  "verification_status": "verified",
  "verified_at": 1705270800,
  "verified_by": "bob",
  "verification_method": "manual_audit",
  "code_paths": [
    {
      "id": 1,
      "file_path": "src/auth/verify.py",
      "function_name": "verify_user_token",
      "commit_hash": "abc123def456",
      "commit_date": 1705270800,
      "notes": "Main auth verification logic"
    }
  ]
}
```

### POST /tasks/{task_id}/verify/unset
Clear verification status and remove all code path references.

**Response:**
```json
{
  "ok": true
}
```

## Task Response Schema

All task endpoints (`GET /tasks/{id}`, `GET /tasks`, `POST /tasks`) now include:

```json
{
  "id": 86,
  "title": "Example task",
  "status": "done",
  "verification_status": "verified",
  "verified_at": 1705270800,
  "verified_by": "bob",
  "verification_method": "manual_audit",
  "code_paths": [
    {
      "id": 1,
      "file_path": "src/auth/verify.py",
      "function_name": "verify_user_token",
      "commit_hash": "abc123def456",
      "commit_date": 1705270800,
      "notes": "Main auth verification logic"
    }
  ]
}
```

## Database Schema

### task_code_verification
```sql
CREATE TABLE task_code_verification (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id          INTEGER NOT NULL UNIQUE REFERENCES tasks(id),
    verification_status TEXT NOT NULL DEFAULT 'unverified',
    verified_at      INTEGER,
    verified_by      TEXT,
    verification_method TEXT,
    last_updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
```

### code_path_references
```sql
CREATE TABLE code_path_references (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id          INTEGER NOT NULL REFERENCES tasks(id),
    file_path        TEXT NOT NULL,
    function_name    TEXT,
    commit_hash      TEXT NOT NULL,
    commit_date      INTEGER NOT NULL,
    notes            TEXT,
    created_at       INTEGER NOT NULL DEFAULT (unixepoch())
);
```

## Usage Examples

### Verify a task with multiple code locations
```bash
curl -X POST http://localhost:8765/tasks/123/verify \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "bob",
    "verification_status": "verified",
    "verification_method": "manual_audit",
    "code_paths": [
      {
        "file_path": "src/core/auth.py",
        "function_name": "authenticate",
        "commit_hash": "f47ac10b",
        "commit_date": 1705270800,
        "notes": "Core auth implementation"
      },
      {
        "file_path": "tests/test_auth.py",
        "commit_hash": "f47ac10b",
        "commit_date": 1705270800,
        "notes": "Unit tests for auth"
      }
    ]
  }'
```

### Query task with verification info
```bash
curl http://localhost:8765/tasks/123 | jq '{id, status, verification_status, verified_by, code_paths}'
```

### Find all verified tasks
```sql
SELECT t.id, t.title, tcv.verification_status, tcv.verified_by
FROM tasks t
JOIN task_code_verification tcv ON t.id = tcv.task_id
WHERE tcv.verification_status = 'verified';
```

### Find completed but unverified tasks
```sql
SELECT t.id, t.title, t.status
FROM tasks t
WHERE t.status = 'done'
AND t.id NOT IN (
  SELECT task_id FROM task_code_verification 
  WHERE verification_status = 'verified'
);
```

## Events

When verification status changes, a `code_verification_updated` event is emitted:

```json
{
  "type": "code_verification_updated",
  "task_id": 123,
  "agent_id": "bob",
  "payload": {"status": "verified"}
}
```

## Integration with Agents

Agents can now audit tasks and report findings with full context:

**Before:**
> "Task 123 is complete."

**After:**
> "Task TASK-123 status=done, verification_status=verified. Code verified in commit f47ac10b: src/core/auth.py::authenticate + tests/test_auth.py"

## Implementation Details

- Schema: 2 new tables with indices for fast lookups
- DB layer: 5 new helper functions (`set_code_verification`, `get_code_verification`, `add_code_path_reference`, `get_code_paths`, `clear_code_verification`)
- API: 3 new endpoints + enriched task responses
- Models: `CodePathCreate`, `TaskVerify`, `CodePathOut`, `VerificationOut`
- Events: Verification changes emit audit events for dashboard/logging

All changes are backward compatible. Existing tasks default to `verification_status: "unverified"`.

# ADR 001: Plan-then-execute handshake

**Status:** Accepted  
**Date:** 2026-05-09  
**Closes:** [#76](https://github.com/conduit-harness/conduit/issues/76)

## Context

Conduit dispatches agents immediately when an issue becomes a candidate. For autonomous runs on
complex or sensitive changes, operators want to review a proposed approach before any code is
written. This ADR answers the open questions in issue #76 and produces a chosen design path for
the scoped implementation issues that replace that placeholder.

## Decisions

### 1. Where does the plan live?

**Decision: tracker comment (primary) + state store (metadata).**

The plan body is posted as a comment on the tracker issue via a new `on_plan_ready` lifecycle
event. This makes the plan visible to humans without any extra tooling. The `RunAttempt` record
in the JSON state store gains a `planPostedAt` timestamp so the orchestrator can enforce a
timeout without re-fetching the comment.

The plan body itself is not stored in the state file (it could be large; the tracker comment is
the canonical copy).

### 2. Trigger

**Decision: workflow-level config flag `planning.enabled: true`.**

A single flag in the workflow file enables the planning phase for every dispatched issue.
Per-issue label triggers (e.g. `plan-first`) are explicitly deferred to a later release —
they add selector complexity without a proven need.

Config shape:

```yaml
planning:
  enabled: false                 # opt-in; default is off
  approval_label: plan-approved  # human adds this label to approve
  rejection_label: plan-rejected # human adds this label to reject
  timeout_ms: 86400000           # 24 h; attempt becomes timed_out if no label appears
```

### 3. Approval mechanism

**Decision: label-based.**

The human adds one of two labels to the issue:
- `planning.approval_label` (default `plan-approved`) → proceed to execute phase on next tick
- `planning.rejection_label` (default `plan-rejected`) → mark attempt failed; normal retry logic
  kicks in

Labels are already a first-class concept across all supported trackers (GitHub, Linear, Jira,
GitLab, Azure DevOps, Forgejo). The orchestrator re-fetches the current issue on each tick via
a new `fetchIssueById` tracker method and checks `issue.labels`.

Alternatives rejected:
- *Emoji reactions*: not available uniformly across trackers; GitHub only.
- *State transition*: requires operators to create new tracker states; harder to configure.
- *Slash-command in comment*: requires comment polling and parsing; added complexity.

### 4. Re-plan loop

**Decision: rejection → attempt failed → existing retry logic.**

When `plan-rejected` is detected, the attempt is marked `failed` (same as a regular agent
failure). The orchestrator's existing retry logic (`max_attempts`, `max_retry_backoff_ms`)
controls whether and when a new attempt is dispatched. The new attempt re-runs the plan phase
from scratch.

Operators can include guidance in the rejection process by having the human add a comment before
the rejection label. The next plan attempt will prompt the agent to check prior attempt history
if the workflow template includes `{{issue.url}}` or similar context — the plan comment remains
visible on the issue.

No new "re-plan counter" is introduced; the global attempt counter is sufficient.

### 5. Spec alignment

**Decision: Conduit extension; Symphony spec is not changed.**

The Symphony specification (mirrored at `website/src/content/docs/reference/spec.md`) does not
define a planning lifecycle. Adding a `planning` phase extends the spec scope significantly and
would need upstream discussion. Instead, this feature is documented as a Conduit-specific
implementation choice here in the ADR.

Concretely:
- A new `TrackerWriteEvent` value `"on_plan_ready"` is added to the Conduit type model.
- `RunAttempt` gains optional fields (`phase`, `planPostedAt`) that are ignored by spec-compliant
  consumers.
- The `ServiceConfig` gains a `planning` block that is absent from the Symphony spec.

The Symphony spec section on orchestration state (§7) is unaffected; the plan phase sits before
the existing dispatch lifecycle begins.

### 6. Runner support

**Decision: prompt-construction-driven; no runner changes.**

All three runners (claude-cli, codex-cli, aider) accept an arbitrary prompt string. The
orchestrator appends a hardcoded planning instruction block to the rendered prompt for the plan
phase:

```
---
PLANNING MODE: Do not write or modify any files.
Generate a detailed plan describing what you will do in the execution phase.
Your plan will be reviewed before execution proceeds.
End your response when the plan is complete.
---
```

No runner-side changes are needed. Operators may override planning behavior by writing a
`planning.prompt_suffix` field (future; not in scope for the initial issues).

## Resulting state model changes

```typescript
// packages/conduit/src/domain/types.ts

export type AttemptPhase = "planning" | "executing";

// New status value
export type AttemptStatus = "running" | "awaiting_approval" | "succeeded" | "failed" | "timed_out";

// Extended RunAttempt (new optional fields only — backward compatible)
export type RunAttempt = {
  id: string;
  issueId: string;
  issueIdentifier: string;
  attempt: number;
  workspacePath: string;
  branchName: string;
  startedAt: string;
  finishedAt?: string;
  status: AttemptStatus;
  phase?: AttemptPhase;     // absent = "executing" for backward compatibility
  planPostedAt?: string;    // ISO 8601; set when plan comment is posted
  error?: string;
};

// New lifecycle event
export type TrackerWriteEvent =
  | "on_start"
  | "on_plan_ready"       // new: fires after plan comment is posted
  | "on_success"
  | "on_failure"
  | "on_terminal_failure";

// New ServiceConfig.planning block
type PlanningConfig = {
  enabled: boolean;
  approvalLabel: string;   // default "plan-approved"
  rejectionLabel: string;  // default "plan-rejected"
  timeoutMs: number;       // default 86400000 (24 h)
};
```

## Orchestrator dispatch flow with planning enabled

```
tick():
  1. Re-fetch labels for each attempt with status="awaiting_approval"
     → approved  → dispatchExecute(issue, attempt)
     → rejected  → mark attempt failed; remove from awaiting set
     → timed out → mark attempt timed_out
  2. Fetch candidate issues (existing logic)
  3. Filter out: running, awaiting_approval, completed, max-attempts-reached
  4. Dispatch remaining:
     → planning.enabled  → dispatchPlan(issue)
     → otherwise         → dispatch(issue)  [unchanged]

dispatchPlan(issue):
  1. Create workspace + RunAttempt (phase="planning", status="running")
  2. Render base prompt + append PLANNING MODE block
  3. Run agent (same runner, same timeout config)
  4. Post agent output as tracker comment (on_plan_ready write)
  5. Update attempt: status="awaiting_approval", planPostedAt=now

dispatchExecute(issue, attempt):
  1. Reuse existing workspace (same path, same branch)
  2. Render full execution prompt (no PLANNING MODE block)
  3. Run agent
  4. Update attempt: phase="executing", status=result.status, finishedAt=now
  5. Apply on_success / on_terminal_failure write (existing logic)
```

## New tracker interface method

```typescript
interface IssueTracker {
  // ... existing methods ...
  fetchIssueById(issueId: string): Promise<Issue | null>;
}
```

Required by the orchestrator's approval gate to re-fetch current labels on each tick without
re-fetching the full candidate list.

## Consequences

**Positive**
- Operators can audit proposed plans before code is written.
- Consistent with existing label-filter and tracker-write patterns.
- Backward compatible: `planning.enabled` defaults to `false`; no state migration needed.
- No runner changes for MVP.
- Timeout prevents orphaned attempts if the human never reviews.

**Negative / risks**
- The agent runs in the workspace during the plan phase. If it ignores the PLANNING MODE
  instruction and writes files anyway, those changes sit on the branch. Mitigation: the plan
  prompt should be clear; operators can inspect the branch before approving.
- `awaiting_approval` is a new terminal-adjacent status. Stale-attempt recovery
  (`recoverStaleAttempts`) must treat it as non-stale (the orchestrator owns its resolution
  via the timeout path).
- Label-based approval requires the human to have label-edit permissions on the tracker issue.

## Implementation issues

This ADR is realized by four scoped issues (see issue comments on #76 for links):

| Issue | Title | Scope |
|-------|-------|-------|
| [#111](https://github.com/conduit-harness/conduit/issues/111) | Add planning phase to state model, config, and lifecycle events | `packages/conduit` types + config parser + `TrackerWriteEvent` |
| [#112](https://github.com/conduit-harness/conduit/issues/112) | Add `fetchIssueById` to `IssueTracker` and implement in all tracker plugins | All `packages/conduit-tracker-*` |
| [#113](https://github.com/conduit-harness/conduit/issues/113) | Implement plan-then-execute dispatch in Orchestrator | `packages/conduit` orchestrator |
| [#114](https://github.com/conduit-harness/conduit/issues/114) | Document plan-then-execute in ubiquitous language and add example workflow | `docs/` + examples |

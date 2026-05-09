# ADR 001: plan-first handshake

Status: Accepted  
Date: 2026-05-09  
Issue: https://github.com/conduit-harness/conduit/issues/76

## Context

Issue #76 introduced the plan-then-execute handshake as a design placeholder for 0.2.0. The
feature intent (from the 0.1.0 launch post): agents should be able to propose a plan for human
review before execution, reducing surprises in autonomous runs.

Six open questions needed answers before implementation:

1. Where does the plan live?
2. What triggers the plan phase?
3. How does a human approve the plan?
4. What happens if a human rejects the plan?
5. Does the Symphony spec define a planning lifecycle event, or do we extend it?
6. Does each runner need a plan-only mode, or can we drive it via prompt construction?

## Decisions

### 1. Plan storage

The agent-generated plan lives in two places:

- **Tracker comment**: posted via the `on_plan` lifecycle event write, making the plan visible in
  the issue thread for human review.
- **`RunAttempt.plan`** (persisted state): a structured object
  `{ content: string; proposedAt: string }` stored alongside the existing attempt fields in
  `runtime.json`. This lets the orchestrator detect "plan phase already completed" across restarts
  and inject the plan text into the execute-phase prompt.

No separate state file is needed. The existing `JsonStateStore` handles the added field
transparently (backward-compatible since the field is optional).

### 2. Trigger mechanism

Two mechanisms, both supported:

- **Per-workflow flag**: `agent.plan_first: true` in WORKFLOW.md front matter (default: `false`).
  Applies to all candidate issues matching the existing label/state filters.
- **Per-issue label**: Issues carrying the `plan-first` label trigger plan mode even when the
  workflow default is `false`. The label name is configurable via `agent.plan_trigger_label`
  (default: `"plan-first"`).
- **Per-issue skip**: Issues carrying a skip label (`agent.plan_skip_label`, default: `"no-plan"`)
  bypass plan mode even when `plan_first: true`.

Label comparisons are case-insensitive, consistent with existing label normalization.

### 3. Approval mechanism

Label-based, using the labels already fetched by `fetchCandidateIssues`:

- **Approve**: operator adds a configurable label to the issue (default: `"plan-approved"`).
- **Reject**: operator adds a configurable label (default: `"plan-rejected"`).

This requires **no new tracker interface method**. The orchestrator checks `issue.labels` inline
in `tick()` for issues that have a pending plan. Those issues stay in active states while
awaiting review and are therefore already returned by `fetchCandidateIssues`.

Label names are configurable via `agent.plan_approval_label` and `agent.plan_rejection_label`.

### 4. Re-plan behavior

- **Approved** (`plan-approved` label detected): plan is marked done; execute attempt dispatched
  on the same or next tick.
- **Rejected** (`plan-rejected` label detected): plan field is cleared from `RunAttempt`; the
  issue re-enters the normal dispatch queue. On the next tick, if the issue still has plan-first
  mode enabled, a new plan phase starts. Operators who want to skip re-planning can add the
  `no-plan` label (or remove `plan-first`) before the next tick.

No hard re-plan counter in v1. The existing `agent.max_attempts` cap applies to the aggregate
attempt count across plan and execute phases.

### 5. Spec alignment

The Symphony spec v1 defines exactly four lifecycle events. This feature adds one
Conduit-specific event (`on_plan`). This is a **Conduit extension**, not an upstream spec change.
It is documented in `docs/UBIQUITOUS_LANGUAGE.md` and as an extension note in
`website/src/content/docs/reference/spec.md`. The Symphony spec §15.1 explicitly leaves trust
and approval posture to implementations.

### 6. Runner support

**Prompt construction only** — no runner interface changes needed. All three runners
(`claude-cli`, `codex-cli`, `aider`) work unchanged.

A new `agent.plan_prompt_template` workflow key provides the planning-phase prompt template.
If absent, a built-in default is used:

```
Review {{issue.identifier}}: {{issue.title}}

Produce a concise step-by-step implementation plan. Do NOT make any code changes,
create files, or run commands. Only describe your intended approach.

End your response with the line: Plan ready for review.
```

Strict Liquid rendering applies; `issue` and `attempt` variables are available.

## Consequences

**Positive:**

- No new tracker API surface. Approval detection uses labels already fetched by the normal
  candidate poll — no extra tracker roundtrip.
- No runner interface changes. All runners work unchanged.
- Backward-compatible. `plan_first: false` is the default; existing workflows are unaffected.
- Plan content persists across orchestrator restarts via `RunAttempt.plan`.
- Per-issue label override keeps the workflow flag as a global gate while allowing per-issue
  opt-out.

**Negative:**

- The issue must remain in an active tracker state during plan review. Operators cannot move it
  to a custom "Plan Review" state without breaking candidate fetching. This is intentional
  simplicity for v1.
- No hard cap on re-plan cycles. Operators must use `no-plan` label to stop looping.

**Neutral:**

- One new `TrackerWriteEvent` value (`on_plan`) deviates from the Symphony spec v1 event count.
  Documented as a Conduit extension.

## Implementation

Two issues replace the placeholder:

- **Issue A** — `plan-first: data model, config schema, and state extensions` (foundation)
- **Issue B** — `plan-first: orchestrator plan phase and approval gate` (depends on A)

See the implementation issues linked from
https://github.com/conduit-harness/conduit/issues/76 for full acceptance criteria.

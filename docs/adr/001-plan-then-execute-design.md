# ADR-001: Plan-then-execute handshake design

Status: accepted  
Date: 2026-05-10  
Issue: #76  

## Context

Issue #76 proposed allowing agents to propose a plan for human review before execution, reducing
surprises in autonomous runs. Before implementation the six open design questions needed to be
resolved. This ADR records those decisions.

## Decisions

### 1. Plan storage: workspace file + tracker comment

The planning-phase agent writes `PLAN.md` to the workspace directory. Conduit reads this file and
posts its contents as a tracker comment. Both surfaces are needed: the file gives the execution
phase direct access without tracker round-trips; the comment gives humans a readable review surface
inside the tracker.

### 2. Trigger: workflow flag + per-issue label

`agent.plan_first: true` in `WORKFLOW.md` activates planning for every issue dispatched by that
workflow. A `plan-first` label on an individual issue also activates planning regardless of the
workflow default. This mirrors the existing pattern of workflow-level defaults with per-issue label
overrides (e.g. `required_labels`).

### 3. Approval mechanism: label-based

The human adds a `plan-approved` or `plan-rejected` label to approve or reject the plan. Conduit
detects the label on the next poll tick — no webhook infrastructure required. This approach works
uniformly across all tracker types (GitHub, Linear, Jira, GitLab, Azure DevOps, Forgejo) and is
auditable in the tracker event log.

Considered alternatives:
- Emoji reactions — requires webhook; not supported by all tracker APIs
- Slash commands in comments — requires webhook; high implementation cost
- State transition — conflicts with existing `active_states` filtering; would hide the issue from Conduit

### 4. Re-plan loop: new attempt with rejection context

A `plan-rejected` label transitions the current attempt to `failed`. A new attempt is then
eligible on the next tick. The new prompt includes the prior plan and any comments added after
rejection so the agent can respond to the feedback. Normal `max_attempts` protection bounds the
loop. The re-plan attempt increments the attempt counter, which keeps existing retry semantics
correct and avoids infinite loops.

### 5. Spec: extend with new lifecycle events

The Symphony spec does not currently define planning lifecycle events. We extend it with two new
`TrackerWriteEvent` values: `on_plan_proposed` (fired after plan is posted, before approval) and
`on_plan_rejected` (fired when a plan is rejected). These are additive and backward-compatible.
Operators who do not use `plan_first` see no change.

### 6. Runner support: prompt construction

No runner (Claude CLI, Codex CLI, Aider) has a native plan-only mode. Conduit drives planning via
prompt engineering:

- **Phase 1 (planning)**: Conduit prepends a planning instruction to the rendered workflow prompt,
  instructing the agent to write `PLAN.md` and stop without making code changes.
- **Phase 2 (execution)**: The approved plan content is injected via a new `{{plan}}` template
  variable. Operators include `{{plan}}` in their workflow prompt where they want the plan
  referenced. A `{{plan_mode}}` boolean variable is also available for conditional prompt phrasing.

No runner API changes are required.

### 7. Phase model: single attempt, two agent runs, shared workspace

One `RunAttempt` covers the full plan-then-execute cycle. The agent is invoked twice within the
same attempt using the same workspace directory:

```
running → awaiting-approval → executing → succeeded | failed
```

Using a single attempt (rather than two separate attempts) keeps the attempt counter semantically
correct (one full plan-execute cycle = one attempt), preserves workspace context across the
planning/execution boundary, and avoids the awkward pattern of attempt 1 "succeeding" with nothing
but a plan file.

## Consequences

- `AttemptStatus` gains `"awaiting-approval"` and `"executing"` (in addition to existing values)
- `TrackerWriteEvent` gains `"on_plan_proposed"` and `"on_plan_rejected"`
- `ServiceConfig.agent` gains `planFirst: boolean` (default: `false`)
- `RunAttempt` gains optional `planContent?: string` (stored after planning phase for use in
  execution prompt)
- `IssueTracker` interface gains optional `addLabel` / `removeLabel` methods (needed to set and
  clear `awaiting-plan-approval` label during the handshake)
- `renderPrompt` gains `{{plan}}` and `{{plan_mode}}` template variables
- Backward compatibility: `plan_first` defaults to `false`; no behavior change for existing
  workflows

## Scoped issues

- `feat(orchestrator): plan-then-execute handshake` — core implementation
- `docs(spec): extend Symphony spec with plan-then-execute lifecycle` — spec + example workflow

# ADR 001: Plan-Then-Execute Handshake Before Agent Dispatch

**Status:** Accepted  
**Issue:** [#76](https://github.com/conduit-harness/conduit/issues/76)  
**Scope:** Conduit-specific extension (not derived from the Symphony spec)

---

## Context

In autonomous agent runs, Conduit dispatches an agent directly against an issue with no human
review of the agent's intended approach. For high-stakes or ambiguous issues, operators want the
agent to first propose a plan, then wait for human approval before doing any implementation work.

This document records the design decisions made when scoping issue #76 into concrete implementable
issues.

---

## Decisions

### 1. Where does the plan live?

**Decision:** Two-tier storage.

- **Machine-readable:** `planText` field added to `RunAttempt` in `runtime.json`. Enables the
  orchestrator to surface the plan in logs and pass it to re-plan attempts.
- **Human-readable:** Tracker comment posted via a new `on_plan` lifecycle event, alongside the
  existing `on_start` / `on_success` / `on_failure` / `on_terminal_failure` events.

Rationale: the tracker comment is the natural human-facing surface (operators already watch
issue comments); the state file gives the orchestrator a durable record without another API call.

### 2. Trigger mechanism

**Decision:** Both per-issue label and global workflow flag.

- Per-issue: the issue must carry the label `plan-first` (configurable via
  `agent.plan_first_label`, default `"plan-first"`).
- Global opt-in: `agent.plan_first: true` in the workflow YAML causes every dispatched issue to
  go through the planning phase regardless of labels.

When both are configured, global wins; per-issue label is a no-op when global is already true.

Rationale: per-issue labels match the existing `required_labels` / `excluded_labels` pattern and
need no changes to the tracker adapter interface. A global flag handles teams that want planning
on every run without labelling every issue.

### 3. Approval mechanism

**Decision:** GitHub label-based approval via `plan-approved` / `plan-rejected` labels
(configurable via `agent.plan_approved_label` and `agent.plan_rejected_label`).

Flow:
1. After the planning attempt completes, Conduit posts the plan as a comment and adds a
   `plan-proposed` label to the issue.
2. A human reviews the comment and adds `plan-approved` or `plan-rejected`.
3. On the next poll tick, the orchestrator reads the issue's current labels and branches:
   - `plan-approved` → remove planning labels, dispatch full execution attempt.
   - `plan-rejected` → remove planning labels, queue a new planning attempt.
   - Neither → no-op; keep waiting.

This requires the tracker adapter to gain optional `addLabels()` and `removeLabels()` methods.
The GitHub tracker implements them; other trackers may leave them unimplemented (planning is
silently skipped without write support, or the issue is held indefinitely — documented behaviour).

Rationale: labels are already the primary per-issue signal surface in Conduit. Adding label reads
for `plan-approved` costs nothing (labels are already fetched with every candidate issue fetch).
Label writes are the minimal new tracker-API surface needed.

Reactions and comment-parsing were rejected:
- Reactions require an additional GitHub API call per comment and are harder to read at a glance.
- Comment-parsing adds fragile string matching and is non-standard across trackers.

### 4. Re-plan loop

**Decision:** New planning attempt per rejection, bounded by `agent.max_plan_attempts` (default: `3`).

- After `max_plan_attempts` rejections: Conduit applies `on_terminal_failure` semantics and stops
  dispatching the issue.
- The previous plan text is injected into the next planning attempt prompt as
  `{{plan.previous}}` (empty string on first plan, populated on re-plans). Workflow authors can
  use this to tell the agent why its prior plan was rejected.
- A `{{plan.rejection_count}}` variable tracks how many rejections have occurred.

### 5. Spec alignment

**Decision:** Conduit-specific extension; no Symphony spec changes required.

The Symphony spec (§18.2) lists "first-class tracker write APIs" as a recommended future
extension. This feature builds on that direction. The new `on_plan` lifecycle event is additive
and does not change the behavior of the four existing lifecycle events.

This decision is a Conduit implementation choice and must not be back-ported into the Symphony
spec without a separate spec-level discussion.

### 6. Runner support

**Decision:** Prompt-driven; no runner code changes required.

A configurable `agent.plan_prompt` field (multi-line string) is appended to the rendered workflow
prompt when in planning mode. The default value instructs the agent to output a structured plan
and explicitly not make any code changes.

The plan is extracted from the runner's `summary` field in `AgentResult` (already populated by
the Claude CLI runner from the `result` field of JSON output). If `summary` is absent, the full
`output` is used as the plan text.

---

## New Terms (to be added to UBIQUITOUS_LANGUAGE.md on implementation)

- **Planning Attempt** — A `RunAttempt` in planning mode: the agent proposes a plan without
  making code changes. Has `status: "planning"` or `"plan_proposed"`.
- **Plan Proposal** — The plan text produced by a planning attempt, stored in `RunAttempt.planText`
  and posted to the tracker as a comment.
- **Plan Resolution** — The human decision (approve or reject) signalled by adding a label to the
  issue.
- **Plan-First** — The dispatch mode in which an issue requires a completed, approved planning
  attempt before full execution begins.

---

## Consequences

- The `RunAttempt` type gains `planText?: string` and new status values
  `"planning" | "plan_proposed"`.
- `PersistedState` gains a `pendingPlans` map for tracking issues awaiting plan resolution.
- `IssueTracker` gains optional `addLabels()` / `removeLabels()` methods.
- The GitHub tracker gains label-write API calls (`POST /issues/{id}/labels`,
  `DELETE /issues/{id}/labels/{name}`).
- The workflow config schema gains `agent.plan_first`, `agent.plan_first_label`,
  `agent.plan_approved_label`, `agent.plan_rejected_label`, `agent.plan_prompt`,
  `agent.max_plan_attempts`.
- Tracker plugins that do not implement `addLabels`/`removeLabels` will hold issues in
  `plan_proposed` state indefinitely — this must be documented.

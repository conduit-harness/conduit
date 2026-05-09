# Plan Handshake Design

Status: Accepted (2026-05-09)
Relates to: [#76](https://github.com/conduit-harness/conduit/issues/76)
Supersedes: #76 placeholder

This document records the design decisions for the plan-then-execute handshake feature scheduled
for 0.2.0. It answers the open questions from issue #76 and provides enough specification for the
implementation issues that replace it.

---

## Problem

When Conduit dispatches an agent autonomously, the operator has no opportunity to review what the
agent is about to do before it starts making changes. For sensitive repositories or high-stakes
issues, teams want a human checkpoint between "Conduit picked up the issue" and "agent is running".

## Chosen Design

### Scope

Version 1 of the plan handshake covers:

- A workflow flag (`agent.plan_first: true`) that opts a workflow into plan-first mode.
- The plan content is the **rendered prompt** posted as a tracker comment — no agent invocation is
  needed for the plan phase itself.
- Approval is via **labels** on the issue (`plan-approved` / `plan-rejected`), matching the
  existing label-based filtering model that Conduit already understands.
- An agent-generated plan (where the agent proposes what it will do before execution) is deferred
  to a follow-on issue.

### Open Questions — Resolved

#### Where does the plan live?

- **Primary**: tracker comment posted on the issue (requires `tracker.writes.enabled: true`).
  The comment body is the rendered prompt, truncated to a reasonable limit, so operators see
  exactly what the agent will be given.
- **Secondary**: `PersistedState.planPending` in `.conduit/state/runtime.json`, keyed by
  `issueId`. Records whether the plan has been posted, and the ID of the tracker comment for
  reference. This prevents re-posting on every tick while approval is pending.
- If `tracker.writes.enabled: false` and `agent.plan_first: true`, `conduit validate` emits an
  error. Both flags must be on together.

#### Trigger

`agent.plan_first: true` in the workflow front matter, under the `agent` block (default `false`).
No label-based trigger in v1 — workflow-level opt-in is sufficient and predictable.

```yaml
agent:
  plan_first: true
  plan_approval_labels:
    approve: plan-approved    # default
    reject: plan-rejected     # default
```

The approval label names are configurable so teams can adapt to their existing label conventions.

#### Approval mechanism

**Label-based**. The operator (or an automated reviewer) adds a `plan-approved` or `plan-rejected`
label to the issue. On the next poll tick, Conduit reads the issue labels (already present on
`Issue.labels` from `fetchCandidateIssues`), acts on whichever label is present, then removes
that label so subsequent attempts go through the plan phase again.

Rationale:
- Labels are already read by `fetchCandidateIssues`; no new tracker read path is needed.
- Works across all tracker kinds that support labels.
- Survives process restarts — the approval decision lives in the tracker, not in memory.
- Can be automated (CI bot adds `plan-approved` after passing a static analysis check).

This requires a new `removeLabel(issueId, label)` method on `IssueTracker`, implemented per
tracker plugin.

#### Re-plan loop

When the operator adds `plan-rejected`:
1. Conduit removes the `plan-rejected` label.
2. Conduit posts a comment acknowledging the rejection.
3. `planPending[issueId]` is cleared — the issue returns to `Unclaimed`.
4. No automatic re-plan. The operator controls when to re-trigger: the issue stays in an
   active state and on the next tick Conduit will post a fresh plan.

When `plan-rejected` is used repeatedly the operator can edit the issue description, change
labels to influence the prompt, or move the issue to a different state to pause it entirely.

#### Spec alignment

The Symphony specification (Draft v1) does not define a planning lifecycle event. This is a
Conduit-specific extension. Per CONTRIBUTING.md, the implementation decision is documented here
and in the UBIQUITOUS_LANGUAGE additions. The Symphony spec's Section 18.2 notes "TODO: Add
first-class tracker write APIs" and "TODO: Persist retry queue and session metadata across
process restarts" — the planPending state is an instance of the second TODO.

The new `on_plan_posted` lifecycle event extends the existing `TrackerWriteEvent` union
(`on_start` | `on_success` | `on_failure` | `on_terminal_failure`). It fires when Conduit
posts the plan comment and maps to an optional `TrackerWriteAction` just like other events.

#### Runner support

No runner changes in v1. The plan is the rendered prompt (the same content the agent would
receive as its task), not an agent-generated plan. The runner interface (`AgentRunner`) is
unchanged.

A follow-on issue (see scoped issues below) will cover agent-generated plans: a separate
`agent.plan_prompt` template that gets rendered and passed to a lightweight agent invocation
whose output becomes the plan comment.

---

## Data Model Changes

### `ServiceConfig.agent` additions

```typescript
planFirst: boolean;                                // default: false
planApprovalLabels: { approve: string; reject: string };  // defaults: "plan-approved", "plan-rejected"
```

### `TrackerWriteEvent` addition

```typescript
type TrackerWriteEvent = "on_start" | "on_success" | "on_failure" | "on_terminal_failure" | "on_plan_posted";
```

### `PersistedState` addition

```typescript
planPending: Record<string, {
  issueId: string;
  identifier: string;
  commentId?: string;   // tracker comment ID, if the post succeeded
  postedAt: string;     // ISO 8601
}>;
```

### `IssueTracker` addition

```typescript
removeLabel(issueId: string, label: string): Promise<void>;
```

---

## Orchestrator Tick Changes

In `Orchestrator.tick()`, after filtering to `dispatchable` issues but before `dispatch()`:

```
for each dispatchable issue (plan_first mode):
  if issueId in planPending → check labels:
    if "plan-approved" label present:
      removeLabel(issueId, "plan-approved")
      delete planPending[issueId]
      dispatch(issue)
    else if "plan-rejected" label present:
      removeLabel(issueId, "plan-rejected")
      delete planPending[issueId]
      safeWrite("on_plan_rejected_ack", issue, "Plan rejected. Issue returned to queue.")
      // issue stays in active state; will re-enter plan phase on next tick
  else:
    render prompt → post as tracker comment via on_plan_posted write
    upsert planPending[issueId]
    // do NOT call dispatch() this tick
```

Issues that are not in `dispatchable` (running, max-attempts reached, etc.) are unaffected.
Issues in `planPending` but no longer in `candidates` have their entry cleaned up during
`tick()` reconciliation.

---

## Validation

`conduit validate` (and dispatch preflight) adds:

- If `agent.plan_first: true` and `tracker.writes.enabled: false`: error
  `plan_first_requires_tracker_writes`
- If `agent.plan_approval_labels.approve` or `.reject` is empty string: error

---

## Scoped Implementation Issues

The following GitHub issues replace this placeholder:

- **[#130]**: Core plan handshake — config parsing, state, orchestrator phases, validation
- **[#131]**: Tracker label removal — `removeLabel` method on `IssueTracker` and per-plugin
  implementations
- **[future]** *(deferred)*: Agent-generated plan proposals via `agent.plan_prompt` template
  (follow-on, not in 0.2.0 scope)

See the issue tracker for the full acceptance criteria.

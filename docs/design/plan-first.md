# Design: plan-then-execute handshake (plan-first)

Answers the open questions in issue #76. This document records the chosen path;
implementation issues are linked at the end.

---

## Problem

Autonomous agent runs can make sweeping changes before a human has a chance to
review the approach. Teams running Conduit in production environments want a
"show me your plan first" mode so they can catch misguided attempts early, before
any code is written.

---

## Open questions → decisions

### 1. Where does the plan live?

**Decision: tracker comment (primary) + `planStatus` field in `RunAttempt` (for
orchestrator state).**

The plan is posted as a comment on the issue. This keeps the review conversation
in the same place as the work. The orchestrator stores the `planCommentId` and
`planStatus` in the `RunAttempt` record so it can poll for approval on each tick
without re-reading all comments. Conduit already writes tracker comments via
lifecycle events, so no new infrastructure is needed for the comment write.

### 2. Trigger — workflow flag, per-issue label, or both?

**Decision: both.**

- `agent.plan_first: true` — global flag in workflow front matter; every
  dispatched issue must go through the plan phase.
- `plan-first` label on an individual issue — per-issue opt-in regardless of the
  global flag. Label name is configurable via `agent.plan.trigger_label`
  (default: `"plan-first"`).

Either condition alone is sufficient to enter the plan phase. The global flag is
the "always require planning" mode for cautious workflows; the label lets teams
opt individual issues in without changing the workflow file.

### 3. Approval mechanism?

**Decision: label-based.**

- Human adds `plan-approved` label → orchestrator proceeds to dispatch.
- Human adds `plan-rejected` label → orchestrator removes that label (if tracker
  writes enabled), re-runs the plan prompt, and posts a revised plan comment.

Label names are configurable:

```yaml
agent:
  plan:
    approval_label: "plan-approved"   # default
    rejection_label: "plan-rejected"  # default
```

Rationale: label reads are already part of the tracker interface (they power
`required_labels` / `excluded_labels` today). No new tracker capability needed.
Emoji reactions and slash-commands were considered but require polling comments —
a new read operation for every tracker plugin. Label transitions require only the
existing `fetchCandidateIssues` path, which already returns labels.

### 4. Re-plan loop — what happens on rejection?

**Decision: same issue, new comment, no attempt counter increment; capped by
`agent.plan.max_revisions`.**

Plan revisions happen in a pre-dispatch phase. The attempt counter (`attempt.number`)
only increments when real code execution starts. Multiple plan rounds on the same
issue are tracked via a separate `planRevisionCount` field in the state entry.

When `plan-rejected` is detected:

1. Conduit removes the `plan-rejected` label (via tracker write if writes are
   enabled) so the label doesn't accumulate.
2. Conduit re-runs the plan prompt with the original issue context.
3. Conduit posts the new plan as a new comment.
4. Conduit resets plan status to `"pending"`.

If `planRevisionCount >= agent.plan.max_revisions` (default `3`), the issue is
released back to unclaimed and a warning is logged. The team can re-queue it by
removing `plan-approved` / `plan-rejected` labels and re-adding `plan-first`, or
by restarting the service.

A configurable `agent.plan.timeout_ms` (default `86400000` = 24 h) releases the
claim if no approval arrives within the window.

### 5. Spec alignment — extend Symphony or Conduit-only?

**Decision: Conduit-specific extension; note it in §18.2 (recommended extensions
TODO list).**

The Symphony spec (§1) explicitly defers trust and approval posture to
implementations: _"This specification does not require a single approval, sandbox,
or operator-confirmation policy."_ The plan-first feature is a concrete operator-
confirmation policy — exactly the kind of extension the spec leaves open.

The spec's forward-compatibility rule (§5.3) already says unknown front-matter
keys are ignored, so existing Symphony implementations won't break. The new
`agent.plan.*` keys are purely additive.

The spec's §18.2 TODO list is the right home for documenting this as a planned
extension. No changes to the Symphony state machine (§7.1) or run-attempt
lifecycle (§7.2) are needed in the spec itself — the plan phase is
pre-dispatch from the spec's perspective, analogous to workspace hooks
(`before_run`).

### 6. Runner support — plan-only mode or prompt construction?

**Decision: prompt construction only.**

A separate `plan_prompt_template` field in the workflow front matter provides the
plan prompt. The runner is invoked as normal (same binary, same timeout
machinery), but with this template substituted and a shorter per-plan timeout
(`agent.plan.turn_timeout_ms`, default `300000` = 5 min). The agent's full
response is treated as the plan text and posted verbatim as the tracker comment.

No runner-specific changes are needed. All three runners (claude-cli, codex-cli,
aider) already support arbitrary prompt input.

If `plan_prompt_template` is absent from the workflow file, Conduit falls back to
a built-in default:

```
You are about to work on the following issue. Before making any changes, output
a concise plan of your intended approach: which files you expect to change, what
the key steps are, and any risks or uncertainties. Do not make any code changes —
output the plan only.
```

---

## Config schema additions

```yaml
agent:
  plan_first: false                   # global flag; default false
  plan:
    trigger_label: "plan-first"       # per-issue opt-in label
    approval_label: "plan-approved"   # label human adds to approve
    rejection_label: "plan-rejected"  # label human adds to request revision
    max_revisions: 3                  # re-plan attempts before giving up
    timeout_ms: 86400000              # 24h; release claim if no response
    turn_timeout_ms: 300000           # 5m; timeout for the plan-only agent run
```

Top-level workflow addition (alongside `promptTemplate`):

```yaml
plan_prompt_template: |
  Before working on {{issue.identifier}}: {{issue.title}}, output your plan.
  Do not make any changes yet.
```

---

## Domain model additions

`RunAttempt` gains three optional fields:

| Field               | Type                                                              |
|---------------------|-------------------------------------------------------------------|
| `planStatus`        | `"pending" \| "approved" \| "rejected" \| "timed_out" \| "skipped"` |
| `planCommentId`     | `string` (tracker comment ID, for reference)                      |
| `planPostedAt`      | ISO 8601 timestamp                                                |

A `planRevisionCount` field tracks re-plan cycles within the orchestrator's
in-memory state (not persisted to `RunAttempt`; it resets on restart).

---

## Orchestrator changes (high level)

New internal state: `planPending: Map<issueId, PlanPendingEntry>` in the
orchestrator runtime, parallel to `running`.

**On tick, plan phase runs before dispatch:**

1. For each issue in `planPending`:
   - Fetch its current labels.
   - `approval_label` present → clear plan-pending, dispatch normally.
   - `rejection_label` present → increment revision count. If under limit:
     remove label, re-run plan, post new comment. If at limit: release claim.
   - Timeout elapsed → release claim.
2. For newly selected candidates that are `plan_first` issues and not yet in
   `planPending`: run plan prompt, post comment, add to `planPending`.
3. Normal dispatch proceeds for all non-plan-pending issues.

**`should_dispatch` guard:** issues in `planPending` are skipped.

---

## Lifecycle event additions

Two new tracker write events:

| Event            | Default action                        |
|------------------|---------------------------------------|
| `on_plan_posted` | `comment: true` (the plan text)       |
| `on_plan_approved` | configurable (e.g. `transition_to`) |

`on_plan_rejected` is not a separate event — rejection triggers a re-plan, which
fires `on_plan_posted` again.

---

## Implementation issues

- **Issue A — config, domain model, glossary, spec note**: config schema, domain
  type changes, UBIQUITOUS_LANGUAGE additions, §18.2 spec update.
- **Issue B — orchestrator planning gate**: `planPending` state, plan phase tick
  logic, plan prompt rendering, runner invocation, label polling, lifecycle event
  wiring.

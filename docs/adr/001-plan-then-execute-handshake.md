# ADR 001: Plan-then-execute handshake before agent dispatch

## Status

Accepted — 2026-05-09

## Context

Conduit dispatches agents directly to execute work items without a human review point. In
autonomous runs this can produce surprising changes. Issue #76 proposed a planning phase where
agents propose a plan before executing, so operators can review and approve before any code
changes land.

Six design questions were left open in the placeholder:

1. Where does the plan live?
2. What triggers plan-first mode?
3. How does an operator approve or reject?
4. What happens on rejection — re-plan loop?
5. Does the Symphony spec already define a planning lifecycle?
6. Do runners need a plan-only mode?

This ADR answers each question with a concrete decision and the rationale behind it.

## Decisions

### Q1 — Where does the plan live?

**Decision:** Both in persisted state (`RunAttempt.plan`) and as a tracker comment.

- `RunAttempt` gains two optional fields:
  ```typescript
  phase?: "planning" | "execution"; // absent = "execution" (backwards-compatible)
  plan?:  string;                    // populated only on planning attempts
  ```
- A new tracker write event `"on_plan_generated"` posts the plan as a comment and optionally
  transitions the issue to a holding state (e.g. `"Planning"`).

Keeping the plan in state means it survives orchestrator restarts and is available for prompt
injection in the subsequent execution attempt. The tracker comment makes it visible to operators
without requiring them to inspect internal state files.

### Q2 — Trigger

**Decision:** Both a global workflow flag and a per-issue opt-in label, with a per-issue
skip label that overrides both.

```yaml
agent:
  planning:
    enabled: false          # boolean; default false — enables plan-first for all issues
    label: "plan-first"     # string; per-issue opt-in
    skip_label: "plan-skip" # string; per-issue opt-out, overrides flag and label
    prompt_template: ""     # string; path or inline text for the planning prompt (optional)
```

An issue is **planning-eligible** when:

```
(config.agent.planning.enabled || issue.labels.includes(config.agent.planning.label))
  && !issue.labels.includes(config.agent.planning.skip_label)
```

Rationale: `enabled: true` suits teams that want plan-first for everything; the per-issue
`plan-first` label suits teams that want selective opt-in without touching global config; the
`plan-skip` label lets individual issues escape the global flag without a config change.

### Q3 — Approval mechanism

**Decision:** Tracker state transition. No label manipulation or emoji reaction.

After posting the plan comment, `on_plan_generated` transitions the issue to a configured
holding state (e.g. `"Planning"`). An operator **approves** by transitioning the issue back to
any state listed in `tracker.states.active`. No new tracker method is needed — this uses the
existing `IssueTracker.transition()` and `fetchIssueStatesByIds()` calls that the reconciler
already makes.

State transitions are universal across all tracker plugins (GitHub, Linear, GitLab, Jira,
Forgejo, Azure DevOps). Approval-by-label would require a new `removeLabel` method in every
tracker plugin and coordinated label hygiene; approval-by-emoji reaction is GitHub-only.

**Approved plan detection** on each tick:

```
latestPlanAttempt = most recent RunAttempt for the issue with phase === "planning"

approvedPlan =
  latestPlanAttempt exists
  && latestPlanAttempt.status === "succeeded"
  && currentIssueState ∈ config.tracker.states.active
```

If `approvedPlan` is true, route to `dispatch()` with `latestPlanAttempt.plan` injected as
`{{plan}}` in the execution prompt. If `approvedPlan` is false (no plan yet, or issue is in
holding state), route to `dispatchPlan()`.

### Q4 — Re-plan loop

**Decision:** No separate rejection state or counter. Reuse existing state machine.

Planning attempts are recorded with `status: "succeeded"` if the agent ran and produced output,
regardless of whether the operator later approves or rejects the plan. Approval is determined
solely by tracker state (see Q3).

To **request a new plan**, an operator:
1. Posts a rejection comment on the issue.
2. Transitions the issue back to an active state (same transition used for approval).
3. Conduit sees the issue as planning-eligible with an existing plan — it runs a new
   `dispatchPlan()` with two additional prompt variables:

   | Variable | Source |
   |---|---|
   | `{{plan.previous_plan}}` | `latestPlanAttempt.plan` |
   | `{{plan.rejection_feedback}}` | Body of the most recent human comment posted after the plan comment |

This reuses the existing attempt counter (`attempt.number`) and retry backoff infrastructure.
No new rejection state, counter, or tracker method is needed.

### Q5 — Spec alignment

**Decision:** Treat as a Conduit-specific extension; document here, not in the upstream spec.

The Symphony spec (draft v1) does not define a planning lifecycle or a `"on_plan_generated"`
event. Extending the spec for a feature that is opt-in and tracker-specific would be premature.
If a future revision of the Symphony spec covers planning phases, this ADR should be revisited
and Conduit's implementation reconciled with the spec text. Until then, `"on_plan_generated"`
is a Conduit extension to the `TrackerWriteEvent` union.

### Q6 — Runner support

**Decision:** No runner changes. Drive planning via prompt construction.

All runners expose a single `run(attempt: RunAttempt, prompt: string): Promise<AgentResult>`
interface. The orchestrator calls `runner.run()` with a planning-specific prompt; the runner
is unaware of the planning concept.

The planning prompt is either:
- The content of `config.agent.planning.prompt_template` (if set), or
- A built-in prefix prepended to the standard prompt, asking the agent to output a structured
  plan without making code changes.

The plan text is extracted from `AgentResult.summary` (fallback: first 2 000 characters of
`AgentResult.output`).

## Implementation order

Scoped issues in dependency order:

| # | Issue | What it adds |
|---|---|---|
| 1 | [#144] | Planning vocabulary in `docs/UBIQUITOUS_LANGUAGE.md` |
| 2 | [#145] | `agent.planning.*` config schema in `packages/conduit/src/config/workflow.ts` |
| 3 | [#146] | `RunAttempt.phase` and `RunAttempt.plan` in `packages/conduit/src/domain/types.ts` |
| 4 | [#148] | `{{plan}}`, `{{plan.previous_plan}}`, `{{plan.rejection_feedback}}` in prompt renderer |
| 5 | [#147] | `dispatchPlan()` and planning-eligible detection in `orchestrator.ts` |

Issues #111–#143 are earlier drafts from prior design iterations. They are superseded by
issues #144–#148 and can be closed once this PR merges.

[#144]: https://github.com/conduit-harness/conduit/issues/144
[#145]: https://github.com/conduit-harness/conduit/issues/145
[#146]: https://github.com/conduit-harness/conduit/issues/146
[#147]: https://github.com/conduit-harness/conduit/issues/147
[#148]: https://github.com/conduit-harness/conduit/issues/148

## Consequences

- Planning-eligible issues require two dispatch cycles (plan → execute) instead of one.
- The holding state (e.g. `"Planning"`) must exist in the tracker and be listed in
  `tracker.states` — otherwise `transition()` will fail silently (consistent with the existing
  write-failure policy).
- Unreviewed plans block execution indefinitely; the orchestrator skips the issue each tick
  until the operator acts. This is intentional — plan-first is a human-in-the-loop gate.
- Issues without the `plan-first` label (and without `agent.planning.enabled: true`) are
  completely unaffected — no performance or behaviour change.

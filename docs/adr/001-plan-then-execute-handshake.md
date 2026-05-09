# ADR 001: Plan-then-execute handshake before agent dispatch

**Status:** Accepted  
**Issue:** [#76](https://github.com/conduit-harness/conduit/issues/76)  
**Date:** 2026-05-09

---

## Context

In autonomous runs an agent can surprise operators by immediately writing code or opening PRs for work that turns out to be misunderstood. Adding a lightweight planning phase — where the agent posts a proposed approach and waits for human acknowledgement before executing — would reduce wasted attempts and build trust in fully-autonomous setups.

This ADR resolves the six open questions from issue #76 and defines the concrete design path for implementation.

---

## Decisions

### Q1 — Where does the plan live?

**Decision: tracker comment + `RunAttempt.plan` field in state JSON.**

The tracker comment is the human-facing artefact: formatted Markdown, clearly labelled, actionable. The `plan` field on `RunAttempt` is the machine-readable copy used to inject the plan into the execution prompt of the subsequent attempt. Both are written atomically during the planning attempt. If the tracker comment fails (best-effort write), the plan is still persisted in state and can be re-posted.

### Q2 — Trigger: flag, label, or both?

**Decision: both — workflow flag (`agent.planning.enabled: true`) applies to every issue; a per-issue label (default `plan-first`) overrides in either direction (opt-in per issue if the flag is off, opt-out per issue if the flag is on via `plan-skip`).**

The orchestrator checks:

```
isPlanningEligible = (config.agent.planning.enabled || issue.labels.includes(planningLabel))
                     && !issue.labels.includes(planSkipLabel)
```

This mirrors the existing `required_labels`/`excluded_labels` pattern and avoids two completely separate code paths.

### Q3 — Approval mechanism: reaction, label, slash-command, or webhook?

**Decision: state-based — planning ends by transitioning the issue to a workflow-configured `Planning` state (not in `active_states`), and approval is a manual transition back to an active state.**

Rationale:

- Works across all tracker implementations — every tracker already implements `transition()`.
- No new webhooks, comment parsing, or bot permissions required.
- The `Planning` state is configured by the operator (e.g. `tracker.writes.actions.on_plan_generated.transition_to: Planning`). It is explicitly excluded from `active_states`, so the issue is naturally held.
- To approve: operator transitions the issue back to `Todo` (or any `active_state`). Next tick dispatches for execution.
- To reject: operator transitions back to `Todo` and leaves a rejection comment. The planning agent reads the most recent comment as rejection feedback on the next attempt.

Emoji reactions and slash-commands are **not** used because they require bot-level comment scanning or webhooks that not all tracker plugins implement.

### Q4 — Re-plan loop: new thread, new counter?

**Decision: the attempt counter increments on re-plan (treated as a fresh attempt); rejection feedback is surfaced via a new `{{plan.rejection_feedback}}` prompt variable.**

Concretely:

1. Operator rejects by transitioning the issue back to an active state (optionally leaving a comment).
2. Next tick: the issue is a candidate again; orchestrator detects prior planning attempts and that no approved plan exists.
3. `dispatchPlan()` is called again with `attempt = N+1`.
4. The planning prompt receives `{{plan.previous_plan}}` (the last plan text) and `{{plan.rejection_feedback}}` (the last human comment after the plan comment, if any).
5. `max_attempts` governs the ceiling — same as execution retries, no separate counter.

This keeps the state machine simple: the orchestrator does not need to distinguish "rejected" from "never planned" — it simply checks whether the latest completed attempt for the issue is a planning attempt with an approved plan.

### Q5 — Spec alignment: extend or reuse?

**Decision: reuse existing Symphony constructs; add `on_plan_generated` as a Conduit-specific lifecycle event extension.**

The Symphony spec already defines:

- **Handoff states** (spec §1): "A successful run may end at a workflow-defined handoff state (for example `Human Review`)." The `Planning` state is exactly this.
- **`before_run` / `after_run` hooks** (spec §5.3.4): the planning phase runs inside the existing workspace lifecycle.
- **`on_start` / `on_success` lifecycle events**: reused as-is for the planning attempt.

The one extension: a new `on_plan_generated` lifecycle event fires after the plan is posted. This is a Conduit-specific addition — it is not in the Symphony spec and is documented here as an implementation choice. It maps to the same `TrackerWriteAction` shape (comment + optional `transition_to`).

### Q6 — Runner support: plan-only mode or prompt construction?

**Decision: prompt construction only — no runner-level changes.**

Every runner already accepts an arbitrary `prompt: string`. The planning phase sends a different prompt template (the planning template from the workflow file) to the same runner. Runners do not need to know they are in planning mode.

A separate planning prompt template path is configured under `agent.planning.prompt_template`. If omitted, a default planning prompt is prepended to the standard execution prompt.

---

## Architecture sketch

```
tick()
  ├─ fetchCandidateIssues()
  ├─ for each candidate:
  │   ├─ isPlanningEligible?
  │   │   ├─ hasApprovedPlan?  → dispatchExecution(issue, plan)
  │   │   └─ no approved plan  → dispatchPlan(issue)
  │   └─ else                  → dispatchExecution(issue)
  │
dispatchPlan(issue):
  1. prepare workspace (same as today)
  2. render planning prompt ({{issue.*}}, {{workspace.*}}, {{plan.previous_plan}}, {{plan.rejection_feedback}})
  3. run agent → extract plan text from output
  4. persist RunAttempt { phase: "planning", plan: <text> }
  5. applyWrite("on_plan_generated", ...) → comment + transition_to: Planning
  6. remove plan-first label (optional, tracker-specific)

dispatchExecution(issue, plan?):
  1. same as today, but renderPrompt receives plan? → {{plan}} variable
```

**Detection of "approved plan":** the orchestrator checks `state.attempts` for the issue. If the latest attempt has `phase: "planning"` and the issue's current tracker state is in `active_states`, the plan is considered approved. The plan text is loaded from that attempt and passed to `dispatchExecution`.

---

## Consequences

**Good:**
- No runner changes — planning works with all existing runners immediately.
- State-based approval works with all existing tracker plugins.
- Reuses Symphony handoff-state and lifecycle-event patterns.
- Opt-in: no behavior change for existing workflows that don't set `agent.planning.enabled`.

**Trade-offs:**
- Requires operators to configure a `Planning` tracker state in their project. For GitHub Issues (which only has open/closed), this means approval happens via label removal rather than state transition — the GitHub tracker plugin may need a thin label-based override for the planning transition.
- Rejection feedback depends on the operator leaving a comment — there is no structured rejection payload. The planning prompt reads the last comment, which may be unrelated.
- `max_attempts` is shared between planning and execution retries — an operator who sets `max_attempts: 3` gets at most 3 total attempts across both phases, not 3 planning + 3 execution.

---

## Implementation scope (scoped issues)

This ADR is implemented in five focused issues:

| # | Scope | Title |
|---|-------|-------|
| TBD | `docs` | Add planning lifecycle vocabulary to UBIQUITOUS_LANGUAGE |
| TBD | `config` | Planning phase config schema (`agent.planning.*`) |
| TBD | `state` | Add `phase` and `plan` fields to `RunAttempt` |
| TBD | `orchestrator` | `dispatchPlan()` and planning-eligible detection |
| TBD | `prompt` | `{{plan}}`, `{{plan.previous_plan}}`, `{{plan.rejection_feedback}}` variables |

Each issue carries concrete acceptance criteria derived from this ADR.

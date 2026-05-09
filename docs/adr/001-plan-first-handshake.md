# ADR 001: Plan-First Handshake

**Status:** Accepted  
**Closes:** #76

## Context

Issue #76 identified the need for agents to propose a plan for human review before
executing work. Six design questions were left open. This ADR records the chosen path.

## Decisions

### 1. Where does the plan live?

**Decision:** Both. The plan text is posted as a tracker comment (human-visible) and
stored in `PersistedState.pendingPlans` (machine-readable, keyed by `issueId`).

**Rationale:** The comment is the primary surface for human review. The state entry
lets the orchestrator correlate approval labels back to the plan text across process
restarts without re-fetching comments.

### 2. Trigger

**Decision:** Workflow YAML flag `agent.plan_first: true` (default: `false`).

**Rationale:** A global flag is simpler to reason about than per-label overrides.
Operators who want to scope plan-first to a subset of issues can already do this
with `tracker.required_labels`; a second trigger mechanism would add complexity
without proportionate benefit.

### 3. Approval mechanism

**Decision:** Label-based. The human adds a configurable label (default:
`plan-approved`) to the issue. Conduit detects the label on the next poll tick via
`issue.labels` — no new tracker API methods required.

**Rationale:** Labels are already normalized and readable from `fetchCandidateIssues()`.
Emoji reactions require polling per-comment reactions (a new API surface). Slash
commands in comments require parsing comment bodies (fragile). A state transition
alone is insufficient because not all trackers distinguish arbitrary intermediate
states.

Configurable via `agent.plan_approval_label` (default: `plan-approved`).

### 4. Re-plan loop

**Decision:** Label-based rejection. The human adds a configurable label (default:
`plan-rejected`) to the issue. Conduit detects the label, deletes the `PlanEntry`
from `PersistedState.pendingPlans`, and triggers a new planning dispatch on the
next tick.

**Rationale:** Keeps the approval/rejection surface symmetric. Clearing the entry
on rejection allows the re-plan attempt to post a fresh comment thread rather than
editing the original.

Configurable via `agent.plan_rejection_label` (default: `plan-rejected`).

### 5. Spec alignment

**Decision:** Conduit-specific extension. The Symphony spec does not define a
planning lifecycle event. The feature is documented as a Conduit extension in
`website/src/content/docs/reference/spec.md` and `docs/UBIQUITOUS_LANGUAGE.md`.

**Rationale:** Symphony's scope is intentionally narrow (scheduler + runner +
tracker reader). Planning-approval workflows are above that layer.

### 6. Runner support

**Decision:** Prompt construction. The workflow file accepts an optional second
Markdown section (after a `---plan---` delimiter) as the planning prompt template.
The existing `AgentRunner.run(attempt, prompt)` interface is reused unchanged.
A built-in default planning prompt is used when no template section is present.

**Rationale:** Every existing runner already handles prompt-driven execution.
Adding a `plan()` method to `AgentRunner` would require updating all three runners
and the interface without improving the outcome — the plan is still just LLM text
output routed to a comment.

## Resulting state machine

```
Issue enters tick (plan_first = true)
  │
  ├─ No PlanEntry in pendingPlans
  │    └─ dispatchPlanning() → post comment → store PlanEntry{status:"proposed"}
  │
  ├─ PlanEntry{status:"proposed"}
  │    ├─ rejection label present → delete PlanEntry → dispatchPlanning()
  │    ├─ approval label present  → update PlanEntry{status:"approved"} → dispatch execution
  │    └─ neither label           → skip this tick (waiting for human)
  │
  └─ PlanEntry{status:"approved"}
       └─ dispatch execution (plan text injected via {{plan}})
```

After a successful execution attempt the issue moves to `completedIssueIds` via
the existing `JsonStateStore.upsertAttempt()` logic; the `PlanEntry` is removed.
If the execution attempt fails the `PlanEntry` stays, allowing retry with the same
plan or rejection + replan.

## New workflow config fields

```yaml
agent:
  plan_first: true                       # default: false
  plan_approval_label: plan-approved     # default: plan-approved
  plan_rejection_label: plan-rejected    # default: plan-rejected
```

## New lifecycle event

`on_plan_proposed` added to `TrackerWriteEvent`. Maps to the same
`TrackerWriteAction` shape (`comment`, `transition_to`) so operators can configure
a state transition alongside the comment.

## Implementation issues

- **Issue A** — Core: state machine, domain types, config  
  New `PlanEntry` type, `pendingPlans` in `PersistedState`, `plan_first` config
  fields, orchestrator state machine, `on_plan_proposed` event.

- **Issue B** — Core: planning prompt template and `{{plan}}` injection  
  `---plan---` delimiter in workflow file, `renderPlanningPrompt()`,
  `{{plan}}` variable in execution prompt.

- **Issue C** — Docs: spec extension and ubiquitous language  
  New terms in `docs/UBIQUITOUS_LANGUAGE.md`, Conduit-extension section in
  `website/src/content/docs/reference/spec.md`.

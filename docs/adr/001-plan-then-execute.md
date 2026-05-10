# ADR 001: Plan-then-execute handshake before agent dispatch

**Status:** Accepted  
**Date:** 2026-05-10  
**Resolves:** [#76](https://github.com/conduit-harness/conduit/issues/76)

## Context

In autonomous agent dispatch, humans may want to review and approve an agent's
intended approach before allowing it to execute changes. This reduces surprises
and wasted compute in long-running or high-stakes runs.

Issue #76 was a draft placeholder listing six open design questions. This ADR
answers each question, records the chosen design path, and defines the
acceptance criteria for the two implementation issues that replace #76.

## Open questions resolved

### Q1: Where does the plan live?

**Decision:** Tracker comment (primary), with a plan record in local state for
correlation.

The plan is posted as a tracker comment via the existing `tracker.writes`
mechanism. The orchestrator records a plan record in `.conduit/state/runtime.json`
to track which issues have a pending plan and their approval status.

If `tracker.writes.enabled` is false, the plan is only emitted to logs
(degraded but functional — the feature is still opt-in to tracker writes).

### Q2: Trigger — opt-in workflow flag, per-issue label, or both?

**Decision:** Workflow-level flag as primary; per-issue label as secondary opt-in.

- `agent.plan_first: true` — all dispatched issues go through planning.
- `agent.plan_labels: ["plan-first"]` — issues with any of these labels go
  through planning regardless of `plan_first`.

Either condition triggers the planning phase. This mirrors existing patterns:
`agent.max_attempts` is workflow-level; label-based filtering already drives
`tracker.required_labels` / `tracker.excluded_labels`.

### Q3: Approval mechanism

**Decision:** Label-based. Human adds a configurable label to the issue to
approve or reject.

- `agent.plan_approval_label: "conduit:approved"` (default)
- `agent.plan_rejection_label: "conduit:rejected"` (default)

Label-based approval is tracker-agnostic (GitHub, Linear, Jira, GitLab, Azure
DevOps). The orchestrator inspects labels on each tick — no new tracker API
methods are required because `Issue.labels` is already populated by
`fetchCandidateIssues()`.

GitHub emoji-reaction approval can be added later as a `conduit-tracker-github`
enhancement.

### Q4: Re-plan loop — what happens on rejection?

**Decision:** On rejection, Conduit posts a rejection comment, clears the plan
record from state, and the issue re-enters the normal candidate pool on the next
tick. A new plan is generated on the next dispatch.

Plan attempts do **not** count against `agent.max_attempts` (only execute
attempts count). The rejection comment is posted to the issue so the agent can
see human feedback on its next planning pass.

### Q5: Spec alignment

**Decision:** Document as a Conduit extension. The Symphony specification does
not define a planning lifecycle event.

The plan-then-execute handshake is entirely Conduit-specific. The Symphony run
attempt lifecycle (PreparingWorkspace → … → Succeeded/Failed) applies to the
execute phase only; the plan phase is a new pre-dispatch phase outside that
lifecycle. This ADR is the extension documentation.

### Q6: Runner support — plan-only mode or prompt construction?

**Decision:** Prompt construction. No changes to the `AgentRunner` interface.

Two separate `agent.run()` calls:

1. **Plan run:** uses `agent.plan_prompt_template` (configurable path, falls
   back to a built-in default). The agent outputs a plan and stops. Conduit
   posts the output as a tracker comment.
2. **Execute run:** uses the main `promptTemplate` with an `{{ approved_plan }}`
   variable injected containing the text of the approved plan.

The agent is not aware it is in "plan mode" except through the prompt text. All
existing runners work without modification.

---

## Chosen design

### New workflow YAML fields

```yaml
agent:
  plan_first: true                          # enable for all issues (default: false)
  plan_labels: ["plan-first"]               # per-issue opt-in labels (default: [])
  plan_approval_label: "conduit:approved"   # label that signals approval (default)
  plan_rejection_label: "conduit:rejected"  # label that signals rejection (default)
  plan_prompt_template: "./PLAN_PROMPT.md"  # optional; built-in default if absent
```

### New `ServiceConfig.agent` fields

```typescript
agent: {
  // ...existing fields unchanged...
  planFirst: boolean;                // default false
  planLabels: string[];              // default []
  planApprovalLabel: string;         // default "conduit:approved"
  planRejectionLabel: string;        // default "conduit:rejected"
  planPromptTemplatePath: string | null; // null → use built-in default
};
```

### New state shape (`PersistedState`)

Added field is optional with a default of `{}` so existing state files
continue to load without migration:

```typescript
export type PlanRecord = {
  issueId: string;
  issueIdentifier: string;
  planPostedAt: string;
  status: "pending" | "approved" | "rejected";
};

// PersistedState (version stays 1; new field is backwards-compatible):
planRecords: Record<string, PlanRecord>; // keyed by issueId, default {}
```

### New tracker write events

```typescript
export type TrackerWriteEvent =
  | "on_start"
  | "on_success"
  | "on_failure"
  | "on_terminal_failure"
  | "on_plan_proposed"   // fires after plan comment is posted
  | "on_plan_approved"   // fires when approval label is detected
  | "on_plan_rejected";  // fires when rejection label is detected
```

`on_plan_proposed` with `comment: true` is what actually posts the plan body
to the tracker. `transitionTo` on `on_plan_proposed` can optionally move the
issue to a review state (e.g. `"Plan Review"`).

### Orchestrator tick changes

```
tick():
  1. Fetch candidates (existing).
  2. For each issue with a pending plan record (status "pending"):
     a. Re-inspect its labels (from the candidate fetch — issue is still active).
     b. Approval label found → mark approved, add to execute dispatch queue.
     c. Rejection label found → post rejection comment (on_plan_rejected),
        clear plan record, issue treated as new candidate this tick.
     d. No signal yet → skip (neither dispatch nor block other issues).
  3. For remaining candidates with no pending plan:
     a. plan_first trigger applies → dispatch plan run → post plan via
        on_plan_proposed → store PlanRecord{status:"pending"}.
     b. No trigger → dispatch normally (existing behavior, unchanged).
```

### Built-in plan prompt default

When `plan_prompt_template` is absent, the orchestrator injects:

```
You are about to work on the following issue. Before writing any code, output
a concise implementation plan: a short summary, a bullet list of the steps
you intend to take, and any risks or open questions.

Do NOT write or modify any code in this response. Your plan will be reviewed
by a human before execution proceeds. If approved, you will be dispatched
again with the same issue context plus your approved plan.

Issue: {{ issue.identifier }} — {{ issue.title }}

{{ issue.description }}
```

---

## Consequences

### Positive

- Reduces autonomous agent surprises for teams that want human oversight.
- Label-based approval is tracker-agnostic; no new tracker API methods required.
- Two-dispatch model fits the existing `AgentRunner` interface; no breaking
  changes to runner plugins.
- Plan attempts don't consume `max_attempts` budget; approval-pending issues
  don't block retry budgets for other issues.
- Backwards-compatible state format: existing deployments unaffected.

### Negative

- Adds a new "pending plan" limbo state that sits outside the normal
  active_states / terminal_states machine; operators need to understand this.
- `tracker.writes.enabled: true` is required for plan comments to be visible
  in the tracker (opt-in by design).
- Without tracker writes the feature is invisible to humans except via logs;
  documentation must make this clear.
- Issues in the planning phase are still fetched as candidates each tick;
  the label-check path must be fast and not spam the tracker API.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Separate plan state in tracker | Requires creating a new tracker state (operational burden); label approach is zero-config |
| Emoji reaction approval | GitHub-only; deferred as tracker-github enhancement |
| Plan stored in local file only | Hidden from humans without knowing where to look |
| `planRun()` on AgentRunner | Adds complexity to every runner plugin; prompt construction achieves the same result |
| Plan attempts count toward max_attempts | Would exhaust retry budgets for issues under heavy review; wrong semantic |

## Implementation issues

Two scoped issues implement this design end-to-end:

- **Issue A** — config schema, state types, plan prompt dispatch, tracker
  comment posting (`on_plan_proposed`).
- **Issue B** — approval/rejection label polling, execute dispatch with
  `{{ approved_plan }}` variable, `on_plan_approved` / `on_plan_rejected`
  tracker events.

These issues are linked from #76.

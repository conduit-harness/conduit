# ADR 001: Plan-then-execute handshake before agent dispatch

Status: accepted  
Issue: [#76](https://github.com/conduit-harness/conduit/issues/76)

## Context

Autonomous agent runs can produce surprising or large-scope changes. Operators want
the option to review what an agent intends to do _before_ it does it — especially on
high-priority issues, large refactors, or in environments where reverting is costly.

This ADR resolves the six open questions from issue #76 and specifies the chosen
design path so the follow-up implementation issues have concrete acceptance criteria.

## Decisions

### 1. Where does the plan live?

**Decision**: tracker comment (human approval surface) + persisted state entry (machine
state).

Posting the plan as a tracker comment is the natural review surface because operators
already watch issue comments. The persisted state records whether a plan has been
posted and whether it has been approved, so the orchestrator can gate execution across
ticks without re-parsing comment threads.

**New state shape** (extends `PersistedState`):

```ts
type PlanStatus = "pending_approval" | "approved" | "rejected";

type PlanProposal = {
  issueId: string;
  issueIdentifier: string;
  planText: string;
  postedAt: string;
  attemptNo: number;   // 1-based, increments on re-plan
  status: PlanStatus;
};

// added to PersistedState:
planProposals: Record<string, PlanProposal>;  // keyed by issueId
```

### 2. Trigger mechanism

**Decision**: workflow flag (`agent.plan_first`) OR per-issue label (`plan-first`).

```yaml
agent:
  plan_first: false          # enable globally for all dispatched issues
```

A per-issue `plan-first` label also triggers the gate regardless of the global flag.
Either condition is sufficient — no AND logic needed.

This mirrors how `required_labels`/`excluded_labels` already work in the tracker
config: coarse global policy + fine-grained per-issue override.

### 3. Approval mechanism

**Decision**: tracker state transition.

After posting a plan comment the orchestrator transitions the issue to a configurable
`plan_review_state` (e.g., `"Plan Review"`). On each subsequent tick the orchestrator
re-fetches the issue state. When it sees the state move to a configurable
`plan_approved_state` (e.g., `"Plan Approved"`) it marks the plan approved and proceeds
with execution on the next tick.

Why state transitions, not emoji reactions or comment parsing:
- State transitions are already a first-class operation in `IssueTracker` (`transition`).
- Every supported tracker (Linear, GitHub, Jira, GitLab) has state/label transitions.
- No special comment-body polling or tracker-specific reaction APIs required.
- Operators who already know how to move issue states have zero new tools to learn.

**New workflow config fields** (under `agent`):

```yaml
agent:
  plan_first: false
  plan_review_state: "Plan Review"      # state transitioned to after plan is posted
  plan_approved_state: "Plan Approved"  # state that unblocks execution
  plan_rejected_state: "Plan Rejected"  # state that triggers re-plan
  max_plan_attempts: 3                  # cap on plan iterations before giving up
  plan_prompt_template: |               # optional; falls back to a built-in default
    Review the issue and produce a brief implementation plan.
    Do not write any code — only outline the steps you would take.
```

### 4. Re-plan loop

**Decision**: tracker state → `plan_rejected_state` triggers a new plan attempt.

When the orchestrator detects a `plan_rejected_state` transition it increments
`PlanProposal.attemptNo`, runs the planning agent again, posts a new comment, and
transitions back to `plan_review_state`. This repeats up to `max_plan_attempts`.

If `max_plan_attempts` is reached without approval the orchestrator fires the
`on_plan_rejected` lifecycle event (tracker write) and releases the claim — no
execution is attempted. The issue returns to an active state where a human can restart
the cycle manually.

### 5. Spec alignment

**Decision**: Conduit extension only — no Symphony spec change required now.

The Symphony spec (§7.2) defines run-attempt lifecycle phases but explicitly marks the
spec as extensible. Planning is a policy choice (spec §15.1: "implementations define
their own trust boundary"). This feature will be documented as a Conduit-specific
extension with a note in `CONTRIBUTING.md` that it deviates from the Symphony spec's
default "dispatch immediately" behavior.

A spec PR to add a `plan_first` lifecycle to Symphony can follow once the Conduit
implementation is stable.

### 6. Runner support

**Decision**: prompt construction only — no runner changes needed.

The `plan_prompt_template` is rendered into a short prompt that asks the agent to
produce a plan (not write code). This prompt is passed to the existing `AgentRunner.run()`
interface unchanged. All three runners (claude-cli, codex-cli, aider) work without
modification.

The agent's plan text is extracted from `AgentResult.summary ?? AgentResult.output` and
posted as the tracker comment.

## New lifecycle events

```ts
// extends TrackerWriteEvent
"on_plan_ready"     // plan posted, awaiting approval
"on_plan_rejected"  // plan rejected and max_plan_attempts exhausted
```

Each maps to an optional `TrackerWriteAction` (comment + optional `transition_to`) in
the workflow's `tracker.writes` block, consistent with the existing four events.

## Orchestrator changes (summary)

`tick()` gains a pre-dispatch phase:

1. Load plan proposals from persisted state.
2. For each candidate issue that is `plan-first`-eligible:
   - If no proposal exists yet → call `planAndPost(issue)` instead of `dispatch(issue)`.
   - If proposal status is `pending_approval` → skip (already waiting).
   - If proposal status is `approved` → fall through to normal `dispatch(issue)`.
   - If proposal status is `rejected` and `attemptNo < max_plan_attempts` → re-plan.
   - If proposal status is `rejected` and `attemptNo >= max_plan_attempts` → write
     `on_plan_rejected`, release.

`planAndPost(issue)`:
1. Render `plan_prompt_template`.
2. Run agent (short turn, plan-only prompt).
3. Extract plan text from result.
4. Post tracker comment (`on_plan_ready` write action).
5. Transition issue to `plan_review_state`.
6. Persist `PlanProposal` with `status: "pending_approval"`.

On each tick for issues in `plan_review_state`:
- Re-fetch issue state.
- If `plan_approved_state` → update proposal to `approved`, release for dispatch.
- If `plan_rejected_state` → update proposal to `rejected`, schedule re-plan.

## Follow-up issues created

- **#116** `[plan-first] Foundation: types, config schema, lifecycle events, persisted state`
- **#117** `[plan-first] Orchestrator plan gate, plan prompt rendering, and tracker integration`

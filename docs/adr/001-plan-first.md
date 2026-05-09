# ADR 001: Plan-First Handshake Before Agent Dispatch

**Status:** Accepted  
**Date:** 2026-05-10  
**Issue:** [#76](https://github.com/conduit-harness/conduit/issues/76)

## Context

Autonomous agent runs can produce surprising or unwanted outcomes. Issue #76 proposes a plan-then-execute handshake so agents propose a plan for human review before doing any work. This ADR records the chosen design path so implementors have a single authoritative reference.

## Decision

### Trigger

A planning phase is activated for an issue when **either** of the following is true:

1. The issue has the `plan-first` label (per-issue opt-in).
2. The workflow sets `planning.enabled: true` (global opt-in).

When neither condition holds, dispatch behavior is identical to today — no change.

### Plan storage

The planning agent writes its plan to `.conduit/plan.md` inside the workspace. The orchestrator reads that file after the planning run and:

- Posts it as a tracker comment (via the existing `applyWrite` / `on_plan_proposed` lifecycle event).
- Stores the plan text in `RunAttempt.planContent` for use in the execution phase.

Storing in the workspace keeps the plan durable across process restarts. Posting as a comment makes it visible to reviewers in the tracker.

### Approval mechanism

Label-based (works across all supported trackers):

| Labels on issue | Orchestrator action |
|---|---|
| `plan-first` present | Dispatch planning phase |
| `plan-ready` present, not `plan-approved` or `plan-rejected` | Skip; log `"awaiting plan approval"` |
| `plan-approved` present | Dispatch execution phase |
| `plan-rejected` present | Mark attempt failed; fire `on_plan_rejected`; issue eligible for re-plan |

The orchestrator checks labels on each poll tick. No webhook or external push required.

### Re-plan loop

When `plan-rejected` is detected:

1. Mark the current attempt `failed` with reason `"plan rejected"`.
2. Fire `on_plan_rejected` tracker write.
3. Remove `plan-ready` and `plan-rejected` labels (agent responsibility via its own tools, not orchestrator).
4. The issue becomes eligible for a new attempt on the next tick (re-runs planning phase).
5. The re-plan prompt receives `{{plan}}` (prior plan) and `{{plan_rejection_reason}}` (comment body from rejection, if readable) so the agent can incorporate feedback.
6. `agent.maxAttempts` bounds the loop.

### Spec alignment

The Symphony spec (§18.2) lists adding planning lifecycle as a TODO. This feature extends the spec with a new §19 "Planning Lifecycle." No existing spec machinery is changed.

New lifecycle events: `on_plan_proposed`, `on_plan_rejected`.

### Runner support

No runner API changes required. The planning phase uses a different prompt (planning instructions prepended to the workflow template). The execution phase uses the normal rendered prompt with `{{plan}}` and `{{plan_rejection_reason}}` template variables added.

The planning prompt instructs the agent to:
1. Analyze the issue and codebase.
2. Write the plan to `.conduit/plan.md`.
3. Stop — do not make changes.
4. Add the `plan-ready` label and remove the `plan-first` label on the tracker issue.

## Consequences

### What changes

- `planning` YAML block in `WORKFLOW.md` front matter (new optional section).
- `ServiceConfig.planning` typed config object.
- `RunAttempt.planContent?: string` and `RunAttempt.phase?: "planning" | "executing"`.
- `TrackerWriteEvent`: two new values: `"on_plan_proposed"`, `"on_plan_rejected"`.
- Orchestrator `tick()`: label-based phase routing; `awaiting-approval` issues excluded from re-dispatch.
- Prompt renderer: `{{plan}}` and `{{plan_rejection_reason}}` template variables.
- Symphony spec §19 (new section documenting the above).
- `UBIQUITOUS_LANGUAGE.md`: entries for plan-first vocabulary.

### What does not change

- Runner interface (`AgentRunner`) — unchanged.
- Tracker plugin interface — unchanged (label management is the agent's job via its own tools).
- Default dispatch behavior when `planning` block is absent or `planning.enabled: false`.

## Scoped implementation issues

| Issue | Scope |
|---|---|
| [#166](https://github.com/conduit-harness/conduit/issues/166) feat(config): planning workflow config block | `planning.*` YAML parsing, `ServiceConfig.planning`, defaults, validation |
| [#167](https://github.com/conduit-harness/conduit/issues/167) feat(orchestrator): plan-first two-phase dispatch | Phase routing, `RunAttempt` extension, lifecycle events, approval polling |
| [#168](https://github.com/conduit-harness/conduit/issues/168) docs(spec+vocab): plan-first lifecycle documentation | Symphony spec §19, `UBIQUITOUS_LANGUAGE.md` entries |

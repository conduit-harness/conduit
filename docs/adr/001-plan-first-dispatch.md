# ADR 001: Plan-First Dispatch (plan-then-execute handshake)

**Status:** Accepted  
**Issue:** #76  
**Date:** 2026-05-10

## Context

Agents dispatched by Conduit sometimes make unexpected changes on autonomous runs.
The request is to let agents propose a plan for human review before they execute
any changes — a "plan-then-execute handshake."

## Open questions resolved

### Where does the plan live?

A **tracker comment** posted by the agent during the planning phase is the
canonical artifact. It is human-visible, asynchronous, and works across all
supported trackers. The agent may additionally write a plan file to the workspace
(`PLAN.md` or similar), but the comment is the one that bridges the two phases.
Conduit itself does not need to read or write the plan text; the agent manages it.

### Trigger

A **per-issue label** (`plan-first` by default) opts an issue into planning mode.
The orchestrator reads label state each tick; no extra state file is needed.

A new optional `planning` block in the workflow YAML enables the feature and
lets operators configure label names and the planning prompt template.

Rationale: per-issue labels give operators and issue authors fine-grained control
without requiring a separate workflow file. Operators who want it for all issues
can set `required_labels: [plan-first]` in the workflow.

### Approval mechanism

**Label transition** performed by a human (or automation):

1. Issue has `plan-first` → planning dispatch
2. Agent posts plan comment, removes `plan-first`, adds `plan-ready` (using agent
   tools such as the GitHub CLI or MCP)
3. Issue has `plan-ready` (no `plan-approved`) → orchestrator skips; awaiting review
4. Human approves → removes `plan-ready`, adds `plan-approved`
5. Issue has `plan-approved` → execution dispatch
6. Execution attempt completes → agent removes `plan-approved`

Conduit reads labels but does not write them during the planning handshake. The
agent drives label transitions inside its planning prompt. This avoids requiring
a new tracker interface method (`addLabels`/`removeLabels`) for the MVP.

Rationale: label state is durable, auditable, and composable with existing
`required_labels`/`excluded_labels` filtering. Emoji reactions require
tracker-specific reaction APIs and are harder to compose. Slash commands require
Conduit to parse tracker comments, which is out of scope.

### Re-plan loop

Human removes `plan-ready`, re-adds `plan-first`. Next tick dispatches another
planning attempt. Each plan is a new `RunAttempt` with `phase: "planning"`.

There is no explicit rejection label or counter for rejected plans in the MVP.
Repeated planning attempts are bounded by the existing `max_attempts` config.

### Spec alignment

The Symphony specification (section 10.5) states that approval, sandbox, and
user-input behavior is **implementation-defined**. Conduit's plan-first mode
is documented here as a Conduit-specific extension; it does not require a new
Symphony lifecycle event.

A new `TrackerWriteEvent` value `on_plan_ready` may be added in a follow-on
issue to let operators configure a tracker transition when the plan is posted
(e.g., move issue to "Plan Review" state). It is not required for the MVP because
the agent can transition state directly.

### Runner support

No existing runner (`claude-cli`, `codex-cli`, `aider`) has a native plan-only
mode. The planning phase is driven by **prompt construction**: the workflow
configures a `planning.prompt_template` that instructs the agent to output a plan
and post it as a comment, rather than implementing changes.

No runner interface changes are needed.

## Chosen design

**Label-based two-phase dispatch via a `planning` workflow config section.**

```yaml
planning:
  enabled: true
  trigger_label: plan-first      # default; issue must have this → planning phase
  ready_label: plan-ready        # default; agent adds this after posting plan
  approval_label: plan-approved  # default; human adds this to approve
  prompt_template: |             # optional; if absent, orchestrator appends
    ...                          #   planning instructions to the main prompt
```

Orchestrator phase selection logic (per tick, per issue):

| Issue labels present             | Action                               |
|----------------------------------|--------------------------------------|
| `trigger_label`                  | Dispatch with planning prompt        |
| `ready_label` (not `approval_label`) | Skip; log "awaiting plan approval" |
| `approval_label`                 | Dispatch with execution prompt       |
| neither                          | Dispatch normally (unchanged)        |

`RunAttempt` gains an optional `phase?: "planning" | "executing"` field.

## Consequences

- No tracker plugin changes for MVP. Orchestrator only reads labels.
- No runner interface changes. Planning is prompt-only.
- Label management (adding `plan-ready`, removing `plan-first`) is the agent's
  responsibility via the planning prompt. This couples label hygiene to prompt
  quality; a badly-written planning prompt that forgets to update labels will
  leave the issue stuck. Mitigation: provide a robust default planning prompt.
- The plan text is not automatically injected into the execution prompt. Agents
  must fetch it (e.g., via `gh issue view` or tracker MCP). The execution prompt
  template should instruct them to do so.
- `max_attempts` counts all attempts (planning + execution). Operators may need
  to increase it for plan-first workflows.

## Implementation issues

This ADR is broken into three implementation issues:

1. **#162 feat(config): add `planning` workflow config section** — types, parser,
   defaults, validation, tests.
2. **#163 feat(orchestrator): plan-first two-phase dispatch** — phase detection,
   prompt selection, `RunAttempt.phase` field, tests.
3. **#164 docs: plan-first workflow example and ubiquitous language** — example
   workflow file, new terms in `UBIQUITOUS_LANGUAGE.md`.

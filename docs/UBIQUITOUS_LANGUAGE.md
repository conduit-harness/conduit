# Ubiquitous Language

This document is the canonical glossary for the Conduit project. Every term
listed here has one preferred spelling and one preferred meaning — use it
consistently in code, comments, commit messages, PR descriptions, issues, and
docs. When you find existing prose drifting from these definitions, prefer
realigning it (in a small follow-up) over coining a new variant.

This is a contributor reference. User-facing documentation lives at
<https://conduit.tomhofman.dev/>.

## Conventions

- **Agent vs. Runner.** "Agent" is the actor doing the coding work — Claude,
  GPT-4o, Codex, etc. "Runner" is the Conduit plugin that invokes that actor.
  Use "runner" when discussing plugin code or packages
  (`conduit-runner-claude-cli`); use "agent" when discussing the actor or its
  output ("the agent finished", "agent run output").
- **Tracker vs. issue tracker.** Prefer "tracker". Reserve "issue tracker"
  for first-mention disambiguation against the generic English meaning.
- **Casing.**
  - Workflow YAML keys are snake_case: `active_states`, `base_ref`,
    `max_concurrent_agents`.
  - TypeScript types and interfaces are PascalCase: `IssueTracker`,
    `AgentRunner`, `ServiceConfig`.
  - CLI verbs are lowercase: `conduit once`, `conduit start`.
- **Plurals.** "issues" and "attempts" pluralize naturally. Do not pluralize
  "workspace" when referring to the per-attempt directory tree — each attempt
  has one workspace.
- **The workflow file.** The CLI's default discovered filename is
  `WORKFLOW.md` at the repo root (see `discoverWorkflow` in
  `packages/conduit/src/config/workflow.ts:13`). Many examples place it at
  `.conduit/workflow.md` and pass `--workflow` explicitly; both are valid.
  Refer to it as "the workflow file" in prose.

---

## Core domain entities

### Issue
A normalized work item fetched from a tracker. Has a stable `id`, a
human-readable `identifier` (e.g. `ENG-123`), a `state`, `labels`, and
optional `priority`, `description`, `url`, and `branchName`. Avoid: "ticket",
"task".
Reference: `packages/conduit/src/domain/types.ts:1`

### Workspace
The isolated filesystem directory in which one attempt runs. Created from a
git worktree against `base_ref`, located at
`<workspace.root>/<workspace-key>/attempt-<n>` by default.
Reference: `packages/conduit/src/domain/types.ts:58`

### Run Attempt (Attempt)
One execution of an agent against one issue, numbered per-issue starting at 1.
Carries `status` (`running` | `succeeded` | `failed` | `timed_out`),
timestamps, the workspace path, and an optional error. Use "attempt" in prose
and `RunAttempt` for the type. Avoid: "agent run" as a noun ("the run") —
prefer "the attempt".
Reference: `packages/conduit/src/domain/types.ts:60`

### Workflow Definition
The parsed workflow file: YAML front matter (`config`) plus the Markdown
prompt body (`promptTemplate`). Distinct from the file on disk and from the
derived `ServiceConfig`.
Reference: `packages/conduit/src/domain/types.ts:16`

### Service Config
The typed, validated, env-resolved runtime configuration derived from a
`WorkflowDefinition` by `buildConfig`. This is what the orchestrator and
plugins consume — never reach back into the raw YAML once a `ServiceConfig`
exists.
Reference: `packages/conduit/src/domain/types.ts:29`

---

## Plugin model

### Tracker
A plugin that reads issues from an external system and optionally writes
back. Implements `IssueTracker`; new trackers should extend `BaseTracker`.
Built-in kinds: `linear`, `github`, `jira`, `gitlab`. Avoid: "issue tracker
client" as a noun in prose.
Reference: `packages/conduit/src/tracker/tracker.ts:3`

### Runner
A plugin that executes a coding agent inside a workspace. Implements
`AgentRunner`. Built-in kinds: `openai-api`, `claude-cli`, `codex-cli`. Note
the naming convention `conduit-runner-{vendor}-{mechanism}` where mechanism
is `api` (HTTP) or `cli` (subprocess).
Reference: `packages/conduit/src/agent/runner.ts:4`

### Plugin Kind
The string value of `tracker.kind` or `agent.kind` in the workflow. The CLI
maps it to an npm package name
`@conduit-harness/conduit-{tracker|runner}-{kind}` and dynamically imports
the plugin's default-exported class.
Reference: `packages/conduit/src/cli/index.ts:80`

### Harness
The `@conduit-harness` npm namespace and the broader plugin-host pattern.
Core lives at `@conduit-harness/conduit`; trackers and runners are sibling
packages under the same namespace.
Reference: `packages/conduit/package.json:2`

---

## Orchestration loop

### Orchestrator
The single coordinator that owns the polling loop, persisted state, and
dispatch decisions. Constructed once per process with a `ServiceConfig`,
`WorkflowDefinition`, `IssueTracker`, `AgentRunner`, and `Logger`.
Reference: `packages/conduit/src/orchestrator/orchestrator.ts:9`

### Tick
One iteration of the orchestration loop: fetch candidate issues, filter out
claimed/completed, sort, and dispatch up to `max_concurrent_agents`.
`conduit once` runs exactly one tick; `conduit start` runs ticks repeatedly.
Reference: `packages/conduit/src/orchestrator/orchestrator.ts:16`

### Polling
The repeated execution of `tick()` at `polling.interval_ms` (default
`30000`) under `conduit start`. The interval is the delay between the end of
one tick and the start of the next.
Reference: `packages/conduit/src/config/workflow.ts:75`

### Dispatch
The act of starting an attempt for a chosen issue: prepare the workspace,
render the prompt, run the agent, persist the attempt, and apply tracker
writes. Used as a verb ("dispatch an issue") and a noun for the act itself
("on dispatch"); avoid using it for the orchestrator as a whole.
Reference: `packages/conduit/src/orchestrator/orchestrator.ts:27`

---

## Issue selection & states

### Candidate Issue
An issue returned by `tracker.fetchCandidateIssues()` — already in an active
state and matching the configured label filters. Candidates may still be
filtered out at dispatch time if claimed by a running attempt or already
completed.
Reference: `packages/conduit/src/orchestrator/orchestrator.ts:17`

### Active States
Tracker state names that make an issue eligible for dispatch. Configured via
`tracker.active_states`; default `["Todo", "In Progress"]`.
Reference: `packages/conduit/src/config/workflow.ts:67`

### Terminal States
Tracker state names that disqualify an issue regardless of labels.
Configured via `tracker.terminal_states`; default `["Closed", "Cancelled",
"Canceled", "Duplicate", "Done"]`.
Reference: `packages/conduit/src/config/workflow.ts:68`

### Required / Excluded Labels
`tracker.required_labels` (issue must have all of these) and
`tracker.excluded_labels` (issue must have none) act as the candidate label
filter. All comparisons are case-insensitive — tracker plugins normalize
labels to lowercase on ingest.
Reference: `packages/conduit/src/config/workflow.ts:69`

---

## Tracker writes

### Tracker Write
A comment and/or state transition written back to the tracker by Conduit.
Off by default; opt in with `tracker.writes.enabled: true`. A failed tracker
write does not by itself fail the attempt.
Reference: `packages/conduit/src/domain/types.ts:22`

### Lifecycle Event
The moment at which a tracker write fires. Exactly four events:
`on_start`, `on_success`, `on_failure`, `on_terminal_failure`. Each event
maps to an optional `TrackerWriteAction` (`comment` and/or `transition_to`).
Reference: `packages/conduit/src/domain/types.ts:22`

---

## CLI modes & flags

### `conduit validate`
Parse the workflow and build the `ServiceConfig` without making external
calls. With `--preflight`, additionally require that tracker/agent
credentials and connectivity are present (`validateForDispatch`).
Reference: `packages/conduit/src/cli/index.ts:106`

### `conduit once`
Run a single tick and exit. Suitable for cron-driven schedules and CI.
Reference: `packages/conduit/src/cli/index.ts:118`

### `conduit start`
Run the polling loop continuously until `SIGINT` or `SIGTERM`.
Reference: `packages/conduit/src/cli/index.ts:122`

### Dry Run (`--dry-run`)
Select issues during a tick but do not prepare workspaces, render prompts,
or run agents. Logs each issue that would have been dispatched. Applies to
both `once` and `start`.
Reference: `packages/conduit/src/orchestrator/orchestrator.ts:21`

### Preflight (`--preflight`)
Extends `conduit validate` to require live credentials/connectivity rather
than only static config validity.
Reference: `packages/conduit/src/config/workflow.ts:89`

---

## Cross-cutting

### Symphony Specification
The upstream, language-agnostic service specification that Conduit
implements in TypeScript. When code and spec disagree, the spec is the
behavioral reference; deviations should be documented as Conduit-specific
implementation choices (see `CONTRIBUTING.md`). The spec is mirrored in this
repo and published on the docs site.
Reference: `website/src/content/docs/reference/spec.md`

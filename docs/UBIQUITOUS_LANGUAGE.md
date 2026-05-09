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
- **The CLI.** Always say "the Conduit CLI" or "the `conduit` binary" — never
  bare "the CLI", since contributors and operators routinely run several
  other CLIs in the same context: the Claude Code CLI (`claude`), the OpenAI
  Codex CLI (`codex`), the GitHub CLI (`gh`), and `git`.
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
Carries `status` (`running` | `succeeded` | `failed` | `timed_out`; and, when
plan-first mode is active, `pending_plan_approval` | `plan_rejected`),
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
A plugin that drives a coding agent inside a workspace by adapting an
external harness. The `claude-cli` runner spawns Claude Code; the
`codex-cli` runner spawns the OpenAI Codex CLI; the `aider` runner spawns
Aider. Implements `AgentRunner`. Naming convention:
`conduit-runner-{vendor}-{mechanism}` where mechanism is `api` (HTTP) or
`cli` (subprocess) — but only `cli` runners conform to the harness
contract; an `api` runner that calls a chat-completions endpoint directly,
without a harness, is non-conformant and not a model for new plugins.
Reference: `packages/conduit/src/agent/runner.ts:4`

### Plugin Kind
The string value of `tracker.kind` or `agent.kind` in the workflow. The CLI
maps it to an npm package name
`@conduit-harness/conduit-{tracker|runner}-{kind}` and dynamically imports
the plugin's default-exported class.
Reference: `packages/conduit/src/cli/index.ts:80`

---

## Harness model

### Harness (Agentic Harness)
The runtime scaffolding around a language model that turns it into a usable
coding agent: the agent loop, tool definitions and tool execution, prompt
assembly and context management, sandbox/workspace isolation, retry and
stop conditions. The model alone is just text-in/text-out; the harness is
what gives it hands and eyes. Claude Code, the OpenAI Codex CLI, and Aider
are coding-agent harnesses.

Conduit is a scheduler over harnesses, not a harness itself. The intended
shape is one layer per concern: Conduit picks issues and prepares
workspaces; a runner adapts an external harness; the harness runs the agent
loop. New runners should wrap a real coding-agent harness — calling an LLM
directly from Conduit is out of scope. The `@conduit-harness` npm namespace
names the relationship: Conduit hosts harnesses, it doesn't try to be one.

See also: Runner (`packages/conduit/src/agent/runner.ts:4`), Workspace
(`packages/conduit/src/domain/types.ts:58`).

### Harness Engineering
The discipline of designing and tuning a harness for a given task: which
tools to expose, how to structure the prompt, how to manage long contexts,
how to detect and recover from failures, how to evaluate task completion.
In Conduit, harness engineering surfaces in the workflow file (prompt
template, label filters, lifecycle-event writes, retry policy) and inside
the runner plugins (timeouts, stall detection, transport details). Tuning
these knobs is the primary leverage operators have over agent behavior
without modifying the underlying model or external harness.

See also: Workflow Definition (`packages/conduit/src/domain/types.ts:16`),
prompt rendering (`packages/conduit/src/prompt/render.ts`).

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
The moment at which a tracker write fires. Four standard events:
`on_start`, `on_success`, `on_failure`, `on_terminal_failure`. When
plan-first mode is enabled a fifth event, `on_plan`, fires after the plan
phase completes and before the execute phase begins. Each event maps to an
optional `TrackerWriteAction` (`comment` and/or `transition_to`).
Reference: `packages/conduit/src/domain/types.ts:22`

---

## Plan-first mode

### Plan-First Mode
An optional dispatch mode enabled by `agent.plan_first: true` in the
workflow. Every new dispatch is split into a plan phase (agent proposes
work, no file changes) followed by a gated execute phase (agent makes
changes). Human review happens between the two phases. Disabled by default
— standard dispatch is single-phase.
Reference: issues #126 (config), #127 (tracker interface), #128 (orchestrator)

### Plan Phase
The first half of a plan-first dispatch. The agent runs against the main
prompt prefixed with a plan instruction and proposes work without touching
any files. The orchestrator stores the proposal in `attempt.plan.content`
and fires the `on_plan` lifecycle event, posting the plan as a tracker
comment for human review.
Reference: issue #128

### Execute Phase
The second half of a plan-first dispatch. The agent runs against the full
prompt and makes code changes. Begins only after a human applies the
configured approval label to the tracker issue.
Reference: issue #128

### Approval Signal / Rejection Signal
A tracker label placed on an issue to accept or refuse a proposed plan.
`agent.plan_approval_label` (default `conduit:approved`) signals approval;
`agent.plan_rejection_label` (default `conduit:revise`) signals rejection.
The orchestrator polls for these labels on each tick.
Reference: issues #127 (tracker interface), #128 (orchestrator)

### Pending Plan Approval
An attempt status (`"pending_plan_approval"`) assigned after the plan
phase completes. The issue is treated as claimed — it will not be
re-dispatched — until the approval or rejection signal is detected on the
next tick.
Reference: issues #126 (types), #128 (orchestrator)

---

## CLI

### Conduit CLI
The `conduit` executable shipped by `@conduit-harness/conduit`. Use the
fully qualified name "Conduit CLI" or the literal `conduit` whenever the
context contains other CLIs — Claude Code (`claude`), Codex (`codex`),
GitHub (`gh`), `git` — which is almost always.

Subcommands: `init`, `validate`, `once`, `start`, `version`.
- `validate` parses the workflow and builds the `ServiceConfig` without
  external calls; `--preflight` extends it to require live tracker/agent
  credentials and connectivity (`validateForDispatch`).
- `once` runs a single tick and exits. Suitable for cron and CI.
- `start` runs the polling loop until `SIGINT` or `SIGTERM`.
- `--dry-run` (on `once` and `start`) selects issues during a tick but
  skips workspace preparation, prompt rendering, and the agent call —
  logging each issue that would have been dispatched.

Reference: `packages/conduit/src/cli/index.ts:92`

---

## Cross-cutting

### Symphony Specification
The upstream, language-agnostic service specification that Conduit
implements in TypeScript. When code and spec disagree, the spec is the
behavioral reference; deviations should be documented as Conduit-specific
implementation choices (see `CONTRIBUTING.md`). The spec is mirrored in this
repo and published on the docs site.
Reference: `website/src/content/docs/reference/spec.md`

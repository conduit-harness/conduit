---
tracker:
  kind: github
  api_key: $GITHUB_TOKEN
  owner: conduit-harness
  repo: conduit
  active_states: [open]
  terminal_states: [closed]
  required_labels: [agentic]
  excluded_labels: [blocked, draft]
  writes:
    enabled: false

workspace:
  root: .conduit/workspaces
  strategy: git-worktree
  base_ref: main

agent:
  kind: claude-cli
  max_concurrent_agents: 1
  max_attempts: 3

claude-cli:
  model: claude-sonnet-4-6
  # claude -p in default text mode buffers ALL output (including tool-use
  # traces) until the run completes, so the runner's stall timer cannot
  # tell "thinking quietly" from "actually hung". Disable stall detection
  # and rely on the turn_timeout for runaway protection. The proper fix
  # is to switch the runner to --output-format stream-json (tracked in
  # #40 / #41); this is the dogfood workaround.
  stall_timeout_ms: 0
  turn_timeout_ms: 1800000

polling:
  interval_ms: 30000
---
You are picking up an open GitHub issue from the conduit-harness/conduit repository — Conduit's own codebase. This is dogfooding: Conduit dispatched you, and you are now working on Conduit itself.

**Issue:** {{issue.identifier}} — {{issue.title}}
**URL:** {{issue.url}}
**Labels:** {{issue.labels}}
**Workspace:** {{workspace.path}} (branched from `main`)
**Attempt:** {{attempt.number}}

**Description:**
{{issue.description}}

## Working rules

- You are inside an isolated git worktree. **Commit early, commit often** — make focused commits on the current branch as you complete each logical step.
- Read the relevant code before changing it. Cite file paths with line numbers in your final summary.
- Run `pnpm typecheck` and `pnpm test` before declaring success. If a test is missing for the change, add it.
- Follow the conventions in `CONTRIBUTING.md` and `docs/UBIQUITOUS_LANGUAGE.md`.
- Keep the change minimal. Do not refactor adjacent code or modify unrelated files.
- If the task is ambiguous or blocked on a decision the issue does not answer, stop and report; do not guess.

## On finish

1. Stage and commit all changes with a descriptive (conventional-commits) message.
2. Push the branch: `git push -u origin HEAD`.
3. Open a PR: `gh pr create --title "Issue: {{issue.identifier}} — {{issue.title}}" --body "Closes {{issue.url}}"`.
4. Report file diffstat and test output.

If you halted without completing the task, end with `STATUS: halted` on its own line and explain what blocked you.

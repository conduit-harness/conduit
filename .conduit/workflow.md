---
tracker:
  kind: github
  api_key: $GITHUB_TOKEN
  owner: conduit-harness
  repo: conduit
  active_states: [open]
  terminal_states: [closed]
  required_labels: [agentic]
  excluded_labels: [blocked]
  writes:
    enabled: false

workspace:
  root: .conduit/workspaces
  strategy: git-worktree
  base_ref: main

agent:
  kind: claude-cli
  max_concurrent_agents: 1

claude-cli:
  model: claude-sonnet-4-6

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

- You are inside an isolated git worktree. Make focused commits on the current branch — do not push.
- Read the relevant code before changing it. Cite file paths with line numbers in your final summary.
- Run `pnpm typecheck` and `pnpm test` before declaring success. If a test is missing for the change, add it.
- Follow the conventions in `CONTRIBUTING.md` and `docs/UBIQUITOUS_LANGUAGE.md`.
- Keep the change minimal. Do not refactor adjacent code or modify unrelated files.
- If the task is ambiguous or blocked on a decision the issue does not answer, stop and report; do not guess.

## On finish

End your run with:

1. A one-paragraph summary of what changed and why.
2. The list of files modified with `git diff --stat` output.
3. The output of `pnpm typecheck` and `pnpm test`.
4. Any follow-up work you noticed but deliberately did not do.

If you halted without completing the task, end with `STATUS: halted` on its own line and explain what blocked you.

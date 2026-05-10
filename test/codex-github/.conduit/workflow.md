---
tracker:
  kind: github
  api_key: $GITHUB_TOKEN
  owner: conduit-harness
  repo: hello-world
  active_states: [open]
  terminal_states: [closed]
  required_labels: [agentic]
  excluded_labels: [blocked, draft, wontfix]
  writes:
    enabled: true
    on_start:
      comment: true
    on_success:
      comment: true
    on_failure:
      comment: true
    on_terminal_failure:
      comment: true
polling:
  interval_ms: 30000
workspace:
  root: .conduit/workspaces
  strategy: git-worktree
  base_ref: main
state:
  root: .conduit/state
hooks:
  timeout_ms: 60000
agent:
  kind: codex-cli
  max_concurrent_agents: 1
  max_retry_backoff_ms: 300000
codex-cli:
  command: codex
  turn_timeout_ms: 3600000
  stall_timeout_ms: 300000
---
You are implementing a GitHub issue in a git worktree. The branch has already been created by conduit — do not create a new one.

Issue: {{issue.identifier}} - {{issue.title}}
GitHub URL: {{issue.url}}
State: {{issue.state.name}}
Labels: {{issue.labels}}
Workspace: {{workspace.path}}
Attempt: {{attempt.number}}

Description:
{{issue.description}}

Complete the following steps in order:

1. Read the issue description carefully and identify the minimal safe change required.
2. Implement the change. Touch only the files necessary to satisfy the issue.
3. Run any relevant tests or linters to verify correctness.
4. Stage and commit all changes:
   ```
   git add -A
   git commit -m "{{issue.identifier}}: {{issue.title}}"
   ```
5. Push the current branch and set the remote tracking:
   ```
   git push -u origin HEAD
   ```
6. Create a GitHub pull request using the CLI:
   ```
   gh pr create --base main --title "{{issue.identifier}}: {{issue.title}}" --body "Closes {{issue.identifier}}"
   ```
7. Output the PR URL so it appears in the conduit run log.

If any step fails, stop and report the error clearly.

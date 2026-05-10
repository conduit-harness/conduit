---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  team_key: $LINEAR_TEAM_KEY
  active_states: [Todo, In Progress]
  terminal_states: [Done, Canceled, Cancelled, Duplicate]
  required_labels: [agentic]
  excluded_labels: [blocked, draft, wontfix]
  writes:
    enabled: true
    on_start:
      comment: true
      transition_to: In Progress
    on_success:
      comment: true
      transition_to: Human Review
    on_failure:
      comment: true
      transition_to: Todo
    on_terminal_failure:
      comment: true
      transition_to: Blocked
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
  kind: claude-cli
  max_concurrent_agents: 1
  max_retry_backoff_ms: 300000
claude-cli:
  command: claude --dangerously-skip-permissions -p -
  turn_timeout_ms: 3600000
  stall_timeout_ms: 300000
---
You are implementing a Linear issue in a git worktree. The branch has already been created by conduit — do not create a new one.

Issue: {{issue.identifier}} - {{issue.title}}
Linear URL: {{issue.url}}
State: {{issue.state}}
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
   gh pr create --base main --title "{{issue.identifier}}: {{issue.title}}" --body "Implements Linear issue {{issue.url}}"
   ```
7. Output the PR URL so it appears in the conduit run log.

If any step fails, stop and report the error clearly.

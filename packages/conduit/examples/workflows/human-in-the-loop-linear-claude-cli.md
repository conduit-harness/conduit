---
tracker:
  kind: linear
  endpoint: https://api.linear.app/graphql
  api_key: $LINEAR_API_KEY
  team_key: ENG
  active_states: [Todo, Ready]
  terminal_states: [Done, Canceled, Cancelled, Closed, Duplicate]
  required_labels: [agentic]
  excluded_labels: [blocked, draft, wontfix]
  page_size: 50
  writes:
    enabled: true
    on_start:
      comment: true
      transition_to: In Progress
    on_success:
      comment: true
      transition_to: In Review
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
  max_attempts: 3   # max dispatch attempts per issue; 0 = unlimited (not recommended)
  max_retry_backoff_ms: 300000
claude-cli:
  command: claude --dangerously-skip-permissions -p -
  turn_timeout_ms: 3600000
  stall_timeout_ms: 300000
---
Investigate the Linear issue below and prepare a change for human review.

Issue: {{issue.identifier}} - {{issue.title}}
URL: {{issue.url}}
State: {{issue.state}}
Labels: {{issue.labels}}
Workspace: {{workspace.path}}
Attempt: {{attempt.number}}

Description:
{{issue.description}}

Implement the change in the workspace and run relevant tests. Commit early, commit often — make focused commits as you complete each logical step.

## On finish

1. Stage and commit all changes with a descriptive message.
2. Push the branch: `git push -u origin HEAD`.
3. Write a review note to `{{workspace.path}}/REVIEW.md` describing what you changed, what you tested, and any open questions.

Do not open a PR — stop after the review note. Conduit will transition the issue to "In Review" and a human will take it from here.

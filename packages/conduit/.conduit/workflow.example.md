---
tracker:
  kind: fake # change to linear for real Linear
  endpoint: https://api.linear.app/graphql
  api_key: $LINEAR_API_KEY
  project_slug: example-project
  # Or use team_key instead of project_slug for team-scoped issue selection.
  # team_key: A
  active_states: [Todo, Ready]
  terminal_states: [Done, Canceled, Cancelled, Closed, Duplicate]
  required_labels: []
  excluded_labels: [blocked, draft, wontfix]
  page_size: 50
  writes:
    enabled: false
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
  kind: fake # change to codex-cli for real Codex child process
  max_concurrent_agents: 1
  max_attempts: 3   # max dispatch attempts per issue; 0 = unlimited (not recommended)
  max_retry_backoff_ms: 300000
codex-cli:
  mode: cli
  command: codex
  turn_timeout_ms: 3600000
  stall_timeout_ms: 300000
---
Implement the Linear issue below in this repository.

Issue: {{issue.identifier}} - {{issue.title}}
URL: {{issue.url}}
State: {{issue.state}}
Labels: {{issue.labels}}
Workspace: {{workspace.path}}
Attempt: {{attempt.number}}

Description:
{{issue.description}}

Please make the smallest safe change, run relevant tests, and summarize the result.

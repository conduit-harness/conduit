---
tracker:
  kind: linear
  endpoint: https://api.linear.app/graphql
  api_key: $LINEAR_API_KEY
  # Use project_slug for project-scoped selection, or team_key for team-scoped selection.
  # project_slug: your-project-slug
  team_key: YOUR_TEAM_KEY
  active_states: [Todo, Ready]
  terminal_states: [Done, Canceled, Cancelled, Closed, Duplicate]
  required_labels: [agentic]
  excluded_labels: [blocked]
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
  kind: codex-cli
  max_concurrent_agents: 1
  max_retry_backoff_ms: 300000
codex-cli:
  command: codex exec -s workspace-write -
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

## Working rules

Make the smallest safe change. Run relevant tests. Commit early, commit often — make focused commits as you complete each logical step.

## On finish

1. Stage and commit all changes with a descriptive message.
2. Push the branch: `git push -u origin HEAD`.
3. Open a PR: `gh pr create --title "Issue: {{issue.identifier}} — {{issue.title}}" --body "Closes {{issue.url}}"`.
4. Report file diffstat and test output.

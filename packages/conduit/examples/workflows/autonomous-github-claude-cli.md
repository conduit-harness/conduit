---
tracker:
  kind: github
  api_key: $GITHUB_TOKEN
  owner: my-org
  repo: my-repo
  active_states: [open]
  terminal_states: [closed]
  required_labels: [agentic]
  excluded_labels: [blocked, draft, wontfix]
  page_size: 50
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
  kind: claude-cli
  max_concurrent_agents: 3
  max_attempts: 3   # max dispatch attempts per issue; 0 = unlimited (not recommended)
  max_retry_backoff_ms: 300000
claude-cli:
  command: claude --dangerously-skip-permissions -p -
  turn_timeout_ms: 3600000
  stall_timeout_ms: 300000
---
Implement the GitHub issue below in this repository.

Issue: {{issue.identifier}} - {{issue.title}}
URL: {{issue.url}}
State: {{issue.state}}
Labels: {{issue.labels}}
Workspace: {{workspace.path}}
Attempt: {{attempt.number}}

Description:
{{issue.description}}

## Working rules

Make the smallest safe change. Run relevant tests. You are running unattended — finish the work end-to-end and only stop when the change is complete or you are blocked. Commit early, commit often — make focused commits as you complete each logical step.

## On finish

1. Stage and commit all changes with a descriptive message.
2. Push the branch: `git push -u origin HEAD`.
3. Open a PR: `gh pr create --title "Issue: {{issue.identifier}} — {{issue.title}}" --body "Closes {{issue.url}}"`.
4. Report file diffstat and test output.

---
tracker:
  kind: forgejo
  base_url: https://forgejo.example.com
  api_key: $FORGEJO_TOKEN
  owner: my-org
  repo: my-repo
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

workspace:
  root: .conduit/workspaces
  strategy: git-worktree
  base_ref: main

agent:
  kind: claude-cli
  max_concurrent_agents: 1

claude-cli:
  command: claude --dangerously-skip-permissions -p -
  turn_timeout_ms: 3600000
  stall_timeout_ms: 300000
---
Implement the Forgejo issue below in this repository.

Issue: {{issue.identifier}} - {{issue.title}}
URL: {{issue.url}}
State: {{issue.state}}
Labels: {{issue.labels}}
Workspace: {{workspace.path}}
Attempt: {{attempt.number}}

Description:
{{issue.description}}

Please make the smallest safe change, run relevant tests, and summarize the result.

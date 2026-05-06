---
tracker:
  kind: azuredevops
  organization: my-org
  project: my-project
  api_key: $AZURE_DEVOPS_TOKEN
  active_states: [Active, New]
  terminal_states: [Closed, Resolved, Removed]
  required_labels: [agentic]
  excluded_labels: [blocked]
  writes:
    enabled: true
    on_start:
      comment: true
      transition_to: Active
    on_success:
      comment: true
      transition_to: Resolved
    on_failure:
      comment: true
      transition_to: New

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
Implement the Azure DevOps work item below in this repository.

Issue: {{issue.identifier}} - {{issue.title}}
URL: {{issue.url}}
State: {{issue.state}}
Labels: {{issue.labels}}
Workspace: {{workspace.path}}
Attempt: {{attempt.number}}

Description:
{{issue.description}}

Please make the smallest safe change, run relevant tests, and summarize the result.

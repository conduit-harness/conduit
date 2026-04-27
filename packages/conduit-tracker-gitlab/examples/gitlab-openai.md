---
tracker:
  kind: gitlab
  api_key: $GITLAB_TOKEN
  project_id: my-group/my-project
  active_states: [opened]
  terminal_states: [closed]
  required_labels: [agentic]
  excluded_labels: [blocked]
  writes:
    enabled: true
    on_start:
      comment: true
    on_success:
      comment: true
    on_failure:
      comment: true
  # For self-hosted GitLab, uncomment and set:
  # gitlab_url: https://gitlab.example.com

workspace:
  root: .conduit/workspaces
  strategy: git-worktree
  base_ref: main

agent:
  kind: openai-api
  max_concurrent_agents: 1

openai-api:
  token: $GITHUB_TOKEN
  model: gpt-4o
  endpoint: https://models.inference.ai.azure.com/chat/completions
  turn_timeout_ms: 3600000
---
Implement the GitLab issue below in this repository.

Issue: {{issue.identifier}} - {{issue.title}}
URL: {{issue.url}}
State: {{issue.state}}
Labels: {{issue.labels}}
Workspace: {{workspace.path}}
Attempt: {{attempt.number}}

Description:
{{issue.description}}

Please make the smallest safe change, run relevant tests, and summarize the result.

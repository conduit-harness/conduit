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
  ollama_backend_url: http://localhost:11434
  ollama_model: qwen2.5-coder
  turn_timeout_ms: 120000
---
Implement the GitHub issue below in this repository using local inference via Ollama.

Issue: {{issue.identifier}} - {{issue.title}}
URL: {{issue.url}}
State: {{issue.state.name}}
Labels: {{issue.labels}}
Workspace: {{workspace.path}}
Attempt: {{attempt.number}}

Description:
{{issue.description}}

Please make the smallest safe change, run relevant tests, and summarize the result.

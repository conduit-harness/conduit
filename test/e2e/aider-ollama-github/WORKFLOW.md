---
tracker:
  kind: github
  api_key: $GITHUB_TOKEN
  base_url: http://mock-github:3000
  owner: testorg
  repo: testrepo
  active_states: [open]
  required_labels: [agentic]
  writes:
    enabled: true
    on_start:
      comment: true
    on_success:
      comment: true
      transition_to: closed
    on_terminal_failure:
      comment: true
agent:
  kind: aider
  max_concurrent_agents: 1
aider:
  model: ollama_chat/$OLLAMA_MODEL
  ollama_endpoint: http://ollama:11434
  turn_timeout_ms: 120000
workspace:
  root: .conduit/workspaces
  strategy: git-worktree
  base_ref: main
polling:
  interval_ms: 5000
---
You are a helpful assistant. Reply briefly to the issue below.

Issue: {{issue.identifier}} - {{issue.title}}
URL: {{issue.url}}
Workspace: {{workspace.path}}
Attempt: {{attempt.number}}

Description:
{{issue.description}}

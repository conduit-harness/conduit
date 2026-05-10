---
tracker:
  kind: forgejo
  api_key: $FORGEJO_TOKEN
  base_url: https://forgejo.home.tomhofman.nl
  owner: paddoswam
  repo: hello-world
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
  kind: aider
  max_concurrent_agents: 1
  max_retry_backoff_ms: 300000
aider:
  model: ollama_chat/qwen2.5-coder:14b
  ollama_endpoint: http://localhost:11434
  turn_timeout_ms: 3600000
  stall_timeout_ms: 300000
  command: aider --yes-always --no-pretty --no-stream --no-show-model-warnings --no-detect-urls --no-check-update --no-suggest-shell-commands
  # After aider commits, push the branch and open a Forgejo PR via the API.
  # extra_args are appended to the aider invocation; && chains run after aider exits 0.
  # Bash syntax (used while runners still spawn bash). Will switch to Invoke-RestMethod
  # once the runner platform-shell issue is resolved (conduit-harness/conduit#<issue>).
  extra_args: "&& git push -u origin HEAD && _B=$(git branch --show-current) && curl -sS -X POST https://forgejo.home.tomhofman.nl/api/v1/repos/paddoswam/hello-world/pulls -H 'Content-Type: application/json' -H \"Authorization: token ${FORGEJO_TOKEN}\" -d \"{\\\"title\\\":\\\"${_B}\\\",\\\"head\\\":\\\"${_B}\\\",\\\"base\\\":\\\"main\\\"}\""
---
You are an automated coding agent. Implement the Forgejo issue below by directly writing or editing files — do NOT ask questions or request files to be added to the chat.

Issue: {{issue.identifier}} - {{issue.title}}
Forgejo URL: {{issue.url}}
State: {{issue.state}}
Labels: {{issue.labels}}
Workspace: {{workspace.path}}
Attempt: {{attempt.number}}

Description:
{{issue.description}}

Rules:
- Write the solution immediately. Create any new files that are needed — do not ask permission.
- Make the minimal change that satisfies the issue.
- Do not ask for clarification. If the task is ambiguous, make a reasonable assumption and proceed.
- Your changes will be auto-committed by aider. Push and PR creation are handled automatically.

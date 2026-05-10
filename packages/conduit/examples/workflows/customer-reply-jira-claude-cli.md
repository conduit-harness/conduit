---
# Non-coding workflow: drafts a customer-facing reply on Jira tickets that
# carry the `needs-reply` label. Conduit posts the agent's output as a comment;
# a human reviews and sends. The agent never modifies code or transitions the
# ticket.
tracker:
  kind: jira
  domain: mycompany.atlassian.net
  email: $JIRA_EMAIL
  api_key: $JIRA_API_TOKEN
  project_key: SUPPORT
  active_states: [To Do, In Progress]
  terminal_states: [Done, Closed, "Won't Do"]
  required_labels: [needs-reply]
  excluded_labels: [blocked, draft, wontfix]
  page_size: 50
  writes:
    enabled: true
    on_success:
      comment: true
polling:
  interval_ms: 60000
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
  max_concurrent_agents: 2
  max_attempts: 3   # max dispatch attempts per issue; 0 = unlimited (not recommended)
  max_retry_backoff_ms: 300000
claude-cli:
  command: claude --dangerously-skip-permissions -p -
  turn_timeout_ms: 1800000
  stall_timeout_ms: 300000
---
Read the Jira ticket below and draft a friendly, accurate reply for the reporter.

Issue: {{issue.identifier}} - {{issue.title}}
URL: {{issue.url}}
State: {{issue.state}}
Labels: {{issue.labels}}
Attempt: {{attempt.number}}

Description:
{{issue.description}}

Guidelines:
- Address the reporter by name if one is available in the description; otherwise use a neutral greeting.
- Acknowledge the problem in one sentence, then either answer the question or list the next steps you will take.
- Keep it under 150 words. Plain language, no jargon, no internal links.
- If the ticket lacks information you would need to actually answer, ask one specific clarifying question instead of guessing.

Do not modify any code. Do not transition the ticket. Output the draft reply as your final message — Conduit will post it as a comment on the ticket for a human teammate to review and send.

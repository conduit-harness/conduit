---
title: Quickstart
description: Install Conduit, configure a workflow, and run your first agent loop.
---

Conduit polls an issue tracker, dispatches a coding agent for each eligible issue inside an isolated git worktree, and optionally writes results back. This guide walks through a minimal GitHub Issues + Claude CLI setup.

> Prefer point-and-click? The [setup wizard](/guides/wizard/) generates the install command, workflow file, and `.env` from your tracker and runner choices.

## Install

```bash
npm install -g @conduit-harness/conduit
```

Conduit uses a plugin model — install the tracker and runner you need alongside the core. See [Trackers](/packages/trackers/github/) and [Runners](/packages/runners/claude-cli/) for the full list.

```bash
npm install -g @conduit-harness/conduit-tracker-github
npm install -g @conduit-harness/conduit-runner-claude-cli
```

The `claude` binary must be installed and authenticated. See the [Claude Code docs](https://docs.claude.com/en/docs/agents-and-tools/claude-code/overview) for setup.

## Workflow file

Create `.conduit/workflow.md`:

```yaml
---
tracker:
  kind: github
  api_key: $GITHUB_TOKEN
  owner: your-org
  repo: your-repo
  active_states: [open]
  required_labels: [agentic]
  excluded_labels: [blocked, draft, wontfix]
  writes:
    enabled: false
workspace:
  root: .conduit/workspaces
  strategy: git-worktree
  base_ref: main
agent:
  kind: claude-cli
  max_concurrent_agents: 1
claude-cli:
  command: claude --dangerously-skip-permissions -p -
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

Please make the smallest safe change, run relevant tests, and summarize the result.
```

**`excluded_labels`** — Conduit skips any issue that carries one of these labels. The defaults (`blocked`, `draft`, `wontfix`) cover the most common "not ready for an agent" patterns. Add labels like `needs-design` or `on-hold` for your own conventions; remove any you don't use.

## Environment

Create `.env`:

```dotenv
GITHUB_TOKEN=github_pat_...
```

Use a fine-grained personal access token scoped to your repository with **Issues: Read & Write** permission. See [GitHub tracker](/packages/trackers/github/) for details.

Secrets must come from environment variables — Conduit will not read raw API keys committed to a workflow file.

## Run

```bash
conduit validate --workflow .conduit/workflow.md
conduit once     --workflow .conduit/workflow.md
conduit start    --workflow .conduit/workflow.md
```

- `validate` checks the workflow without contacting the tracker.
- `once` polls the tracker once and dispatches eligible issues.
- `start` runs the polling loop continuously every 30s.

Add `--dry-run` to either command to select issues without dispatching agents.

## Next steps

- [Configuration](/guides/configuration/) — workspace and state paths, secrets, plugins.
- [Tracker writes](/reference/tracker-writes/) — enable comments and state transitions.
- [Non-intrusive use](/reference/non-intrusive-use/) — run against external repos without leaving artifacts.

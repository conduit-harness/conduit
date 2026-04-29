---
title: Quickstart
description: Install Conduit, configure a workflow, and run your first agent loop.
---

Conduit polls an issue tracker, dispatches a coding agent for each eligible issue inside an isolated git worktree, and optionally writes results back. This guide walks through a minimal Linear + OpenAI setup.

> Prefer point-and-click? The [setup wizard](/guides/wizard/) generates the install command, workflow file, and `.env` from your tracker and runner choices.

## Install

```bash
npm install -g @ausernamedtom/conduit
```

Conduit uses a plugin model — install the tracker and runner you need alongside the core. See [Trackers](/packages/trackers/github/) and [Runners](/packages/runners/claude-cli/) for the full list.

```bash
npm install -g @ausernamedtom/conduit-tracker-linear
npm install -g @ausernamedtom/conduit-runner-openai-api
```

## Workflow file

Create `.conduit/workflow.md`:

```yaml
---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  team_key: YOUR_TEAM_KEY
  active_states: [Todo, Ready]
  required_labels: [agentic]
  excluded_labels: [blocked]
  writes:
    enabled: false
workspace:
  root: .conduit/workspaces
  strategy: git-worktree
  base_ref: main
agent:
  kind: openai-api
  max_concurrent_agents: 1
openai-api:
  model: gpt-4o
---
Implement the Linear issue below in this repository.

Issue: {{issue.identifier}} - {{issue.title}}
URL: {{issue.url}}
State: {{issue.state.name}}
Labels: {{issue.labels}}
Workspace: {{workspace.path}}
Attempt: {{attempt.number}}

Description:
{{issue.description}}

Please make the smallest safe change, run relevant tests, and summarize the result.
```

## Environment

Create `.env`:

```dotenv
LINEAR_API_KEY=lin_api_...
OPENAI_API_KEY=sk-...
```

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

# Conduit

Conduit is an agentic coding scheduler. It reads issues from a tracker, creates an isolated git worktree for each, renders a prompt, runs a coding agent, and optionally writes results back to the tracker.

## How it works

Conduit runs a continuous loop:

- Poll tracker for issues matching active states and labels (Linear / GitHub / Jira / GitLab)
- Per eligible issue:
  - Create isolated git worktree (`.conduit/workspaces/<issue-id>`)
  - Render prompt from `workflow.md` template + issue context
  - Launch agent inside the worktree (openai-api / claude-cli / codex-cli)
  - Write result back to tracker *(optional)* — comment + state transition
- ↺ repeat every 30s

## Install

```bash
npm install -g @conduit-harness/conduit
```

Conduit uses a plugin model — install the tracker and runner you need alongside the core.

### Trackers

| Tracker | `tracker.kind` | Install |
|---------|---------------|---------|
| Linear | `linear` | `npm install -g @conduit-harness/conduit-tracker-linear` |
| GitHub | `github` | `npm install -g @conduit-harness/conduit-tracker-github` |
| Jira   | `jira`   | `npm install -g @conduit-harness/conduit-tracker-jira` |
| GitLab | `gitlab` | `npm install -g @conduit-harness/conduit-tracker-gitlab` |

### Runners

| Runner | `agent.kind` | Mechanism | Install |
|--------|-------------|-----------|---------|
| OpenAI API  | `openai-api` | HTTP — any OpenAI-compatible chat completions endpoint | `npm install -g @conduit-harness/conduit-runner-openai-api` |
| Claude CLI  | `claude-cli` | CLI subprocess — requires `claude` (Claude Code) installed | `npm install -g @conduit-harness/conduit-runner-claude-cli` |
| Codex CLI   | `codex-cli`  | CLI subprocess — requires `codex` (OpenAI Codex CLI) installed | `npm install -g @conduit-harness/conduit-runner-codex-cli` |

Each plugin package includes an example workflow under its own `examples/` directory.

## Quick start

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
State: {{issue.state}}
Labels: {{issue.labels}}
Workspace: {{workspace.path}}
Attempt: {{attempt.number}}

Description:
{{issue.description}}

Please make the smallest safe change, run relevant tests, and summarize the result.
```

Create `.env`:

```dotenv
LINEAR_API_KEY=lin_api_...
OPENAI_API_KEY=sk-...
```

Run:

```bash
conduit validate --workflow .conduit/workflow.md
conduit once     --workflow .conduit/workflow.md
conduit start    --workflow .conduit/workflow.md
```

## CLI

```
conduit init     [--workflow PATH] [--repo PATH] [--env PATH] [--fake] [--gitignore]
conduit validate [--workflow PATH] [--repo PATH] [--env PATH] [--preflight]
conduit once     [--workflow PATH] [--repo PATH] [--env PATH] [--dry-run]
conduit start    [--workflow PATH] [--repo PATH] [--env PATH] [--dry-run]
conduit version
```

`--dry-run` selects issues without dispatching agents. `--preflight` requires external credentials to be present.

## Documentation

Full docs, package guides, and the API reference live at **<https://conduit.tomhofman.dev/>**.

- [Quickstart](https://conduit.tomhofman.dev/guides/quickstart/)
- [Configuration](https://conduit.tomhofman.dev/guides/configuration/)
- [Tracker writes](https://conduit.tomhofman.dev/reference/tracker-writes/) — configuring comments and state transitions
- [Non-intrusive use](https://conduit.tomhofman.dev/reference/non-intrusive-use/) — running against external repos without leaving artifacts
- [Status](https://conduit.tomhofman.dev/reference/status/) — current capabilities and known limitations
- [Symphony specification](https://conduit.tomhofman.dev/reference/spec/) — the upstream spec this implementation follows
- [CONTRIBUTING.md](CONTRIBUTING.md) — development setup and contribution guidelines

# Conduit

[![npm version](https://img.shields.io/npm/v/@conduit-harness/conduit.svg)](https://www.npmjs.com/package/@conduit-harness/conduit)
[![weekly downloads](https://img.shields.io/npm/dw/@conduit-harness/conduit.svg)](https://www.npmjs.com/package/@conduit-harness/conduit)
[![CI](https://github.com/conduit-harness/conduit/actions/workflows/build-test.yml/badge.svg)](https://github.com/conduit-harness/conduit/actions/workflows/build-test.yml)
[![license](https://img.shields.io/npm/l/@conduit-harness/conduit.svg)](LICENSE)

Conduit is an agentic coding scheduler. It reads issues from a tracker, creates an isolated git worktree for each, renders a prompt, and hands off to a coding-agent harness (Claude Code, Codex CLI, or Aider) inside that worktree — optionally writing results back to the tracker. Conduit handles dispatch, isolation, and prompting; the harness handles the agent loop.

This implementation follows the [Symphony service specification](https://conduit.tomhofman.dev/reference/spec/) — a language-agnostic spec for issue-to-code-agent dispatch services. Conduit is the reference TypeScript implementation.

## How it works

Conduit runs a continuous loop:

- Poll tracker for issues matching active states and labels (Linear / GitHub / Jira / GitLab / Azure DevOps)
- Per eligible issue:
  - Create isolated git worktree (`.conduit/workspaces/<issue-id>`)
  - Render prompt from `workflow.md` template + issue context
  - Hand off to a coding-agent harness inside the worktree (Claude Code, Codex CLI, or Aider — selected by `agent.kind`)
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
| Azure DevOps | `azuredevops` | `npm install -g @conduit-harness/conduit-tracker-azuredevops` |
| Forgejo / Gitea | `forgejo` | `npm install -g @conduit-harness/conduit-tracker-forgejo` |

### Runners

| Runner | `agent.kind` | Mechanism | Install |
|--------|-------------|-----------|---------|
| Claude CLI  | `claude-cli` | CLI subprocess — requires `claude` (Claude Code) installed | `npm install -g @conduit-harness/conduit-runner-claude-cli` |
| Codex CLI   | `codex-cli`  | CLI subprocess — requires `codex` (OpenAI Codex CLI) installed | `npm install -g @conduit-harness/conduit-runner-codex-cli` |
| Aider       | `aider`      | CLI subprocess — requires `aider` installed | `npm install -g @conduit-harness/conduit-runner-aider` |

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
  kind: claude-cli
  max_concurrent_agents: 1
claude-cli:
  model: claude-sonnet-4-6
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
```

The `claude` (Claude Code) binary must be installed and on `PATH`; it will prompt for credentials on first launch. See the [Claude CLI runner docs](https://conduit.tomhofman.dev/packages/runners/claude-cli/) for details.

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
- [DEVELOPMENT.md](DEVELOPMENT.md) — trunk model, pre-release cadence, patch release flow
- [CHANGELOG.md](CHANGELOG.md) — release history

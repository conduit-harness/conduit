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

### excluded_labels

`excluded_labels` skips any issue that carries one of the listed labels. The defaults (`blocked`, `draft`, `wontfix`) prevent the agent from picking up issues that are on hold, not ready for implementation, or explicitly won't be resolved. Extend the list with labels like `question` or `help-wanted` if you want to exclude informational issues from dispatch.

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

### Start with inline token

Instead of a `.env` file you can inline the credential directly in the start command — useful for one-off runs or CI. The syntax differs by shell.

#### macOS / Linux (bash / zsh)

```bash
GITHUB_TOKEN=$(gh auth token) conduit start --workflow .conduit/workflow.md
```

#### Windows (PowerShell)

```powershell
$env:GITHUB_TOKEN = (gh auth token); conduit start --workflow .conduit/workflow.md
```

#### Windows (cmd)

```cmd
for /f %i in ('gh auth token') do set GITHUB_TOKEN=%i && conduit start --workflow .conduit/workflow.md
```

The same pattern works for any tracker that reads a token from an environment variable — replace `GITHUB_TOKEN=$(gh auth token)` with the appropriate variable and credential helper for your tracker:

| Tracker | Variable | Credential helper |
|---------|----------|-------------------|
| GitHub | `GITHUB_TOKEN` | `gh auth token` |
| Linear | `LINEAR_API_KEY` | *(copy from Linear settings)* |
| GitLab | `GITLAB_TOKEN` | `glab auth token` |
| Jira | `JIRA_API_TOKEN` | *(copy from Atlassian account)* |
| Azure DevOps | `AZURE_DEVOPS_TOKEN` | `az account get-access-token --query accessToken -o tsv` |
| Forgejo | `FORGEJO_TOKEN` | *(copy from Forgejo user settings)* |

> **Tested on:** macOS (zsh), Windows 11 (PowerShell 7). The `cmd` variant follows the standard `for /f` pattern — verify in your environment before scripting.

## Next steps

- [Configuration](/guides/configuration/) — workspace and state paths, secrets, plugins.
- [Tracker writes](/reference/tracker-writes/) — enable comments and state transitions.
- [Non-intrusive use](/reference/non-intrusive-use/) — run against external repos without leaving artifacts.

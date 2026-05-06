---
title: Configuration
description: Where Conduit stores files, how secrets are resolved, and how plugins are loaded.
---

Conduit's configuration lives in a single workflow markdown file: YAML front matter for service config, body for the prompt template. This guide covers the fields most users adjust.

## Workspace and state roots

By default, Conduit writes runtime data under `.conduit/` in the working directory:

```text
.conduit/workflow.md          # workflow file
.conduit/workspaces/          # git worktrees per issue
.conduit/state/               # per-run state JSON
```

Both `workspaces/` and `state/` should be gitignored. `conduit init --gitignore` appends the right rules automatically.

To keep these out of the target repo entirely, point them at absolute paths:

```yaml
workspace:
  root: ~/conduit/workspaces/customer-project
  strategy: git-worktree
  base_ref: main
state:
  root: ~/conduit/state/customer-project
```

See [Non-intrusive use](/reference/non-intrusive-use/) for the external-tool layout.

## Secrets

Conduit only reads secrets from environment variables. Reference them in the workflow as `$VAR_NAME`:

```yaml
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
```

A `.env` file alongside the workflow is loaded automatically; pass `--env PATH` to override. Never commit `.env` files.

## Plugins

Trackers and runners are separate npm packages, loaded by `kind`:

- `tracker.kind: linear` → `@conduit-harness/conduit-tracker-linear`
- `tracker.kind: github` → `@conduit-harness/conduit-tracker-github`
- `tracker.kind: jira` → `@conduit-harness/conduit-tracker-jira`
- `tracker.kind: gitlab` → `@conduit-harness/conduit-tracker-gitlab`
- `tracker.kind: azuredevops` → `@conduit-harness/conduit-tracker-azuredevops`
- `tracker.kind: forgejo` → `@conduit-harness/conduit-tracker-forgejo` (also covers Gitea)
- `agent.kind: claude-cli` → `@conduit-harness/conduit-runner-claude-cli`
- `agent.kind: codex-cli` → `@conduit-harness/conduit-runner-codex-cli`
- `agent.kind: aider` → `@conduit-harness/conduit-runner-aider`

Install only the plugins you need. If a referenced plugin is missing, Conduit prints the install command.

## CLI flags

```text
conduit init     [--workflow PATH] [--repo PATH] [--env PATH] [--fake] [--gitignore]
conduit validate [--workflow PATH] [--repo PATH] [--env PATH] [--preflight]
conduit once     [--workflow PATH] [--repo PATH] [--env PATH] [--dry-run]
conduit start    [--workflow PATH] [--repo PATH] [--env PATH] [--dry-run]
```

`--preflight` requires external credentials to be present. `--dry-run` selects issues without dispatching agents.

---
title: Claude CLI runner
description: Run Claude Code as the coding agent for each issue.
---

`@ausernamedtom/conduit-runner-claude-cli` invokes the `claude` (Claude Code) CLI as a subprocess inside the issue's worktree.

## Install

```bash
npm install -g @ausernamedtom/conduit-runner-claude-cli
```

The `claude` binary must be installed and on `PATH`. See the [Claude Code docs](https://docs.claude.com/en/docs/agents-and-tools/claude-code/overview) for setup.

## Workflow snippet

```yaml
agent:
  kind: claude-cli
  max_concurrent_agents: 1
claude-cli:
  model: claude-sonnet-4-6
```

## Source

[`packages/conduit-runner-claude-cli`](https://github.com/ausernamedtom/conduit/tree/main/packages/conduit-runner-claude-cli)

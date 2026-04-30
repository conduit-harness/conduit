---
title: Codex CLI runner
description: Run the OpenAI Codex CLI as the coding agent for each issue.
---

:::caution[Coming soon]
This package is not yet published. Only the [Claude CLI runner](/packages/runners/claude-cli/) is available in 0.0.1.
:::

`@conduit-harness/conduit-runner-codex-cli` invokes the `codex` (OpenAI Codex CLI) as a subprocess inside the issue's worktree.

## Install

```bash
npm install -g @conduit-harness/conduit-runner-codex-cli
```

The `codex` binary must be installed and on `PATH`.

## Workflow snippet

```yaml
agent:
  kind: codex-cli
  max_concurrent_agents: 1
codex-cli:
  model: gpt-5
```

## Source

[`packages/conduit-runner-codex-cli`](https://github.com/conduit-harness/conduit/tree/main/packages/conduit-runner-codex-cli)

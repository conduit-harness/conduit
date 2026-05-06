---
title: Codex CLI runner
description: Run the OpenAI Codex CLI as the coding agent for each issue.
---

:::caution[Coming soon]
This package is published on npm but has received limited testing. For production workloads, prefer the [Claude CLI runner](/packages/runners/claude-cli/).
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

## Token usage

The runner automatically enables the `--json` flag in non-interactive mode (`codex exec`) to capture token usage metrics. These are surfaced in the success comment when the tracker supports it.

If you specify a custom `command`, the runner will append `--json` if not already present.

## Source

[`packages/conduit-runner-codex-cli`](https://github.com/conduit-harness/conduit/tree/main/packages/conduit-runner-codex-cli)

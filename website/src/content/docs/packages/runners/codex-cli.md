---
title: Codex CLI runner
description: Run the OpenAI Codex CLI as the coding agent for each issue.
---

`@conduit-harness/conduit-runner-codex-cli` invokes the `codex` (OpenAI Codex CLI) as a subprocess inside the issue's worktree.

## Install

:::caution
The `@conduit-harness` packages on npm are **not yet published**. The install command below will fail until the initial release lands.
:::

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

[`packages/conduit-runner-codex-cli`](https://github.com/ausernamedtom/conduit/tree/main/packages/conduit-runner-codex-cli)

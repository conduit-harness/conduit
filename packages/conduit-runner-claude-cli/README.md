# @conduit-harness/conduit-runner-claude-cli

Conduit runner plugin that invokes [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview) (`claude` CLI) as a subprocess inside each issue's git worktree.

> **Note:** The `@conduit-harness` packages are not yet published. See [CONTRIBUTING.md](https://github.com/conduit-harness/conduit/blob/main/CONTRIBUTING.md) to run from source.

## Prerequisites

The `claude` binary must be installed and on `PATH`. See the [Claude Code installation guide](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview) for setup instructions.

## Install

```bash
npm install -g @conduit-harness/conduit-runner-claude-cli
```

Requires [`@conduit-harness/conduit`](https://www.npmjs.com/package/@conduit-harness/conduit) (>= 0.0.1) as a peer dependency.

## Workflow snippet

```yaml
agent:
  kind: claude-cli
  max_concurrent_agents: 1
claude-cli:
  model: claude-sonnet-4-6
```

## Requirements

Node.js >= 24.0.0

## Documentation

Full configuration reference: **https://conduit.tomhofman.dev/packages/runners/claude-cli/**

- [Configuration](https://conduit.tomhofman.dev/guides/configuration/)
- [Non-intrusive use](https://conduit.tomhofman.dev/reference/non-intrusive-use/)

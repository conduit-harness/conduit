# @conduit-harness/conduit-runner-codex-cli

Conduit runner plugin that invokes the [OpenAI Codex CLI](https://github.com/openai/codex) (`codex`) as a subprocess inside each issue's git worktree.

> **Note:** The `@conduit-harness` packages are not yet published. See [CONTRIBUTING.md](https://github.com/conduit-harness/conduit/blob/main/CONTRIBUTING.md) to run from source.

## Prerequisites

The `codex` binary must be installed and on `PATH`. See the [Codex CLI repository](https://github.com/openai/codex) for setup instructions.

## Install

```bash
npm install -g @conduit-harness/conduit-runner-codex-cli
```

Requires [`@conduit-harness/conduit`](https://www.npmjs.com/package/@conduit-harness/conduit) (>= 0.0.1) as a peer dependency.

## Workflow snippet

```yaml
agent:
  kind: codex-cli
  max_concurrent_agents: 1
codex-cli:
  model: gpt-5
```

## Requirements

Node.js >= 24.0.0

## Documentation

Full configuration reference: **https://conduit.tomhofman.dev/packages/runners/codex-cli/**

- [Configuration](https://conduit.tomhofman.dev/guides/configuration/)
- [Non-intrusive use](https://conduit.tomhofman.dev/reference/non-intrusive-use/)

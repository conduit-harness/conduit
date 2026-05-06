# @conduit-harness/conduit

Conduit is an agentic coding scheduler. It reads issues from a tracker, creates an isolated git worktree for each, renders a prompt, runs a coding agent, and optionally writes results back to the tracker.

> **Note:** The `@conduit-harness` packages are not yet published. To try Conduit today, clone the repo and run `pnpm install` from the root. See [CONTRIBUTING.md](https://github.com/conduit-harness/conduit/blob/main/CONTRIBUTING.md).

## Install

```bash
npm install -g @conduit-harness/conduit
```

Conduit uses a plugin model — install a tracker and a runner alongside the core:

```bash
# example: GitHub tracker + Claude Code runner
npm install -g @conduit-harness/conduit-tracker-github
npm install -g @conduit-harness/conduit-runner-claude-cli
```

## Quick start

```bash
conduit init     --workflow .conduit/workflow.md
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

`--dry-run` selects issues without dispatching agents. `--preflight` verifies external credentials are reachable.

## Requirements

Node.js >= 24.0.0

## Documentation

Full docs, guides, and the configuration reference: **https://conduit.tomhofman.dev/**

- [Quickstart](https://conduit.tomhofman.dev/guides/quickstart/)
- [Configuration](https://conduit.tomhofman.dev/guides/configuration/)
- [Tracker writes](https://conduit.tomhofman.dev/reference/tracker-writes/)
- [Non-intrusive use](https://conduit.tomhofman.dev/reference/non-intrusive-use/)
- [Status](https://conduit.tomhofman.dev/reference/status/)

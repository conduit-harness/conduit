---
title: "@ausernamedtom/conduit"
description: Core orchestrator package — CLI, workflow parser, runner harness, and plugin interfaces.
---

The core package provides the `conduit` CLI, the workflow parser, the orchestration loop, and the `IssueTracker` and `AgentRunner` interfaces that plugins implement.

## Install

```bash
npm install -g @ausernamedtom/conduit
```

## What it provides

- The `conduit` CLI (`init`, `validate`, `once`, `start`, `version`).
- Workflow front-matter parser and prompt renderer.
- Orchestration loop: tracker poll → workspace creation → agent dispatch → optional tracker write-back.
- Plugin interfaces:
  - `IssueTracker` — implemented by tracker plugins (`BaseTracker` provides shared behavior).
  - `AgentRunner` — implemented by runner plugins.

## Plugin authors

To build a custom tracker or runner, implement the interface from this package and publish it as `conduit-tracker-<vendor>` or `conduit-runner-<vendor>-<mechanism>`. See the [API reference](/conduit/api/) for the exact types.

## Source

[`packages/conduit`](https://github.com/ausernamedtom/conduit/tree/main/packages/conduit) on GitHub.

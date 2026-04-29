---
title: Status
description: Current capabilities, limitations, and spec coverage.
---

Conduit is an early implementation of the [Symphony specification](/reference/spec/). It is functional for controlled local runs but several production concerns are intentionally simple:

## Current capabilities

- Linear, GitHub Issues, Jira, and GitLab issue tracking (via separate plugin packages)
- Team-scoped or project-scoped issue selection
- Optional tracker comments and state transitions per lifecycle event
- Label and state filtering
- Codex CLI, Claude Code CLI, and OpenAI-compatible API agent runners (via separate plugin packages)
- Fake tracker and fake agent modes for local testing without credentials
- Git worktree-based isolated workspaces
- JSON local state
- Stall and turn timeouts for agent processes
- `conduit init`, `validate`, `once`, `start` CLI commands

## Known limitations

- State is stored as local JSON files, not a database. This is sufficient for single-machine use but not horizontally scalable.
- Recovery and reconciliation after unexpected restarts is limited.
- No HTTP status dashboard or remote observability.
- Retry/backoff behavior is basic.
- The orchestrator is single-node; no distributed coordination.

## Plugin support

Trackers and agent runners are loaded as npm packages at runtime. If a required plugin is missing, Conduit reports a clear install instruction. See the [packages section](/packages/) for the plugin list.

## Spec coverage

See the [Symphony specification](/reference/spec/) for the full reference. Notable gaps between spec and current implementation are noted in comments in the source.

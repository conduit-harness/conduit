---
title: Linear tracker
description: Read Linear issues and optionally post comments or transition states.
---

`@conduit-harness/conduit-tracker-linear` reads issues from a Linear team and optionally writes back via comments and named state transitions.

## Install

```bash
npm install -g @conduit-harness/conduit-tracker-linear
```

## Workflow snippet

```yaml
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  team_key: YOUR_TEAM_KEY
  active_states: [Todo, Ready]
  required_labels: [agentic]
  excluded_labels: [blocked]
  writes:
    enabled: false
```

## Notes

State names must match exactly what is configured in your Linear team workflow (e.g. `Todo`, `In Progress`, `In Review`). Failed tracker writes do not fail the agent run unless strict mode is configured. See [Tracker writes](/reference/tracker-writes/).

## Source

[`packages/conduit-tracker-linear`](https://github.com/ausernamedtom/conduit/tree/main/packages/conduit-tracker-linear)

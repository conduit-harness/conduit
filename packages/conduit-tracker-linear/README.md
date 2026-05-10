# @conduit-harness/conduit-tracker-linear

Conduit tracker plugin for [Linear](https://linear.app). Reads issues from a Linear team and optionally writes back via comments and state transitions.

> **Note:** The `@conduit-harness` packages are not yet published. See [CONTRIBUTING.md](https://github.com/conduit-harness/conduit/blob/main/CONTRIBUTING.md) to run from source.

## Install

```bash
npm install -g @conduit-harness/conduit-tracker-linear
```

Requires [`@conduit-harness/conduit`](https://www.npmjs.com/package/@conduit-harness/conduit) (>= 0.0.1) as a peer dependency.

## Environment variables

| Variable | Description |
|----------|-------------|
| `LINEAR_API_KEY` | Linear API key — create one at **Linear → Settings → API** |

## Workflow snippet

```yaml
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  team_key: YOUR_TEAM_KEY
  active_states: [Todo, Ready]
  required_labels: [agentic]
  excluded_labels: [blocked, draft, wontfix]
  writes:
    enabled: false
```

State names must match exactly what is configured in your Linear team workflow (e.g. `Todo`, `In Progress`, `In Review`). Failed tracker writes do not fail the agent run.

## Requirements

Node.js >= 24.0.0

## Documentation

Full configuration reference: **https://conduit.tomhofman.dev/packages/trackers/linear/**

- [Tracker writes](https://conduit.tomhofman.dev/reference/tracker-writes/) — configuring comments and state transitions
- [Configuration](https://conduit.tomhofman.dev/guides/configuration/)

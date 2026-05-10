# @conduit-harness/conduit-tracker-github

Conduit tracker plugin for [GitHub Issues](https://docs.github.com/en/issues). Reads issues from a GitHub repository and optionally writes back via comments and open/closed transitions.

> **Note:** The `@conduit-harness` packages are not yet published. See [CONTRIBUTING.md](https://github.com/conduit-harness/conduit/blob/main/CONTRIBUTING.md) to run from source.

## Install

```bash
npm install -g @conduit-harness/conduit-tracker-github
```

Requires [`@conduit-harness/conduit`](https://www.npmjs.com/package/@conduit-harness/conduit) (>= 0.0.1) as a peer dependency.

## Environment variables

| Variable | Description |
|----------|-------------|
| `GITHUB_TOKEN` | Fine-grained PAT with **Issues: Read & Write** on the target repo — create at **GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens** |

Classic PATs are not recommended — they grant broad repository-wide access.

## Workflow snippet

```yaml
tracker:
  kind: github
  api_key: $GITHUB_TOKEN
  repo: owner/name
  active_states: [open]
  required_labels: [agentic]
  excluded_labels: [blocked, draft, wontfix]
  writes:
    enabled: false
```

GitHub Issues only supports two states: `open` and `closed`. A `transition_to` value that maps to a terminal state closes the issue; all others reopen it.

## Requirements

Node.js >= 24.0.0

## Documentation

Full configuration reference: **https://conduit.tomhofman.dev/packages/trackers/github/**

- [Tracker writes](https://conduit.tomhofman.dev/reference/tracker-writes/) — configuring comments and state transitions
- [Configuration](https://conduit.tomhofman.dev/guides/configuration/)

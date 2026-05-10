# @conduit-harness/conduit-tracker-gitlab

Conduit tracker plugin for [GitLab](https://gitlab.com). Reads issues from a GitLab project and optionally writes back via comments and opened/closed transitions.

> **Note:** The `@conduit-harness` packages are not yet published. See [CONTRIBUTING.md](https://github.com/conduit-harness/conduit/blob/main/CONTRIBUTING.md) to run from source.

## Install

```bash
npm install -g @conduit-harness/conduit-tracker-gitlab
```

Requires [`@conduit-harness/conduit`](https://www.npmjs.com/package/@conduit-harness/conduit) (>= 0.0.1) as a peer dependency.

## Environment variables

| Variable | Description |
|----------|-------------|
| `GITLAB_TOKEN` | GitLab personal access token with `api` scope — create at **GitLab → Edit profile → Access tokens** |

## Workflow snippet

```yaml
tracker:
  kind: gitlab
  api_key: $GITLAB_TOKEN
  project_id: 12345
  active_states: [opened]
  required_labels: [agentic]
  excluded_labels: [blocked, draft, wontfix]
  writes:
    enabled: false
```

GitLab issues support `opened` and `closed` states. Use the appropriate value for `transition_to`.

## Requirements

Node.js >= 24.0.0

## Documentation

Full configuration reference: **https://conduit.tomhofman.dev/packages/trackers/gitlab/**

- [Tracker writes](https://conduit.tomhofman.dev/reference/tracker-writes/) — configuring comments and state transitions
- [Configuration](https://conduit.tomhofman.dev/guides/configuration/)

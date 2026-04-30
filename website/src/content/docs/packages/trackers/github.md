---
title: GitHub tracker
description: Read GitHub Issues and optionally post comments or close/reopen issues.
---

`@conduit-harness/conduit-tracker-github` reads issues from a GitHub repository and optionally writes back via comments and open/closed transitions.

## Install

:::caution
The `@conduit-harness` packages on npm are **not yet published**. The install command below will fail until the initial release lands.
:::

```bash
npm install -g @conduit-harness/conduit-tracker-github
```

## Workflow snippet

```yaml
tracker:
  kind: github
  api_key: $GITHUB_TOKEN
  repo: owner/name
  active_states: [open]
  required_labels: [agentic]
  excluded_labels: [blocked]
  writes:
    enabled: false
```

## Notes

GitHub Issues only supports two states: `open` and `closed`. `transition_to` values that map to a terminal state close the issue; all others reopen it. See [Tracker writes](/reference/tracker-writes/).

## Source

[`packages/conduit-tracker-github`](https://github.com/ausernamedtom/conduit/tree/main/packages/conduit-tracker-github)

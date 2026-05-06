---
title: Forgejo / Gitea tracker
description: Read Forgejo or Gitea issues and optionally post comments or close/reopen issues.
---

:::caution[Coming soon]
This package is not yet published. Only the [GitHub tracker](/packages/trackers/github/) is available in 0.0.1.
:::

`@conduit-harness/conduit-tracker-forgejo` reads issues from a self-hosted Forgejo or Gitea repository and optionally writes back via comments and open/closed transitions. The two forges share the same REST API surface, so a single plugin works for both.

## Install

:::caution
The `@conduit-harness` packages on npm are **not yet published**. The install command below will fail until the initial release lands.
:::

```bash
npm install -g @conduit-harness/conduit-tracker-forgejo
```

## Authentication

Set a `FORGEJO_TOKEN` (or `GITEA_TOKEN`) environment variable and reference it as `api_key: $FORGEJO_TOKEN` in your workflow.

Create an access token under **User Settings → Applications → Generate New Token** with the **read:issue** and **write:issue** scopes. Limit the scope to the minimum your workflow needs — read-only is enough if `writes.enabled` is `false`.

## Workflow snippet

```yaml
tracker:
  kind: forgejo
  base_url: https://forgejo.example.com
  api_key: $FORGEJO_TOKEN
  owner: my-org
  repo: my-repo
  active_states: [open]
  terminal_states: [closed]
  required_labels: [agentic]
  excluded_labels: [blocked]
  writes:
    enabled: false
```

## Notes

Forgejo and Gitea issues support two states: `open` and `closed`. `transition_to` values that map to a terminal state close the issue; all others reopen it. See [Tracker writes](/reference/tracker-writes/).

`base_url` is required and should point at the root of your Forgejo or Gitea instance (the plugin appends `/api/v1` itself). Pull requests are filtered out of issue listings automatically.

## Source

[`packages/conduit-tracker-forgejo`](https://github.com/conduit-harness/conduit/tree/main/packages/conduit-tracker-forgejo)

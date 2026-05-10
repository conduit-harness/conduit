---
title: Azure DevOps tracker
description: Read Azure DevOps work items and optionally post comments or transition states.
---

:::caution[Coming soon]
This package is not yet published. Only the [GitHub tracker](/packages/trackers/github/) is available in 0.0.1.
:::


`@conduit-harness/conduit-tracker-azuredevops` reads work items from an Azure DevOps project and optionally writes back via comments and state transitions.

## Install

:::caution
The `@conduit-harness` packages on npm are **not yet published**. The install command below will fail until the initial release lands.
:::

```bash
npm install -g @conduit-harness/conduit-tracker-azuredevops
```

## Authentication

Set an `AZURE_DEVOPS_TOKEN` environment variable and reference it as `api_key: $AZURE_DEVOPS_TOKEN` in your workflow.

Use a **Personal Access Token** with the **Work Items: Read & write** scope, scoped to the target organization. Create one at **Azure DevOps → User settings → Personal access tokens**.

## Workflow snippet

```yaml
tracker:
  kind: azuredevops
  organization: my-org
  project: my-project
  api_key: $AZURE_DEVOPS_TOKEN
  active_states: [Active, New]
  terminal_states: [Closed, Resolved, Removed]
  required_labels: [agentic]
  excluded_labels: [blocked, draft, wontfix]
  writes:
    enabled: false
```

For Azure DevOps Server (on-prem), set `base_url` to the collection root, e.g. `base_url: https://dev.example.com/tfs`.

## Notes

Work item state transitions must match the names configured in your project's process template (e.g. `Active`, `Resolved`, `Closed`). Tags on a work item map to Conduit labels — they are normalized to lowercase. See [Tracker writes](/reference/tracker-writes/).

## Source

[`packages/conduit-tracker-azuredevops`](https://github.com/conduit-harness/conduit/tree/main/packages/conduit-tracker-azuredevops)

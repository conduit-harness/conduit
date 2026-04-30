---
title: Jira tracker
description: Read Jira issues and optionally post comments or transition states.
---

`@conduit-harness/conduit-tracker-jira` reads issues from a Jira project and optionally writes back via comments and workflow transitions.

## Install

:::caution
The `@conduit-harness` packages on npm are **not yet published**. The install command below will fail until the initial release lands.
:::

```bash
npm install -g @conduit-harness/conduit-tracker-jira
```

## Workflow snippet

```yaml
tracker:
  kind: jira
  api_key: $JIRA_API_TOKEN
  email: $JIRA_EMAIL
  base_url: https://your-org.atlassian.net
  project_key: PROJ
  active_states: [To Do, In Progress]
  required_labels: [agentic]
  excluded_labels: [blocked]
  writes:
    enabled: false
```

## Notes

Jira transitions are matched by name against the available transitions for the issue. The transition must exist in the issue's current workflow step. See [Tracker writes](/reference/tracker-writes/).

## Source

[`packages/conduit-tracker-jira`](https://github.com/ausernamedtom/conduit/tree/main/packages/conduit-tracker-jira)

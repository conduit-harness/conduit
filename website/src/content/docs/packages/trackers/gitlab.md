---
title: GitLab tracker
description: Read GitLab issues and optionally post comments or close/reopen issues.
---

:::caution[Coming soon]
This package is published on npm but has received limited testing. For production workloads, prefer the [GitHub tracker](/packages/trackers/github/).
:::

`@conduit-harness/conduit-tracker-gitlab` reads issues from a GitLab project and optionally writes back via comments and opened/closed transitions.

## Install

```bash
npm install -g @conduit-harness/conduit-tracker-gitlab
```

## Workflow snippet

```yaml
tracker:
  kind: gitlab
  api_key: $GITLAB_TOKEN
  project_id: 12345
  active_states: [opened]
  required_labels: [agentic]
  excluded_labels: [blocked]
  writes:
    enabled: false
```

## Notes

GitLab issues support `opened` and `closed` states. Use the appropriate value for `transition_to`. See [Tracker writes](/reference/tracker-writes/).

## Source

[`packages/conduit-tracker-gitlab`](https://github.com/conduit-harness/conduit/tree/main/packages/conduit-tracker-gitlab)

---
title: GitLab tracker
description: Read GitLab issues and optionally post comments or close/reopen issues.
---

`@ausernamedtom/conduit-tracker-gitlab` reads issues from a GitLab project and optionally writes back via comments and opened/closed transitions.

## Install

```bash
npm install -g @ausernamedtom/conduit-tracker-gitlab
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

GitLab issues support `opened` and `closed` states. Use the appropriate value for `transition_to`. See [Tracker writes](/conduit/reference/tracker-writes/).

## Source

[`packages/conduit-tracker-gitlab`](https://github.com/ausernamedtom/conduit/tree/main/packages/conduit-tracker-gitlab)

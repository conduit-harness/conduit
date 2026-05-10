---
title: GitHub tracker
description: Read GitHub Issues and optionally post comments or close/reopen issues.
---

`@conduit-harness/conduit-tracker-github` reads issues from a GitHub repository and optionally writes back via comments and open/closed transitions.

## Install

```bash
npm install -g @conduit-harness/conduit-tracker-github
```

## Authentication

Set a `GITHUB_TOKEN` environment variable and reference it as `api_key: $GITHUB_TOKEN` in your workflow.

Use a **fine-grained personal access token** scoped to the target repository with **Issues: Read & Write** permission. This is the minimum required scope and limits the blast radius if the token is ever leaked.

Create one at **GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens**.

Classic PATs grant broad, repository-wide access and are not recommended.

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

## Notes

GitHub Issues only supports two states: `open` and `closed`. `transition_to` values that map to a terminal state close the issue; all others reopen it. See [Tracker writes](/reference/tracker-writes/).

## Source

[`packages/conduit-tracker-github`](https://github.com/conduit-harness/conduit/tree/main/packages/conduit-tracker-github)

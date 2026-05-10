# @conduit-harness/conduit-tracker-jira

Conduit tracker plugin for [Jira](https://www.atlassian.com/software/jira). Reads issues from a Jira project and optionally writes back via comments and workflow transitions.

> **Note:** The `@conduit-harness` packages are not yet published. See [CONTRIBUTING.md](https://github.com/conduit-harness/conduit/blob/main/CONTRIBUTING.md) to run from source.

## Install

```bash
npm install -g @conduit-harness/conduit-tracker-jira
```

Requires [`@conduit-harness/conduit`](https://www.npmjs.com/package/@conduit-harness/conduit) (>= 0.0.1) as a peer dependency.

## Environment variables

| Variable | Description |
|----------|-------------|
| `JIRA_API_TOKEN` | Jira API token — create at **Atlassian account → Security → API tokens** |
| `JIRA_EMAIL` | Email address associated with your Atlassian account |

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
  excluded_labels: [blocked, draft, wontfix]
  writes:
    enabled: false
```

Jira transitions are matched by name against the available transitions for the issue's current workflow step. The transition must exist at the issue's current step.

## Requirements

Node.js >= 24.0.0

## Documentation

Full configuration reference: **https://conduit.tomhofman.dev/packages/trackers/jira/**

- [Tracker writes](https://conduit.tomhofman.dev/reference/tracker-writes/) — configuring comments and state transitions
- [Configuration](https://conduit.tomhofman.dev/guides/configuration/)

---
title: Tracker writes
description: Configure optional comments and state transitions during agent lifecycle events.
---

All tracker plugins support an optional writes configuration that controls whether Conduit posts comments or transitions issue state during a run.

By default, writes are disabled:

```yaml
tracker:
  writes:
    enabled: false
```

When enabled, each lifecycle event is configured independently:

```yaml
tracker:
  writes:
    enabled: true
    on_start:
      comment: true
      transition_to: In Progress
    on_success:
      comment: true
      transition_to: In Review
    on_failure:
      comment: true
      transition_to: Todo
    on_terminal_failure:
      comment: true
      transition_to: Todo
```

## Lifecycle events

| Event | When it fires |
|-------|--------------|
| `on_start` | When an agent run begins |
| `on_success` | When the agent exits with code 0 |
| `on_failure` | When the agent exits with a non-zero code or times out |
| `on_terminal_failure` | After all retries are exhausted and the issue is marked terminal |

## Per-event fields

| Field | Type | Description |
|-------|------|-------------|
| `comment` | boolean | Whether to post a comment with the agent output |
| `transition_to` | string | State name to transition the issue to |

Both fields are optional. Setting `comment: false` and omitting `transition_to` is equivalent to omitting the event block entirely.

## Tracker-specific notes

### Linear

State names must match exactly what is configured in the Linear team workflow (e.g. `Todo`, `In Progress`, `In Review`). Failed tracker writes do not fail the agent run unless strict mode is configured.

### GitHub Issues

GitHub Issues only supports two states: `open` and `closed`. `transition_to` values that map to a terminal state close the issue; all others reopen it.

### GitLab

GitLab issues support `opened` and `closed` states. Use the appropriate value for `transition_to`.

### Jira

Jira transitions are matched by name against the available transitions for the issue. The transition must exist in the issue's current workflow step.

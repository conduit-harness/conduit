---
title: Claude CLI runner
description: Run Claude Code as the coding agent for each issue.
---

`@conduit-harness/conduit-runner-claude-cli` invokes the `claude` (Claude Code) CLI as a subprocess inside the issue's worktree.

## Install

:::caution
The `@conduit-harness` packages on npm are **not yet published**. The install command below will fail until the initial release lands.
:::

```bash
npm install -g @conduit-harness/conduit-runner-claude-cli
```

The `claude` binary must be installed and on `PATH`. See the [Claude Code docs](https://docs.claude.com/en/docs/agents-and-tools/claude-code/overview) for setup.

## Workflow snippet

```yaml
agent:
  kind: claude-cli
  max_concurrent_agents: 1
claude-cli:
  model: claude-sonnet-4-6
```

## Output

The runner pipes the prompt to `claude --dangerously-skip-permissions -p -`. In `-p` (print) mode with the default `--output-format text`, Claude Code prints only the final assistant message to stdout and writes nothing to stderr — no tool-use traces (Bash/Edit/Read/Write), no streaming partials, no auth/model banners. The captured `output` posted as the tracker's success comment is therefore the model's final summary, which is what you want for a public issue comment.

If you override the `command` setting to add `--output-format json` or `--output-format stream-json`, the comment body will contain the raw JSON / streaming envelope instead. Stick with the default unless you have a downstream parser that expects it.

## Source

[`packages/conduit-runner-claude-cli`](https://github.com/conduit-harness/conduit/tree/main/packages/conduit-runner-claude-cli)

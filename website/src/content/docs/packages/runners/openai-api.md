---
title: OpenAI API runner (deprecated)
description: Deprecated runner that calls a chat-completions endpoint directly. Use a CLI runner that wraps a real coding-agent harness instead.
---

:::danger[Deprecated]
This runner calls a chat-completions endpoint directly — there is no agent loop, no tool execution, no context management, no sandboxing. In Conduit's terms it does not wrap an [agentic harness](https://github.com/conduit-harness/conduit/blob/main/docs/UBIQUITOUS_LANGUAGE.md#harness-agentic-harness), and so it does not conform to the runner contract.

Use one of the CLI runners instead, each of which adapts a real coding-agent harness:

- [Claude CLI runner](/packages/runners/claude-cli/) — wraps Claude Code
- [Codex CLI runner](/packages/runners/codex-cli/) — wraps the OpenAI Codex CLI
- [Aider runner](/packages/runners/aider/) — wraps Aider

The Conduit CLI emits a runtime warning when `agent.kind: openai-api` is configured.
:::

`@conduit-harness/conduit-runner-openai-api` calls an OpenAI-compatible chat completions endpoint over HTTP. Works with OpenAI, Azure OpenAI, GitHub Models, and other compatible providers.

## Install

```bash
npm install -g @conduit-harness/conduit-runner-openai-api
```

## Workflow snippet

```yaml
agent:
  kind: openai-api
  max_concurrent_agents: 1
openai-api:
  model: gpt-4o
  base_url: https://api.openai.com/v1
```

`OPENAI_API_KEY` (or the equivalent for your provider) must be set in the environment.

## Source

[`packages/conduit-runner-openai-api`](https://github.com/conduit-harness/conduit/tree/main/packages/conduit-runner-openai-api)

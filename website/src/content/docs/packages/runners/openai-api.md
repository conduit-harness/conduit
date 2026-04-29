---
title: OpenAI API runner
description: Drive any OpenAI-compatible chat completions endpoint as the coding agent.
---

`@ausernamedtom/conduit-runner-openai-api` calls an OpenAI-compatible chat completions endpoint over HTTP. Works with OpenAI, Azure OpenAI, GitHub Models, and other compatible providers.

## Install

```bash
npm install -g @ausernamedtom/conduit-runner-openai-api
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

[`packages/conduit-runner-openai-api`](https://github.com/ausernamedtom/conduit/tree/main/packages/conduit-runner-openai-api)

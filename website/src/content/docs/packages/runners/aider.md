---
title: Aider runner
description: Run Aider as the coding agent — works fully self-hosted with Ollama.
---

`@conduit-harness/conduit-runner-aider` invokes [aider](https://aider.chat) as a subprocess inside the issue's worktree. Aider is an open-source agentic coding tool that uses search/replace diffs, which keeps it usable with smaller local models — making this runner the recommended path for fully self-hosted setups against [Ollama](https://ollama.com).

## Install

```bash
npm install -g @conduit-harness/conduit-runner-aider
```

This runner has three external dependencies you'll also need on `PATH`:

### 1. aider

The one-line installer (Mac & Linux) is the simplest route:

```bash
curl -LsSf https://aider.chat/install.sh | sh
```

Windows (PowerShell):

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://aider.chat/install.ps1 | iex"
```

Other options (uv, pipx, manual pip) are documented at [aider.chat/docs/install.html](https://aider.chat/docs/install.html). All of them produce an `aider` binary on your `PATH`.

### 2. Ollama

Download and install from [ollama.com/download](https://ollama.com/download). After installation, Ollama runs as a background service and exposes an HTTP API at `http://localhost:11434`.

### 3. A coding model

Pull a model into Ollama. `qwen2.5-coder` is a good default for this runner because it works well with aider's search/replace edit format:

```bash
ollama pull qwen2.5-coder
```

For larger machines, `qwen2.5-coder:14b` or `qwen2.5-coder:32b` will produce better edits at the cost of more VRAM. The [setup wizard](/guides/wizard/) recommends a model based on the hardware you select.

## Workflow snippet

```yaml
agent:
  kind: aider
  max_concurrent_agents: 1
aider:
  model: ollama_chat/qwen2.5-coder
  ollama_endpoint: http://localhost:11434
```

The runner writes the prompt to a temp file in the worktree and passes it via `--message-file`, so each issue dispatch is a single non-interactive aider session.

## Configuration options

All under the `aider:` key in the workflow:

| Option | Default | Description |
| --- | --- | --- |
| `model` | `ollama_chat/qwen2.5-coder:14b` | Model identifier passed to aider via `--model`. Use the `ollama_chat/<name>` prefix for Ollama-served models. |
| `ollama_endpoint` | `http://localhost:11434` | Set as `OLLAMA_API_BASE` in aider's environment. |
| `command` | `aider --yes-always --no-pretty --no-stream --no-show-model-warnings --no-detect-urls --no-check-update` | Override only if you need different aider flags. The runner appends `--model` and `--message-file` automatically. |
| `extra_args` | _(empty)_ | Extra arguments appended after the auto-added flags. Useful for `--no-git`, `--no-auto-commits`, etc. |
| `api_key` | _(none)_ | Optional. Set as `OPENAI_API_KEY` in aider's environment for non-Ollama backends. |
| `turn_timeout_ms` | `3600000` (1 hour) | Hard cap on the whole aider run. |
| `stall_timeout_ms` | `300000` (5 min) | Kill aider if it produces no output for this long. |

## Source

[`packages/conduit-runner-aider`](https://github.com/conduit-harness/conduit/tree/main/packages/conduit-runner-aider)

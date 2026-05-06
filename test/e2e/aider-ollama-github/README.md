# Docker harness: Ollama + mock GitHub + aider

A self-contained `docker compose` stack that exercises Conduit's full
poll → worktree → LLM → write-back loop without any external dependencies:

- **`ollama`** — runs `ollama/ollama` and serves an OpenAI-compatible
  `/v1/chat/completions` endpoint.
- **`mock-github`** — tiny Node `http` server (no deps) that implements only
  the four GitHub REST endpoints the tracker hits today.
- **`conduit`** — the Conduit CLI built from this monorepo's source, with the
  `conduit-tracker-github` and `conduit-runner-aider` plugins installed
  alongside it via `npm install -g`, the same way they install in production.
- **`aider`** — installed in the Docker image, provides code-editing AI agent
  backed by the local Ollama instance.

## Run it

To run it manually (locally or in a sandbox with Docker available):

```bash
cd test/e2e/aider-ollama-github
cp .env.example .env
docker compose build
docker compose up --abort-on-container-exit --exit-code-from conduit
```

The `conduit` service runs `conduit once` and exits; the `--exit-code-from`
flag makes the whole stack stop with conduit's exit code. First boot pulls
the Ollama model (~400 MB for `qwen2.5-coder:0.5b`); subsequent runs reuse the
`ollama-models` named volume.

## What to look for

In **conduit logs**:

```
dispatch candidates selected   fetched=1 dispatchable=1
agent starting                 issue=#1 attempt=1
agent finished                 issue=#1 status=succeeded
```

In **mock-github logs**, four hits in this order:

```
GET   /repos/testorg/testrepo/issues?state=open&...   # candidate fetch
POST  /repos/testorg/testrepo/issues/1/comments       # on_start
POST  /repos/testorg/testrepo/issues/1/comments       # on_success (LLM output)
PATCH /repos/testorg/testrepo/issues/1                # state -> closed
```

## Inspect the worktree

```bash
docker compose run --rm --entrypoint sh conduit \
    -c 'ls -R /repo/.conduit/workspaces/'
```

## Pick a different model

Edit `.env`:

```
OLLAMA_MODEL=llama3.2:1b
```

Anything in the [Ollama library](https://ollama.com/library) works; pick small
models — this harness is for plumbing, not LLM quality.

## Caveats

- The `aider` runner edits files in the worktree when the LLM responds.
  For this smoke test, it will create/edit files based on the prompt.
  Verify the worktree changes by inspecting `.conduit/workspaces/`.
- The mock GitHub server implements exactly the four endpoints the tracker
  uses today (`packages/conduit-tracker-github/src/index.ts`). If the tracker
  grows, the mock needs updating in lockstep.
- This harness depends on the `base_url` option on the GitHub tracker, which
  defaults to `https://api.github.com` and points at `http://mock-github:3000`
  here.

# Test: Aider + Forgejo

Validates the `aider` runner against a self-hosted Forgejo issue tracker, with
automatic branch push and Forgejo pull request creation.

Target repository: https://forgejo.home.tomhofman.nl/paddoswam/hello-world

## What happens

1. Conduit polls Forgejo Issues for open issues labelled `agentic`
2. Creates a git worktree on branch `conduit/<issue-number>/<attempt>`
3. Invokes Aider with the issue description; Aider edits files and auto-commits
4. After Aider exits, `extra_args` chains `git push` + Forgejo API PR creation
5. Conduit posts the result as a comment on the Forgejo issue

Push and PR creation are handled automatically via the `extra_args` shell chain —
no separate step required.

## Prerequisites

- Node.js >=24
- `aider` installed (`pip install aider-chat` or the standalone installer)
- [Ollama](https://ollama.com) running locally with the model pulled:
  ```
  ollama pull qwen2.5-coder:14b
  ```
- A Forgejo personal access token with Issues: Read & Write on `paddoswam/hello-world`
- `curl` on PATH
- At least one open issue in the repo labelled `agentic`
- Packages built and packed (see step 1)

## Steps

### 1. Pack local packages (once per build)

From the repo root:

```powershell
pwsh test/pack-local.ps1
```

### 2. Install dependencies

```powershell
cd test/aider-forgejo
npm install
```

### 3. Configure environment

```powershell
Copy-Item .env.example .env
```

Edit `.env` and set:
- `FORGEJO_TOKEN` — Forgejo personal access token
  (https://forgejo.home.tomhofman.nl/user/settings/applications)

### 4. Clone the target repository

```powershell
git clone https://forgejo.home.tomhofman.nl/paddoswam/hello-world repo
```

### 5. Validate configuration

```powershell
npm run validate
```

Expected: `workflow valid` with tracker=forgejo, agent=aider.

### 6. Dry-run

```powershell
npx conduit once --repo ./repo --workflow .conduit/workflow.md --env .env --dry-run
```

Expected: issues fetched and logged, nothing dispatched.

### 7. Single real cycle

```powershell
npm run once
```

Expected flow:
- Aider implements the minimal change and auto-commits
- `git push -u origin HEAD` (chained after aider exits 0)
- Forgejo PR created via API (curl) — PR title is the branch name
- Conduit comments on the Forgejo issue

### 8. Polling loop

```powershell
npm run start
```

Stop with Ctrl+C.

## Adjusting the model

Edit `.conduit/workflow.md` and change `aider.model` and `aider.ollama_endpoint`.
Any [Aider-compatible model](https://aider.chat/docs/llms.html) works; set
`aider.api_key` if the model needs an API key instead of Ollama.

# Test: Codex CLI + GitHub

Validates the `codex-cli` runner against GitHub Issues, with automatic branch push
and pull request creation.

Target repository: https://github.com/conduit-harness/hello-world

## What happens

1. Conduit polls GitHub Issues for open issues labelled `agentic`
2. Creates a git worktree on branch `conduit/<issue-number>/<attempt>`
3. Invokes Codex CLI with the issue description as the prompt
4. Codex implements the change, commits, pushes, and opens a GitHub PR
5. Conduit posts the result as a comment on the GitHub issue

## Prerequisites

- Node.js >=24
- `codex` CLI installed and authenticated (`codex --version`)
- `gh` CLI installed and authenticated (`gh auth status`)
- A GitHub fine-grained token with Issues: Read & Write on `conduit-harness/hello-world`
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
cd test/codex-github
npm install
```

### 3. Configure environment

```powershell
Copy-Item .env.example .env
```

Edit `.env` and set:
- `GITHUB_TOKEN` — fine-grained PAT with Issues: Read & Write
  (https://github.com/settings/tokens?type=beta)
- `OPENAI_API_KEY` — OpenAI API key required by Codex CLI

### 4. Clone the target repository

```powershell
git clone https://github.com/conduit-harness/hello-world repo
```

### 5. Validate configuration

```powershell
npm run validate
```

Expected: `workflow valid` with tracker=github, agent=codex-cli.

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
- Codex implements the minimal change
- `git add -A && git commit`
- `git push -u origin HEAD`
- `gh pr create` → PR URL logged (PR body includes `Closes #<number>`)
- Conduit comments on the GitHub issue

### 8. Polling loop

```powershell
npm run start
```

Stop with Ctrl+C.

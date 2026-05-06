# Test: Claude CLI + Linear

Validates the `claude-cli` runner against a Linear issue tracker, with automatic
branch push and GitHub pull request creation.

Target repository: https://github.com/conduit-harness/linear-demo

## What happens

1. Conduit polls Linear for issues in `active_states` labelled `agentic`
2. Creates a git worktree on branch `conduit/<issue-id>/<attempt>`
3. Invokes Claude CLI with the issue description as the prompt
4. Claude implements the change, commits, pushes, and opens a GitHub PR
5. Conduit posts the result as a comment on the Linear issue and transitions state

## Prerequisites

- Node.js >=24
- `claude` CLI installed and authenticated (`claude --version`)
- `gh` CLI installed and authenticated (`gh auth status`)
- A Linear account with at least one issue labelled `agentic` in a `Todo` state
- Packages built and packed (see step 1)

## Steps

### 1. Pack local packages (once per build)

From the repo root:

```powershell
pwsh test/pack-local.ps1
```

### 2. Install dependencies

```powershell
cd test/claude-linear
npm install
```

### 3. Configure environment

```powershell
Copy-Item .env.example .env
```

Edit `.env` and set:
- `LINEAR_API_KEY` — Linear personal API key (https://linear.app/settings/api)
- `LINEAR_TEAM_KEY` — team identifier shown in Linear workspace URLs (e.g. `ENG`)

### 4. Clone the target repository

```powershell
git clone https://github.com/conduit-harness/linear-demo repo
```

### 5. Validate configuration

```powershell
npm run validate
```

Expected: `workflow valid` with tracker=linear, agent=claude-cli.

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
- Claude implements the minimal change
- `git add -A && git commit`
- `git push -u origin HEAD`
- `gh pr create` → PR URL logged
- Conduit comments on the Linear issue and transitions it to `Human Review`

### 8. Polling loop

```powershell
npm run start
```

Stop with Ctrl+C.

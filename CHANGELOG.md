# Changelog

All notable changes to Conduit are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). All packages under the `@conduit-harness/*` scope are versioned in lockstep — every entry below applies to all packages.

## [Unreleased]

## [0.1.0] — 2026-05-09

First validated public release. Same package surface as 0.0.x, hardened: real preflight, structured run logs, configurable logging, integration tests gating PRs.

### Added
- `license` field on every `packages/*/package.json`.
- README badges (npm version, weekly downloads, CI status, license).
- README intro now mentions Conduit's lineage from the Symphony service specification.
- `CHANGELOG.md` (this file).
- `DEVELOPMENT.md` describing the development cadence and pre-release flow.
- `conduit report` subcommand: drafts a sanitized GitHub issue from the latest run. Reads `.conduit/logs/last-run.ndjson`, redacts known token shapes / sensitive keys / home + workspace paths, prints a confirmation preview, then either prints a pre-filled issue-form URL (default), shells out to `gh issue create --gh`, or writes the body to `--out PATH`. `conduit once` and `conduit start` now also persist their NDJSON log to `.conduit/logs/last-run.ndjson` (5 MB cap with single-file rotation, truncated on each invocation). `conduit init --gitignore` now adds `.conduit/logs/` to the rules it appends.
- `logs.root` workflow config field (default `.conduit/logs`) — redirects the run-log file sink. Supports relative (resolved against the repo root) and absolute paths, with `~` home expansion. `conduit report` reads from the same configured root.
- `--no-log-file` flag on `conduit once` / `conduit start` — disables the file sink for ephemeral runs or environments where writing into the working directory is undesirable. Default behavior (sink on) is unchanged.
- `tools/smoke-docker/` — minimal Node 24 / Debian 12 image for clean-machine install validation. Documents both `@next` / `@latest` smoke and locally-packed-tarball smoke modes.

### Changed
- Abandoned the `0.0.2-rc2` release cycle in favor of going directly to `0.1.0`.

### Removed
- `@conduit-harness/conduit-runner-openai-api` — the package called a chat-completions endpoint directly without an agentic harness, so it did not satisfy the runner contract. Use `claude-cli`, `codex-cli`, or `aider` instead. The deprecation warning, the `DEPRECATED_KINDS` map in `packages/conduit/src/cli/index.ts`, the openai-api docs page, the `claude-api` and `openai-api` options in the setup wizard, the `gitlab-openai.md` example, and the `examples/docker-ollama-github/` e2e harness (and its `e2e-smoke.yml` workflow) are all gone with it. A replacement smoke test using the aider runner against Ollama is tracked separately.

## [0.0.1] — 2026-04-27

Initial public release. Conduit ships as eight packages under `@conduit-harness/*`:

- `@conduit-harness/conduit` (core)
- `@conduit-harness/conduit-tracker-{linear,github,jira,gitlab}`
- `@conduit-harness/conduit-runner-{claude-cli,codex-cli,aider}`
- `@conduit-harness/conduit-runner-openai-api` (deprecated; calls a chat-completions endpoint directly without an agentic harness)

### Features

- CLI: `init`, `validate`, `once`, `start`, `version`.
- Workflow file with YAML front matter + Markdown prompt template.
- Per-issue git-worktree isolation under `.conduit/workspaces/`.
- Tracker writes (`on_start`, `on_success`, `on_failure`, `on_terminal_failure`) — comments and state transitions, opt-in.
- Polling loop with configurable interval and `max_concurrent_agents`.
- Plugin discovery from `tracker.kind` and `agent.kind` via `@conduit-harness/conduit-{tracker|runner}-{kind}` package names.
- JSON state store at `.conduit/state.json` for attempt persistence.
- `--dry-run` flag for `once` and `start`.
- `--preflight` flag scaffolding (full implementation deferred to 0.1.0).

[Unreleased]: https://github.com/conduit-harness/conduit/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/conduit-harness/conduit/releases/tag/v0.1.0
[0.0.1]: https://github.com/conduit-harness/conduit/releases/tag/v0.0.1

# Clean-machine smoke test

A minimal Linux container with Node 24 and git — nothing else. Use it to
validate that Conduit installs cleanly on a fresh machine before promoting a
`preview.N` to `@latest`, or to reproduce install-time issues a user reports.

## Build the image

From the repo root:

```powershell
docker build -t conduit-smoke tools/smoke-docker
```

## Mode A — validate a published version (`@next` / `@latest`)

Use this once `0.1.0-preview.N` has been published.

```powershell
docker run --rm -it conduit-smoke
```

Inside the container:

```bash
npm install -g \
  @conduit-harness/conduit@next \
  @conduit-harness/conduit-tracker-github@next \
  @conduit-harness/conduit-runner-claude-cli@next

conduit version
conduit init smoke-project
cd smoke-project
conduit validate
conduit validate --preflight   # expect: "claude binary not found" — none installed
```

Swap `@next` for `@latest` (or pin a specific version) to test the stable channel.

## Mode B — validate locally-packed tarballs (pre-publish)

Use this before cutting a release branch, when nothing is published yet.

### 1. Pack from the host (repo root)

```powershell
mkdir -Force .smoke | Out-Null
Get-ChildItem packages -Directory | ForEach-Object {
  Push-Location $_.FullName
  pnpm pack --pack-destination "$((Resolve-Path ../../.smoke).Path)"
  Pop-Location
}
```

This drops one `.tgz` per workspace package into `.smoke/` at the repo root.

### 2. Run the container with `.smoke/` mounted

```powershell
docker run --rm -it -v "${PWD}\.smoke:/work/tarballs:ro" conduit-smoke
```

### 3. Install inside the container

```bash
cd /work/tarballs
npm install -g \
  ./conduit-harness-conduit-*.tgz \
  ./conduit-harness-conduit-tracker-github-*.tgz \
  ./conduit-harness-conduit-runner-claude-cli-*.tgz

conduit version
mkdir -p /work/smoke-project && cd /work/smoke-project
conduit init .
conduit validate
```

## What this validates

- The package manifest's `files` list pulls in everything the CLI needs at runtime (no missing `dist/` or template files).
- No `postinstall` / `prepare` scripts trip on a minimal image.
- `engines.node >= 24` is honored — npm does not warn about an unmet engine.
- Plugin discovery via `@conduit-harness/conduit-{tracker|runner}-{kind}` resolves through global node_modules.
- `conduit init` writes a workflow scaffold from the published templates.

## What this does NOT validate

- Actual agent runs — `claude`, `codex`, and `aider` binaries are not installed. `conduit validate --preflight` is expected to report them missing.
- Real tracker calls — no API keys are wired up. Use the `integration-trackers` and `integration-runners` workflows in CI for that.
- Cross-platform behavior on Windows or macOS hosts directly. This is a Linux smoke only.

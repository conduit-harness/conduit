# Releasing

Conduit ships as 10 separate npm packages (1 core + 5 trackers + 4 runners), all versioned in lockstep. A release publishes every package, and creates a corresponding GitHub release with auto-generated notes.

The release workflow authenticates to npm via **OIDC (Trusted Publishing)** — no long-lived `NPM_TOKEN` is used or required.

## Stable vs pre-release

Versions containing a hyphen (e.g. `0.1.0-preview.1`, `1.0.0-beta.3`) are treated as pre-releases by the workflow:

- Each package is published under the npm `next` dist-tag instead of `latest`, so `npm install -g <pkg>` still resolves to the previous stable release. Opt in with `npm install -g <pkg>@next`.
- The GitHub release is marked as a pre-release.

Stable versions (no hyphen) publish under `latest` and create a non-pre-release GitHub release. The workflow detects which mode based on the version string alone.

## Steps

1. **Bump versions.** On a PR (or a long-lived release branch), update `version` in every `packages/*/package.json` to the new version (e.g. `0.1.0` → `0.1.1`). Match exactly — the workflow refuses to release if any package disagrees.

2. **Merge the bump PR to `main`** (or push the release branch).

3. **Push the version tag.** From the commit that carries the bumped versions:

   ```bash
   git tag v<version>          # e.g. git tag v0.1.1
   git push origin v<version>
   ```

   Pushing the tag triggers the **Release to npm** workflow automatically. The workflow will, in order:

   - Verify every `packages/*/package.json` matches the tag version.
   - Install, typecheck, test, build.
   - Pack each package into a tarball (built once, reused for publish).
   - `npm publish` every package via OIDC (auto-discovered from `packages/*/package.json` — no per-package step to maintain). Each publish skips cleanly if the version is already on npm, so the workflow is idempotent and safe to re-run.
   - Poll npm with retries (up to 60 s per package) to confirm visibility. A missed publish surfaces as a warning rather than a failure — the pre-publish skip-if-already-published guard is the real safety net.
   - Create the GitHub release with auto-generated notes (PRs since the previous tag).

4. **Verify the release page.** <https://github.com/conduit-harness/conduit/releases> should list the new release with notes.

## What if it fails partway?

The publish steps are independent and idempotent. If the workflow fails (e.g. one package's publish errored out, or the verify step timed out for transient npm reasons), fix the underlying cause and re-run via **workflow_dispatch**:

1. Go to **Actions → Release to npm → Run workflow**.
2. Enter the existing tag (e.g. `v0.1.1`) as the input. The tag must already exist.
3. Already-published packages are detected and skipped automatically.

## Trusted Publisher configuration (one-time per package)

Because the workflow uses OIDC instead of a static token, each npm package must have a Trusted Publisher configured. This is a one-time setup per package:

1. Open **npmjs.com → package → Settings → Publishing access**.
2. Under **Trusted Publishers**, add a GitHub Actions publisher with:
   - **Repository owner:** `conduit-harness`
   - **Repository name:** `conduit`
   - **Workflow filename:** `release.yml`
3. Leave **Environment** blank (no GitHub Actions environment is used).

The workflow's summary step prints a direct link to each package's access page after every run.

## Manual fallback (rare)

If the automated workflow can't run, you can publish manually. Obtain a short-lived npm token (or use a Granular Access Token scoped to the relevant packages), then:

```bash
# From each packages/* directory:
npm publish --access public --tag next   # or --tag latest for stable

# After all packages are published:
gh release create v<version> --generate-notes
```

## Pre-release checklist

- [ ] All packages in `packages/*/package.json` agree on the new version.
- [ ] `pnpm install`, `pnpm typecheck`, `pnpm test`, and `pnpm build` succeed locally.
- [ ] Every package on npmjs.com has a Trusted Publisher configured for `conduit-harness/conduit` + `release.yml`.
- [ ] The bump PR is reviewed and merged before pushing the tag.

# Releasing

Conduit ships as 10 separate npm packages (1 core + 5 trackers + 4 runners), all versioned in lockstep. A release publishes every package, creates a `v<version>` git tag, and a corresponding GitHub release with auto-generated notes.

## Stable vs pre-release

Versions containing a hyphen (e.g. `0.1.0-preview.1`, `1.0.0-beta.3`) are treated as pre-releases by the workflow:

- Each package is published under the npm `next` dist-tag instead of `latest`, so `npm install -g <pkg>` still resolves to the previous stable release. Opt in with `npm install -g <pkg>@next`.
- The GitHub release is marked as a pre-release.

Stable versions (no hyphen) publish under `latest` and create a non-pre-release GitHub release. The workflow detects which mode based on the version string alone.

## Prerequisites: npm Trusted Publishing

The workflow authenticates to npm via OIDC (Trusted Publishing) — no static `NPM_TOKEN` secret required. Before any package can be published for the first time, each `@conduit-harness/*` package on npmjs.com must have `conduit-harness/conduit` + `release.yml` configured as a Trusted Publisher:

1. Visit `https://www.npmjs.com/package/<pkg>/access` for each package.
2. Under **Publishing access → Trusted Publishers**, click **Add a publisher**.
3. Set: Repository owner `conduit-harness`, Repository name `conduit`, Workflow filename `release.yml`. Leave Environment blank.

The workflow's `prepare` job prints a checklist of these links in the job summary each run.

## Steps

1. **Bump versions.** On a PR (or a long-lived release branch), update `version` in every `packages/*/package.json` to the new version (e.g. `0.1.0` → `0.1.1`). Match exactly — the workflow refuses to release if any package disagrees.

2. **Merge the bump PR to `main`** (or push the release branch).

3. **Push the tag.** The workflow triggers automatically when a `vX.Y.Z` tag is pushed:

   ```bash
   git tag -a v0.1.1 -m "Release v0.1.1" <commit-sha>
   git push origin v0.1.1
   ```

   `<commit-sha>` must be the commit on the branch whose `package.json` versions match the tag.

   The workflow will, in order (**prepare** → **publish** → **release**):

   - Verify every `packages/*/package.json` matches the tag version.
   - Install, typecheck, test, build.
   - Print a Trusted Publisher checklist in the job summary.
   - Tar the built packages and upload as a workflow artifact.
   - `npm publish` every workspace package via OIDC (auto-discovered from `packages/*/`; no per-package step to maintain). Each publish skips cleanly if the version is already on npm, so the workflow is idempotent and can be re-run if it fails partway.
   - Poll npm (warning only) to report visibility of each package at the new version.
   - Create the GitHub release with auto-generated notes (PRs since the previous tag).

4. **Verify the release page.** <https://github.com/conduit-harness/conduit/releases> should list the new release with notes.

## What if it fails partway?

The publish steps are independent and idempotent. If the workflow fails (e.g. a 401/403 from npm because Trusted Publishing was not configured for a package, or a transient registry error), fix the underlying cause and re-run via **workflow_dispatch**:

1. From the GitHub Actions tab, select **Release to npm**.
2. Click **Run workflow**, enter the existing tag (e.g. `v0.1.1`), and run.

- Already-published packages are detected and skipped.
- The tag already exists (it was pushed in step 3), so there is no "tag already exists" check to worry about.

If a publish fails with **401/403**, the package's Trusted Publisher was not configured. Open the link from the job summary checklist, configure it, and re-run.

## Manual fallback (rare)

If the automated workflow can't run, you can publish manually from a machine with an npm token, then create the GitHub release directly:

```bash
# After publishing all packages with `npm publish` from each packages/* dir:
gh release create v<version> --target <commit-sha> --generate-notes
```

`<commit-sha>` should be the commit on `main` (or the release branch) whose `package.json` versions match the released artifacts.

## Pre-release checklist

- [ ] All packages in `packages/*/package.json` agree on the new version.
- [ ] `pnpm install`, `pnpm typecheck`, `pnpm test`, and `pnpm build` succeed locally.
- [ ] `CHANGELOG.md` (if added in future) reflects the new version.
- [ ] The bump PR is reviewed and merged.
- [ ] Each new `@conduit-harness/*` package has its Trusted Publisher configured on npmjs.com.

# Releasing

Conduit ships as 8 separate npm packages (1 core + 4 trackers + 3 runners), all versioned in lockstep. A release publishes every package, creates a `v<version>` git tag, and a corresponding GitHub release with auto-generated notes.

## Stable vs pre-release

Versions containing a hyphen (e.g. `0.0.2-rc1`, `1.0.0-beta.3`) are treated as pre-releases by the workflow:

- Each package is published under the npm `next` dist-tag instead of `latest`, so `npm install -g <pkg>` still resolves to the previous stable release. Opt in with `npm install -g <pkg>@next`.
- The GitHub release is marked as a pre-release.

Stable versions (no hyphen) publish under `latest` and create a non-pre-release GitHub release. The workflow detects which mode based on the version string alone.

## Steps

1. **Bump versions.** On a PR (or a long-lived release branch), update `version` in every `packages/*/package.json` to the new version (e.g. `0.0.1` → `0.0.2-rc1`). Match exactly — the workflow refuses to release if any package disagrees.

2. **Merge the bump PR to `main`** (or push the release branch).

3. **Trigger the release.** From the GitHub Actions tab, run the **Release to npm** workflow with the new version as input (e.g. `0.0.2-rc1`). For releases off a non-main branch, pick that branch in the "Use workflow from" dropdown.

   The workflow will, in order:

   - Verify every `packages/*/package.json` matches the input version.
   - Verify the `v<version>` tag does not already exist.
   - Install, typecheck, test, build.
   - `npm publish` every workspace package (auto-discovered from `packages/*/package.json` — no per-package step to maintain). Each publish skips cleanly if the version is already on npm, so the workflow is idempotent and can be re-run if it fails partway.
   - Poll npm with retries (up to 60s per package, also iterating over `packages/*`) to confirm every package is visible at the new version. A package added under `packages/` but somehow not published gets caught here.
   - Create and push the `v<version>` tag.
   - Create the GitHub release with auto-generated notes (PRs since the previous tag).

4. **Verify the release page.** <https://github.com/conduit-harness/conduit/releases> should list the new release with notes.

## What if it fails partway?

The publish steps are independent and idempotent. If the workflow fails (e.g. one package's publish errored out, or the verify gate timed out for transient npm reasons), fix the underlying cause and re-run the same workflow with the same version input.

- Already-published packages are detected and skipped.
- The "tag does not already exist" check at the start protects against accidental re-tags only — if the tag step itself ran and succeeded, a re-run will fail on this check; in that case the release is effectively done and only the missing post-tag steps need a manual touch-up.

## Manual fallback (rare)

If the automated workflow can't run, you can publish manually with an npm token, then create the tag and GitHub release directly:

```bash
# After publishing all 8 packages with `npm publish` from each packages/* dir:
git tag -a v<version> -m "Release v<version>" <commit-sha>
git push origin v<version>
gh release create v<version> --target <commit-sha> --generate-notes
```

`<commit-sha>` should be the commit on `main` whose `package.json` versions match the released artifacts.

## Pre-release checklist

- [ ] All packages in `packages/*/package.json` agree on the new version.
- [ ] `pnpm install`, `pnpm typecheck`, `pnpm test`, and `pnpm build` succeed locally.
- [ ] `CHANGELOG.md` (if added in future) reflects the new version.
- [ ] The bump PR is reviewed and merged.

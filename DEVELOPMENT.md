# Development cadence

This document describes how Conduit is developed and released. For the mechanical "how to publish" steps, see [`RELEASING.md`](RELEASING.md). For contribution rules and local setup, see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Trunk model

`main` is the working trunk during a `0.x` development cycle. Feature branches and PRs target `main`. Versions on `main` stay at the current released version (e.g. `0.0.1`) — `main` does not carry pre-release version bumps.

This keeps `main` always installable and avoids the situation where `git clone && pnpm install` produces an unpublished version that confuses workspace tooling.

## Pre-release lifecycle

When a `0.x.0` release is approaching ready (the targeted feature set is largely complete and the bar for the release has been met):

1. **Cut a release branch** from `main`: `release/0.x.0`.
2. **Bump every `packages/*/package.json` `version`** (and matching `peerDependencies`) to `0.x.0-preview.1`.
3. **Trigger the release workflow** with `0.x.0-preview.1` as input. The hyphen-detection logic in `release.yml` routes the publish to the npm `next` dist-tag — so `npm install -g <pkg>` still resolves to the previous stable, and `npm install -g <pkg>@next` opts into the preview.
4. **Iterate**. Bug reports and fixes against `0.x.0-preview.1` land on the `release/0.x.0` branch (or merge-forward from `main` if the fix is generally applicable). Each iteration bumps to `0.x.0-preview.N` and re-runs the release workflow.
5. **Cut the stable release.** When the preview has been validated, bump to `0.x.0` (no hyphen). The workflow publishes under `latest`. The GitHub release is no longer marked pre-release.
6. **Merge `release/0.x.0` back to `main`** so the version bump and any release-only fixes land on the trunk.

## Patch releases (`0.x.y` for `y > 0`)

Patches branch from the `v0.x.0` tag, not from `main`. This isolates patches from unrelated `main` work that has accumulated since the minor release.

```
git checkout -b release/0.x.y v0.x.0
# bump packages/*/package.json to 0.x.y, cherry-pick or commit fixes
# trigger release workflow with 0.x.y
# merge release/0.x.y back into main
```

If a patch needs a preview cycle, use `0.x.y-preview.N` exactly as for minor releases.

## Why no `rc` cycles

Earlier releases used `0.0.2-rc1` and `0.0.2-rc2` as staging steps. In practice this fragmented the release cadence and produced rc tags that never converged on a stable `0.0.2`. The convention now is: skip `rc`, use `preview.N` until the release is ready, then publish stable. The npm `next` dist-tag carries the preview line; users who want bleeding edge install with `@next`.

## Branch hygiene

- One PR = one logical change. Polish bundles (license fields, badges, docs) are fine, but keep them scoped.
- Long-lived feature branches under `feature/...` are discouraged; prefer breaking work into mergeable slices on `main`.
- The `claude/...` branches that appear in history come from autonomous agent work and are squash-merged via PR like any other contribution.

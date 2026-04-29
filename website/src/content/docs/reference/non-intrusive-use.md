---
title: Non-intrusive use
description: Run Conduit against external repositories without committing tool-specific files.
---

Conduit is designed to run as an external tool against target repositories — it does not need to be installed into a project.

## Example layout

```text
~/repositories/conduit/                  # this tool
~/repositories/customer/project/          # target repo
~/conduit/configs/customer-project.md     # workflow file (external)
~/conduit/configs/customer-project.env    # env file (external)
~/conduit/workspaces/customer-project/    # git worktrees (external)
```

## Running against an external repo

```bash
conduit once \
  --repo ~/repositories/customer/project \
  --workflow ~/conduit/configs/customer-project.md \
  --env ~/conduit/configs/customer-project.env
```

## Keeping workspaces outside the target repo

Set `workspace.root` to an absolute path in the workflow:

```yaml
workspace:
  root: ~/conduit/workspaces/customer-project
  strategy: git-worktree
  base_ref: main
```

## Keeping state outside the target repo

Either set it in the workflow front matter:

```yaml
state:
  root: ~/conduit/state/customer-project
```

Or pass it at runtime:

```bash
conduit once \
  --repo ~/repositories/customer/project \
  --workflow ~/conduit/configs/customer-project.md \
  --env ~/conduit/configs/customer-project.env \
  --state-dir ~/conduit/state/customer-project
```

## Target repo footprint

When using external workspace and state roots, nothing is written to the target repo except git worktree metadata (under `.git/`). You can run Conduit against a customer or project repository without committing any Conduit-specific files to it.

If you do want to store Conduit config in the target repo, `.conduit/` is the conventional location:

```text
.conduit/workflow.md          # workflow file
.conduit/workspaces/          # git worktrees (add to .gitignore)
.conduit/state/               # run state (add to .gitignore)
```

Add to `.gitignore`:

```
.conduit/workspaces/
.conduit/state/
```

Or use `conduit init --gitignore` to append these rules automatically.

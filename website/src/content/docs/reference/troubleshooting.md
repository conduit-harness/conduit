---
title: Troubleshooting
description: Fixes for common setup problems.
---

## `node: command not found` (or `npm: command not found`)

Conduit is published as Node.js packages and requires **Node 24 or newer**. If `node --version` doesn't print a version ≥ 24, install or upgrade it.

The recommended approach on every platform is a Node version manager — they install Node into your home directory, don't require sudo, and let you switch versions per project. If you don't already have one, pick one of the options below.

### macOS

**Homebrew:**

```bash
brew install node
```

**fnm** (fast, single binary, recommended if you don't already use Homebrew):

```bash
curl -fsSL https://fnm.vercel.app/install | bash
exec $SHELL          # restart the shell so fnm is on PATH
fnm install 24
fnm use 24
```

**Official installer:** download the LTS `.pkg` from [nodejs.org](https://nodejs.org/).

### Linux

**fnm** (works on every distro, no root needed):

```bash
curl -fsSL https://fnm.vercel.app/install | bash
exec $SHELL
fnm install 24
fnm use 24
```

**Distro package managers** sometimes ship Node versions older than 24 — check `node --version` after install. If yours is too old, use NodeSource (Debian/Ubuntu/RHEL) or fall back to fnm.

```bash
# Debian / Ubuntu
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs

# Fedora / RHEL
curl -fsSL https://rpm.nodesource.com/setup_24.x | sudo bash -
sudo dnf install -y nodejs
```

**Arch:**

```bash
sudo pacman -S nodejs npm
```

### Windows

**fnm** via Winget:

```powershell
winget install Schniz.fnm
fnm install 24
fnm use 24
```

**Official installer:** download the LTS `.msi` from [nodejs.org](https://nodejs.org/) and run it. Open a fresh terminal afterwards so `node` is on `PATH`.

**WSL2:** if you're using Windows Subsystem for Linux, follow the [Linux instructions](#linux) inside your WSL distro instead — installing Node on the Windows side won't make it available in WSL.

### Verify

```bash
node --version    # should print v24.x.x or newer
npm --version
```

If `node` is installed but `command not found` persists, your shell hasn't picked up the new `PATH`. Open a fresh terminal, or `exec $SHELL`.

## `npm error code EACCES` when running `npm install -g`

Global installs into `/usr/local` or `/usr/lib/node_modules` need write permission you usually don't have. Two clean ways out:

1. **Use a Node version manager** (fnm/nvm/volta — see above). Their `npm` installs into your home directory, so `-g` doesn't hit a permissioned path.
2. **Reconfigure npm's global prefix** to a directory you own:

   ```bash
   mkdir -p ~/.npm-global
   npm config set prefix ~/.npm-global
   echo 'export PATH=$HOME/.npm-global/bin:$PATH' >> ~/.zshrc   # or ~/.bashrc
   exec $SHELL
   ```

Avoid `sudo npm install -g` — it works but leaves files owned by root and creates more permission problems later.

## Conduit installs but `conduit: command not found`

`npm install -g` placed the binary somewhere that isn't on your `PATH`. Find where:

```bash
npm config get prefix
```

Add `<that-prefix>/bin` to your shell `PATH` and reopen the terminal.

# Builds all packages and packs them as tarballs into test/local-packages/.
# Run this from the repo root before npm install in any test scenario folder.
#
# Usage: pwsh test/pack-local.ps1

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent
$outDir = Join-Path $PSScriptRoot "local-packages"

Push-Location $repoRoot

Write-Host "Building all packages..."
pnpm build
if ($LASTEXITCODE -ne 0) { Pop-Location; exit 1 }

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$packages = @(
    "conduit",
    "conduit-runner-claude-cli",
    "conduit-runner-codex-cli",
    "conduit-runner-aider",
    "conduit-tracker-linear",
    "conduit-tracker-github",
    "conduit-tracker-forgejo"
)

foreach ($pkg in $packages) {
    $pkgDir = Join-Path $repoRoot "packages" $pkg
    Write-Host "Packing $pkg..."
    Push-Location $pkgDir
    npm pack --pack-destination "$outDir" --ignore-scripts
    if ($LASTEXITCODE -ne 0) { Pop-Location; Pop-Location; exit 1 }
    Pop-Location
}

Pop-Location
Write-Host ""
Write-Host "All packages packed to test/local-packages/."
Write-Host "Run 'npm install' in any test scenario folder to install them."

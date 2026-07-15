# Populate the shared/common Vionto music library from a local Windows folder.
# Run from the repository root: .\apps\vionto\scripts\populate-music-library.ps1
# Tracks end up under vionto/common/audio/immostoryai/ and are visible to every user.
# User uploads remain private under vionto/{userId}/audio/.

param(
  [string]$Dir = "C:\Users\saal\Music\immostoryai",
  [string]$Scope = "immostoryai",
  [switch]$Watch,
  [switch]$DryRun,
  [switch]$Test
)

$ErrorActionPreference = "Stop"
$env:VIONTO_STORAGE_DRIVER = "spaces"

$cliArgs = @("--dir", $Dir, "--scope", $Scope)
if ($Watch) { $cliArgs += "--watch" }
if ($DryRun) { $cliArgs += "--dryRun" }
if ($Test) { $cliArgs += "--test" }

pnpm --filter vionto populate-music-library @cliArgs

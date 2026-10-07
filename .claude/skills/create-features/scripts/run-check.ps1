<#
.SYNOPSIS
  Prüft den ISS-Tracker in einem echten Chrome gegen einen laufenden Build.

.DESCRIPTION
  Richtet beim ersten Aufruf einmalig ein Temp-Verzeichnis mit puppeteer-core
  ein (das Projekt bleibt unberührt), kopiert browser-check.mjs dorthin und
  führt es aus. Der Screenshot landet im selben Verzeichnis.

.PARAMETER Url
  Adresse der laufenden App. Standard: http://localhost:3100 (next start).

.PARAMETER Expect
  Zusätzliche CSS-Selektoren, die vorhanden sein müssen (für neue Features).

.PARAMETER Script
  Welches Prüfskript laufen soll: browser-check.mjs (Standard, allgemeiner
  Rauchtest) oder feature-check.mjs (Theme-Umschalter und Plot-Ansicht).

.EXAMPLE
  .\.claude\skills\create-features\scripts\run-check.ps1

.EXAMPLE
  .\.claude\skills\create-features\scripts\run-check.ps1 -Script feature-check.mjs

.EXAMPLE
  .\.claude\skills\create-features\scripts\run-check.ps1 -Expect ".astronauten-liste li"
#>
param(
  [string]$Url = "http://localhost:3100",
  [string[]]$Expect = @(),
  [string]$Script = "browser-check.mjs"
)

$ErrorActionPreference = "Stop"

# Node liegt auf dieser Maschine nicht im PATH.
$nodeDir = "C:\Program Files\nodejs"
if (Test-Path $nodeDir) { $env:Path = "$nodeDir;" + $env:Path }

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "node nicht gefunden. Erwartet unter $nodeDir."
}

$harness = Join-Path $env:TEMP "iss-browser-check"
New-Item -ItemType Directory -Force -Path $harness | Out-Null

if (-not (Test-Path (Join-Path $harness "node_modules\puppeteer-core"))) {
  Write-Host "Richte puppeteer-core einmalig in $harness ein ..."
  Push-Location $harness
  try {
    npm init -y | Out-Null
    npm install puppeteer-core | Out-Null
  } finally {
    Pop-Location
  }
}

Get-ChildItem -Path $PSScriptRoot -Filter "*.mjs" | Copy-Item -Destination $harness -Force

$out = Join-Path $harness ("out-" + [IO.Path]::GetFileNameWithoutExtension($Script))
$nodeArgs = @($Script, $Url, "--out", $out)
foreach ($selector in $Expect) { $nodeArgs += @("--expect", $selector) }

Push-Location $harness
try {
  node @nodeArgs
  $code = $LASTEXITCODE
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "Ergebnis-Verzeichnis: $out"
exit $code

<#
  Impacchetta l'estensione per Chrome e Firefox in cartelle separate sotto dist/,
  ognuna con il proprio manifest.json, e produce gli zip pronti per l'upload
  su Chrome Web Store / addons.mozilla.org.

  Uso: pwsh ./scripts/package.ps1
#>

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $root 'dist'

$sharedFiles = @(
  'background.js', 'config.js', 'confirm.html', 'confirm.js',
  'content-cnl-scanner.js', 'jdApi.js', 'linkUtils.js',
  'options.html', 'options.js'
)

$version = (Get-Content (Join-Path $root 'manifest.json') -Raw | ConvertFrom-Json).version

function New-Package($browser, $manifestName) {
  $out = Join-Path $dist $browser
  if (Test-Path $out) { Remove-Item $out -Recurse -Force }
  New-Item -ItemType Directory -Path $out -Force | Out-Null

  foreach ($f in $sharedFiles) {
    Copy-Item (Join-Path $root $f) (Join-Path $out $f)
  }
  Copy-Item (Join-Path $root 'icons') (Join-Path $out 'icons') -Recurse
  Copy-Item (Join-Path $root $manifestName) (Join-Path $out 'manifest.json')

  $zipPath = Join-Path $dist "jd-link-sender-$browser-v$version.zip"
  if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
  Compress-Archive -Path (Join-Path $out '*') -DestinationPath $zipPath

  Write-Host "OK  $browser -> $zipPath"
}

New-Package 'chrome' 'manifest.json'
New-Package 'firefox' 'manifest.firefox.json'

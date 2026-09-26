$ErrorActionPreference = 'Stop'

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$dist = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'dist'))
$rawfile = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'platforms\harmony\entry\src\main\resources\rawfile'))
$target = [System.IO.Path]::GetFullPath((Join-Path $rawfile 'web'))

pnpm --dir $projectRoot build
if ($LASTEXITCODE -ne 0) { throw 'Web build failed.' }

if (-not $target.StartsWith($rawfile, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Refusing to replace a directory outside Harmony rawfile resources.'
}
if (Test-Path -LiteralPath $target) {
  Remove-Item -LiteralPath $target -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $target | Out-Null
Copy-Item -Path (Join-Path $dist '*') -Destination $target -Recurse -Force

Write-Host 'Harmony web resources synchronized.'

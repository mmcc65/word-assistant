$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$desktopProject = Join-Path $projectRoot 'platforms\windows\Cet6WordAssistant.csproj'
$output = Join-Path $projectRoot 'artifacts\desktop-update'
$staging = Join-Path $output 'package'
$archive = Join-Path $output 'WordAssistant-desktop-release.zip'
$buildCacheRoot = Join-Path $projectRoot '.cache'
$env:DOTNET_CLI_HOME = Join-Path $buildCacheRoot 'dotnet-home'
$env:NUGET_PACKAGES = Join-Path $buildCacheRoot 'nuget'
$env:NUGET_HTTP_CACHE_PATH = Join-Path $buildCacheRoot 'nuget-http'
$env:NUGET_PLUGINS_CACHE_PATH = Join-Path $buildCacheRoot 'nuget-plugins'
$env:DOTNET_SKIP_FIRST_TIME_EXPERIENCE = '1'
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
New-Item -ItemType Directory -Force -Path $output, $env:DOTNET_CLI_HOME, $env:NUGET_PACKAGES, $env:NUGET_HTTP_CACHE_PATH, $env:NUGET_PLUGINS_CACHE_PATH | Out-Null
if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
New-Item -ItemType Directory -Force -Path $staging | Out-Null

Push-Location $projectRoot
try {
  pnpm build
  if ($LASTEXITCODE -ne 0) { throw 'Web build failed.' }
  dotnet publish $desktopProject -c Release -r win-x64 --self-contained true -o $staging
  if ($LASTEXITCODE -ne 0) { throw 'Windows update build failed.' }
} finally {
  Pop-Location
}

if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $archive -CompressionLevel Optimal
$hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLower()
$projectText = Get-Content -LiteralPath $desktopProject -Raw
$version = [regex]::Match($projectText, '<Version>([^<]+)</Version>').Groups[1].Value
$manifest = [ordered]@{
  version = $version
  packageUrl = 'WordAssistant-desktop-release.zip'
  sha256 = $hash
  notes = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('5ou85YaZ5pS55Li66YCQ5a2X5q+N5qCH5YeG5b2V6Z+z77yM5bm25o+Q6auY5a2X5q+N5ZON5bqm77yb5L+u5q2j6auY6K+t6YCf6Z+z6aKR5Yqg6L295aSx6LSl77yb5Yqg5YWl5aSH55So6Iux5paH6K+t6Z+z5rqQ44CC'))
} | ConvertTo-Json
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $output 'desktop-latest.json'), $manifest, $utf8NoBom)
Remove-Item -LiteralPath $staging -Recurse -Force
Write-Host "Desktop update package: $archive"
Write-Host "Manifest: $(Join-Path $output 'desktop-latest.json')"

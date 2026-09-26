$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$desktopProject = Join-Path $projectRoot 'platforms\windows\Cet6WordAssistant.csproj'
$releaseRoot = Join-Path $projectRoot 'release\windows-x64'
$buildCacheRoot = Join-Path $projectRoot '.cache'
$env:DOTNET_CLI_HOME = Join-Path $buildCacheRoot 'dotnet-home'
$env:NUGET_PACKAGES = Join-Path $buildCacheRoot 'nuget'
$env:NUGET_HTTP_CACHE_PATH = Join-Path $buildCacheRoot 'nuget-http'
$env:NUGET_PLUGINS_CACHE_PATH = Join-Path $buildCacheRoot 'nuget-plugins'
$env:DOTNET_SKIP_FIRST_TIME_EXPERIENCE = '1'
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
New-Item -ItemType Directory -Force -Path $env:DOTNET_CLI_HOME, $env:NUGET_PACKAGES, $env:NUGET_HTTP_CACHE_PATH, $env:NUGET_PLUGINS_CACHE_PATH | Out-Null

Push-Location $projectRoot
try {
  pnpm build
  if ($LASTEXITCODE -ne 0) { throw 'Web build failed.' }
  dotnet publish $desktopProject -c Release -r win-x64 --self-contained true -o $releaseRoot
  if ($LASTEXITCODE -ne 0) { throw 'Windows desktop build failed.' }
  Write-Host "Windows app generated in: $releaseRoot"
} finally {
  Pop-Location
}

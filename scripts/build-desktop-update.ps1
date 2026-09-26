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
  notes = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('5Y2V6K+N5Y2h5pSv5oyB5LiK5LiA5Liq5ZKM5LiL5LiA5Liq6Ieq55Sx57+76aG177yb6Kej6YeK5Y+v5Lul5Y+N5aSN5pi+56S65oiW6ZqQ6JeP77yb54af57uD5bqm6K6w5b2V5pS55Li65Y+v6YCJ77ybQW5kcm9pZCDmiYvmnLrlkozlubPmnb/mjqXlhaXlronlhajlupTnlKjlhoXmm7TmlrDjgII='))
} | ConvertTo-Json
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $output 'desktop-latest.json'), $manifest, $utf8NoBom)
Remove-Item -LiteralPath $staging -Recurse -Force
Write-Host "Desktop update package: $archive"
Write-Host "Manifest: $(Join-Path $output 'desktop-latest.json')"

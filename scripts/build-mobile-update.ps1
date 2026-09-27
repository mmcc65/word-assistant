$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$source = Join-Path $projectRoot 'android\app\build\outputs\apk\debug\app-debug.apk'
$output = Join-Path $projectRoot 'artifacts\mobile-update'
$apk = Join-Path $output 'WordAssistant-android-phone-tablet.apk'
$gradleFile = Join-Path $projectRoot 'android\app\build.gradle'

if (-not (Test-Path -LiteralPath $source)) { throw 'Android APK has not been built.' }
New-Item -ItemType Directory -Force -Path $output | Out-Null
Copy-Item -LiteralPath $source -Destination $apk -Force

$gradleText = Get-Content -LiteralPath $gradleFile -Raw
$versionCode = [int][regex]::Match($gradleText, 'versionCode\s+(\d+)').Groups[1].Value
$versionName = [regex]::Match($gradleText, 'versionName\s+"([^"]+)"').Groups[1].Value
$hash = (Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLower()
$notes = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('5paw5aKe5LiD57G75pKt5oql5YaF5a6554us56uL6Z+z6YeP77yaNTAlIOS/neaMgeWOn+WTjeW6pu+8jOiLseaWh+W9lemfs+acgOmrmOWPr+iwg+iHs+e6puS4pOWAje+8m+WQjOaXtuaUuei/m+aSreaUvuS4juemu+e6v+mfs+mikeS9k+mqjOOAguezu+e7n+ivremfs+WPl+iuvuWkh+mfs+mHj+S4iumZkOmZkOWItuOAgg=='))
$manifest = [ordered]@{
  versionCode = $versionCode
  versionName = $versionName
  apkUrl = 'WordAssistant-android-phone-tablet.apk'
  sha256 = $hash
  notes = $notes
} | ConvertTo-Json
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $output 'latest.json'), $manifest, $utf8NoBom)

Write-Host "Mobile package: $apk"
Write-Host "Manifest: $(Join-Path $output 'latest.json')"

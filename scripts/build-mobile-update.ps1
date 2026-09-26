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
$notes = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('5Y2V6K+N5Y2h5pSv5oyB6Ieq55Sx57+76aG15ZKM6Kej6YeK5pi+6ZqQ77yb54af57uD5bqm6K6w5b2V5pS55Li65Y+v6YCJ77yb55Sf6K+N5pys5pSv5oyB5YiG6aG177yb5omL5py65ZKM5bmz5p2/6YCa55So44CC'))
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

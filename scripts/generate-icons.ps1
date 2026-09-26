$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$publicDir = Join-Path $projectRoot 'public'
$assetDir = Join-Path $projectRoot 'assets'
$windowsDir = Join-Path $projectRoot 'platforms\windows'
New-Item -ItemType Directory -Force -Path $publicDir, $assetDir, $windowsDir | Out-Null

function New-WordIcon([int]$size, [string]$path) {
  $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $margin = [single]($size * 0.035)
    $radius = [single]($size * 0.22)
    $rect = [System.Drawing.RectangleF]::new($margin, $margin, $size - 2 * $margin, $size - 2 * $margin)
    $pathShape = [System.Drawing.Drawing2D.GraphicsPath]::new()
    try {
      $diameter = 2 * $radius
      $pathShape.AddArc($rect.Left, $rect.Top, $diameter, $diameter, 180, 90)
      $pathShape.AddArc($rect.Right - $diameter, $rect.Top, $diameter, $diameter, 270, 90)
      $pathShape.AddArc($rect.Right - $diameter, $rect.Bottom - $diameter, $diameter, $diameter, 0, 90)
      $pathShape.AddArc($rect.Left, $rect.Bottom - $diameter, $diameter, $diameter, 90, 90)
      $pathShape.CloseFigure()
      $graphics.FillPath([System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#173F35')), $pathShape)
      $borderPen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#315F51'), [single]($size * 0.025))
      $graphics.DrawPath($borderPen, $pathShape)
      $borderPen.Dispose()
    } finally { $pathShape.Dispose() }

    $orange = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#DF6F45'))
    $dot = [single]($size * 0.115)
    $graphics.FillEllipse($orange, [single]($size * 0.75), [single]($size * 0.13), $dot, $dot)
    $orange.Dispose()

    $fontName = if ([System.Drawing.FontFamily]::Families.Name -contains 'Microsoft YaHei UI') { 'Microsoft YaHei UI' } else { 'Microsoft YaHei' }
    $font = [System.Drawing.Font]::new($fontName, [single]($size * 0.56), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $brush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#F7F8F5'))
    $format = [System.Drawing.StringFormat]::new()
    try {
      $format.Alignment = [System.Drawing.StringAlignment]::Center
      $format.LineAlignment = [System.Drawing.StringAlignment]::Center
      $textRect = [System.Drawing.RectangleF]::new(0, [single](-$size * 0.015), $size, $size)
      $wordChar = [string][char]0x8BCD
      $graphics.DrawString($wordChar, $font, $brush, $textRect, $format)
    } finally { $format.Dispose(); $brush.Dispose(); $font.Dispose() }
    $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally { $graphics.Dispose(); $bitmap.Dispose() }
}

New-WordIcon 192 (Join-Path $publicDir 'pwa-192.png')
New-WordIcon 512 (Join-Path $publicDir 'pwa-512.png')
$masterPng = Join-Path $assetDir 'word-icon-1024.png'
New-WordIcon 1024 $masterPng
$icoPng = Join-Path $assetDir 'word-icon-256.png'
New-WordIcon 256 $icoPng

$pngBytes = [System.IO.File]::ReadAllBytes($icoPng)
$icoPath = Join-Path $windowsDir 'word.ico'
$stream = [System.IO.File]::Open($icoPath, [System.IO.FileMode]::Create)
$writer = [System.IO.BinaryWriter]::new($stream)
try {
  $writer.Write([uint16]0)
  $writer.Write([uint16]1)
  $writer.Write([uint16]1)
  $writer.Write([byte]0)
  $writer.Write([byte]0)
  $writer.Write([byte]0)
  $writer.Write([byte]0)
  $writer.Write([uint16]1)
  $writer.Write([uint16]32)
  $writer.Write([uint32]$pngBytes.Length)
  $writer.Write([uint32]22)
  $writer.Write($pngBytes)
} finally { $writer.Dispose(); $stream.Dispose() }

$androidRes = Join-Path $projectRoot 'android\app\src\main\res'
if (Test-Path -LiteralPath $androidRes) {
  $densities = @(
    @{ Name = 'mdpi'; Icon = 48; Foreground = 108 },
    @{ Name = 'hdpi'; Icon = 72; Foreground = 162 },
    @{ Name = 'xhdpi'; Icon = 96; Foreground = 216 },
    @{ Name = 'xxhdpi'; Icon = 144; Foreground = 324 },
    @{ Name = 'xxxhdpi'; Icon = 192; Foreground = 432 }
  )
  foreach ($density in $densities) {
    $folder = Join-Path $androidRes ("mipmap-" + $density.Name)
    New-Item -ItemType Directory -Force -Path $folder | Out-Null
    New-WordIcon $density.Icon (Join-Path $folder 'ic_launcher.png')
    New-WordIcon $density.Icon (Join-Path $folder 'ic_launcher_round.png')
    New-WordIcon $density.Foreground (Join-Path $folder 'ic_launcher_foreground.png')
  }
}

$harmonyMedia = Join-Path $projectRoot 'platforms\harmony\AppScope\resources\base\media'
$harmonyEntryMedia = Join-Path $projectRoot 'platforms\harmony\entry\src\main\resources\base\media'
if ((Test-Path -LiteralPath (Split-Path $harmonyMedia -Parent)) -or (Test-Path -LiteralPath (Split-Path $harmonyEntryMedia -Parent))) {
  New-Item -ItemType Directory -Force -Path $harmonyMedia, $harmonyEntryMedia | Out-Null
  New-WordIcon 512 (Join-Path $harmonyMedia 'app_icon.png')
  New-WordIcon 512 (Join-Path $harmonyEntryMedia 'app_icon.png')
}

Write-Host 'App icons generated.'

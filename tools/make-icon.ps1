<#
.SYNOPSIS
  Draws assets\icon.ico from the same cloud mark the app uses.

.DESCRIPTION
  The same generator every program in Ozone uses, in Nimbus's own colours: a
  sunset sky rather than a daylight one, and rain falling from the cloud,
  because Nimbus is the rain cloud - the one that actually produces something.

  The shape is drawn at each size rather than scaled from one bitmap, so the
  small sizes stay crisp - a 16px icon downsampled from 256px turns to mush.
  Below 24px the rain is left off: three 1px streaks at that scale read as
  dirt on the icon rather than as weather.

  Windows reads sizes down to 16px for the title bar and up to 256px for large
  tiles, so all of them are written into one .ico. Each entry is a PNG, which
  Windows has accepted since Vista.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools\make-icon.ps1
#>

[CmdletBinding()]
param(
    [string]$Out,
    [int[]]$Sizes = @(16, 20, 24, 32, 40, 48, 64, 128, 256)
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $Out) { $Out = Join-Path $projectRoot 'assets\icon.ico' }
$assets = Split-Path -Parent $Out
if (-not (Test-Path $assets)) { New-Item -ItemType Directory -Path $assets -Force | Out-Null }

# Nimbus's palette, from src\renderer\styles.css. Keep them in step.
$SKY_TOP    = [System.Drawing.Color]::FromArgb(255, 239, 160, 121)   # --sky-top
$SKY_BOTTOM = [System.Drawing.Color]::FromArgb(255, 249, 214, 182)   # --sky-bottom
$CLOUD_FILL = [System.Drawing.Color]::FromArgb(255, 255, 250, 245)   # --cloud
$RAIN_INK   = [System.Drawing.Color]::FromArgb(255, 212, 102, 60)    # --accent

# The logo path lives in a 24-unit box. The body sits higher than Stratus's, to
# leave the rain somewhere to fall.
$LOBES = @(
    @{ cx = 11.5; cy = 8.2;  r = 5.0 },   # the tall one, left of centre
    @{ cx = 17.0; cy = 11.2; r = 3.6 },
    @{ cx = 7.4;  cy = 11.0; r = 3.8 }
)
$BODY_BOX = @{ left = 4.6; right = 21.0; top = 9.8; bottom = 14.8 }

# Where the rain falls: x, then the run from top to bottom, in the same units.
$RAIN_STREAKS = @(
    @{ x = 9.0;  y1 = 16.4; y2 = 19.4 },
    @{ x = 12.6; y1 = 17.2; y2 = 20.6 },
    @{ x = 16.2; y1 = 16.4; y2 = 19.4 }
)

function New-CloudBitmap([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

    $s = $size / 24.0

    # Sky, rounded like the rest of the app.
    $radius = [Math]::Max(2, $size * 0.22)
    $round = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $radius * 2
    $round.AddArc(0, 0, $d, $d, 180, 90)
    $round.AddArc($size - $d, 0, $d, $d, 270, 90)
    $round.AddArc($size - $d, $size - $d, $d, $d, 0, 90)
    $round.AddArc(0, $size - $d, $d, $d, 90, 90)
    $round.CloseFigure()

    $sky = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Point(0, 0)),
        (New-Object System.Drawing.Point(0, $size)),
        $SKY_TOP, $SKY_BOTTOM)
    $g.FillPath($sky, $round)

    # The rain first, so the cloud is drawn over the top of where it starts and
    # the streaks appear to fall out from under it.
    if ($size -ge 24) {
        $pen = New-Object System.Drawing.Pen($RAIN_INK, [Math]::Max(1.0, $s * 1.35))
        $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
        $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
        foreach ($r in $RAIN_STREAKS) {
            # Leaning very slightly, the way rain does.
            $g.DrawLine($pen, ($r.x * $s), ($r.y1 * $s), (($r.x - 0.7) * $s), ($r.y2 * $s))
        }
        $pen.Dispose()
    }

    # The cloud, as one silhouette so the lobes never show a seam. Winding fill
    # is what makes that true: the default alternate mode treats every overlap
    # as a hole, and the shape comes out as a tangle of rings.
    $cloud = New-Object System.Drawing.Drawing2D.GraphicsPath
    $cloud.FillMode = [System.Drawing.Drawing2D.FillMode]::Winding
    foreach ($l in $LOBES) {
        $r = $l.r * $s
        $cloud.AddEllipse(($l.cx * $s - $r), ($l.cy * $s - $r), ($r * 2), ($r * 2))
    }
    $bx = $BODY_BOX.left * $s
    $by = $BODY_BOX.top * $s
    $bw = ($BODY_BOX.right - $BODY_BOX.left) * $s
    $bh = ($BODY_BOX.bottom - $BODY_BOX.top) * $s
    $br = $bh / 2
    $body = New-Object System.Drawing.Drawing2D.GraphicsPath
    $body.AddArc($bx, $by, ($br * 2), ($br * 2), 90, 180)
    $body.AddArc(($bx + $bw - $br * 2), $by, ($br * 2), ($br * 2), 270, 180)
    $body.CloseFigure()
    $cloud.AddPath($body, $false)

    $brush = New-Object System.Drawing.SolidBrush($CLOUD_FILL)
    $g.FillPath($brush, $cloud)

    $g.Dispose(); $sky.Dispose(); $round.Dispose(); $cloud.Dispose(); $body.Dispose(); $brush.Dispose()
    return $bmp
}

# --- pack the sizes into one .ico -------------------------------------------

$pngs = @()
foreach ($size in $Sizes) {
    $bmp = New-CloudBitmap $size
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngs += , @{ size = $size; bytes = $ms.ToArray() }
    $ms.Dispose(); $bmp.Dispose()
}

$stream = New-Object System.IO.MemoryStream
$w = New-Object System.IO.BinaryWriter($stream)

# ICONDIR
$w.Write([UInt16]0)                 # reserved
$w.Write([UInt16]1)                 # type: icon
$w.Write([UInt16]$pngs.Count)

# ICONDIRENTRY per image, 16 bytes each
$offset = 6 + (16 * $pngs.Count)
foreach ($p in $pngs) {
    $dim = if ($p.size -ge 256) { 0 } else { $p.size }   # 0 means 256
    $w.Write([Byte]$dim)
    $w.Write([Byte]$dim)
    $w.Write([Byte]0)               # palette colours
    $w.Write([Byte]0)               # reserved
    $w.Write([UInt16]1)             # colour planes
    $w.Write([UInt16]32)            # bits per pixel
    $w.Write([UInt32]$p.bytes.Length)
    $w.Write([UInt32]$offset)
    $offset += $p.bytes.Length
}
foreach ($p in $pngs) { $w.Write($p.bytes) }

$w.Flush()
[System.IO.File]::WriteAllBytes($Out, $stream.ToArray())
$w.Dispose(); $stream.Dispose()

Write-Host "Wrote $Out ($($pngs.Count) sizes)"

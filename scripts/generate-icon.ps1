Add-Type -AssemblyName System.Drawing

$width = 512
$height = 512
$bmp = New-Object System.Drawing.Bitmap $width, $height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

# 1. 深度酒馆黑金背景
$bgBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 15, 17, 24))
$g.FillRectangle($bgBrush, 0, 0, $width, $height)

# 2. 金色发光边框
$borderPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 217, 119, 6)), 10
$g.DrawRectangle($borderPen, 10, 10, 492, 492)

$innerPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 251, 191, 36)), 3
$g.DrawRectangle($innerPen, 20, 20, 472, 472)

# 3. 绘制居中两张倾斜扑克牌 (A♠ 与 K♥)
function Draw-Card($g, $x, $y, $w, $h, $angle, $val, $suit, [System.Drawing.Color]$suitColor) {
    $state = $g.Save()
    $g.TranslateTransform($x, $y)
    $g.RotateTransform($angle)
    $cardRect = New-Object System.Drawing.Rectangle (-[int]($w/2)), (-[int]($h/2)), $w, $h
    
    # 牌身阴影与白底
    $shadowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(140, 0, 0, 0))
    $g.FillRectangle($shadowBrush, (-[int]($w/2) + 6), (-[int]($h/2) + 6), $w, $h)
    
    $cardBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 248, 250, 252))
    $g.FillRectangle($cardBrush, $cardRect)
    
    $cardPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 148, 163, 184)), 2
    $g.DrawRectangle($cardPen, $cardRect)
    
    # 点数与花色
    $fontVal = New-Object System.Drawing.Font "Arial", [float]24, [System.Drawing.FontStyle]::Bold
    $fontSuit = New-Object System.Drawing.Font "Arial", [float]34, [System.Drawing.FontStyle]::Bold
    $textColor = New-Object System.Drawing.SolidBrush $suitColor
    
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    
    $g.DrawString($val, $fontVal, $textColor, [float](-$w/2 + 25), [float](-$h/2 + 26), $sf)
    $g.DrawString($suit, $fontSuit, $textColor, [float]0, [float]8, $sf)
    
    $g.Restore($state)
}

# 绘制左倾 K♥ 和右倾 A♠
Draw-Card $g 210 200 120 170 -14 "K" "♥" ([System.Drawing.Color]::FromArgb(255, 225, 29, 72))
Draw-Card $g 302 200 120 170 14 "A" "♠" ([System.Drawing.Color]::FromArgb(255, 15, 23, 42))

# 4. 绘制居中 8 弹巢左轮转轮 (直径 170)
$cx = 256
$cy = 220
$cr = 86

$cylBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(245, 30, 34, 46))
$g.FillEllipse($cylBrush, [float]($cx - $cr), [float]($cy - $cr), [float]($cr * 2), [float]($cr * 2))

$cylPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 245, 158, 11)), 6
$g.DrawEllipse($cylPen, [float]($cx - $cr), [float]($cy - $cr), [float]($cr * 2), [float]($cr * 2))

# 绘制 8 个黄铜子弹孔
$bulletR = 14
$orbitR = 56
for ($i = 0; $i -lt 8; $i++) {
    $rad = ($i * 45) * [Math]::PI / 180
    $bx = $cx + [Math]::Cos($rad) * $orbitR
    $by = $cy + [Math]::Sin($rad) * $orbitR
    
    # 弹孔阴影
    $holeBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 12, 13, 18))
    $g.FillEllipse($holeBrush, [float]($bx - $bulletR), [float]($by - $bulletR), [float]($bulletR * 2), [float]($bulletR * 2))
    
    # 黄铜子弹底火
    $brassBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 251, 191, 36))
    $g.FillEllipse($brassBrush, [float]($bx - $bulletR + 3), [float]($by - $bulletR + 3), [float](($bulletR - 3) * 2), [float](($bulletR - 3) * 2))
    
    # 底火击发中心
    $primerBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 180, 83, 9))
    $g.FillEllipse($primerBrush, [float]($bx - 4), [float]($by - 4), [float]8, [float]8)
}

# 转轮中心轴
$centerBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 217, 119, 6))
$g.FillEllipse($centerBrush, [float]($cx - 16), [float]($cy - 16), [float]32, [float]32)
$innerCenterBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 12, 13, 18))
$g.FillEllipse($innerCenterBrush, [float]($cx - 8), [float]($cy - 8), [float]16, [float]16)

# 5. 绘制金色酒馆标牌
$sfCenter = New-Object System.Drawing.StringFormat
$sfCenter.Alignment = [System.Drawing.StringAlignment]::Center

$fontEn = New-Object System.Drawing.Font "Arial", [float]18, [System.Drawing.FontStyle]::Bold
$brushGold = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 251, 191, 36))
$g.DrawString("LIARS BAR", $fontEn, $brushGold, [float]256, [float]52, $sfCenter)

# 底部主标题 "骗子酒馆"
$fontZh = New-Object System.Drawing.Font "Microsoft YaHei", [float]44, [System.Drawing.FontStyle]::Bold
$g.DrawString("骗子酒馆", $fontZh, $brushGold, [float]256, [float]352, $sfCenter)

# 底部小字 "德州扑克 · 8弹生死局"
$fontSub = New-Object System.Drawing.Font "Microsoft YaHei", [float]16, [System.Drawing.FontStyle]::Bold
$brushSub = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 203, 213, 225))
$g.DrawString("德州扑克 · 8弹生死局", $fontSub, $brushSub, [float]256, [float]430, $sfCenter)

$targetPath = "E:\others\app\liars-bar\icon.png"
$bmp.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
Write-Host "Icon successfully generated at: $targetPath"

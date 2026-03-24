#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Generic rebranding script. Replaces frontend branding and specific backend CLI outputs.
  Removes EnterpriseBanner component.
.USAGE
  pwsh scripts/rebrand-ai-security.ps1 -OldValue "promptfoo" -NewValue "AI Security"
#>
[CmdletBinding()]
param (
    [Parameter(Mandatory=$true, HelpMessage="The existing brand name (e.g. 'promptfoo')")]
    [string]$OldValue,

    [Parameter(Mandatory=$true, HelpMessage="The new brand name (e.g. 'AI Security')")]
    [string]$NewValue
)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot | Split-Path   # repo root
$App  = Join-Path $Root 'src\app\src'

# Derive variants
$OldLower = $OldValue.ToLower()
$OldTitle = (Culture).TextInfo.ToTitleCase($OldLower)

$NewTitle = $NewValue
$NewFlat  = $NewValue.ToLower() -replace '\s', ''
$NewKebab = $NewValue.ToLower() -replace '\s', '-'

function Replace-InFile([string]$Path, [string]$Old, [string]$New) {
  if (-not (Test-Path $Path)) { return }
  $content = Get-Content $Path -Raw
  if ($content -notmatch [regex]::Escape($Old)) { return }
  $content -replace [regex]::Escape($Old), $New | Set-Content $Path -NoNewline
  Write-Host "  patched: $Path ($Old -> $New)"
}

function Delete-File([string]$Path) {
  if (-not (Test-Path $Path)) { return }
  Remove-Item $Path -Force
  Write-Host "  deleted: $Path"
}

$TargetFiles = @(
  "$Root\src\app\index.html",
  "$App\components\Logo.tsx",
  "$App\hooks\usePageMeta.ts",
  "$App\components\ApiSettingsModal.tsx",
  "$App\pages\login.tsx",
  "$App\pages\launcher\page.tsx",
  "$App\pages\history\History.tsx",
  "$App\pages\redteam\setup\page.tsx",
  "$App\pages\redteam\setup\components\Review.tsx",
  "$App\pages\redteam\setup\components\Purpose.tsx",
  "$App\pages\redteam\setup\components\Plugins.tsx",
  "$App\pages\redteam\setup\components\strategies\StrategyItem.tsx",
  "$App\pages\redteam\setup\components\VerticalSuiteCard.tsx",
  "$App\pages\redteam\setup\components\TestCaseDialog.tsx",
  "$App\pages\redteam\setup\components\StrategyConfigDialog.tsx",
  "$App\pages\redteam\setup\components\StatefulnessRadioGroup.tsx",
  "$App\pages\redteam\setup\components\Strategies.tsx",
  "$App\pages\redteam\setup\components\PluginsTab.tsx",
  "$App\pages\redteam\setup\components\Targets\CustomPoliciesSection.tsx",
  "$App\pages\redteam\setup\components\Targets\AgentFrameworkConfiguration.tsx",
  "$App\pages\redteam\setup\components\Targets\tabs\DigitalSignatureAuthTab.tsx",
  "$App\pages\redteam\setup\components\Targets\tabs\AuthorizationTab.tsx",
  "$App\pages\redteam\setup\components\Targets\HttpEndpointConfiguration.tsx",
  "$App\pages\redteam\setup\components\Targets\index.tsx",
  "$App\pages\redteam\setup\components\Targets\ProviderConfigEditor.tsx",
  "$App\pages\model-audit\components\InstallationGuide.tsx",
  "$App\hooks\usePageMeta.test.ts",
  "$App\components\ApiSettingsModal.test.tsx",
  "$App\pages\launcher\page.test.tsx",
  "$App\pages\evals\page.test.tsx",
  "$App\pages\history\page.test.tsx",
  "$App\pages\redteam\setup\components\Review.test.tsx",
  "$App\pages\redteam\setup\components\Purpose.test.tsx",
  "$App\pages\redteam\setup\components\Plugins.test.tsx",
  "$App\pages\redteam\setup\components\TestCaseDialog.test.tsx",
  "$App\pages\redteam\setup\components\StrategyConfigDialog.test.tsx",
  "$Root\src\commands\eval\summary.ts",
  "$Root\src\commands\modelScan.ts",
  "$Root\src\commands\list.ts",
  "$Root\src\commands\share.ts",
  "$Root\src\commands\redteam.ts",
  "$Root\src\redteam\extraction\purpose.ts"
)

Write-Host "`n=== Text Replacements ===" -ForegroundColor Cyan
foreach ($f in $TargetFiles) {
  # 1. Kebab case specific files
  Replace-InFile $f "$OldLower-eval-history" "$NewKebab-eval-history"

  # 2. URLs
  Replace-InFile $f "https://$OldLower.app" "https://$NewFlat.app"
  Replace-InFile $f "https://$OldLower.dev" "https://$NewFlat.dev"
  
  # 3. CLI commands and lowercases
  Replace-InFile $f "$OldLower view" "$NewFlat view"
  Replace-InFile $f "$OldLower share" "$NewFlat share"
  Replace-InFile $f "$OldLower redteam" "$NewFlat redteam"
  Replace-InFile $f "$OldLower@" "$NewFlat@"
  
  # Title-case strings (e.g. Promptfoo -> AI Security)
  Replace-InFile $f $OldTitle $NewTitle
  
  # Blanket catch-all lowercases inside strings like '<title>promptfoo</title>'
  Replace-InFile $f $OldLower $NewTitle
}

Write-Host "`n=== Remove EnterpriseBanner ===" -ForegroundColor Cyan
Delete-File "$App\components\EnterpriseBanner.tsx"
Delete-File "$App\components\EnterpriseBanner.test.tsx"

$evalPath = "$App\pages\eval\components\Eval.tsx"
if (Test-Path $evalPath) {
  $c = Get-Content $evalPath -Raw
  $c = $c -replace "import EnterpriseBanner from '@app/components/EnterpriseBanner';\r?\n", ''
  $c = $c -replace '\s*<EnterpriseBanner[^/]*/>', ''
  $c | Set-Content $evalPath -NoNewline
  Write-Host "  patched: $evalPath"
}

$reportPath = "$App\pages\redteam\report\components\Report.tsx"
if (Test-Path $reportPath) {
  $c = Get-Content $reportPath -Raw
  $c = $c -replace "import EnterpriseBanner from '@app/components/EnterpriseBanner';\r?\n", ''
  $c = $c -replace '\s*<EnterpriseBanner[^/]*/>', ''
  $c | Set-Content $reportPath -NoNewline
  Write-Host "  patched: $reportPath"
}

$evalTestPath = "$App\pages\eval\components\Eval.test.tsx"
if (Test-Path $evalTestPath) {
  $c = Get-Content $evalTestPath -Raw
  $c = $c -replace "vi\.mock\('@app/components/EnterpriseBanner'[^)]*\);\r?\n", ''
  $c | Set-Content $evalTestPath -NoNewline
  Write-Host "  patched: $evalTestPath"
}

$reportTestPath = "$App\pages\redteam\report\components\Report.test.tsx"
if (Test-Path $reportTestPath) {
  $c = Get-Content $reportTestPath -Raw
  $c = $c -replace "vi\.mock\('@app/components/EnterpriseBanner'[^)]*\);\r?\n", ''
  $c | Set-Content $reportTestPath -NoNewline
  Write-Host "  patched: $reportTestPath"
}


Write-Host "`n=== Logo & Favicon Replacement ===" -ForegroundColor Cyan
$pythonScript = @'
import sys, os, base64, struct, zlib
try:
    from PIL import Image, ImageDraw, ImageFont
    HAS_PILLOW = True
except ImportError:
    HAS_PILLOW = False

def generate_logo_pillow(size, out_path):
    img = Image.new('RGBA', (size, size), (10, 15, 35, 255))
    draw = ImageDraw.Draw(img)
    for i in range(size // 2, 0, -2):
        alpha = int(40 * (1 - i / (size / 2)))
        draw.ellipse([size//2 - i, size//2 - i, size//2 + i, size//2 + i], outline=(0, 200, 220, alpha))
    s = size
    shield_pts = [(s*0.5, s*0.12), (s*0.85, s*0.25), (s*0.85, s*0.58), (s*0.5, s*0.88), (s*0.15, s*0.58), (s*0.15, s*0.25)]
    shield_pts = [(int(x), int(y)) for x, y in shield_pts]
    draw.polygon(shield_pts, fill=(0, 150, 180, 220), outline=(0, 220, 240, 255))
    inner = [(int(x * 0.75 + s * 0.125), int(y * 0.75 + s * 0.075)) for x, y in shield_pts]
    draw.polygon(inner, fill=None, outline=(0, 240, 255, 120))
    cx, cy = s // 2, int(s * 0.47)
    r = int(s * 0.09)
    node_color = (0, 240, 255, 255)
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=node_color)
    for dx, dy in [(-0.18, -0.12), (0.18, -0.12), (-0.18, 0.12), (0.18, 0.12)]:
        nx, ny = int(cx + dx * s), int(cy + dy * s)
        nr = int(s * 0.055)
        draw.ellipse([nx - nr, ny - nr, nx + nr, ny + nr], fill=node_color)
        draw.line([cx, cy, nx, ny], fill=(0, 240, 255, 160), width=max(1, int(s * 0.02)))
    img.save(out_path, 'PNG')

def make_png_chunk(name, data):
    c = zlib.crc32(name + data) & 0xffffffff
    return struct.pack('>I', len(data)) + name + data + struct.pack('>I', c)

def generate_logo_pure(size, out_path):
    w, h = size, size
    raw_rows = []
    for y in range(h):
        row = [0]
        for x in range(w):
            dx, dy = x - w / 2, y - h / 2
            dist = (dx*dx + dy*dy) ** 0.5
            if dist < w * 0.38: row += [0, 180, 200, 255]
            else: row += [10, 15, 35, 255]
        raw_rows.append(bytes(row))
    raw = zlib.compress(b''.join(raw_rows), 9)
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)
    png = (b'\x89PNG\r\n\x1a\n' + make_png_chunk(b'IHDR', ihdr) + make_png_chunk(b'IDAT', raw) + make_png_chunk(b'IEND', b''))
    with open(out_path, 'wb') as f: f.write(png)

out_dir = sys.argv[1]
os.makedirs(out_dir, exist_ok=True)
sizes = {'logo-256.png': 256, 'favicon-32x32.png': 32, 'favicon-16x16.png': 16}
for fname, sz in sizes.items():
    p = os.path.join(out_dir, fname)
    if HAS_PILLOW: generate_logo_pillow(sz, p)
    else: generate_logo_pure(sz, p)

logo_path = os.path.join(out_dir, 'logo-256.png')
with open(logo_path, 'rb') as f: b64 = base64.b64encode(f.read()).decode()
svg = f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 256 256"><image width="256" height="256" xlink:href="data:image/png;base64,{b64}"/></svg>'
svg_path = os.path.join(out_dir, 'logo.svg')
with open(svg_path, 'w') as f: f.write(svg)

import shutil
shutil.copy(os.path.join(out_dir, 'favicon-32x32.png'), os.path.join(out_dir, 'favicon.png'))

ico_path = os.path.join(out_dir, 'favicon.ico')
with open(os.path.join(out_dir, 'favicon-32x32.png'), 'rb') as f: png_data = f.read()
ico  = b'\x00\x00\x01\x00\x01\x00\x20\x20\x00\x00\x01\x00\x20\x00' + struct.pack('<I', len(png_data)) + struct.pack('<I', 22) + png_data
with open(ico_path, 'wb') as f: f.write(ico)
'@

$tmpDir = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "$NewKebab-logo")
$pyScript = [System.IO.Path]::GetTempFileName() + '.py'
$pythonScript | Set-Content $pyScript -Encoding UTF8

try {
  $py = Get-Command python -ErrorAction SilentlyContinue
  if (-not $py) { $py = Get-Command python3 -ErrorAction SilentlyContinue }
  if ($py) {
    & $py.Source $pyScript $tmpDir
    $PublicDir = Join-Path $Root 'src\app\public'
    $AssetsDir = Join-Path $Root 'src\app\src\assets'
    Copy-Item (Join-Path $tmpDir 'favicon.png') "$PublicDir\favicon.png" -Force
    Copy-Item (Join-Path $tmpDir 'favicon-16x16.png') "$PublicDir\favicon-16x16.png" -Force
    Copy-Item (Join-Path $tmpDir 'favicon-32x32.png') "$PublicDir\favicon-32x32.png" -Force
    Copy-Item (Join-Path $tmpDir 'favicon.ico') "$PublicDir\favicon.ico" -Force
    Copy-Item (Join-Path $tmpDir 'logo.svg') "$AssetsDir\logo.svg" -Force
    Write-Host "  Logo and favicon files replaced successfully." -ForegroundColor Green
  }
} catch {
  Write-Warning "Logo generation step skipped: $_"
} finally {
  Remove-Item $pyScript -ErrorAction SilentlyContinue
}

Write-Host "`n=== Register '$NewFlat' CLI command ===" -ForegroundColor Cyan
$pkgJson = Join-Path $Root 'package.json'
$pkg = Get-Content $pkgJson -Raw
if ($pkg -notmatch "`"$NewFlat`"") {
  $pkg = $pkg -replace '("bin"\s*:\s*\{)', "`$1`n    `"$NewFlat`": `"dist/src/entrypoint.js`","
  $pkg | Set-Content $pkgJson -NoNewline
  Write-Host "  patched: package.json (added '$NewFlat' to bin)"
}

$npmGlobal = "$env:APPDATA\npm"
$srcShim   = 'pf'
$dstShim   = $NewFlat
$allCreated = $true

foreach ($ext in @('', '.cmd', '.ps1')) {
  $src = Join-Path $npmGlobal "$srcShim$ext"
  $dst = Join-Path $npmGlobal "$dstShim$ext"
  if (Test-Path $src) {
    Copy-Item $src $dst -Force
  } else {
    $allCreated = $false
  }
}

if ($allCreated) {
  Write-Host "  '$NewFlat' CLI is ready - try: $NewFlat --version" -ForegroundColor Green
} else {
  Write-Host "  Partial: run 'npm run build && npm link --force' to finish CLI registration." -ForegroundColor Yellow
}

Write-Host "`n[Done] Rebranding script complete!" -ForegroundColor Green

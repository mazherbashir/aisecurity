#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Rebrands the promptfoo frontend from "promptfoo"/"Promptfoo" -> "AI Security".
  Removes EnterpriseBanner component and all its consumers.
.USAGE
  pwsh scripts/rebrand-ai-security.ps1
  # Run from the repo root: c:\github\promptfoo-0.121.2\promptfoo
#>

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot | Split-Path   # repo root
$App  = Join-Path $Root 'src\app\src'

function Replace-InFile([string]$Path, [string]$Old, [string]$New) {
  if (-not (Test-Path $Path)) { Write-Warning "SKIP (not found): $Path"; return }
  $content = Get-Content $Path -Raw
  if ($content -notmatch [regex]::Escape($Old)) { Write-Warning "SKIP (pattern not found): $Path"; return }
  $content -replace [regex]::Escape($Old), $New | Set-Content $Path -NoNewline
  Write-Host "  patched: $Path"
}

function Delete-File([string]$Path) {
  if (-not (Test-Path $Path)) { Write-Warning "SKIP (not found): $Path"; return }
  Remove-Item $Path -Force
  Write-Host "  deleted: $Path"
}

Write-Host "`n=== HTML Entry Point ===" -ForegroundColor Cyan
Replace-InFile "$Root\src\app\index.html" `
  '<title>promptfoo</title>' `
  '<title>AI Security</title>'

Write-Host "`n=== Logo component ===" -ForegroundColor Cyan
Replace-InFile "$App\components\Logo.tsx" 'alt="Promptfoo Logo"' 'alt="AI Security Logo"'
Replace-InFile "$App\components\Logo.tsx" '        promptfoo' '        AI Security'

Write-Host "`n=== usePageMeta hook ===" -ForegroundColor Cyan
Replace-InFile "$App\hooks\usePageMeta.ts" '| promptfoo`' '| AI Security`'

Write-Host "`n=== ApiSettingsModal ===" -ForegroundColor Cyan
Replace-InFile "$App\components\ApiSettingsModal.tsx" 'Connected to promptfoo API' 'Connected to AI Security API'
Replace-InFile "$App\components\ApiSettingsModal.tsx" 'Cannot connect to promptfoo API' 'Cannot connect to AI Security API'
Replace-InFile "$App\components\ApiSettingsModal.tsx" 'The promptfoo API the webview will connect to' 'The AI Security API the webview will connect to'

Write-Host "`n=== Login page ===" -ForegroundColor Cyan
Replace-InFile "$App\pages\login.tsx" "Login to Promptfoo" "Login to AI Security"
Replace-InFile "$App\pages\login.tsx" "Sign in to access your Promptfoo workspace" "Sign in to access your AI Security workspace"
Replace-InFile "$App\pages\login.tsx" 'alt="Promptfoo"' 'alt="AI Security"'
Replace-InFile "$App\pages\login.tsx" '<h1>promptfoo</h1>' '<h1>AI Security</h1>'
Replace-InFile "$App\pages\login.tsx" "Welcome to Promptfoo" "Welcome to AI Security"

Write-Host "`n=== Launcher page ===" -ForegroundColor Cyan
Replace-InFile "$App\pages\launcher\page.tsx" 'alt="Promptfoo Logo"' 'alt="AI Security Logo"'
Replace-InFile "$App\pages\launcher\page.tsx" 'Welcome to Promptfoo' 'Welcome to AI Security'
Replace-InFile "$App\pages\launcher\page.tsx" 'Connecting to Promptfoo on localhost:15500' 'Connecting to AI Security on localhost:15500'
Replace-InFile "$App\pages\launcher\page.tsx" 'Connected to Promptfoo successfully!' 'Connected to AI Security successfully!'

Write-Host "`n=== History page (download filenames) ===" -ForegroundColor Cyan
Replace-InFile "$App\pages\history\History.tsx" 'promptfoo-eval-history.json' 'ai-security-eval-history.json'
Replace-InFile "$App\pages\history\History.tsx" 'promptfoo-eval-history.csv' 'ai-security-eval-history.csv'

Write-Host "`n=== Redteam setup page ===" -ForegroundColor Cyan
Replace-InFile "$App\pages\redteam\setup\page.tsx" `
  'Import an existing promptfoo redteam YAML configuration.' `
  'Import an existing AI Security redteam YAML configuration.'

Write-Host "`n=== Redteam components ===" -ForegroundColor Cyan
Replace-InFile "$App\pages\redteam\setup\components\Review.tsx" 'Promptfoo Cloud' 'AI Security Cloud'
Replace-InFile "$App\pages\redteam\setup\components\Purpose.tsx" 'Promptfoo API' 'AI Security API'
Replace-InFile "$App\pages\redteam\setup\components\Plugins.tsx" "Plugins are Promptfoo's modular system" "Plugins are AI Security's modular system"
Replace-InFile "$App\pages\redteam\setup\components\Plugins.tsx" 'Promptfoo transforms each intent' 'AI Security transforms each intent'
Replace-InFile "$App\pages\redteam\setup\components\strategies\StrategyItem.tsx" 'Promptfoo Enterprise' 'AI Security Enterprise'
Replace-InFile "$App\pages\redteam\setup\components\VerticalSuiteCard.tsx" 'Promptfoo Enterprise' 'AI Security Enterprise'
Replace-InFile "$App\pages\redteam\setup\components\VerticalSuiteCard.tsx" 'Promptfoo Cloud' 'AI Security Cloud'
Replace-InFile "$App\pages\redteam\setup\components\TestCaseDialog.tsx" 'Promptfoo Cloud' 'AI Security Cloud'
Replace-InFile "$App\pages\redteam\setup\components\StrategyConfigDialog.tsx" 'Promptfoo should only send' 'AI Security should only send'
Replace-InFile "$App\pages\redteam\setup\components\StrategyConfigDialog.tsx" 'Promptfoo Cloud' 'AI Security Cloud'
Replace-InFile "$App\pages\redteam\setup\components\StatefulnessRadioGroup.tsx" 'Promptfoo should only send' 'AI Security should only send'
Replace-InFile "$App\pages\redteam\setup\components\StatefulnessRadioGroup.tsx" 'Promptfoo should resend' 'AI Security should resend'
Replace-InFile "$App\pages\redteam\setup\components\Strategies.tsx" 'Promptfoo Enterprise' 'AI Security Enterprise'
Replace-InFile "$App\pages\redteam\setup\components\PluginsTab.tsx" 'Promptfoo Cloud' 'AI Security Cloud'
Replace-InFile "$App\pages\redteam\setup\components\Targets\CustomPoliciesSection.tsx" 'Promptfoo Cloud' 'AI Security Cloud'
Replace-InFile "$App\pages\redteam\setup\components\Targets\AgentFrameworkConfiguration.tsx" 'Promptfoo' 'AI Security'
Replace-InFile "$App\pages\redteam\setup\components\Targets\tabs\DigitalSignatureAuthTab.tsx" 'sent to Promptfoo' 'sent to AI Security'
Replace-InFile "$App\pages\redteam\setup\components\Targets\tabs\AuthorizationTab.tsx" 'sent to Promptfoo' 'sent to AI Security'
Replace-InFile "$App\pages\redteam\setup\components\Targets\HttpEndpointConfiguration.tsx" 'Promptfoo will automatically' 'AI Security will automatically'
Replace-InFile "$App\pages\redteam\setup\components\Targets\index.tsx" 'In Promptfoo targets' 'In AI Security targets'
Replace-InFile "$App\pages\redteam\setup\components\Targets\ProviderConfigEditor.tsx" '. Promptfoo uses Nunjucks' '. AI Security uses Nunjucks'

Write-Host "`n=== InstallationGuide ===" -ForegroundColor Cyan
Replace-InFile "$App\pages\model-audit\components\InstallationGuide.tsx" 'the Promptfoo server' 'the AI Security server'

Write-Host "`n=== Remove EnterpriseBanner ===" -ForegroundColor Cyan
Delete-File "$App\components\EnterpriseBanner.tsx"
Delete-File "$App\components\EnterpriseBanner.test.tsx"

# Remove import + usage from Eval.tsx
$evalPath = "$App\pages\eval\components\Eval.tsx"
if (Test-Path $evalPath) {
  $c = Get-Content $evalPath -Raw
  $c = $c -replace "import EnterpriseBanner from '@app/components/EnterpriseBanner';\r?\n", ''
  $c = $c -replace '\s*<EnterpriseBanner[^/]*/>', ''
  $c | Set-Content $evalPath -NoNewline
  Write-Host "  patched: $evalPath"
}

# Remove import + usage from Report.tsx
$reportPath = "$App\pages\redteam\report\components\Report.tsx"
if (Test-Path $reportPath) {
  $c = Get-Content $reportPath -Raw
  $c = $c -replace "import EnterpriseBanner from '@app/components/EnterpriseBanner';\r?\n", ''
  $c = $c -replace '\s*<EnterpriseBanner[^/]*/>', ''
  $c | Set-Content $reportPath -NoNewline
  Write-Host "  patched: $reportPath"
}

# Remove vi.mock from Eval.test.tsx
$evalTestPath = "$App\pages\eval\components\Eval.test.tsx"
if (Test-Path $evalTestPath) {
  $c = Get-Content $evalTestPath -Raw
  $c = $c -replace "vi\.mock\('@app/components/EnterpriseBanner'[^)]*\);\r?\n", ''
  $c | Set-Content $evalTestPath -NoNewline
  Write-Host "  patched: $evalTestPath"
}

# Remove vi.mock from Report.test.tsx
$reportTestPath = "$App\pages\redteam\report\components\Report.test.tsx"
if (Test-Path $reportTestPath) {
  $c = Get-Content $reportTestPath -Raw
  $c = $c -replace "vi\.mock\('@app/components/EnterpriseBanner'[^)]*\);\r?\n", ''
  $c | Set-Content $reportTestPath -NoNewline
  Write-Host "  patched: $reportTestPath"
}

Write-Host "`n=== Test file assertions ===" -ForegroundColor Cyan
Replace-InFile "$App\hooks\usePageMeta.test.ts" '| promptfoo' '| AI Security'
Replace-InFile "$App\components\ApiSettingsModal.test.tsx" 'promptfoo API' 'AI Security API'
Replace-InFile "$App\pages\launcher\page.test.tsx" 'Promptfoo' 'AI Security'
Replace-InFile "$App\pages\evals\page.test.tsx" 'Evals | promptfoo' 'Evals | AI Security'
Replace-InFile "$App\pages\history\page.test.tsx" 'History | promptfoo' 'History | AI Security'
Replace-InFile "$App\pages\redteam\setup\components\Review.test.tsx" 'Promptfoo Cloud' 'AI Security Cloud'
Replace-InFile "$App\pages\redteam\setup\components\Purpose.test.tsx" 'Promptfoo API' 'AI Security API'
Replace-InFile "$App\pages\redteam\setup\components\Plugins.test.tsx" 'Promptfoo' 'AI Security'
Replace-InFile "$App\pages\redteam\setup\components\TestCaseDialog.test.tsx" 'Promptfoo Cloud' 'AI Security Cloud'
Replace-InFile "$App\pages\redteam\setup\components\StrategyConfigDialog.test.tsx" 'Promptfoo' 'AI Security'

Write-Host "`n=== CLI output strings ===" -ForegroundColor Cyan
Replace-InFile "$Root\src\commands\eval\summary.ts" 'promptfoo view' 'aisecurity view'
Replace-InFile "$Root\src\commands\eval\summary.ts" 'promptfoo share' 'aisecurity share'
Replace-InFile "$Root\src\commands\eval\summary.ts" 'https://promptfoo.app' 'https://aisecurity.app'
Replace-InFile "$Root\src\commands\eval\summary.ts" 'https://promptfoo.dev/feedback' 'https://aisecurity.dev/feedback'

Replace-InFile "$Root\src\commands\modelScan.ts" 'promptfoo view' 'aisecurity view'
Replace-InFile "$Root\src\commands\list.ts" 'promptfoo view' 'aisecurity view'
Replace-InFile "$App\pages\launcher\page.tsx" 'promptfoo view' 'aisecurity view'
Replace-InFile "$App\pages\launcher\page.test.tsx" 'promptfoo view' 'aisecurity view'

Write-Host "`n=== Logo & Favicon Replacement ===" -ForegroundColor Cyan

# Python script to generate the AI Security logo and favicon files
$pythonScript = @'
import sys, os, base64, struct, zlib

# Try to use Pillow if available; fall back to pure-Python PNG generator
try:
    from PIL import Image, ImageDraw, ImageFont
    HAS_PILLOW = True
except ImportError:
    HAS_PILLOW = False

def generate_logo_pillow(size, out_path):
    """Generate AI Security logo using Pillow."""
    img = Image.new('RGBA', (size, size), (10, 15, 35, 255))
    draw = ImageDraw.Draw(img)

    # Background gradient effect (concentric circles)
    for i in range(size // 2, 0, -2):
        alpha = int(40 * (1 - i / (size / 2)))
        draw.ellipse(
            [size//2 - i, size//2 - i, size//2 + i, size//2 + i],
            outline=(0, 200, 220, alpha)
        )

    # Draw shield shape
    s = size
    shield_pts = [
        (s*0.5, s*0.12), (s*0.85, s*0.25), (s*0.85, s*0.58),
        (s*0.5, s*0.88), (s*0.15, s*0.58), (s*0.15, s*0.25)
    ]
    shield_pts = [(int(x), int(y)) for x, y in shield_pts]
    draw.polygon(shield_pts, fill=(0, 150, 180, 220), outline=(0, 220, 240, 255))

    # Inner shield highlight
    inner = [(int(x * 0.75 + s * 0.125), int(y * 0.75 + s * 0.075)) for x, y in shield_pts]
    draw.polygon(inner, fill=None, outline=(0, 240, 255, 120))

    # Circuit brain nodes
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
    print(f'  Generated (Pillow): {out_path}')

def make_png_chunk(name, data):
    c = zlib.crc32(name + data) & 0xffffffff
    return struct.pack('>I', len(data)) + name + data + struct.pack('>I', c)

def generate_logo_pure(size, out_path):
    """Minimal pure-Python PNG — navy square with cyan circle."""
    w, h = size, size
    raw_rows = []
    for y in range(h):
        row = [0]  # filter byte
        for x in range(w):
            dx, dy = x - w / 2, y - h / 2
            dist = (dx*dx + dy*dy) ** 0.5
            if dist < w * 0.38:
                row += [0, 180, 200, 255]
            else:
                row += [10, 15, 35, 255]
        raw_rows.append(bytes(row))
    raw = zlib.compress(b''.join(raw_rows), 9)
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)
    png = (b'\x89PNG\r\n\x1a\n'
           + make_png_chunk(b'IHDR', ihdr)
           + make_png_chunk(b'IDAT', raw)
           + make_png_chunk(b'IEND', b''))
    with open(out_path, 'wb') as f:
        f.write(png)
    print(f'  Generated (pure-Python PNG): {out_path}')

out_dir = sys.argv[1]
os.makedirs(out_dir, exist_ok=True)

# Generate sizes needed
sizes = {'logo-256.png': 256, 'favicon-32x32.png': 32, 'favicon-16x16.png': 16}
for fname, sz in sizes.items():
    p = os.path.join(out_dir, fname)
    if HAS_PILLOW:
        generate_logo_pillow(sz, p)
    else:
        generate_logo_pure(sz, p)

# Build SVG with base64-embedded 256px PNG
logo_path = os.path.join(out_dir, 'logo-256.png')
with open(logo_path, 'rb') as f:
    b64 = base64.b64encode(f.read()).decode()
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 256 256">
  <image width="256" height="256" xlink:href="data:image/png;base64,{b64}"/>
</svg>'''
svg_path = os.path.join(out_dir, 'logo.svg')
with open(svg_path, 'w') as f:
    f.write(svg)
print(f'  Generated SVG: {svg_path}')

# Copy 32x32 as favicon.png
import shutil
shutil.copy(os.path.join(out_dir, 'favicon-32x32.png'), os.path.join(out_dir, 'favicon.png'))
print(f'  Copied favicon.png')

# Create minimal ICO (32x32 embedded)
ico_path = os.path.join(out_dir, 'favicon.ico')
with open(os.path.join(out_dir, 'favicon-32x32.png'), 'rb') as f:
    png_data = f.read()
ico  = b'\x00\x00'          # reserved
ico += b'\x01\x00'          # type: ICO
ico += b'\x01\x00'          # count: 1
ico += b'\x20'              # width: 32
ico += b'\x20'              # height: 32
ico += b'\x00'              # color count
ico += b'\x00'              # reserved
ico += b'\x01\x00'          # color planes
ico += b'\x20\x00'          # bits per pixel
ico += struct.pack('<I', len(png_data))   # size of image data
ico += struct.pack('<I', 22)             # offset to image data
ico += png_data
with open(ico_path, 'wb') as f:
    f.write(ico)
print(f'  Generated ICO: {ico_path}')
'@

$tmpDir = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), 'ai-security-logo')
$pyScript = [System.IO.Path]::GetTempFileName() + '.py'
$pythonScript | Set-Content $pyScript -Encoding UTF8

try {
  $py = Get-Command python -ErrorAction SilentlyContinue
  if (-not $py) { $py = Get-Command python3 -ErrorAction SilentlyContinue }
  if (-not $py) { Write-Warning "Python not found - skipping logo generation. Install Python and re-run."; throw }

  & $py.Source $pyScript $tmpDir
  if ($LASTEXITCODE -ne 0) { throw "Python script failed (exit $LASTEXITCODE)" }

  # Copy generated files to app locations
  $PublicDir = Join-Path $Root 'src\app\public'
  $AssetsDir = Join-Path $Root 'src\app\src\assets'

  $filesToCopy = @(
    @{ Src = 'favicon.png';      Dst = "$PublicDir\favicon.png" }
    @{ Src = 'favicon-16x16.png'; Dst = "$PublicDir\favicon-16x16.png" }
    @{ Src = 'favicon-32x32.png'; Dst = "$PublicDir\favicon-32x32.png" }
    @{ Src = 'favicon.ico';      Dst = "$PublicDir\favicon.ico" }
    @{ Src = 'logo.svg';         Dst = "$AssetsDir\logo.svg" }
  )
  foreach ($f in $filesToCopy) {
    Copy-Item (Join-Path $tmpDir $f.Src) $f.Dst -Force
    Write-Host "  copied: $($f.Dst)"
  }
  Write-Host "  Logo and favicon files replaced successfully." -ForegroundColor Green
}
catch {
  Write-Warning "Logo generation step skipped: $_"
}
finally {
  Remove-Item $pyScript -ErrorAction SilentlyContinue
}

Write-Host "`n=== Register 'aisecurity' CLI command ===" -ForegroundColor Cyan

$pkgJson = Join-Path $Root 'package.json'
$pkg = Get-Content $pkgJson -Raw

# Add "aisecurity" bin entry if not already present
if ($pkg -notmatch '"aisecurity"') {
  $pkg = $pkg -replace '("bin"\s*:\s*\{)', "`$1`n    `"aisecurity`": `"dist/src/entrypoint.js`","
  $pkg | Set-Content $pkgJson -NoNewline
  Write-Host "  patched: package.json (added 'aisecurity' to bin)"
} else {
  Write-Host "  skip: 'aisecurity' bin entry already exists"
}

# Create npm global shims by copying from the existing 'pf' shims
$npmGlobal = "$env:APPDATA\npm"
$srcShim   = 'pf'
$dstShim   = 'aisecurity'
$allCreated = $true

foreach ($ext in @('', '.cmd', '.ps1')) {
  $src = Join-Path $npmGlobal "$srcShim$ext"
  $dst = Join-Path $npmGlobal "$dstShim$ext"
  if (Test-Path $src) {
    Copy-Item $src $dst -Force
    Write-Host "  created: $dst"
  } else {
    Write-Warning "Source shim not found: $src  (run 'npm link --force' after building)"
    $allCreated = $false
  }
}

if ($allCreated) {
  Write-Host "  'aisecurity' CLI is ready - try: aisecurity --version" -ForegroundColor Green
} else {
  Write-Host "  Partial: run 'npm run build && npm link --force' to finish registering the CLI." -ForegroundColor Yellow
}

Write-Host "`n[Done] Rebranding complete!" -ForegroundColor Green
Write-Host "   Run 'npm run dev:app' to verify in the browser." -ForegroundColor Gray

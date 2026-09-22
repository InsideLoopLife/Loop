param([string]$RepoRoot = (Get-Location).Path)
$ErrorActionPreference = "Stop"

$path = Join-Path $RepoRoot "components\investments\AmplifiedInvestmentsDashboard.tsx"
if (-not (Test-Path $path)) {
  throw "Could not find AmplifiedInvestmentsDashboard.tsx"
}

$content = Get-Content $path -Raw -Encoding UTF8

function S([int[]]$codes) {
  return -join ($codes | ForEach-Object { [char]$_ })
}

# Repair mojibake using code points only so this script itself stays ASCII-safe.
$badPound      = (S @(0x00C2,0x00A3))
$goodPound     = (S @(0x00A3))
$badEuro       = (S @(0x00E2,0x201A,0x00AC))
$goodEuro      = (S @(0x20AC))
$badUp         = (S @(0x00E2,0x2013,0x00B2))
$goodUp        = (S @(0x25B2))
$badDown       = (S @(0x00E2,0x2013,0x00BC))
$goodDown      = (S @(0x25BC))
$badEmDash     = (S @(0x00E2,0x20AC,0x201D))
$goodEmDash    = (S @(0x2014))
$badEnDash     = (S @(0x00E2,0x20AC,0x201C))
$goodEnDash    = (S @(0x2013))
$badTimes      = (S @(0x00C3,0x2014))
$goodTimes     = (S @(0x00D7))
$badMiddleDot  = (S @(0x00C2,0x00B7))
$goodMiddleDot = (S @(0x00B7))

$content = $content.Replace($badPound, $goodPound)
$content = $content.Replace($badEuro, $goodEuro)
$content = $content.Replace($badUp, $goodUp)
$content = $content.Replace($badDown, $goodDown)
$content = $content.Replace($badEmDash, $goodEmDash)
$content = $content.Replace($badEnDash, $goodEnDash)
$content = $content.Replace($badTimes, $goodTimes)
$content = $content.Replace($badMiddleDot, $goodMiddleDot)

$oldPortfolioLine = '  const portfolioPoints = remotePoints.length >= 2 ? remotePoints : localPortfolioPoints;'
$newPortfolioLine = '  const portfolioPoints = remotePoints.length >= 2 ? remotePoints : localPortfolioPoints.length >= 2 ? localPortfolioPoints : activeTotalValue > 0 ? [{ date: "Start", value: activeTotalValue }, { date: "Now", value: activeTotalValue }] : [];'
if (-not $content.Contains($oldPortfolioLine)) {
  throw "Could not find portfolioPoints line. Source has changed; nothing written."
}
$content = $content.Replace($oldPortfolioLine, $newPortfolioLine)

$oldAssetPoints = @'
      let points = observedPoints.length >= 2
        ? observedPoints
        : holdingPeriodPoints(holding, snapshots, period);
'@

$newAssetPoints = @'
      let points = observedPoints.length >= 2
        ? observedPoints
        : holdingPeriodPoints(holding, snapshots, period);
      if (points.length === 1) {
        points = [
          { date: "Start", value: points[0].value },
          { date: "Now", value: points[0].value },
        ];
      }
'@

if (-not $content.Contains($oldAssetPoints)) {
  throw "Could not find selected asset points block. Source has changed; nothing written."
}
$content = $content.Replace($oldAssetPoints, $newAssetPoints)

[System.IO.File]::WriteAllText(
  $path,
  $content,
  [System.Text.UTF8Encoding]::new($false)
)

Write-Host "Investment live-view fix v2 applied."
Write-Host "Now run git diff --check and inspect the file diff."

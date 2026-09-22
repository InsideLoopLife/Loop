param([string]$RepoRoot = (Get-Location).Path)
$ErrorActionPreference = "Stop"

$dashboardPath = Join-Path $RepoRoot "components\investments\AmplifiedInvestmentsDashboard.tsx"
$rangePath = Join-Path $RepoRoot "lib\investments\history-range.ts"

if (-not (Test-Path $dashboardPath)) { throw "AmplifiedInvestmentsDashboard.tsx not found." }
if (-not (Test-Path $rangePath)) { throw "history-range.ts not found." }

$dashboard = Get-Content $dashboardPath -Raw -Encoding UTF8
$range = Get-Content $rangePath -Raw -Encoding UTF8

# 1) 6M/YTD: production backfill is complete at 1h for this portfolio.
$rangeOld = '  if (range === "6m" || range === "ytd") return "1d";'
$rangeNew = '  if (range === "6m" || range === "ytd") return "1h";'
if (-not $range.Contains($rangeOld)) {
  throw "Could not find 6m/ytd bucket mapping. Nothing has been written."
}
$range = $range.Replace($rangeOld, $rangeNew)

# 2) Always load observed history for the currently selected holding.
$idsOld = @'
  const observedHoldingIdsKey = useMemo(() => {
    return filteredHoldings
      .filter((holding) => holding.id && !String(holding.id).startsWith("bundle:"))
      .sort((a, b) => holdingValue(b) - holdingValue(a))
      .slice(0, 16)
      .map((holding) => holding.id)
      .join(",");
  }, [filteredHoldings]);
'@

$idsNew = @'
  const observedHoldingIdsKey = useMemo(() => {
    const rankedIds = filteredHoldings
      .filter((holding) => holding.id && !String(holding.id).startsWith("bundle:"))
      .sort((a, b) => holdingValue(b) - holdingValue(a))
      .slice(0, 16)
      .map((holding) => holding.id);

    if (
      selectedTickerItem &&
      filteredHoldings.some((holding) => holding.id === selectedTickerItem) &&
      !rankedIds.includes(selectedTickerItem)
    ) {
      rankedIds.unshift(selectedTickerItem);
    }

    return Array.from(new Set(rankedIds)).slice(0, 17).join(",");
  }, [filteredHoldings, selectedTickerItem]);
'@

if (-not $dashboard.Contains($idsOld)) {
  throw "Could not find observedHoldingIdsKey block. Nothing has been written."
}
$dashboard = $dashboard.Replace($idsOld, $idsNew)

# 3) Current source already has the one-point fallback from v2.
# Extend genuine backfilled history to the latest saved portfolio value if stale.
$pointsOld = '  const portfolioPoints = remotePoints.length >= 2 ? remotePoints : localPortfolioPoints.length >= 2 ? localPortfolioPoints : activeTotalValue > 0 ? [{ date: "Start", value: activeTotalValue }, { date: "Now", value: activeTotalValue }] : [];'

$pointsNew = @'
  const portfolioPointsBase = remotePoints.length >= 2
    ? remotePoints
    : localPortfolioPoints.length >= 2
      ? localPortfolioPoints
      : activeTotalValue > 0
        ? [{ date: "Start", value: activeTotalValue }, { date: "Now", value: activeTotalValue }]
        : [];

  const portfolioPoints = (() => {
    if (portfolioPointsBase.length < 2 || activeTotalValue <= 0) return portfolioPointsBase;

    const lastAt = Date.parse(portfolioPointsBase[portfolioPointsBase.length - 1]?.date || "");
    const staleByMs = Number.isFinite(lastAt) ? Date.now() - lastAt : 0;

    if (staleByMs > 24 * 60 * 60 * 1000) {
      return [
        ...portfolioPointsBase,
        { date: new Date().toISOString(), value: activeTotalValue },
      ];
    }

    return portfolioPointsBase;
  })();
'@

if (-not $dashboard.Contains($pointsOld)) {
  throw "Could not find current portfolioPoints line. Nothing has been written."
}
$dashboard = $dashboard.Replace($pointsOld, $pointsNew)

# 4) Make the visible lines lighter without changing chart maths.
$dashboard = $dashboard.Replace(
  'strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"',
  'strokeWidth="0.45" strokeLinecap="round" strokeLinejoin="round"'
)
$dashboard = $dashboard.Replace(
  'strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"',
  'strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"'
)
$dashboard = $dashboard.Replace('r="1.35"', 'r="0.8"')

# 5) Use the actual midpoint time in asset mini charts.
$timeOld = @'
  const startTime = formatTime(points[0].date, true);
  const endTime = formatTime(points[points.length - 1].date, false);
'@
$timeNew = @'
  const startTime = formatTime(points[0].date, true);
  const midTime = formatTime(points[Math.floor((points.length - 1) / 2)]?.date || points[0].date, false);
  const endTime = formatTime(points[points.length - 1].date, false);
'@
if ($dashboard.Contains($timeOld)) {
  $dashboard = $dashboard.Replace($timeOld, $timeNew)
  $dashboard = $dashboard.Replace('<span>12:00</span>', '<span>{midTime}</span>')
}

# Only write after every required match succeeded.
[System.IO.File]::WriteAllText($dashboardPath, $dashboard, [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText($rangePath, $range, [System.Text.UTF8Encoding]::new($false))

Write-Host "Investment history/display v4 applied successfully."
Write-Host "Now run git diff --check and inspect the two diffs."

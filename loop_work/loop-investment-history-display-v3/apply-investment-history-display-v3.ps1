param([string]$RepoRoot = (Get-Location).Path)
$ErrorActionPreference = "Stop"

$dashboardPath = Join-Path $RepoRoot "components\investments\AmplifiedInvestmentsDashboard.tsx"
$rangePath = Join-Path $RepoRoot "lib\investments\history-range.ts"

if (-not (Test-Path $dashboardPath)) { throw "AmplifiedInvestmentsDashboard.tsx not found." }
if (-not (Test-Path $rangePath)) { throw "history-range.ts not found." }

$dashboard = Get-Content $dashboardPath -Raw -Encoding UTF8
$range = Get-Content $rangePath -Raw -Encoding UTF8

# 1) The stored backfill in production is complete for the household at the
# 1h tier, while the 1d tier only covers a minority of holdings. Use the tier
# that actually contains the six-month backfill.
$rangeOld = '  if (range === "6m" || range === "ytd") return "1d";'
$rangeNew = '  if (range === "6m" || range === "ytd") return "1h";'
if (-not $range.Contains($rangeOld)) { throw "Could not find 6m history bucket mapping." }
$range = $range.Replace($rangeOld, $rangeNew)

# 2) Always include the currently selected holding in the observed-series
# request. Previously only the top 16 holdings by value were fetched, so a
# small holding could show 'Chart loading...' forever after selection.
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

if (-not $dashboard.Contains($idsOld)) { throw "Could not find observed holding ID block." }
$dashboard = $dashboard.Replace($idsOld, $idsNew)

# 3) If backfilled market history stops before the most recent saved value,
# append the current portfolio point so historical charts finish at 'now'.
$pointsOld = '  const portfolioPoints = remotePoints.length >= 2 ? remotePoints : localPortfolioPoints;'
$pointsNew = @'
  const portfolioPointsBase = remotePoints.length >= 2 ? remotePoints : localPortfolioPoints;
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
if (-not $dashboard.Contains($pointsOld)) { throw "Could not find portfolioPoints line." }
$dashboard = $dashboard.Replace($pointsOld, $pointsNew)

# 4) Make chart strokes substantially lighter.
$dashboard = $dashboard.Replace('strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"', 'strokeWidth="0.45" strokeLinecap="round" strokeLinejoin="round"')
$dashboard = $dashboard.Replace('strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"', 'strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"')
$dashboard = $dashboard.Replace('r="1.35"', 'r="0.8"')

# 5) Mini-chart midpoint label should be a real midpoint, not a hard-coded 12:00.
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

[System.IO.File]::WriteAllText($dashboardPath, $dashboard, [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText($rangePath, $range, [System.Text.UTF8Encoding]::new($false))

Write-Host "Investment history/display v3 applied."
Write-Host "Run git diff --check and inspect both diffs before committing."

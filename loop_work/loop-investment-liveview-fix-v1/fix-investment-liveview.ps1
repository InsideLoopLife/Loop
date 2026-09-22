param([string]$RepoRoot = (Get-Location).Path)
$ErrorActionPreference = "Stop"

$path = Join-Path $RepoRoot "components\investments\AmplifiedInvestmentsDashboard.tsx"
if (-not (Test-Path $path)) { throw "AmplifiedInvestmentsDashboard.tsx not found." }

$content = Get-Content $path -Raw -Encoding UTF8

$replacements = [ordered]@{
  "Â£" = "£"
  "â‚¬" = "€"
  "â–²" = "▲"
  "â–¼" = "▼"
  "â€”" = "—"
  "â€“" = "–"
  "Ã—" = "×"
  "Â·" = "·"
}
foreach ($pair in $replacements.GetEnumerator()) {
  $content = $content.Replace($pair.Key, $pair.Value)
}

$portfolioPattern = '(?s)function PortfolioChart\(\{ points, costValue, positive, dark \}: \{ points: Array<\{ date: string; value: number \}>; costValue: number; positive: boolean; dark: boolean; \}\) \{\s*if \(points\.length < 2\) \{\s*return <div className=\{`grid min-h-\[460px\].*?</div>;\s*\}'
$portfolioReplacement = @'
function PortfolioChart({ points, costValue, positive, dark }: { points: Array<{ date: string; value: number }>; costValue: number; positive: boolean; dark: boolean; }) {
  if (!points.length) {
    return <div className={`grid min-h-[460px] place-items-center rounded-2xl border border-dashed ${dark ? "border-white/10 bg-white/[0.02] text-white/40" : "border-slate-200 bg-slate-50 text-slate-400"}`}><p className="text-sm font-semibold">No evidenced price history yet.</p></div>;
  }
  if (points.length === 1) {
    const only = Number(points[0]?.value || 0);
    return (
      <div className={`relative min-h-[460px] overflow-hidden rounded-2xl border ${dark ? "border-white/10 bg-white/[0.02]" : "border-slate-200 bg-slate-50"}`}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          {[20, 50, 80].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="currentColor" strokeDasharray="2 4" className={dark ? "text-white/[0.07]" : "text-slate-200"} strokeWidth="0.3" />)}
          <path d="M0,50 L100,50" fill="none" stroke="currentColor" className="text-emerald-400" strokeWidth="0.8" strokeLinecap="round" />
          <circle cx="100" cy="50" r="1.25" fill="currentColor" className="text-emerald-300" />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div className={`rounded-full px-3 py-1.5 text-xs font-bold backdrop-blur ${dark ? "bg-black/35 text-white/60" : "bg-white/80 text-slate-500"}`}>
            1 evidenced price point · line will build as new prices arrive
          </div>
        </div>
        <div className={`absolute right-4 top-4 text-xs font-bold ${dark ? "text-white/50" : "text-slate-500"}`}>{formatCompactMoney(only)}</div>
      </div>
    );
  }
'@
$content = [regex]::Replace($content, $portfolioPattern, $portfolioReplacement, 1)

$miniPattern = '(?s)function AssetMiniChart\(\{ points, positive, dark \}: \{ points: Array<\{ date: string; value: number \}>; positive: boolean; dark: boolean; \}\) \{\s*if \(!points \|\| points\.length < 2\) return <div className=\{`h-full w-full flex items-center justify-center text-xs font-semibold .*?</div>;'
$miniReplacement = @'
function AssetMiniChart({ points, positive, dark }: { points: Array<{ date: string; value: number }>; positive: boolean; dark: boolean; }) {
  if (!points || points.length === 0) return <div className={`h-full w-full flex items-center justify-center text-xs font-semibold ${dark ? "text-white/20" : "text-slate-400"}`}>No price history yet</div>;
  if (points.length === 1) {
    return (
      <div className="relative h-full w-full overflow-hidden">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <line x1="0" x2="100" y1="50" y2="50" stroke="currentColor" className={positive ? "text-emerald-400" : "text-rose-500"} strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="100" cy="50" r="2" fill="currentColor" className={positive ? "text-emerald-300" : "text-rose-400"} />
        </svg>
        <div className={`absolute bottom-2 left-2 rounded-full px-2 py-1 text-[10px] font-bold ${dark ? "bg-black/40 text-white/45" : "bg-white/80 text-slate-400"}`}>1 price point</div>
      </div>
    );
  }
'@
$content = [regex]::Replace($content, $miniPattern, $miniReplacement, 1)

[System.IO.File]::WriteAllText($path, $content, [System.Text.UTF8Encoding]::new($false))
Write-Host "Investment live-view repair applied."

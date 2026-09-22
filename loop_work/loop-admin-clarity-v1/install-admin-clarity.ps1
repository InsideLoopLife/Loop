param([string]$RepoRoot = (Get-Location).Path)
$ErrorActionPreference = "Stop"

if (-not (Test-Path (Join-Path $RepoRoot "package.json"))) {
  throw "Run this from the loop_work repo root, or pass -RepoRoot C:\path\to\Loop\loop_work"
}

$PackRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

function Copy-PackFile([string]$RelativePath) {
  $source = Join-Path $PackRoot $RelativePath
  $target = Join-Path $RepoRoot $RelativePath
  New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
  Copy-Item $source $target -Force
  Write-Host "Updated $RelativePath"
}

Copy-PackFile "components/admin/AdminTabs.tsx"
Copy-PackFile "app/admin/page.tsx"
Copy-PackFile "app/admin/features/page.tsx"
Copy-PackFile "app/features/page.tsx"

$sectionsPath = Join-Path $RepoRoot "lib/navigation/sections.ts"
$content = Get-Content $sectionsPath -Raw -Encoding UTF8

$content = $content.Replace(
  '{ key: "overview", label: "Overview", href: "/admin", area: "admin", icon: "dashboard", exact: true, description: "Admin control centre summary." },',
  '{ key: "overview", label: "Admin home", href: "/admin", area: "admin", icon: "dashboard", exact: true, description: "Choose the admin job you want to do." },'
)
$content = $content.Replace(
  '{ key: "users", label: "Users", href: "/admin/users", area: "admin", icon: "users", description: "Customer, profile, tier and household checks." },',
  '{ key: "users", label: "User access", href: "/admin/users", area: "admin", icon: "users", description: "Customers, plan access, overrides and household checks." },'
)
$content = $content.Replace(
  '{ key: "tiers", label: "Tiers", href: "/admin/tiers", area: "admin", icon: "tiers", description: "Plan limits, AI routing and tier API keys." },',
  '{ key: "features", label: "Features", href: "/admin/features", area: "admin", icon: "sparkles", description: "Plain-English feature catalogue and plan coverage." },' + "`r`n" +
  '  { key: "tiers", label: "Plans & pricing", href: "/admin/tiers", area: "admin", icon: "tiers", description: "Plan prices, allowances, upgrade rules and AI routing." },'
)

[System.IO.File]::WriteAllText($sectionsPath, $content, [System.Text.UTF8Encoding]::new($false))

Write-Host ""
Write-Host "Done. Next:"
Write-Host "git diff --check"
Write-Host "git status"
Write-Host 'git add app/admin/page.tsx app/admin/features/page.tsx app/features/page.tsx components/admin/AdminTabs.tsx lib/navigation/sections.ts'
Write-Host 'git commit -m "Simplify admin navigation and add feature catalogue"'
Write-Host "git push origin main"

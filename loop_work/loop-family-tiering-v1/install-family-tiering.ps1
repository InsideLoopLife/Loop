param([string]$RepoRoot = (Get-Location).Path)
$ErrorActionPreference = "Stop"
if (-not (Test-Path (Join-Path $RepoRoot "package.json"))) { throw "Run from loop_work or pass -RepoRoot." }
$PackRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

Copy-Item (Join-Path $PackRoot "lib/access/feature-keys.ts") (Join-Path $RepoRoot "lib/access/feature-keys.ts") -Force
Copy-Item (Join-Path $PackRoot "lib/access/feature-entitlements.ts") (Join-Path $RepoRoot "lib/access/feature-entitlements.ts") -Force
Copy-Item (Join-Path $PackRoot "app/api/investments/quote-check/route.ts") (Join-Path $RepoRoot "app/api/investments/quote-check/route.ts") -Force

$wizardPath = Join-Path $RepoRoot "components/investments/AddInvestmentHoldingWizard.tsx"
$wizard = Get-Content $wizardPath -Raw -Encoding UTF8
$wizard = $wizard.Replace('import { useEffect, useState } from "react";', 'import { useState } from "react";')
$pattern = '(?s)\n  useEffect\(\(\) => \{.*?\n  \}, \[searchQuery, exchange\]\);\n'
$wizard = [regex]::Replace($wizard, $pattern, "`n", 1)
[System.IO.File]::WriteAllText($wizardPath, $wizard, [System.Text.UTF8Encoding]::new($false))

$actionsPath = Join-Path $RepoRoot "lib/investments/actions.ts"
$actions = Get-Content $actionsPath -Raw -Encoding UTF8
if ($actions -notmatch 'app_check_investment_holding_capacity') {
  $needle = '  if (!accountId) throw new Error("Choose an investment account first.");'
  $insert = @'
  if (!accountId) throw new Error("Choose an investment account first.");

  const { data: holdingCapacity, error: holdingCapacityError } = await (supabase as any).rpc(
    "app_check_investment_holding_capacity",
    { p_account_id: accountId, p_additional: 1 }
  );
  if (holdingCapacityError) throw new Error("We could not verify this account's portfolio allowance.");
  if (!holdingCapacity?.allowed) throw new Error(holdingCapacity?.reason || "This investment account has reached the holding limit for the current plan.");
'@
  if (-not $actions.Contains($needle)) { throw "Could not find addInvestmentHolding insertion point." }
  $actions = $actions.Replace($needle, $insert)
  [System.IO.File]::WriteAllText($actionsPath, $actions, [System.Text.UTF8Encoding]::new($false))
}

Write-Host "Family tiering source wiring applied."
Write-Host 'Next: git diff --check'
Write-Host 'Then: git add lib/access/feature-keys.ts lib/access/feature-entitlements.ts app/api/investments/quote-check/route.ts components/investments/AddInvestmentHoldingWizard.tsx lib/investments/actions.ts'

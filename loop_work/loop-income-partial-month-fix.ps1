$ErrorActionPreference = "Stop"

Write-Host "LOOP income overlap + partial-month proration patch" -ForegroundColor Cyan

$incomePath = "components\income\IncomeTrackerClient.tsx"
$flowPath   = "domains\wealth\financial-flow\FinancialFlowPage.tsx"

foreach ($p in @($incomePath, $flowPath)) {
    if (-not (Test-Path $p)) {
        throw "Cannot find $p. Run this script from inside your loop_work folder."
    }
}

# ---------- 1) Income detail page ----------
$text = Get-Content $incomePath -Raw

$anchor = @'
function isActiveInMonth(start: string, end: string | null, month: string) {
  return start <= monthEnd(month) && (!end || end >= monthStart(month));
}
'@

$helper = @'
function isActiveInMonth(start: string, end: string | null, month: string) {
  return start <= monthEnd(month) && (!end || end >= monthStart(month));
}

function payEventMonthFraction(event: PayEvent, month: string) {
  if (event.pay_kind === "maternity") return 1;

  const start = monthStart(month);
  const end = monthEnd(month);
  const effectiveStart = event.effective_from > start ? event.effective_from : start;
  const effectiveEnd =
    event.effective_until && event.effective_until < end
      ? event.effective_until
      : end;

  if (effectiveStart > effectiveEnd) return 0;

  const startDate = new Date(`${effectiveStart}T12:00:00Z`);
  const endDate = new Date(`${effectiveEnd}T12:00:00Z`);
  const daysActive =
    Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1;

  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();

  return Math.max(0, Math.min(1, daysActive / daysInMonth));
}
'@

if (-not $text.Contains("function payEventMonthFraction(event: PayEvent, month: string)")) {
    if (-not $text.Contains($anchor)) {
        throw "IncomeTrackerClient.tsx: could not find isActiveInMonth anchor."
    }
    $text = $text.Replace($anchor, $helper)
}

$oldNormal = @'
  const monthlyGross = Number(event.gross_annual_salary || 0) / 12;
  const monthlyNet =
    event.monthly_take_home_override !== null &&
    event.monthly_take_home_override !== undefined
      ? Number(event.monthly_take_home_override)
      : annualBreakdown.monthlyTakeHome;

  return {
    monthlyGross,
    monthlyNet,
    monthlyPension: annualBreakdown.pension / 12,
    monthlyTax: annualBreakdown.incomeTax / 12,
    monthlyNi: annualBreakdown.nationalInsurance / 12,
    monthlyStudentLoan: annualBreakdown.studentLoan / 12,
    keptPercent: monthlyGross > 0 ? (monthlyNet / monthlyGross) * 100 : 0,
  };
'@

$newNormal = @'
  const fraction = payEventMonthFraction(event, month);
  const fullMonthlyGross = Number(event.gross_annual_salary || 0) / 12;
  const fullMonthlyNet =
    event.monthly_take_home_override !== null &&
    event.monthly_take_home_override !== undefined
      ? Number(event.monthly_take_home_override)
      : annualBreakdown.monthlyTakeHome;

  const monthlyGross = fullMonthlyGross * fraction;
  const monthlyNet = fullMonthlyNet * fraction;
  const monthlyPension = (annualBreakdown.pension / 12) * fraction;
  const monthlyTax = (annualBreakdown.incomeTax / 12) * fraction;
  const monthlyNi = (annualBreakdown.nationalInsurance / 12) * fraction;
  const monthlyStudentLoan = (annualBreakdown.studentLoan / 12) * fraction;

  return {
    monthlyGross,
    monthlyNet,
    monthlyPension,
    monthlyTax,
    monthlyNi,
    monthlyStudentLoan,
    keptPercent: monthlyGross > 0 ? (monthlyNet / monthlyGross) * 100 : 0,
  };
'@

if ($text.Contains($oldNormal)) {
    $text = $text.Replace($oldNormal, $newNormal)
} elseif (-not $text.Contains("const fraction = payEventMonthFraction(event, month);")) {
    throw "IncomeTrackerClient.tsx: expected normal salary breakdown block not found."
}

Set-Content -Path $incomePath -Value $text -NoNewline
Write-Host "Updated $incomePath" -ForegroundColor Green


# ---------- 2) Financial Flow overview ----------
$text = Get-Content $flowPath -Raw

$flowAnchor = @'
function isActiveInMonth(start: string | null | undefined, end: string | null | undefined, rangeStart: string, rangeEnd: string) {
  const starts = start || "1900-01-01";
  const ends = end || "9999-12-31";
  return starts <= rangeEnd && ends >= rangeStart;
}
'@

$flowHelper = @'
function isActiveInMonth(start: string | null | undefined, end: string | null | undefined, rangeStart: string, rangeEnd: string) {
  const starts = start || "1900-01-01";
  const ends = end || "9999-12-31";
  return starts <= rangeEnd && ends >= rangeStart;
}

function payEventMonthFraction(event: PayEvent, monthKey: string) {
  if (isMaternityPay(event)) return 1;

  const parsed = parseMonth(monthKey);
  const monthStartDate = iso(parsed.start);
  const monthEndDate = iso(parsed.end);
  const effectiveStart =
    event.effective_from && event.effective_from > monthStartDate
      ? event.effective_from
      : monthStartDate;
  const effectiveEnd =
    event.effective_until && event.effective_until < monthEndDate
      ? event.effective_until
      : monthEndDate;

  if (effectiveStart > effectiveEnd) return 0;

  const startDate = new Date(`${effectiveStart}T12:00:00Z`);
  const endDate = new Date(`${effectiveEnd}T12:00:00Z`);
  const daysActive =
    Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
  const daysInMonth = parsed.end.getDate();

  return Math.max(0, Math.min(1, daysActive / daysInMonth));
}
'@

if (-not $text.Contains("function payEventMonthFraction(event: PayEvent, monthKey: string)")) {
    if (-not $text.Contains($flowAnchor)) {
        throw "FinancialFlowPage.tsx: could not find isActiveInMonth anchor."
    }
    $text = $text.Replace($flowAnchor, $flowHelper)
}

$oldMonthlyPay = @'
  if (event.monthly_take_home_override !== null && event.monthly_take_home_override !== undefined) {
    return n(event.monthly_take_home_override);
  }
  const gross = n(event.gross_annual_salary);
  if (!gross) return 0;
  return estimateAnnualTakeHome({
    grossAnnual: gross,
    pensionPercent: n(event.pension_percent),
    pensionMethod: event.pension_method || "net_pay",
    studentLoanPlan: event.student_loan_plan || "none",
  }).monthlyTakeHome;
'@

$newMonthlyPay = @'
  const fraction = payEventMonthFraction(event, monthKey);

  if (event.monthly_take_home_override !== null && event.monthly_take_home_override !== undefined) {
    return n(event.monthly_take_home_override) * fraction;
  }

  const gross = n(event.gross_annual_salary);
  if (!gross) return 0;

  return (
    estimateAnnualTakeHome({
      grossAnnual: gross,
      pensionPercent: n(event.pension_percent),
      pensionMethod: event.pension_method || "net_pay",
      studentLoanPlan: event.student_loan_plan || "none",
    }).monthlyTakeHome * fraction
  );
'@

if ($text.Contains($oldMonthlyPay)) {
    $text = $text.Replace($oldMonthlyPay, $newMonthlyPay)
} elseif (-not $text.Contains("const fraction = payEventMonthFraction(event, monthKey);")) {
    throw "FinancialFlowPage.tsx: expected monthlyPay salary block not found."
}

# Remove any remaining maternity-suppression logic in Financial Flow.
$oldSuppression = @'
    const maternityPeople = new Set(activePay.filter(isMaternityPay).map((event) => event.person_id || "household"));
    const payLines = activePay
      .filter((event) => !(maternityPeople.has(event.person_id || "household") && !isMaternityPay(event)))
      .map((event) => ({ key: `pay-${event.id}`, label: isMaternityPay(event) ? "Maternity pay" : event.label || "Salary", amount: monthlyPay(event, monthKey), icon: Banknote, tone: "green" as Tone, personId: event.person_id }));
'@

$newSuppression = @'
    const payLines = activePay
      .map((event) => ({ key: `pay-${event.id}`, label: isMaternityPay(event) ? "Maternity pay" : event.label || "Salary", amount: monthlyPay(event, monthKey), icon: Banknote, tone: "green" as Tone, personId: event.person_id }));
'@

if ($text.Contains($oldSuppression)) {
    $text = $text.Replace($oldSuppression, $newSuppression)
}

Set-Content -Path $flowPath -Value $text -NoNewline
Write-Host "Updated $flowPath" -ForegroundColor Green

Write-Host ""
Write-Host "Patch complete. Running checks..." -ForegroundColor Cyan
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw "Typecheck failed. Do not commit." }

git diff --check
if ($LASTEXITCODE -ne 0) { throw "git diff --check failed. Do not commit." }

Write-Host ""
Write-Host "Checks passed. Review the diff:" -ForegroundColor Green
git diff -- $incomePath $flowPath

export type PensionSnapshotForProjection = {
  snapshot_date: string | null;
  value: number | null;
  monthly_contribution_applied?: number | null;
};

export type PensionContributionForProjection = {
  contribution_date?: string | null;
  contribution_due_date?: string | null;
  investment_date?: string | null;
  contribution_amount?: number | null;
  employee_amount?: number | null;
  employer_amount?: number | null;
  employer_ni_topup_amount?: number | null;
  fixed_amount?: number | null;
  event_status?: string | null;
};

export type PensionPerformanceAssumption = {
  pension_fund_id?: string | null;
  pension_account_id?: string | null;
  fund_name?: string | null;
  current_value?: number | null;
  annualised_5y_percent?: number | null;
  annualised_10y_percent?: number | null;
  as_of_date?: string | null;
  source_url?: string | null;
  source_name?: string | null;
  verified_at?: string | null;
};

export type PensionRateScenarios = {
  low: number;
  middle: number;
  high: number;
  defaultKey: "low" | "middle" | "high";
  source: string;
  asOfDate: string | null;
  isFallback: boolean;
  assumptionsUsed: number;
};

function cleanDate(value?: string | null) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

function contributionAmount(event: PensionContributionForProjection) {
  const explicit = Number(event.contribution_amount || 0);
  if (explicit > 0) return explicit;
  return (
    Number(event.employee_amount || 0) +
    Number(event.employer_amount || 0) +
    Number(event.employer_ni_topup_amount || 0) +
    Number(event.fixed_amount || 0)
  );
}

function xnpv(rate: number, cashflows: Array<{ date: Date; amount: number }>) {
  if (cashflows.length < 2 || rate <= -1) return Number.NaN;
  const start = cashflows[0].date.getTime();
  return cashflows.reduce((sum, cashflow) => {
    const years = (cashflow.date.getTime() - start) / (365.2425 * 24 * 60 * 60 * 1000);
    return sum + cashflow.amount / Math.pow(1 + rate, years);
  }, 0);
}

function solveXirr(cashflows: Array<{ date: Date; amount: number }>) {
  const hasPositive = cashflows.some((row) => row.amount > 0);
  const hasNegative = cashflows.some((row) => row.amount < 0);
  if (!hasPositive || !hasNegative) return null;

  let low = -0.95;
  let high = 5;
  let lowValue = xnpv(low, cashflows);
  let highValue = xnpv(high, cashflows);
  if (!Number.isFinite(lowValue) || !Number.isFinite(highValue) || lowValue * highValue > 0) return null;

  for (let index = 0; index < 120; index += 1) {
    const mid = (low + high) / 2;
    const value = xnpv(mid, cashflows);
    if (!Number.isFinite(value)) return null;
    if (Math.abs(value) < 0.01) return mid;
    if (lowValue * value <= 0) {
      high = mid;
      highValue = value;
    } else {
      low = mid;
      lowValue = value;
    }
  }
  return (low + high) / 2;
}

export function derivePensionAnnualRate(
  snapshots: PensionSnapshotForProjection[],
  contributions: PensionContributionForProjection[],
  fallbackRate = 5,
) {
  const totalsByDate = new Map<string, number>();
  for (const snapshot of snapshots) {
    const date = cleanDate(snapshot.snapshot_date);
    if (!date) continue;
    const key = date.toISOString().slice(0, 10);
    totalsByDate.set(key, (totalsByDate.get(key) || 0) + Math.max(0, Number(snapshot.value || 0)));
  }
  const datedTotals = Array.from(totalsByDate.entries())
    .map(([date, value]) => ({ date: new Date(`${date}T00:00:00Z`), value }))
    .filter((row) => row.value > 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (datedTotals.length >= 2) {
    const latest = datedTotals[datedTotals.length - 1];
    const fiveYearsAgo = new Date(latest.date);
    fiveYearsAgo.setUTCFullYear(fiveYearsAgo.getUTCFullYear() - 5);
    const earliest = datedTotals.find((row) => row.date >= fiveYearsAgo) || datedTotals[0];
    const observedDays = (latest.date.getTime() - earliest.date.getTime()) / (24 * 60 * 60 * 1000);

    if (observedDays >= 90 && latest.value > 0 && earliest.value > 0) {
      const cashflows: Array<{ date: Date; amount: number }> = [{ date: earliest.date, amount: -earliest.value }];
      const explicitContributionMonths = new Set<string>();
      for (const event of contributions) {
        if (String(event.event_status || "invested").toLowerCase() === "cancelled") continue;
        const date = cleanDate(event.investment_date || event.contribution_date || event.contribution_due_date);
        const amount = contributionAmount(event);
        if (!date || amount <= 0 || date < earliest.date || date > latest.date) continue;
        explicitContributionMonths.add(date.toISOString().slice(0, 7));
        cashflows.push({ date, amount: -amount });
      }
      // Older imports may have contribution values on the fund snapshot but no separate
      // contribution event. Use those only for months not already represented by an event.
      for (const snapshot of snapshots) {
        const date = cleanDate(snapshot.snapshot_date);
        const amount = Math.max(0, Number(snapshot.monthly_contribution_applied || 0));
        if (!date || amount <= 0 || date < earliest.date || date > latest.date) continue;
        if (explicitContributionMonths.has(date.toISOString().slice(0, 7))) continue;
        cashflows.push({ date, amount: -amount });
      }
      cashflows.push({ date: latest.date, amount: latest.value });
      cashflows.sort((a, b) => a.date.getTime() - b.date.getTime());
      const annualRate = solveXirr(cashflows);
      if (annualRate != null && Number.isFinite(annualRate)) {
        const percent = annualRate * 100;
        if (percent >= -20 && percent <= 40) {
          return {
            annualRate: percent,
            source: `Money-weighted return from ${earliest.date.toISOString().slice(0, 10)} to ${latest.date.toISOString().slice(0, 10)}`,
            observedDays: Math.round(observedDays),
            isFallback: false,
          };
        }
      }
    }
  }

  return {
    annualRate: fallbackRate,
    source: "Fallback assumption until enough pension value history is logged",
    observedDays: 0,
    isFallback: true,
  };
}


function weightedAverage(rows: Array<{ value: number; weight: number }>) {
  const totalWeight = rows.reduce((sum, row) => sum + Math.max(0, row.weight), 0);
  if (totalWeight <= 0) return rows.length ? rows.reduce((sum, row) => sum + row.value, 0) / rows.length : 0;
  return rows.reduce((sum, row) => sum + row.value * Math.max(0, row.weight), 0) / totalWeight;
}

export function derivePensionRateScenarios(
  assumptions: PensionPerformanceAssumption[],
  snapshotRate: ReturnType<typeof derivePensionAnnualRate>,
  fallbackRate = 5,
): PensionRateScenarios {
  const usable = (assumptions || []).filter((row) => {
    const five = Number(row.annualised_5y_percent);
    const ten = Number(row.annualised_10y_percent);
    return (Number.isFinite(five) && five > -50 && five < 80) || (Number.isFinite(ten) && ten > -50 && ten < 80);
  });

  if (usable.length > 0) {
    const fiveRows = usable
      .map((row) => ({ value: Number(row.annualised_5y_percent), weight: Math.max(1, Number(row.current_value || 0)) }))
      .filter((row) => Number.isFinite(row.value));
    const tenRows = usable
      .map((row) => ({ value: Number(row.annualised_10y_percent), weight: Math.max(1, Number(row.current_value || 0)) }))
      .filter((row) => Number.isFinite(row.value));
    const five = fiveRows.length ? weightedAverage(fiveRows) : null;
    const ten = tenRows.length ? weightedAverage(tenRows) : null;
    const values = [five, ten].filter((value): value is number => value != null && Number.isFinite(value));
    const low = Math.min(...values);
    const high = Math.max(...values);
    const middle = values.reduce((sum, value) => sum + value, 0) / values.length;
    const dates = usable.map((row) => row.as_of_date || row.verified_at?.slice(0, 10) || null).filter((value): value is string => Boolean(value)).sort();
    return {
      low,
      middle,
      high,
      defaultKey: "middle",
      source: `Weighted official/provider fund performance: ${five != null ? `5y ${five.toFixed(2)}%` : "5y unavailable"}; ${ten != null ? `10y ${ten.toFixed(2)}%` : "10y unavailable"}`,
      asOfDate: dates.at(-1) || null,
      isFallback: false,
      assumptionsUsed: usable.length,
    };
  }

  if (!snapshotRate.isFallback) {
    const observed = snapshotRate.annualRate;
    return {
      low: observed,
      middle: observed,
      high: observed,
      defaultKey: "middle",
      source: snapshotRate.source,
      asOfDate: null,
      isFallback: false,
      assumptionsUsed: 0,
    };
  }

  return {
    low: Math.max(0, fallbackRate - 2),
    middle: fallbackRate,
    high: fallbackRate + 2,
    defaultKey: "middle",
    source: "Fallback range until an official fund factsheet or sufficient value history is stored",
    asOfDate: null,
    isFallback: true,
    assumptionsUsed: 0,
  };
}

export function deriveMonthlyPensionContribution(
  events: PensionContributionForProjection[],
  fixedMonthlyFallback: number,
) {
  const valid = events
    .filter((event) => String(event.event_status || "invested").toLowerCase() !== "cancelled")
    .map((event) => {
      const date = cleanDate(event.contribution_due_date || event.contribution_date || event.investment_date);
      return date ? { date, amount: contributionAmount(event) } : null;
    })
    .filter((row): row is { date: Date; amount: number } => Boolean(row && row.amount > 0))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (valid.length > 0) {
    const latest = valid[valid.length - 1].date;
    const cutoff = new Date(latest);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - 5);
    const byMonth = new Map<string, number>();
    for (const row of valid) {
      if (row.date < cutoff) continue;
      const key = row.date.toISOString().slice(0, 7);
      byMonth.set(key, (byMonth.get(key) || 0) + row.amount);
    }
    const monthlyValues = Array.from(byMonth.values()).filter((value) => value > 0);
    if (monthlyValues.length > 0) {
      return {
        monthlyContribution: monthlyValues.reduce((sum, value) => sum + value, 0) / monthlyValues.length,
        source: `Average of ${monthlyValues.length} recent pension contribution month${monthlyValues.length === 1 ? "" : "s"}`,
      };
    }
  }

  return {
    monthlyContribution: Math.max(0, Number(fixedMonthlyFallback || 0)),
    source: fixedMonthlyFallback > 0 ? "Current pension account contribution settings" : "No pension contribution schedule found",
  };
}

export type PayEventPensionForProjection = {
  person_id?: string | null;
  label?: string | null;
  pay_kind?: string | null;
  gross_annual_salary?: number | null;
  pension_percent?: number | null;
  pension_method?: string | null;
  employer_pension_percent?: number | null;
  employer_pension_monthly_amount?: number | null;
  employer_ni_topup_enabled?: boolean | null;
  employer_ni_rate_percent?: number | null;
  employer_ni_topup_share_percent?: number | null;
  effective_from?: string | null;
  effective_until?: string | null;
};

function activePayEvent(event: PayEventPensionForProjection, onDate: Date) {
  const date = onDate.toISOString().slice(0, 10);
  const start = String(event.effective_from || "1900-01-01");
  const end = String(event.effective_until || "9999-12-31");
  return start <= date && end >= date;
}

export function deriveIncomePensionContribution(
  payEvents: PayEventPensionForProjection[],
  onDate = new Date(),
) {
  const activeRows = (payEvents || []).filter((event) => activePayEvent(event, onDate));
  const latestByInstruction = new Map<string, PayEventPensionForProjection>();
  for (const event of activeRows) {
    const key = `${event.person_id || "household"}:${String(event.label || event.pay_kind || "salary").toLowerCase()}`;
    const existing = latestByInstruction.get(key);
    if (!existing || String(event.effective_from || "1900-01-01") >= String(existing.effective_from || "1900-01-01")) latestByInstruction.set(key, event);
  }
  const active = Array.from(latestByInstruction.values());
  let employee = 0;
  let employer = 0;
  let employerNiTopUp = 0;

  for (const event of active) {
    const annualSalary = Math.max(0, Number(event.gross_annual_salary || 0));
    const employeeMonthly = annualSalary * Math.max(0, Number(event.pension_percent || 0)) / 100 / 12;
    const employerMonthlyFixed = Math.max(0, Number(event.employer_pension_monthly_amount || 0));
    const employerMonthlyPercent = annualSalary * Math.max(0, Number(event.employer_pension_percent || 0)) / 100 / 12;
    const employerMonthly = employerMonthlyFixed > 0 ? employerMonthlyFixed : employerMonthlyPercent;
    const salarySacrifice = String(event.pension_method || "").trim().toLowerCase().replace(/[\s-]+/g, "_") === "salary_sacrifice";
    const niRate = Math.max(0, Number(event.employer_ni_rate_percent ?? 15));
    const share = Math.max(0, Math.min(100, Number(event.employer_ni_topup_share_percent ?? 100)));
    const niTopUp = salarySacrifice && event.employer_ni_topup_enabled
      ? employeeMonthly * niRate / 100 * share / 100
      : 0;

    employee += employeeMonthly;
    employer += employerMonthly;
    employerNiTopUp += niTopUp;
  }

  const total = employee + employer + employerNiTopUp;
  const parts = [
    employee > 0 ? `employee £${Math.round(employee).toLocaleString("en-GB")}` : null,
    employer > 0 ? `employer £${Math.round(employer).toLocaleString("en-GB")}` : null,
    employerNiTopUp > 0 ? `employer NI top-up £${Math.round(employerNiTopUp).toLocaleString("en-GB")}` : null,
  ].filter(Boolean);

  return {
    monthlyContribution: total,
    employeeMonthly: employee,
    employerMonthly: employer,
    employerNiTopUpMonthly: employerNiTopUp,
    detail: parts.length ? parts.join(" + ") : "No active pension deduction or employer contribution found in income settings",
    source: total > 0 ? `Calculated from ${active.length} active income record${active.length === 1 ? "" : "s"}` : "No pension contribution found in income settings",
  };
}

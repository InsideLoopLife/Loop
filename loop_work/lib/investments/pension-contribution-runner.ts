import { createAdminClient } from "@/lib/supabase/admin";
import { calculatePensionSalarySacrifice } from "@/lib/investments/pension-contribution-math";

export type PensionContributionRunnerOptions = {
  now?: Date;
  lookbackMonths?: number;
  force?: boolean;
  logger?: Pick<Console, "log" | "warn" | "error">;
};

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

type PensionAccountRow = {
  id: string;
  user_id: string;
  person_id?: string | null;
  label?: string | null;
  provider?: string | null;
  contribution_method?: string | null;
  employee_contribution_percent?: number | null;
  employer_contribution_percent?: number | null;
  employer_ni_topup_enabled?: boolean | null;
  employer_ni_topup_percent?: number | null;
  employer_ni_topup_mode?: string | null;
  employer_ni_rate_percent?: number | null;
  employer_ni_passback_percent?: number | null;
  employer_base_salary_basis?: string | null;
  fixed_monthly_contribution?: number | null;
  contribution_frequency?: string | null;
  contribution_day?: number | null;
  regular_pay_day?: number | null;
  pension_payment_timing?: string | null;
  contribution_delay_days?: number | null;
  pension_investment_day?: number | null;
  pension_investment_timing?: string | null;
  contribution_started_on?: string | null;
  contribution_ended_on?: string | null;
  contribution_paused?: boolean | null;
  contribution_auto_apply_enabled?: boolean | null;
  current_value?: number | null;
};

type PensionFundRow = {
  id: string;
  user_id: string;
  pension_account_id: string;
  fund_name?: string | null;
  fund_code?: string | null;
  group_label?: string | null;
  target_allocation_percent?: number | null;
  monthly_contribution_percent?: number | null;
  contribution_active?: boolean | null;
  current_value?: number | null;
  units?: number | null;
  unit_price?: number | null;
  annual_fund_fee_percent?: number | null;
  price_as_of_date?: string | null;
  fee_source_url?: string | null;
};

type PayEventRow = {
  user_id: string;
  person_id: string | null;
  gross_annual_salary?: number | null;
  pensionable_pay?: number | null;
  effective_from?: string | null;
  effective_until?: string | null;
};

type GlossaryPrice = {
  unitPrice: number | null;
  priceDate: string | null;
  fee: number | null;
  sourceUrl: string | null;
  confidence: number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function n(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Math.round(n(value, fallback));
  return Math.max(min, Math.min(max, parsed));
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function monthKey(date: Date) {
  return isoDate(date).slice(0, 7);
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) ? d : null;
}

function addDays(date: Date, days: number) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function endOfDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

function safeDayOfMonth(day: unknown, fallback = 1) {
  return clampInt(day, fallback, 1, 31);
}

function dateForMonthDay(monthDate: Date, day: number) {
  const lastDay = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth(), Math.min(day, lastDay), 0, 0, 0, 0));
}

function isWeekend(date: Date) {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function adjustWorkingDay(date: Date, timing?: string | null) {
  const mode = String(timing || "same_day").toLowerCase();
  let adjusted = new Date(date.getTime());
  if (mode === "calendar_day" || mode === "same_day" || mode === "none") return adjusted;
  if (mode === "previous_working_day") {
    while (isWeekend(adjusted)) adjusted = addDays(adjusted, -1);
    return adjusted;
  }
  // next_working_day is the safest default for provider investment/pay-in dates.
  while (isWeekend(adjusted)) adjusted = addDays(adjusted, 1);
  return adjusted;
}

function contributionFrequency(value?: string | null) {
  const clean = String(value || "monthly").toLowerCase();
  return ["weekly", "fortnightly", "monthly", "quarterly", "annual", "one_off", "manual"].includes(clean) ? clean : "monthly";
}

function contributionDatesForAccount(account: PensionAccountRow, fromDate: Date, toDate: Date) {
  const frequency = contributionFrequency(account.contribution_frequency);
  if (frequency === "manual" || account.contribution_paused === true || account.contribution_auto_apply_enabled === false) return [] as Date[];

  const accountStart = parseDate(account.contribution_started_on) || fromDate;
  const accountEnd = parseDate(account.contribution_ended_on) || toDate;
  const start = accountStart > fromDate ? accountStart : fromDate;
  const end = accountEnd < toDate ? accountEnd : toDate;
  if (start > end) return [] as Date[];

  const payDay = safeDayOfMonth(account.contribution_day ?? account.regular_pay_day, 1);
  const dates: Date[] = [];
  let cursor: Date;

  if (frequency === "weekly" || frequency === "fortnightly") {
    cursor = parseDate(account.contribution_started_on) || start;
    while (cursor < start) cursor = addDays(cursor, frequency === "weekly" ? 7 : 14);
    let guard = 0;
    while (cursor <= end && guard < 370) {
      dates.push(adjustWorkingDay(cursor, account.pension_payment_timing || "next_working_day"));
      cursor = addDays(cursor, frequency === "weekly" ? 7 : 14);
      guard += 1;
    }
    return dates.filter((date) => date >= start && date <= endOfDay(end));
  }

  const step = frequency === "quarterly" ? 3 : frequency === "annual" ? 12 : 1;
  cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  let guard = 0;
  while (cursor <= end && guard < 96) {
    const candidate = adjustWorkingDay(dateForMonthDay(cursor, payDay), account.pension_payment_timing || "next_working_day");
    if (candidate >= start && candidate <= endOfDay(end)) dates.push(candidate);
    if (frequency === "one_off") break;
    cursor = addMonths(cursor, step);
    guard += 1;
  }
  return dates;
}

function investmentDateForContribution(account: PensionAccountRow, contributionDate: Date) {
  const delayDays = clampInt(account.contribution_delay_days, 0, 0, 90);
  let candidate = addDays(contributionDate, delayDays);
  const investmentDay = n(account.pension_investment_day, 0);
  if (investmentDay > 0) {
    const sameMonth = dateForMonthDay(candidate, safeDayOfMonth(investmentDay, 1));
    candidate = sameMonth >= contributionDate ? sameMonth : dateForMonthDay(addMonths(candidate, 1), safeDayOfMonth(investmentDay, 1));
  }
  return adjustWorkingDay(candidate, account.pension_investment_timing || "next_working_day");
}

function activePayFor(account: PensionAccountRow, payEvents: PayEventRow[], contributionDate: Date) {
  const contributionIso = isoDate(contributionDate);
  return payEvents.find((event) => {
    if (event.user_id !== account.user_id) return false;
    if (String(event.person_id || "") !== String(account.person_id || "")) return false;
    const from = String(event.effective_from || "0000-01-01").slice(0, 10);
    const until = event.effective_until ? String(event.effective_until).slice(0, 10) : "9999-12-31";
    return from <= contributionIso && until >= contributionIso;
  }) || null;
}

function periodsPerYear(frequency: string) {
  if (frequency === "weekly") return 52;
  if (frequency === "fortnightly") return 26;
  if (frequency === "quarterly") return 4;
  if (frequency === "annual") return 1;
  return 12;
}

function contributionBreakdown(account: PensionAccountRow, pay: PayEventRow | null) {
  const frequency = contributionFrequency(account.contribution_frequency);
  const periods = periodsPerYear(frequency);
  const grossAnnual = n(pay?.pensionable_pay, n(pay?.gross_annual_salary, 0));
  const fixedMonthly = n(account.fixed_monthly_contribution);

  // BUGFIX: this used to only reinvest the employer's NI saving when
  // employer_ni_topup_mode was explicitly "saved_ni" — a separate control
  // from the "Employer NI saving is topped into pension" checkbox, which
  // could (and did) disagree with it, silently producing £0 NI-reinvestment
  // contribution events despite the checkbox being on. The checkbox is now
  // the sole authority for NI-saving reinvestment; any fixed-percent top-up
  // is treated as an independent, additive extra rather than a competing
  // mode. This affects real contribution events created by this job, not
  // just a UI display figure.
  const grossMonthlyForPercent = grossAnnual / 12;
  const fixedPercentTopUpMonthly = grossMonthlyForPercent * (n(account.employer_ni_topup_percent) / 100);
  const monthly = calculatePensionSalarySacrifice({
    grossSalaryAnnual: grossAnnual,
    employeeContributionPercent: account.employee_contribution_percent,
    employerBaseContributionPercent: account.employer_contribution_percent,
    employerBaseSalaryBasis: account.employer_base_salary_basis,
    employerNiEnabled: account.employer_ni_topup_enabled,
    employerNiRatePercent: account.employer_ni_rate_percent ?? 15,
    employerNiPassbackPercent: account.employer_ni_passback_percent ?? 100,
    fixedMonthlyContribution: fixedMonthly + fixedPercentTopUpMonthly,
    contributionMethod: account.contribution_method,
  });
  const periodScale = 12 / periods;
  return {
    grossPensionablePay: monthly.grossMonthly * periodScale,
    employeeAmount: monthly.employeeSacrificeMonthly * periodScale,
    employerAmount: monthly.employerBaseMonthly * periodScale,
    employerNiTopupAmount: monthly.employerNiReinvestedMonthly * periodScale,
    fixedAmount: monthly.fixedMonthly * periodScale,
    total: monthly.totalMonthlyPensionInput * periodScale,
  };
}

function asGbpUnitPrice(row: any) {
  const raw = n(row?.latest_unit_price, 0);
  const unit = String(row?.price_unit || "GBP").toUpperCase();
  if (!raw) return null;
  return unit === "GBX" || unit.includes("PENCE") ? raw / 100 : raw;
}

async function getLatestGlossaryPrice(supabase: SupabaseAdmin, fund: PensionFundRow): Promise<GlossaryPrice | null> {
  const code = String(fund.fund_code || "").trim();
  const name = String(fund.fund_name || "").trim();
  const select = "fund_name,fund_code,isin,latest_unit_price,latest_unit_price_date,price_unit,fund_fee_percent,source_url,factsheet_url,confidence";
  const read = async (column: string, value: string, exact = false) => {
    const query = supabase.from("provider_fund_glossary").select(select).order("confidence", { ascending: false }).limit(1);
    const result = exact ? await query.eq(column, value).maybeSingle() : await query.ilike(column, `%${value}%`).maybeSingle();
    return result.data || null;
  };

  let data: any = null;
  if (code) data = await read("fund_code", code, true) || await read("isin", code, true);
  if (!data && name) data = await read("fund_name", name, false);
  if (!data) return null;
  return {
    unitPrice: asGbpUnitPrice(data),
    priceDate: data.latest_unit_price_date || null,
    fee: data.fund_fee_percent ?? null,
    sourceUrl: data.source_url || data.factsheet_url || null,
    confidence: data.confidence ?? null,
  };
}

function normaliseAllocations(funds: PensionFundRow[]) {
  const active = funds.filter((fund) => fund.contribution_active !== false);
  const explicitTotal = active.reduce((sum, fund) => sum + n(fund.monthly_contribution_percent), 0);
  if (explicitTotal > 0) {
    // Users/providers do not always maintain contribution splits at exactly 100.
    // Scale the active rows so every projected salary/NI contribution is fully allocated.
    return active.map((fund) => ({
      fund,
      allocationPercent: n(fund.monthly_contribution_percent) / explicitTotal * 100,
    }));
  }
  const targetTotal = active.reduce((sum, fund) => sum + n(fund.target_allocation_percent), 0);
  if (targetTotal > 0) {
    return active.map((fund) => ({
      fund,
      allocationPercent: n(fund.target_allocation_percent) / targetTotal * 100,
    }));
  }
  const even = active.length ? 100 / active.length : 0;
  return active.map((fund) => ({ fund, allocationPercent: even }));
}

export async function runPensionContributionProjection(
  supabase: SupabaseAdmin = createAdminClient(),
  options: PensionContributionRunnerOptions = {},
) {
  const logger = options.logger || console;
  const now = options.now || new Date();
  const today = isoDate(now);
  const lookbackMonths = Math.max(1, Math.min(36, Math.round(options.lookbackMonths || 3)));
  const fromDate = addMonths(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), -lookbackMonths + 1);
  const result = {
    ok: true,
    checked_accounts: 0,
    checked_funds: 0,
    contribution_events_created: 0,
    contribution_events_existing: 0,
    pending_investments: 0,
    funds_updated: 0,
    accounts_updated: 0,
    snapshots: 0,
    failed: 0,
    notes: [] as string[],
  };

  const { data: accounts, error: accountError } = await supabase
    .from("pension_accounts")
    .select("id,user_id,person_id,label,provider,contribution_method,employee_contribution_percent,employer_contribution_percent,employer_ni_topup_enabled,employer_ni_topup_percent,employer_ni_topup_mode,employer_ni_rate_percent,employer_ni_passback_percent,employer_base_salary_basis,fixed_monthly_contribution,contribution_frequency,contribution_day,regular_pay_day,pension_payment_timing,contribution_delay_days,pension_investment_day,pension_investment_timing,contribution_started_on,contribution_ended_on,contribution_paused,contribution_auto_apply_enabled,current_value")
    .returns<PensionAccountRow[]>();
  if (accountError) throw accountError;

  const accountIds = (accounts || []).map((account) => account.id);
  const [{ data: funds, error: fundError }, { data: payEvents, error: payError }] = await Promise.all([
    accountIds.length
      ? supabase
          .from("pension_funds")
          .select("id,user_id,pension_account_id,fund_name,fund_code,group_label,target_allocation_percent,monthly_contribution_percent,contribution_active,current_value,units,unit_price,annual_fund_fee_percent,price_as_of_date,fee_source_url")
          .in("pension_account_id", accountIds)
          .returns<PensionFundRow[]>()
      : Promise.resolve({ data: [] as PensionFundRow[], error: null as any }),
    supabase
      .from("pay_events")
      .select("user_id,person_id,gross_annual_salary,pensionable_pay,effective_from,effective_until")
      .returns<PayEventRow[]>(),
  ]);
  if (fundError) throw fundError;
  if (payError) throw payError;

  const fundsByAccount = new Map<string, PensionFundRow[]>();
  for (const fund of funds || []) {
    if (!fundsByAccount.has(fund.pension_account_id)) fundsByAccount.set(fund.pension_account_id, []);
    fundsByAccount.get(fund.pension_account_id)!.push(fund);
  }

  // Refresh every fund's live price unconditionally, independent of whether a contribution gets
  // created below. Previously this only ever happened as a side effect of a successful
  // contribution match, so a pension whose contributions were silently stuck (e.g. no matching pay
  // event) never got a fresh price either — its value/graph would just be the same stale number
  // copied forward every day. Pensions can go up or down like any other investment; this ensures
  // that's actually reflected.
  let pricesRefreshed = 0;
  for (const fund of funds || []) {
    const glossary = await getLatestGlossaryPrice(supabase, fund).catch(() => null);
    if (!glossary?.unitPrice || glossary.unitPrice <= 0) continue;
    if (glossary.priceDate && fund.price_as_of_date && glossary.priceDate <= fund.price_as_of_date) continue;
    const units = n(fund.units, 0);
    const nextValue = units > 0 ? units * glossary.unitPrice : n(fund.current_value, 0);
    const updatePayload: Record<string, any> = {
      unit_price: glossary.unitPrice,
      price_as_of_date: glossary.priceDate || today,
      updated_at: new Date().toISOString(),
    };
    if (units > 0) updatePayload.current_value = Math.round(nextValue * 100) / 100;
    if (glossary.fee !== null && glossary.fee !== undefined) updatePayload.annual_fund_fee_percent = glossary.fee;
    if (glossary.sourceUrl) updatePayload.fee_source_url = glossary.sourceUrl;
    const { error: refreshError } = await supabase.from("pension_funds").update(updatePayload).eq("id", fund.id).eq("user_id", fund.user_id);
    if (refreshError) {
      result.notes.push(`${fund.fund_name || fund.id}: price refresh failed — ${refreshError.message}`);
      continue;
    }
    fund.unit_price = glossary.unitPrice;
    fund.price_as_of_date = updatePayload.price_as_of_date;
    if (units > 0) fund.current_value = updatePayload.current_value;
    pricesRefreshed += 1;
  }
  if (pricesRefreshed) result.notes.push(`Refreshed live price for ${pricesRefreshed} pension fund(s) independent of contribution activity.`);

  for (const account of accounts || []) {
    result.checked_accounts += 1;
    const accountFunds = fundsByAccount.get(account.id) || [];
    const allocations = normaliseAllocations(accountFunds);
    result.checked_funds += accountFunds.length;
    if (!allocations.length) {
      result.notes.push(`${account.label || account.provider || account.id}: skipped — no fund allocations set up under "Funds & allocation" (nothing to invest the contribution into).`);
      continue;
    }

    const dates = contributionDatesForAccount(account, fromDate, now);
    if (!dates.length) {
      const reason = account.contribution_paused
        ? "contributions are paused on this account"
        : account.contribution_auto_apply_enabled === false
          ? "auto-apply is switched off for this account"
          : contributionFrequency(account.contribution_frequency) === "manual"
            ? "contribution frequency is set to manual"
            : "no contribution dates fall in the lookback window (check the start date isn't in the future)";
      result.notes.push(`${account.label || account.provider || account.id}: skipped — ${reason}.`);
      continue;
    }

    let matchedAnyPay = false;
    for (const contributionDate of dates) {
      const pay = activePayFor(account, payEvents || [], contributionDate);
      if (pay) matchedAnyPay = true;
      const breakdown = contributionBreakdown(account, pay);
      if (breakdown.total <= 0) continue;
      const investmentDate = investmentDateForContribution(account, contributionDate);
      const status = investmentDate <= now ? "invested" : "pending_investment";

      for (const allocation of allocations) {
        const fund = allocation.fund;
        const allocationPercent = allocation.allocationPercent;
        const contributionAmount = breakdown.total * (allocationPercent / 100);
        if (contributionAmount <= 0) continue;
        const txId = `pension:auto:${account.id}:${fund.id}:${isoDate(contributionDate)}:${isoDate(investmentDate)}`;

        const { data: existing } = await supabase
          .from("pension_contribution_events")
          .select("id,event_status")
          .eq("external_transaction_id", txId)
          .maybeSingle();
        if (existing && !options.force) {
          result.contribution_events_existing += 1;
          continue;
        }

        const glossary = await getLatestGlossaryPrice(supabase, fund);
        const unitPrice = glossary?.unitPrice || n(fund.unit_price, 0) || null;
        const unitsBought = status === "invested" && unitPrice && unitPrice > 0 ? contributionAmount / unitPrice : 0;

        const eventPayload = {
          user_id: account.user_id,
          pension_account_id: account.id,
          pension_fund_id: fund.id,
          contribution_month: monthKey(contributionDate),
          contribution_date: isoDate(contributionDate),
          contribution_due_date: isoDate(contributionDate),
          investment_date: isoDate(investmentDate),
          contribution_amount: Math.round(contributionAmount * 100) / 100,
          employee_amount: Math.round(breakdown.employeeAmount * (allocationPercent / 100) * 100) / 100,
          employer_amount: Math.round(breakdown.employerAmount * (allocationPercent / 100) * 100) / 100,
          employer_ni_topup_amount: Math.round(breakdown.employerNiTopupAmount * (allocationPercent / 100) * 100) / 100,
          fixed_amount: Math.round(breakdown.fixedAmount * (allocationPercent / 100) * 100) / 100,
          gross_pensionable_pay: Math.round(breakdown.grossPensionablePay * 100) / 100,
          allocation_percent: allocationPercent,
          unit_price: unitPrice,
          units_bought: unitsBought,
          source: account.employer_ni_topup_enabled ? "salary_contribution_projection_with_ni" : "salary_contribution_projection",
          event_status: status,
          external_transaction_id: txId,
          notes: `Auto-projected from ${account.label || account.provider || "pension"}. Employee £${breakdown.employeeAmount.toFixed(2)}, employer £${breakdown.employerAmount.toFixed(2)}, NI top-up £${breakdown.employerNiTopupAmount.toFixed(2)}, fixed £${breakdown.fixedAmount.toFixed(2)}. Allocation ${allocationPercent.toFixed(3)}%. Invested/expected on ${isoDate(investmentDate)}.`,
        } as any;

        const write = existing?.id
          ? await supabase.from("pension_contribution_events").update(eventPayload).eq("id", existing.id)
          : await supabase.from("pension_contribution_events").insert(eventPayload);
        if (write.error) {
          result.failed += 1;
          result.ok = false;
          result.notes.push(`${fund.fund_name || fund.id}: ${write.error.message}`);
          continue;
        }
        result.contribution_events_created += existing?.id ? 0 : 1;
        if (status !== "invested") {
          result.pending_investments += 1;
          continue;
        }

        const previousUnits = n(fund.units, 0);
        const previousValue = n(fund.current_value, previousUnits * n(fund.unit_price, 0));
        const nextUnits = previousUnits + unitsBought;
        const nextValue = unitPrice ? nextUnits * unitPrice : previousValue + contributionAmount;
        const updatePayload: Record<string, any> = {
          units: nextUnits,
          unit_price: unitPrice,
          current_value: Math.round(nextValue * 100) / 100,
          price_as_of_date: glossary?.priceDate || today,
          updated_at: new Date().toISOString(),
        };
        if (glossary?.fee !== null && glossary?.fee !== undefined) updatePayload.annual_fund_fee_percent = glossary.fee;
        if (glossary?.sourceUrl) updatePayload.fee_source_url = glossary.sourceUrl;
        const update = await supabase.from("pension_funds").update(updatePayload).eq("id", fund.id).eq("user_id", fund.user_id);
        if (update.error) {
          result.failed += 1;
          result.ok = false;
          result.notes.push(`${fund.fund_name || fund.id}: ${update.error.message}`);
          continue;
        }
        fund.units = nextUnits;
        fund.unit_price = unitPrice;
        fund.current_value = updatePayload.current_value;
        result.funds_updated += 1;
      }
    }

    if (!matchedAnyPay) {
      result.notes.push(`${account.label || account.provider || account.id}: ${dates.length} contribution date(s) due, but no matching pay event was found for this account's person on any of them — check the person on this pension account matches the person on the salary/pay event, and that the pay event's effective dates cover these contribution dates. No contributions were created.`);
    }

    // Always snapshot and roll up account current_value after updating fund rows.
    const refreshedFunds = fundsByAccount.get(account.id) || [];
    const totalValue = refreshedFunds.reduce((sum, fund) => sum + n(fund.current_value, n(fund.units) * n(fund.unit_price)), 0);
    if (totalValue > 0) {
      await supabase.from("pension_accounts").update({
        current_value: Math.round(totalValue * 100) / 100,
        value_as_of_date: today,
        last_contribution_projection_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any).eq("id", account.id).eq("user_id", account.user_id);
      result.accounts_updated += 1;
    }

    const snapshotRows = refreshedFunds.map((fund) => ({
      user_id: fund.user_id,
      pension_fund_id: fund.id,
      snapshot_date: today,
      units: n(fund.units),
      unit_price: n(fund.unit_price) || null,
      value: Math.round(n(fund.current_value, n(fund.units) * n(fund.unit_price)) * 100) / 100,
      monthly_contribution_applied: 0,
      source: "pension_contribution_runner",
    }));
    if (snapshotRows.length) {
      const { error } = await supabase.from("pension_fund_value_snapshots").upsert(snapshotRows, { onConflict: "user_id,pension_fund_id,snapshot_date" });
      if (error) {
        result.failed += 1;
        result.ok = false;
        result.notes.push(`${account.label || account.id}: snapshot failed ${error.message}`);
      } else {
        result.snapshots += snapshotRows.length;
      }
    }
  }

  logger.log(`[pension-contribution-runner] accounts=${result.checked_accounts} events=${result.contribution_events_created} existing=${result.contribution_events_existing} funds=${result.funds_updated} pending=${result.pending_investments} failed=${result.failed}`);
  return result;
}

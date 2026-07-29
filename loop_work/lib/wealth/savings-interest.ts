import { movementDelta, movementDirection, type SavingsLedgerMovement } from "@/lib/wealth/savings-ledger";

export type SavingsInterestAccount = {
  id: string;
  name?: string | null;
  current_balance?: number | null;
  balance_last_confirmed_value?: number | null;
  balance_last_confirmed_at?: string | null;
  interest_rate?: number | null;
  interest_accrual_frequency?: string | null;
  interest_compounding_frequency?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

export type SavingsInterestEstimateRow = {
  accountId: string;
  accountName: string;
  accrualFrequency: "none" | "daily" | "monthly" | "annually" | "maturity";
  annualRate: number;
  balanceUsed: number;
  dailyEstimate: number;
  completedAccrualDays: number;
  estimatedDays: number;
  providerConfirmedInterest: number;
  accruedThroughYesterday: number;
  confirmedInterest: number;
  estimatedInterest: number;
  totalInterest: number;
  confirmedThrough: string | null;
  estimateFrom: string | null;
  estimateTo: string | null;
  label: string;
};

export type SavingsInterestMonthEstimate = {
  monthKey: string;
  providerConfirmed: number;
  accruedThroughYesterday: number;
  confirmed: number;
  estimated: number;
  total: number;
  rows: SavingsInterestEstimateRow[];
};

const DAY_MS = 86_400_000;
const allowedFrequencies = new Set(["none", "daily", "monthly", "annually", "maturity"]);

function asNumber(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function clampFrequency(value?: string | null): SavingsInterestEstimateRow["accrualFrequency"] {
  const clean = String(value || "daily").toLowerCase();
  return allowedFrequencies.has(clean) ? clean as SavingsInterestEstimateRow["accrualFrequency"] : "daily";
}

function utcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateIso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function monthBounds(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return { start, end };
}

function maxDate(...dates: Array<string | null>) {
  return dates.filter((date): date is string => Boolean(date)).sort().at(-1) || null;
}

function minDate(...dates: Array<string | null>) {
  return dates.filter((date): date is string => Boolean(date)).sort()[0] || null;
}

function addDays(value: string, days: number) {
  const date = utcDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return dateIso(date);
}

function daysBetweenInclusive(start: string, end: string) {
  const startDate = utcDate(start);
  const endDate = utcDate(end);
  if (endDate < startDate) return 0;
  return Math.floor((endDate.getTime() - startDate.getTime()) / DAY_MS) + 1;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function dailyEquivalentRate(annualPercent: number) {
  const annual = Math.max(0, annualPercent) / 100;
  return Math.pow(1 + annual, 1 / 365) - 1;
}

function interestMovementRows(movements: SavingsLedgerMovement[], accountId: string, monthKey: string) {
  return movements.filter((movement) => {
    if (movement.financial_account_id !== accountId) return false;
    const date = cleanDate(movement.effective_at || movement.created_at);
    return date?.slice(0, 7) === monthKey && movementDirection(movement) === "interest";
  });
}

function firstEligibleEstimateDate(account: SavingsInterestAccount, monthStart: string, latestInterestDate: string | null) {
  const confirmedBalanceDate = cleanDate(account.balance_last_confirmed_at || account.updated_at || account.created_at);
  const firstAfterPaidInterest = latestInterestDate ? addDays(latestInterestDate, 1) : null;
  return maxDate(
    monthStart,
    firstAfterPaidInterest,
    confirmedBalanceDate && confirmedBalanceDate.slice(0, 7) === monthStart.slice(0, 7) ? confirmedBalanceDate : null,
  );
}

/**
 * Daily accounts are split into:
 * - provider-confirmed interest movements;
 * - deterministic accrued interest for completed days (through yesterday);
 * - an estimate for today only.
 *
 * Monthly/annual accounts remain estimated until a provider/manual interest movement is logged.
 */
export function estimateSavingsInterestForMonth(
  accounts: SavingsInterestAccount[],
  movements: SavingsLedgerMovement[],
  monthKey: string,
  nowInput: Date | string | number = new Date(),
): SavingsInterestMonthEstimate {
  const now = nowInput instanceof Date ? nowInput : new Date(nowInput);
  const today = now.toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7);
  const { start, end } = monthBounds(monthKey);
  const monthStart = dateIso(start);
  const monthEnd = dateIso(end);
  const yesterday = addDays(today, -1);

  const rows = accounts.map((account): SavingsInterestEstimateRow => {
    const frequency = clampFrequency(account.interest_accrual_frequency);
    const rate = Math.max(0, asNumber(account.interest_rate));
    const balance = Math.max(0, asNumber(account.balance_last_confirmed_value ?? account.current_balance));
    const actualRows = interestMovementRows(movements, account.id, monthKey);
    const providerConfirmedInterest = roundMoney(actualRows.reduce((sum, movement) => sum + Math.abs(movementDelta(movement)), 0));
    const latestInterestDate = actualRows
      .map((movement) => cleanDate(movement.effective_at || movement.created_at))
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) || null;
    const estimateFrom = firstEligibleEstimateDate(account, monthStart, latestInterestDate);
    const dailyEstimate = balance > 0 && rate > 0 ? balance * dailyEquivalentRate(rate) : 0;

    let completedThrough: string | null = null;
    let completedAccrualDays = 0;
    let estimatedDays = 0;
    let accruedThroughYesterday = 0;
    let estimatedInterest = 0;
    let estimateTo: string | null = null;

    if (frequency === "daily" && estimateFrom && rate > 0 && balance > 0) {
      if (monthKey < currentMonth) completedThrough = monthEnd;
      else if (monthKey === currentMonth && yesterday >= monthStart) completedThrough = minDate(monthEnd, yesterday);

      if (completedThrough && completedThrough >= estimateFrom) {
        completedAccrualDays = daysBetweenInclusive(estimateFrom, completedThrough);
        accruedThroughYesterday = roundMoney(dailyEstimate * completedAccrualDays);
      }

      if (monthKey === currentMonth && today >= monthStart && today <= monthEnd) {
        const todayEstimateStart = completedThrough ? addDays(completedThrough, 1) : estimateFrom;
        if (todayEstimateStart && today >= todayEstimateStart) {
          estimatedDays = daysBetweenInclusive(todayEstimateStart, today);
          estimateTo = today;
          estimatedInterest = roundMoney(dailyEstimate * estimatedDays);
        }
      }
    } else if (["monthly", "annually"].includes(frequency) && estimateFrom && rate > 0 && balance > 0) {
      const estimateEnd = monthKey < currentMonth ? monthEnd : monthKey === currentMonth ? today : null;
      if (estimateEnd && estimateEnd >= estimateFrom) {
        estimatedDays = daysBetweenInclusive(estimateFrom, estimateEnd);
        estimateTo = estimateEnd;
        estimatedInterest = roundMoney(dailyEstimate * estimatedDays);
      }
    }

    const confirmedInterest = roundMoney(providerConfirmedInterest + accruedThroughYesterday);
    const frequencyLabel = frequency === "daily"
      ? `Daily accrual: ${roundMoney(dailyEstimate).toLocaleString("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2 })}/day. Completed days move into accrued-through-yesterday; today remains estimated until tomorrow.`
      : frequency === "monthly"
        ? "Estimated interest accrued so far this month; it remains estimated until the monthly provider payment is logged."
        : frequency === "annually"
          ? "Estimated interest accrued so far this month; the provider pays it annually."
          : frequency === "maturity"
            ? "Interest is retained until maturity and is not included in monthly accrued interest."
            : "No automatic interest estimate is available.";

    return {
      accountId: account.id,
      accountName: account.name || "Savings account",
      accrualFrequency: frequency,
      annualRate: rate,
      balanceUsed: balance,
      dailyEstimate: roundMoney(dailyEstimate),
      completedAccrualDays,
      estimatedDays,
      providerConfirmedInterest,
      accruedThroughYesterday,
      confirmedInterest,
      estimatedInterest,
      totalInterest: roundMoney(confirmedInterest + estimatedInterest),
      confirmedThrough: completedAccrualDays > 0 ? completedThrough : latestInterestDate,
      estimateFrom: estimatedDays > 0 ? (completedThrough ? addDays(completedThrough, 1) : estimateFrom) : null,
      estimateTo: estimatedDays > 0 ? estimateTo : null,
      label: frequencyLabel,
    };
  });

  const providerConfirmed = roundMoney(rows.reduce((sum, row) => sum + row.providerConfirmedInterest, 0));
  const accruedThroughYesterday = roundMoney(rows.reduce((sum, row) => sum + row.accruedThroughYesterday, 0));
  const confirmed = roundMoney(providerConfirmed + accruedThroughYesterday);
  const estimated = roundMoney(rows.reduce((sum, row) => sum + row.estimatedInterest, 0));
  return {
    monthKey,
    providerConfirmed,
    accruedThroughYesterday,
    confirmed,
    estimated,
    total: roundMoney(confirmed + estimated),
    rows,
  };
}

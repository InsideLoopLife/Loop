export type SavingsAccrualFrequency = "none" | "daily" | "monthly" | "annually" | "maturity";
export type SavingsCompoundingFrequency = "none" | "daily" | "monthly" | "annually" | "maturity";

export type SavingsAccrualInput = {
  current_balance?: number | string | null;
  balance_last_confirmed_value?: number | string | null;
  balance_last_confirmed_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  interest_rate?: number | string | null;
  interest_accrual_frequency?: string | null;
  interest_compounding_frequency?: string | null;
};

export type SavingsAccrualResult = {
  baseBalance: number;
  estimatedBalance: number;
  interestAccrued: number;
  elapsedDays: number;
  elapsedPeriods: number;
  accrualFrequency: SavingsAccrualFrequency;
  compoundingFrequency: SavingsCompoundingFrequency;
  lastConfirmedAt: string | null;
  label: string;
  isEstimate: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function asNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function cleanFrequency<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const clean = String(value || "").trim().toLowerCase() as T;
  return allowed.includes(clean) ? clean : fallback;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function completedMonthsBetween(start: Date, end: Date) {
  let months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth());
  if (end.getUTCDate() < start.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

function completedYearsBetween(start: Date, end: Date) {
  let years = end.getUTCFullYear() - start.getUTCFullYear();
  const endMonthDay = end.getUTCMonth() * 100 + end.getUTCDate();
  const startMonthDay = start.getUTCMonth() * 100 + start.getUTCDate();
  if (endMonthDay < startMonthDay) years -= 1;
  return Math.max(0, years);
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function calculateSavingsAccruedBalance(input: SavingsAccrualInput, nowInput: Date | string | number = new Date()): SavingsAccrualResult {
  const now = nowInput instanceof Date ? nowInput : new Date(nowInput);
  const baseBalance = asNumber(input.balance_last_confirmed_value, asNumber(input.current_balance, 0));
  const ratePercent = Math.max(0, asNumber(input.interest_rate, 0));
  const rate = ratePercent / 100;
  const accrualFrequency = cleanFrequency(input.interest_accrual_frequency, ["none", "daily", "monthly", "annually", "maturity"] as const, "daily");
  const compoundingFrequency = cleanFrequency(input.interest_compounding_frequency, ["none", "daily", "monthly", "annually", "maturity"] as const, "monthly");
  const confirmedAt = parseDate(input.balance_last_confirmed_at || input.updated_at || input.created_at || input.start_date) || now;
  const elapsedMs = Math.max(0, now.getTime() - confirmedAt.getTime());
  const elapsedDays = elapsedMs / DAY_MS;
  const maturityDate = parseDate(input.end_date || null);

  let periods = 0;
  let estimated = baseBalance;
  let label = "No interest accrual";

  if (baseBalance > 0 && rate > 0 && accrualFrequency !== "none") {
    if (accrualFrequency === "daily") {
      periods = elapsedDays;
      if (compoundingFrequency === "daily") {
        estimated = baseBalance * Math.pow(1 + rate / 365, periods);
        label = "Daily accrual · daily compounding";
      } else {
        estimated = baseBalance * (1 + (rate * periods) / 365);
        label = compoundingFrequency === "monthly" ? "Daily accrual · paid monthly" : "Daily accrual estimate";
      }
    } else if (accrualFrequency === "monthly") {
      periods = completedMonthsBetween(confirmedAt, now);
      estimated = compoundingFrequency === "monthly"
        ? baseBalance * Math.pow(1 + rate / 12, periods)
        : baseBalance * (1 + (rate * periods) / 12);
      label = "Monthly interest";
    } else if (accrualFrequency === "annually") {
      periods = completedYearsBetween(confirmedAt, now);
      estimated = compoundingFrequency === "annually"
        ? baseBalance * Math.pow(1 + rate, periods)
        : baseBalance * (1 + rate * periods);
      label = "Annual interest";
    } else if (accrualFrequency === "maturity") {
      const matured = Boolean(maturityDate && now.getTime() >= maturityDate.getTime());
      periods = matured ? Math.max(0, elapsedDays) : 0;
      estimated = matured ? baseBalance * (1 + (rate * elapsedDays) / 365) : baseBalance;
      label = matured ? "Interest paid at maturity" : "Interest held until maturity";
    }
  }

  const estimatedBalance = roundMoney(estimated);
  const interestAccrued = roundMoney(estimatedBalance - baseBalance);
  return {
    baseBalance: roundMoney(baseBalance),
    estimatedBalance,
    interestAccrued,
    elapsedDays,
    elapsedPeriods: periods,
    accrualFrequency,
    compoundingFrequency,
    lastConfirmedAt: confirmedAt.toISOString(),
    label,
    isEstimate: estimatedBalance !== roundMoney(asNumber(input.current_balance, baseBalance)),
  };
}

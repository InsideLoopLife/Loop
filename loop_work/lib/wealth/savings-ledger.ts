import { calculateSavingsAccruedBalance } from "@/lib/wealth/savings-accrual";

export type SavingsLedgerAccount = {
  id: string;
  name?: string | null;
  current_balance?: number | null;
  opening_balance_assumption?: number | null;
  balance_last_confirmed_value?: number | null;
  balance_last_confirmed_at?: string | null;
  interest_rate?: number | null;
  interest_accrual_frequency?: string | null;
  interest_compounding_frequency?: string | null;
  monthly_top_up_amount?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SavingsLedgerMovement = {
  id?: string;
  financial_account_id: string;
  movement_type: string;
  amount: number;
  previous_balance?: number | null;
  balance_delta?: number | null;
  resulting_balance?: number | null;
  effective_at?: string | null;
  created_at?: string | null;
  note?: string | null;
};

export type SavingsTrajectoryPoint = {
  date: string;
  balance: number;
  kind: "actual" | "projected";
};

function cleanDate(value?: string | null) {
  const parsed = value ? new Date(value) : null;
  if (!parsed || !Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function compareDate(a: string, b: string) {
  return a.localeCompare(b);
}

function addMonths(date: Date, months: number) {
  const next = new Date(date.getFullYear(), date.getMonth() + months, 1);
  return next;
}

function yyyyMmDd(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthlyRate(annualPercent: number) {
  const annual = Math.max(-0.99, Number(annualPercent || 0) / 100);
  return Math.pow(1 + annual, 1 / 12) - 1;
}

export function movementDelta(movement: SavingsLedgerMovement) {
  if (movement.balance_delta != null && Number.isFinite(Number(movement.balance_delta))) {
    return Number(movement.balance_delta);
  }
  const amount = Number(movement.amount || 0);
  const type = String(movement.movement_type || "").toLowerCase();
  if (["withdrawal", "fee", "transfer_out"].includes(type)) return -Math.abs(amount);
  if (["deposit", "interest", "transfer_in", "opening_balance"].includes(type)) return Math.abs(amount);
  return amount;
}

export function movementDirection(movement: SavingsLedgerMovement) {
  const type = String(movement.movement_type || "").toLowerCase();
  if (["withdrawal", "fee", "transfer_out"].includes(type)) return "out" as const;
  if (type === "interest") return "interest" as const;
  if (["deposit", "transfer_in", "opening_balance"].includes(type)) return "in" as const;
  const delta = movementDelta(movement);
  return delta < 0 ? ("out" as const) : delta > 0 ? ("in" as const) : ("neutral" as const);
}

export function savingsMonthSummary(movements: SavingsLedgerMovement[], monthKey: string) {
  const rows = movements.filter((movement) => {
    const date = cleanDate(movement.effective_at || movement.created_at);
    return date?.slice(0, 7) === monthKey;
  });
  return rows.reduce(
    (summary, movement) => {
      if (String(movement.movement_type || "").toLowerCase() === "opening_balance") return summary;
      const direction = movementDirection(movement);
      const delta = Math.abs(movementDelta(movement));
      if (direction === "interest") summary.interest += delta;
      else if (direction === "in") summary.in += delta;
      else if (direction === "out") summary.out += delta;
      return summary;
    },
    { in: 0, out: 0, interest: 0 },
  );
}

function accountActualLedger(account: SavingsLedgerAccount, movements: SavingsLedgerMovement[], today: string) {
  const accountMovements = movements
    .filter((movement) => movement.financial_account_id === account.id)
    .map((movement) => ({ ...movement, ledgerDate: cleanDate(movement.effective_at || movement.created_at) || today }))
    .sort((a, b) => {
      const dateOrder = compareDate(a.ledgerDate, b.ledgerDate);
      if (dateOrder) return dateOrder;
      const aPriority = String(a.movement_type || "").toLowerCase() === "opening_balance" ? 0 : 1;
      const bPriority = String(b.movement_type || "").toLowerCase() === "opening_balance" ? 0 : 1;
      return aPriority - bPriority || String(a.created_at || "").localeCompare(String(b.created_at || ""));
    });

  const baselineDate = cleanDate(account.start_date || account.created_at || account.balance_last_confirmed_at) || today;
  const hasOpeningMovement = accountMovements.some((movement) => movement.movement_type === "opening_balance");
  let balance = Number(account.opening_balance_assumption ?? (hasOpeningMovement ? 0 : account.current_balance) ?? 0);
  const points: Array<{ date: string; balance: number }> = [{ date: baselineDate, balance: Math.max(0, balance) }];

  for (const movement of accountMovements) {
    const type = String(movement.movement_type || "").toLowerCase();
    if (["balance_correction", "opening_balance"].includes(type)) {
      const next = Number(movement.resulting_balance ?? movement.amount ?? balance);
      balance = Number.isFinite(next) ? Math.max(0, next) : balance;
    } else {
      balance = Math.max(0, balance + movementDelta(movement));
      if (movement.resulting_balance != null && Number.isFinite(Number(movement.resulting_balance))) {
        balance = Math.max(0, Number(movement.resulting_balance));
      }
    }
    points.push({ date: movement.ledgerDate, balance });
  }

  const estimatedToday = calculateSavingsAccruedBalance(account as any).estimatedBalance;
  if (today >= baselineDate) points.push({ date: today, balance: Math.max(0, estimatedToday) });

  const byDate = new Map<string, number>();
  for (const point of points) byDate.set(point.date, point.balance);
  return Array.from(byDate.entries())
    .sort(([a], [b]) => compareDate(a, b))
    .map(([date, value]) => ({ date, balance: value }));
}

function valueAtDate(points: Array<{ date: string; balance: number }>, date: string) {
  let value = 0;
  for (const point of points) {
    if (point.date > date) break;
    value = point.balance;
  }
  return value;
}

export function buildSavingsTrajectory(
  accounts: SavingsLedgerAccount[],
  movements: SavingsLedgerMovement[],
  monthsForward = 24,
  now = new Date(),
): SavingsTrajectoryPoint[] {
  const today = yyyyMmDd(now);
  const accountLedgers = new Map(accounts.map((account) => [account.id, accountActualLedger(account, movements, today)]));
  const actualDates = new Set<string>([today]);
  for (const ledger of accountLedgers.values()) {
    for (const point of ledger) actualDates.add(point.date);
  }

  const actual = Array.from(actualDates)
    .filter((date) => date <= today)
    .sort(compareDate)
    .map((date) => ({
      date,
      balance: accounts.reduce((sum, account) => sum + valueAtDate(accountLedgers.get(account.id) || [], date), 0),
      kind: "actual" as const,
    }));

  const projectedAccounts = accounts.map((account) => ({
    id: account.id,
    balance: Math.max(0, calculateSavingsAccruedBalance(account as any).estimatedBalance),
    monthlyTopUp: Math.max(0, Number(account.monthly_top_up_amount || 0)),
    monthlyRate: monthlyRate(Number(account.interest_rate || 0)),
  }));

  const projected: SavingsTrajectoryPoint[] = [];
  for (let month = 1; month <= monthsForward; month += 1) {
    let total = 0;
    for (const account of projectedAccounts) {
      // Contribution is assumed at the start of the month, so a January payment receives
      // substantially more of that year's growth than a December payment.
      account.balance = Math.max(0, (account.balance + account.monthlyTopUp) * (1 + account.monthlyRate));
      total += account.balance;
    }
    projected.push({ date: yyyyMmDd(addMonths(now, month)), balance: total, kind: "projected" });
  }

  return [...actual, ...projected];
}

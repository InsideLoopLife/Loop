import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { movementDelta, type SavingsLedgerAccount, type SavingsLedgerMovement } from "@/lib/wealth/savings-ledger";

type MaintenanceAccount = SavingsLedgerAccount & {
  user_id: string;
  owner_user_id?: string | null;
  created_by_user_id?: string | null;
  household_id?: string | null;
  visibility_scope?: string | null;
  top_up_day?: number | null;
  account_status?: string | null;
};

type PlannedMovement = SavingsLedgerMovement & {
  id: string;
  user_id: string;
  owner_user_id: string;
  created_by_user_id: string;
  household_id: string | null;
  visibility_scope: "private" | "household";
  source_type: "scheduled_top_up" | "modelled_interest";
  source_note: string;
  tax_year: string;
  payload: Record<string, unknown>;
};

function isoDate(value: Date | string | null | undefined) {
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

function utcDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  const date = utcDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return dateKey(date);
}

function monthStart(value: string) {
  return `${value.slice(0, 7)}-01`;
}

function monthEnd(value: string) {
  const date = utcDate(monthStart(value));
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  return dateKey(date);
}

function nextMonth(value: string) {
  const date = utcDate(monthStart(value));
  date.setUTCMonth(date.getUTCMonth() + 1);
  return dateKey(date);
}

function scheduledDate(month: string, requestedDay: number) {
  const end = monthEnd(month);
  return `${month.slice(0, 7)}-${String(Math.min(Math.max(1, requestedDay), Number(end.slice(-2)))).padStart(2, "0")}`;
}

function taxYear(date: string) {
  const year = Number(date.slice(0, 4));
  const monthDay = date.slice(5);
  const startYear = monthDay >= "04-06" ? year : year - 1;
  return `${startYear}/${String(startYear + 1).slice(-2)}`;
}

function deterministicUuid(value: string) {
  const bytes = Buffer.from(createHash("sha256").update(value).digest("hex").slice(0, 32), "hex");
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function dailyRate(aerPercent: number) {
  return Math.pow(1 + Math.max(0, aerPercent) / 100, 1 / 365) - 1;
}

function openingBalance(account: MaintenanceAccount, movements: SavingsLedgerMovement[]) {
  const opening = movements.find((row) => row.movement_type === "opening_balance");
  return Math.max(0, Number(opening?.resulting_balance ?? opening?.amount ?? account.opening_balance_assumption ?? account.balance_last_confirmed_value ?? account.current_balance ?? 0));
}

function ordered(rows: SavingsLedgerMovement[]) {
  return [...rows].sort((a, b) => String(a.effective_at || a.created_at || "").localeCompare(String(b.effective_at || b.created_at || "")) || String(a.id || "").localeCompare(String(b.id || "")));
}

function balanceBefore(rows: SavingsLedgerMovement[], account: MaintenanceAccount, date: string) {
  let balance = openingBalance(account, rows);
  for (const row of ordered(rows)) {
    const effective = isoDate(row.effective_at || row.created_at);
    if (!effective || effective >= date || row.movement_type === "opening_balance") continue;
    if (row.movement_type === "balance_correction") balance = Math.max(0, Number(row.resulting_balance ?? row.amount ?? balance));
    else balance = Math.max(0, balance + movementDelta(row));
  }
  return balance;
}

function interestForMonth(account: MaintenanceAccount, rows: SavingsLedgerMovement[], month: string) {
  const rate = dailyRate(Number(account.interest_rate || 0));
  if (rate <= 0) return 0;
  const start = monthStart(month);
  const end = monthEnd(month);
  let balance = balanceBefore(rows, account, start);
  let interest = 0;
  const rowsByDate = new Map<string, SavingsLedgerMovement[]>();
  for (const row of rows) {
    const effective = isoDate(row.effective_at || row.created_at);
    if (!effective || effective < start || effective > end || row.movement_type === "opening_balance" || row.source_type === "modelled_interest") continue;
    const dayRows = rowsByDate.get(effective) || [];
    dayRows.push(row);
    rowsByDate.set(effective, dayRows);
  }
  for (let day = start; day <= end; day = addDays(day, 1)) {
    for (const row of rowsByDate.get(day) || []) {
      if (row.movement_type === "balance_correction") balance = Math.max(0, Number(row.resulting_balance ?? row.amount ?? balance));
      else balance = Math.max(0, balance + movementDelta(row));
    }
    const dayInterest = balance * rate;
    interest += dayInterest;
    balance += dayInterest;
  }
  return money(interest);
}

export function planSavingsMaintenance(
  account: MaintenanceAccount,
  existingMovements: SavingsLedgerMovement[],
  todayInput: Date | string = new Date(),
) {
  const today = isoDate(todayInput) || new Date().toISOString().slice(0, 10);
  const start = isoDate(account.start_date || account.created_at || account.balance_last_confirmed_at) || today;
  const end = isoDate(account.end_date) || today;
  const rows = [...existingMovements];
  const planned: PlannedMovement[] = [];
  const userId = account.user_id;
  const writeBase = {
    user_id: userId,
    owner_user_id: account.owner_user_id || userId,
    created_by_user_id: account.created_by_user_id || userId,
    household_id: account.household_id || null,
    visibility_scope: account.visibility_scope === "household" ? "household" as const : "private" as const,
  };

  const monthlyTopUp = Math.max(0, Number(account.monthly_top_up_amount || 0));
  const topUpDay = Math.min(31, Math.max(1, Number(account.top_up_day || 1)));
  if (monthlyTopUp > 0) {
    for (let month = monthStart(start); month <= monthStart(today); month = nextMonth(month)) {
      const effective = scheduledDate(month, topUpDay);
      if (effective < start || effective > today || effective > end) continue;
      const satisfied = rows.some((row) => {
        const rowDate = isoDate(row.effective_at || row.created_at);
        return rowDate === effective
          && ["deposit", "transfer_in"].includes(String(row.movement_type || ""))
          && Math.abs(Math.abs(Number(row.amount || 0)) - monthlyTopUp) < 0.01;
      });
      if (satisfied) continue;
      const id = deterministicUuid(`loop:savings:${account.id}:scheduled-top-up:${effective}`);
      const row: PlannedMovement = {
        ...writeBase,
        id,
        financial_account_id: account.id,
        movement_type: "deposit",
        amount: money(monthlyTopUp),
        balance_delta: money(monthlyTopUp),
        effective_at: effective,
        note: "Scheduled monthly top-up",
        source_type: "scheduled_top_up",
        source_note: "Materialised from the account's monthly top-up amount and due day.",
        tax_year: taxYear(effective),
        payload: { modelled: true, schedule: "monthly_top_up", dueDate: effective },
      };
      rows.push(row);
      planned.push(row);
    }
  }

  const accrual = String(account.interest_accrual_frequency || "daily").toLowerCase();
  const compounding = String(account.interest_compounding_frequency || "monthly").toLowerCase();
  const rate = Math.max(0, Number(account.interest_rate || 0));
  if (rate > 0 && accrual !== "none" && ["daily", "monthly"].includes(compounding)) {
    const lastCompleteMonth = monthStart(addDays(monthStart(today), -1));
    for (let month = monthStart(start); month <= lastCompleteMonth; month = nextMonth(month)) {
      const effective = monthEnd(month);
      if (effective < start || effective > end) continue;
      const confirmed = rows.some((row) => row.movement_type === "interest" && row.source_type !== "modelled_interest" && isoDate(row.effective_at || row.created_at)?.slice(0, 7) === month.slice(0, 7));
      const alreadyModelled = rows.some((row) => row.movement_type === "interest" && row.source_type === "modelled_interest" && isoDate(row.effective_at || row.created_at)?.slice(0, 7) === month.slice(0, 7));
      if (confirmed || alreadyModelled) continue;
      const amount = interestForMonth(account, rows, month);
      if (amount <= 0) continue;
      const id = deterministicUuid(`loop:savings:${account.id}:modelled-interest:${month.slice(0, 7)}`);
      const row: PlannedMovement = {
        ...writeBase,
        id,
        financial_account_id: account.id,
        movement_type: "interest",
        amount,
        balance_delta: amount,
        effective_at: effective,
        note: `Modelled interest for ${month.slice(0, 7)}`,
        source_type: "modelled_interest",
        source_note: "Calculated from the stored AER and dated ledger movements; replace with provider-confirmed interest when available.",
        tax_year: taxYear(effective),
        payload: { modelled: true, schedule: "monthly_interest", aer: rate, period: month.slice(0, 7) },
      };
      rows.push(row);
      planned.push(row);
    }
  }
  return planned;
}

export async function runSavingsAccountMaintenance(
  supabase: SupabaseClient,
  options: { today?: Date | string; limit?: number } = {},
) {
  const limit = Math.max(1, Math.min(5_000, Number(options.limit || 1_000)));
  const { data: accounts, error: accountError } = await supabase
    .from("financial_accounts")
    .select("id,user_id,owner_user_id,created_by_user_id,household_id,visibility_scope,current_balance,opening_balance_assumption,balance_last_confirmed_value,balance_last_confirmed_at,interest_rate,interest_accrual_frequency,interest_compounding_frequency,monthly_top_up_amount,top_up_day,start_date,end_date,created_at,updated_at,account_status")
    .eq("is_liability", false)
    .neq("account_type", "current_account")
    .or("account_status.is.null,account_status.eq.active")
    .limit(limit);
  if (accountError) throw new Error(accountError.message);

  const accountRows = (accounts || []) as MaintenanceAccount[];
  const ids = accountRows.map((account) => account.id);
  const { data: movements, error: movementError } = ids.length
    ? await supabase.from("savings_account_movements").select("id,financial_account_id,movement_type,amount,previous_balance,balance_delta,resulting_balance,effective_at,created_at,note,source_type").in("financial_account_id", ids).order("effective_at")
    : { data: [], error: null };
  if (movementError) throw new Error(movementError.message);
  const movementRows = (movements || []) as Array<SavingsLedgerMovement & { id: string; source_type?: string | null }>;

  // A provider/manual interest entry is authoritative for its month. Remove
  // the modelled placeholder before rebuilding future periods so interest is
  // never counted twice.
  const confirmedInterestMonths = new Set<string>();
  for (const row of movementRows) {
    if (row.movement_type === "interest" && row.source_type !== "modelled_interest") {
      const effective = isoDate(row.effective_at || row.created_at);
      if (effective) confirmedInterestMonths.add(`${row.financial_account_id}:${effective.slice(0, 7)}`);
    }
  }
  const replacedModelIds = movementRows
    .filter((row) => row.movement_type === "interest" && row.source_type === "modelled_interest")
    .filter((row) => {
      const effective = isoDate(row.effective_at || row.created_at);
      return Boolean(effective && confirmedInterestMonths.has(`${row.financial_account_id}:${effective.slice(0, 7)}`));
    })
    .map((row) => row.id);
  if (replacedModelIds.length) {
    const { error } = await supabase.from("savings_account_movements").delete().in("id", replacedModelIds);
    if (error) throw new Error(error.message);
  }

  const byAccount = new Map<string, SavingsLedgerMovement[]>();
  for (const row of movementRows) {
    if (replacedModelIds.includes(row.id)) continue;
    const list = byAccount.get(row.financial_account_id) || [];
    list.push(row);
    byAccount.set(row.financial_account_id, list);
  }
  const planned: PlannedMovement[] = accountRows.flatMap((account) => planSavingsMaintenance(account, byAccount.get(account.id) || [], options.today));
  if (planned.length) {
    const { error } = await supabase.from("savings_account_movements").upsert(planned, { onConflict: "id" });
    if (error) throw new Error(error.message);
  }
  if (ids.length) {
    const { error } = await supabase.from("financial_accounts").update({ savings_last_balance_projection_at: new Date().toISOString() }).in("id", ids);
    if (error) throw new Error(error.message);
  }
  return {
    accounts_checked: ids.length,
    scheduled_top_ups: planned.filter((row) => row.source_type === "scheduled_top_up").length,
    interest_periods: planned.filter((row) => row.source_type === "modelled_interest").length,
    modelled_interest_replaced: replacedModelIds.length,
  };
}

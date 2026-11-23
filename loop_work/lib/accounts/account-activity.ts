// What each account does in a month: pay landing in it, bills and costs leaving it, and regular
// transfers between accounts. Uses the same planning maths as Spending.
import {
  dueDateForMonth, getChildCostMonthlyAmount, getPayAmount, isActiveInMonth, mortgageDealMonthlyPayment, plannedItemDatesForMonth, selectActivePayEventsForMonth,
  type ChildCost, type HomeMortgageDeal, type PayEvent, type PlannedItem,
} from "@/lib/planning/summary-plan";
import { transferDatesInMonth, transferScheduleLabel, type StandingTransfer } from "@/lib/accounts/standing-transfers";

export type AccountLine = {
  key: string;
  label: string;
  date: string | null;
  amount: number;
  direction: "in" | "out";
  kind: "pay" | "bill" | "income" | "child" | "spend" | "transfer" | "mortgage" | "topup";
  personId: string | null;
  note?: string;
  /** The record behind the line, so it can be given an account. */
  ref?: { table: "planned_items" | "pay_events" | "child_costs" | "spending_entries" | "home_mortgage_deals"; id: string };
};

export type UnassignedLine = AccountLine & { ref: NonNullable<AccountLine["ref"]> };

export type AccountActivity = { in: number; out: number; lines: AccountLine[] };

type WithAccount = { payment_account_id?: string | null };

export function buildAccountActivity({
  month, plannedItems, payEvents, childCosts, entries, transfers, accountNames, personNames, mortgageDeals = [],
}: {
  mortgageDeals?: Array<HomeMortgageDeal & WithAccount>;
  month: string;
  plannedItems: Array<PlannedItem & WithAccount>;
  payEvents: Array<PayEvent & WithAccount>;
  childCosts: Array<ChildCost & WithAccount & { payment_day_of_month?: number | null; payment_timing?: string | null; payment_adjustment?: string | null }>;
  entries: Array<{ id: string; label: string; amount: number; spent_at: string; person_id: string | null } & WithAccount>;
  transfers: StandingTransfer[];
  accountNames: Record<string, string>;
  personNames: Record<string, string>;
}) {
  const byAccount = new Map<string, AccountLine[]>();
  let unassigned = 0;
  const unassignedLines: UnassignedLine[] = [];
  const push = (accountId: string | null | undefined, line: AccountLine) => {
    if (!(line.amount > 0)) return;
    if (!accountId) {
      if (line.kind !== "transfer" && line.kind !== "topup") unassigned += 1;
      if (line.ref) unassignedLines.push(line as UnassignedLine);
      return;
    }
    byAccount.set(accountId, [...(byAccount.get(accountId) || []), line]);
  };

  for (const item of plannedItems) {
    const dates = plannedItemDatesForMonth(item, month);
    // A savings top-up is money moving between your own accounts: out of the paying account, into the savings one.
    const savingsId = /\[linked_savings_account:([0-9a-f-]{36})\]/i.exec(String((item as { notes?: string | null }).notes || ""))?.[1] || null;
    dates.forEach((date, i) => {
      if (savingsId && item.direction !== "income") {
        const savingsName = accountNames[savingsId] || "savings";
        const fromName = item.payment_account_id ? accountNames[item.payment_account_id] : null;
        push(item.payment_account_id, { key: `topup-out:${item.id}:${i}`, label: `To ${savingsName}`, date, amount: Number(item.amount || 0), direction: "out", kind: "topup", personId: item.person_id, note: "savings top-up", ref: { table: "planned_items", id: item.id } });
        if (!item.payment_account_id) unassigned += 1;
        push(savingsId, { key: `topup-in:${item.id}:${i}`, label: fromName ? `From ${fromName}` : "Top-up", date, amount: Number(item.amount || 0), direction: "in", kind: "topup", personId: item.person_id, note: "savings top-up" });
        return;
      }
      push(item.payment_account_id, {
        key: `planned:${item.id}:${i}`, label: item.label, date, amount: Number(item.amount || 0),
        direction: item.direction === "income" ? "in" : "out", kind: item.direction === "income" ? "income" : "bill", personId: item.person_id,
        ref: { table: "planned_items", id: item.id },
      });
    });
  }

  for (const event of selectActivePayEventsForMonth(payEvents, month) as Array<PayEvent & WithAccount>) {
    push(event.payment_account_id, {
      key: `pay:${event.id}`, label: event.label || "Pay", amount: Math.round(Number(getPayAmount(event, month) || 0) * 100) / 100,
      date: dueDateForMonth(month, (event as any).pay_timing ?? "last_workday", (event as any).pay_day_of_month, (event as any).pay_adjustment ?? "previous_workday"),
      direction: "in", kind: "pay", personId: event.person_id, ref: { table: "pay_events", id: event.id },
    });
  }

  for (const cost of childCosts) {
    // Same rule as Spending: a cost only counts in months between its start and end dates.
    if (!isActiveInMonth(cost.starts_on, cost.ends_on, month)) continue;
    const amount = Math.round(Number(getChildCostMonthlyAmount(cost, month) || 0) * 100) / 100;
    const date = cost.payment_day_of_month || cost.payment_timing === "last_workday"
      ? dueDateForMonth(month, cost.payment_timing || "fixed_day", cost.payment_day_of_month ?? null, cost.payment_adjustment || "previous_workday")
      : null;
    push(cost.payment_account_id, { key: `child:${cost.id}`, label: cost.label, date, amount, direction: "out", kind: "child", personId: null, ref: { table: "child_costs", id: cost.id } });
  }

  for (const deal of mortgageDeals) {
    if (!isActiveInMonth(deal.start_date, deal.end_date, month)) continue;
    const amount = Math.round(Number(mortgageDealMonthlyPayment(deal) || 0) * 100) / 100;
    const day = deal.payment_day_of_month || Number(String(deal.start_date || "").slice(8, 10)) || 1;
    push(deal.payment_account_id, { key: `mortgage:${deal.id}`, label: deal.lender ? `Mortgage · ${deal.lender}` : "Mortgage", date: dueDateForMonth(month, "fixed_day", day, "next_workday"), amount, direction: "out", kind: "mortgage", personId: null, ref: { table: "home_mortgage_deals", id: deal.id } });
  }

  for (const entry of entries) {
    if (!String(entry.spent_at || "").startsWith(month)) continue;
    push(entry.payment_account_id, { key: `entry:${entry.id}`, label: entry.label, date: entry.spent_at.slice(0, 10), amount: Math.abs(Number(entry.amount || 0)), direction: "out", kind: "spend", personId: entry.person_id, ref: { table: "spending_entries", id: entry.id } });
  }

  for (const t of transfers) {
    const who = t.person_id ? personNames[t.person_id] || "Someone" : "Someone";
    const schedule = transferScheduleLabel(t);
    for (const date of transferDatesInMonth(t, month)) {
      push(t.to_account_id, { key: `transfer-in:${t.id}:${date}`, label: `From ${who}${t.from_account_id && accountNames[t.from_account_id] ? ` (${accountNames[t.from_account_id]})` : ""}`, date, amount: Number(t.amount), direction: "in", kind: "transfer", personId: t.person_id, note: schedule });
      if (t.from_account_id) push(t.from_account_id, { key: `transfer-out:${t.id}:${date}`, label: `To ${accountNames[t.to_account_id] || "joint account"}`, date, amount: Number(t.amount), direction: "out", kind: "transfer", personId: t.person_id, note: schedule });
    }
  }

  const activity: Record<string, AccountActivity> = {};
  for (const [id, lines] of byAccount) {
    lines.sort((a, b) => String(a.date || "9999").localeCompare(String(b.date || "9999")));
    const round = (v: number) => Math.round(v * 100) / 100;
    activity[id] = {
      in: round(lines.filter((l) => l.direction === "in").reduce((s, l) => s + l.amount, 0)),
      out: round(lines.filter((l) => l.direction === "out").reduce((s, l) => s + l.amount, 0)),
      lines,
    };
  }
  return { activity, unassigned, unassignedLines };
}

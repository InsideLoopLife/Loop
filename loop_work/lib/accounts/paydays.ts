// When each account's balance starts being tracked: the next payday on or after today.
//   - an account that pay lands in: the next date that pay lands
//   - otherwise a personal account: its owner's next payday
//   - otherwise (joint): the household's first payday
import { dueDateForMonth, getPayAmount, selectActivePayEventsForMonth, type PayEvent } from "@/lib/planning/summary-plan";

type Pay = PayEvent & { payment_account_id?: string | null; pay_timing?: string | null; pay_day_of_month?: number | null; pay_adjustment?: string | null };

function nextMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** Upcoming pay dates (today or later) over this month and the next two. */
export function upcomingPayDates(payEvents: Pay[], today: string) {
  const out: Array<{ date: string; personId: string | null; accountId: string | null; label: string }> = [];
  let month = today.slice(0, 7);
  for (let i = 0; i < 3; i += 1) {
    for (const event of selectActivePayEventsForMonth(payEvents, month) as Pay[]) {
      if (!(Number(getPayAmount(event, month) || 0) > 0)) continue;
      const date = dueDateForMonth(month, event.pay_timing ?? "last_workday", event.pay_day_of_month ?? null, event.pay_adjustment ?? "previous_workday");
      if (date >= today) out.push({ date, personId: event.person_id, accountId: event.payment_account_id ?? null, label: event.label || "Pay" });
    }
    month = nextMonth(month);
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function trackingStartFor(account: { id: string; joint: boolean; ownerPersonId: string | null }, pays: ReturnType<typeof upcomingPayDates>) {
  const into = pays.find((p) => p.accountId === account.id);
  if (into) return { date: into.date, reason: `${into.label} lands` };
  if (!account.joint && account.ownerPersonId) {
    const own = pays.find((p) => p.personId === account.ownerPersonId);
    if (own) return { date: own.date, reason: "payday" };
  }
  const first = pays[0];
  return first ? { date: first.date, reason: "first payday" } : null;
}

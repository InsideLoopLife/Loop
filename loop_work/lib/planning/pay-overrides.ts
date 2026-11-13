// Attaches pay_event_monthly_overrides and that person's income_deductions to
// pay events, so getPayAmount uses exact monthly figures and takes deductions
// (cycle to work, car schemes, extra pension...) off on every page and the
// calendar, not just one screen.
import { carrySalaryForward } from "@/lib/planning/salary-carry-forward";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PayDeductionRow, PayEventOverrideForPlan } from "@/lib/planning/month-plan";

export async function withPayOverrides<T extends { id: string; person_id?: string | null }>(db: SupabaseClient | any, payEvents: T[] | null | undefined): Promise<Array<T & { overrides: PayEventOverrideForPlan[]; deductions: PayDeductionRow[] }>> {
  // Salaries with an end date but no later pay record carry on (see carrySalaryForward).
  const events = carrySalaryForward(payEvents);
  if (!events.length) return [];
  const personIds = Array.from(new Set(events.map((event) => event.person_id).filter(Boolean))) as string[];
  const [{ data }, deductionRead] = await Promise.all([
    db
      .from("pay_event_monthly_overrides")
      .select("pay_event_id, month, statutory_pay, occupational_pay, gross_pay, net_pay_override")
      .in("pay_event_id", events.map((event) => event.id)),
    personIds.length
      ? db.from("income_deductions").select("id, person_id, deduction_type, label, monthly_amount, taken_before_tax, effective_from, effective_until").in("person_id", personIds)
      : Promise.resolve({ data: [] }),
  ]);
  const byEvent = new Map<string, PayEventOverrideForPlan[]>();
  for (const row of (data || []) as PayEventOverrideForPlan[]) {
    if (!row.pay_event_id) continue;
    byEvent.set(row.pay_event_id, [...(byEvent.get(row.pay_event_id) || []), row]);
  }
  const byPerson = new Map<string, PayDeductionRow[]>();
  for (const row of ((deductionRead as any)?.data || []) as PayDeductionRow[]) {
    if (!row.person_id) continue;
    byPerson.set(row.person_id, [...(byPerson.get(row.person_id) || []), row]);
  }
  return events.map((event) => ({ ...event, overrides: byEvent.get(event.id) || [], deductions: byPerson.get(String(event.person_id || "")) || [] }));
}

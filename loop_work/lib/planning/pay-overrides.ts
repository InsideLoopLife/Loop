// Attaches pay_event_monthly_overrides to pay events so getPayAmount uses the
// exact figure for those months on every page (and the calendar), not just
// the Summary page.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PayEventOverrideForPlan } from "@/lib/planning/month-plan";

export async function withPayOverrides<T extends { id: string }>(db: SupabaseClient | any, payEvents: T[] | null | undefined): Promise<Array<T & { overrides: PayEventOverrideForPlan[] }>> {
  const events = payEvents || [];
  if (!events.length) return [];
  const { data } = await db
    .from("pay_event_monthly_overrides")
    .select("pay_event_id, month, statutory_pay, occupational_pay, gross_pay, net_pay_override")
    .in("pay_event_id", events.map((event) => event.id));
  const byEvent = new Map<string, PayEventOverrideForPlan[]>();
  for (const row of (data || []) as PayEventOverrideForPlan[]) {
    if (!row.pay_event_id) continue;
    byEvent.set(row.pay_event_id, [...(byEvent.get(row.pay_event_id) || []), row]);
  }
  return events.map((event) => ({ ...event, overrides: byEvent.get(event.id) || [] }));
}

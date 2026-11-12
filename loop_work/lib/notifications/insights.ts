// Builds one person's notifications: the weekly investment and nutrition
// updates, bill price rises, a mortgage deal or savings rate ending soon.
// Used by the daily job and the "Generate weekly preview" button; `notify`
// makes running it any number of times safe.
import { formatMoney } from "@/lib/format/money";
import { priceWatch } from "@/lib/bills/price-watch";
import { notify, weekKey } from "./notify";

const num = (value: unknown) => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
};
const DAY = 86400000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (date: string | Date, days: number) => new Date(new Date(typeof date === "string" ? `${date}T12:00:00` : date).getTime() + days * DAY);
const daysUntil = (date: string, today: Date) => Math.round((new Date(`${date}T12:00:00`).getTime() - today.getTime()) / DAY);
const dateLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const signed = (n: number) => `${n >= 0 ? "up" : "down"} ${formatMoney(Math.abs(n))}`;
const months = (days: number) => (days < 45 ? `${days} days` : `${Math.round(days / 30.4)} months`);

type Prefs = { in_app_enabled?: boolean | null; renewal_reminders_enabled?: boolean | null; finance_digest_enabled?: boolean | null; health_digest_enabled?: boolean | null };

export async function buildNotifications(supabase: any, person: { user_id: string; household_id: string | null }, opts: { today?: Date; prefs?: Prefs | null } = {}) {
  const today = opts.today ?? new Date();
  const prefs = opts.prefs ?? {};
  const counts = { created: 0, updated: 0, skipped: 0 };
  if (prefs.in_app_enabled === false) return counts;
  const on = (flag: boolean | null | undefined) => flag !== false;
  const send = async (input: Parameters<typeof notify>[1]) => { counts[await notify(supabase, input)] += 1; };
  const base = { user_id: person.user_id, household_id: person.household_id };
  const mine = person.household_id ? `user_id.eq.${person.user_id},household_id.eq.${person.household_id}` : `user_id.eq.${person.user_id}`;
  const week = weekKey(today);
  const weekEnds = iso(addDays(today, 8));

  const [holdings, logs, items, responses, homes, deals, accounts, lastWeekly] = await Promise.all([
    supabase.from("investment_holdings").select("latest_price, average_buy_price, units, imported_current_value, imported_invested_value").eq("user_id", person.user_id).neq("record_status", "archived").limit(500),
    supabase.from("food_logs").select("protein_g, fibre_g, processed_score").eq("user_id", person.user_id).gte("eaten_on", iso(addDays(today, -7))).limit(500),
    supabase.from("planned_items").select("id, label, brand_name, amount, recurrence, start_date, end_date, day_of_month, spending_categories(name)").or(mine).eq("direction", "outgoing").limit(1000),
    supabase.from("bill_price_watch").select("watch_key, planned_item_id, response, value, fixed_until").or(mine),
    supabase.from("homes").select("id").or(mine).limit(1),
    supabase.from("home_mortgage_deals").select("id, lender, product_name, interest_rate, initial_period_end, renewal_watch_enabled").or(mine).not("initial_period_end", "is", null),
    supabase.from("financial_accounts").select("id, name, provider, interest_rate, interest_rate_end_date, is_liability").or(mine).not("interest_rate_end_date", "is", null),
    supabase.from("app_notifications").select("period_key, metadata").eq("user_id", person.user_id).eq("notification_type", "investment_weekly_progress").neq("period_key", week).like("period_key", "____-W__").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  // Weekly investments: the change since last week's update, plus since bought.
  const holdingRows: any[] = holdings.data || [];
  if (holdingRows.length && on(prefs.finance_digest_enabled)) {
    const invested = holdingRows.reduce((s, h) => s + (num(h.imported_invested_value) || num(h.average_buy_price) * num(h.units)), 0);
    const current = holdingRows.reduce((s, h) => s + (num(h.imported_current_value) || num(h.latest_price) * num(h.units)), 0);
    const sinceBought = current - invested;
    const sinceBoughtPct = invested > 0 ? (sinceBought / invested) * 100 : 0;
    const previous = lastWeekly.data?.metadata?.current != null ? num(lastWeekly.data.metadata.current) : null;
    const weekChange = previous != null ? current - previous : null;
    const weekPct = previous ? ((weekChange as number) / previous) * 100 : null;
    const lead = weekChange != null
      ? `Your investments are worth ${formatMoney(current)}, ${signed(weekChange)} (${Math.abs(weekPct as number).toFixed(1)}%) on last week.`
      : `Your investments are worth ${formatMoney(current)}.`;
    await send({
      ...base, notification_type: "investment_weekly_progress", key: week, category: "wealth",
      severity: (weekChange ?? sinceBought) >= 0 ? "success" : "info",
      title: weekChange != null ? `Investments ${signed(weekChange)} this week` : "Your investments this week",
      body: `${lead} Since you bought them: ${signed(sinceBought)} (${sinceBoughtPct.toFixed(1)}%).`,
      cta_label: "Open investments", cta_href: "/investments", expires_at: weekEnds,
      metadata: { invested, current, previous, weekChange, sinceBought, sinceBoughtPct },
    });
  }

  // Weekly nutrition.
  const logRows: any[] = logs.data || [];
  if (logRows.length && on(prefs.health_digest_enabled)) {
    const avgFibre = logRows.reduce((s, r) => s + num(r.fibre_g), 0) / 7;
    const avgProtein = logRows.reduce((s, r) => s + num(r.protein_g), 0) / 7;
    const avgProcessed = logRows.reduce((s, r) => s + num(r.processed_score), 0) / logRows.length;
    await send({
      ...base, notification_type: "nutrition_weekly_insight", key: week, category: "lifestyle",
      severity: avgProcessed > 65 || avgFibre < 10 ? "warning" : "info",
      title: "Your food this week",
      body: `About ${avgProtein.toFixed(0)}g protein and ${avgFibre.toFixed(0)}g fibre a day, with a processed score of ${avgProcessed.toFixed(0)} out of 100.`,
      cta_label: "Open LoopHealth", cta_href: "/nutrition", expires_at: weekEnds,
      metadata: { avgProtein, avgFibre, avgProcessed, loggedItems: logRows.length },
    });
  }

  // Bill price rises that are confirmed or forecast and start within 60 days.
  const alerts = priceWatch(
    ((items.data ?? []) as any[]).map((item) => ({ ...item, amount: num(item.amount), category: item.spending_categories?.name ?? null })),
    (responses.data ?? []) as any[],
    { today, hasHome: Boolean(homes.data?.length) },
  );
  for (const alert of alerts) {
    if ((alert.status !== "confirmed" && alert.status !== "forecast") || !alert.effective) continue;
    const days = daysUntil(alert.effective, today);
    if (days < 0 || days > 60) continue;
    const up = alert.next != null && alert.current != null ? alert.next - alert.current : null;
    await send({
      ...base, notification_type: "bill_price_rise", key: alert.key, category: "household",
      severity: "warning",
      title: alert.headline,
      body: `${up != null ? `That's about ${formatMoney(Math.round(up * 12))} more a year. ` : ""}Add the new price to your plan, or tell LOOP it doesn't apply.`,
      cta_label: "Review bill", cta_href: "/financial-flow", expires_at: iso(addDays(alert.effective, 14)),
      metadata: { itemId: alert.itemId, current: alert.current, next: alert.next, effective: alert.effective, status: alert.status },
    });
  }

  if (on(prefs.renewal_reminders_enabled)) {
    // Mortgage deal ending: once at 6 months (when you can lock in a new
    // rate) and again at 2 months if it still stands.
    for (const deal of (deals.data ?? []) as any[]) {
      if (deal.renewal_watch_enabled === false) continue;
      const days = daysUntil(deal.initial_period_end, today);
      if (days < 0 || days > 183) continue;
      const stage = days <= 62 ? "2m" : "6m";
      const name = [deal.lender, deal.product_name].filter(Boolean).join(" ") || "Your mortgage deal";
      await send({
        ...base, notification_type: "mortgage_deal_ending", key: `${deal.id}:${deal.initial_period_end}:${stage}`, category: "wealth",
        severity: stage === "2m" ? "urgent" : "warning",
        title: `${name} ends in ${months(days)}`,
        body: stage === "2m"
          ? `It ends on ${dateLabel(deal.initial_period_end)}. If you haven't picked a new deal, do it now so you don't move to the lender's standard rate.`
          : `It ends on ${dateLabel(deal.initial_period_end)}. Most lenders let you lock in a new rate up to 6 months ahead, so now is a good time to compare.`,
        cta_label: "Compare deals", cta_href: "/mortgage", expires_at: iso(addDays(deal.initial_period_end, 1)),
        metadata: { dealId: deal.id, ends: deal.initial_period_end, rate: deal.interest_rate },
      });
    }

    // Savings rate ending within 30 days.
    for (const account of (accounts.data ?? []) as any[]) {
      if (account.is_liability) continue;
      const days = daysUntil(account.interest_rate_end_date, today);
      if (days < 0 || days > 30) continue;
      const name = [account.provider, account.name].filter(Boolean).join(" ") || "A savings account";
      await send({
        ...base, notification_type: "savings_rate_ending", key: `${account.id}:${account.interest_rate_end_date}`, category: "wealth",
        severity: "warning",
        title: `${name}: rate ends ${dateLabel(account.interest_rate_end_date)}`,
        body: `${account.interest_rate ? `Your ${num(account.interest_rate)}% rate` : "Your rate"} ends in ${days} days. Check what it drops to and whether to move the money.`,
        cta_label: "Open savings", cta_href: "/financial-flow?tab=savings", expires_at: iso(addDays(account.interest_rate_end_date, 7)),
        metadata: { accountId: account.id, ends: account.interest_rate_end_date },
      });
    }
  }

  return counts;
}

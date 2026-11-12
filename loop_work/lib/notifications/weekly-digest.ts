// The Monday email: one short read on where your money is heading, what's
// coming up, and anything that needs you. Built from the same month plans as
// the dashboard and the same alerts as the notification centre, so the email
// never says something the app doesn't.
import { buildMonthPlan, type MonthPlan } from "@/lib/planning/month-plan";
import { monthDrivers, outlook } from "@/lib/planning/plain-money";
import { visibleDataOrFilter } from "@/domains/identity/household/household-context";
import { weekKey } from "./notify";
import { areaByKey, areaOf } from "./areas";

const pounds = (n: number) => `£${Math.round(Math.abs(n)).toLocaleString("en-GB")}`;
const longMonth = (month: string) => new Date(`${month}-01T12:00:00`).toLocaleDateString("en-GB", { month: "long" });
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function months(start: string, count: number) {
  const [y, m] = start.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(y, m - 1 + i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

/** The person's month plans from last month to five months ahead. */
async function loadPlans(supabase: any, userId: string, householdId: string | null, today: Date): Promise<MonthPlan[]> {
  const filter = visibleDataOrFilter({ userId, dataOwnerUserId: userId, householdId } as any);
  const [profile, categories, childCosts, people, payEvents, overrides, deals, items, incomeEntries] = await Promise.all([
    supabase.from("financial_profiles").select("name, annual_salary, monthly_take_home, monthly_dividends, pension_percent, student_loan_plan, monthly_mortgage, monthly_savings_target").eq("user_id", userId).maybeSingle(),
    supabase.from("spending_categories").select("id, name, type, monthly_budget").or(filter),
    supabase.from("child_costs").select("*").or(filter),
    supabase.from("people").select("id, name, relationship").or(filter).or("account_status.is.null,account_status.neq.duplicate_merged"),
    supabase.from("pay_events").select("*").or(filter),
    supabase.from("pay_event_monthly_overrides").select("id, pay_event_id, person_id, month, statutory_pay, occupational_pay, gross_pay, net_pay_override").eq("user_id", userId),
    supabase.from("home_mortgage_deals").select("id, lender, product_name, balance, balance_as_of_date, interest_rate, term_years, monthly_payment_override, payment_day_of_month, initial_period_end, start_date, end_date, first_payment_date").or(filter),
    supabase.from("planned_items").select("id, person_id, category_id, direction, item_type, label, amount, recurrence, recurrence_interval_days, start_date, end_date, day_of_month, payment_timing, payment_adjustment, end_behavior, renewal_notice_days, early_upgrade_date, expected_refund_amount").or(filter),
    supabase.from("income_entries").select("id, person_id, label, gross_amount, net_amount, frequency, entry_date").or(filter),
  ]);
  const byEvent = new Map<string, any[]>();
  for (const o of (overrides.data ?? []) as any[]) if (o.pay_event_id) byEvent.set(o.pay_event_id, [...(byEvent.get(o.pay_event_id) || []), o]);
  const peopleById = new Map(((people.data ?? []) as any[]).map((p) => [p.id, p]));
  const thisMonth = today.toISOString().slice(0, 7);
  const [y, m] = thisMonth.split("-").map(Number);
  const last = new Date(y, m - 2, 1);
  const start = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}`;
  return months(start, 7).map((month) => buildMonthPlan({
    month,
    profile: profile.data ?? null,
    categories: (categories.data ?? []) as any,
    childCosts: (childCosts.data ?? []) as any,
    payEvents: ((payEvents.data ?? []) as any[]).map((e) => ({ ...e, overrides: byEvent.get(e.id) || [] })),
    mortgageDeals: (deals.data ?? []) as any,
    plannedItems: (items.data ?? []) as any,
    incomeEntries: (incomeEntries.data ?? []) as any,
    peopleById,
  }));
}

export type Digest = { subject: string; html: string; text: string; summary: string; empty: boolean };

export async function buildWeeklyDigest(
  supabase: any,
  person: { user_id: string; household_id: string | null; name?: string | null },
  opts: { today?: Date; appUrl: string; finance?: boolean; health?: boolean },
): Promise<Digest> {
  const today = opts.today ?? new Date();
  const appUrl = opts.appUrl.replace(/\/$/, "");
  const finance = opts.finance !== false;

  const [plans, notes] = await Promise.all([
    finance ? loadPlans(supabase, person.user_id, person.household_id, today).catch(() => [] as MonthPlan[]) : Promise.resolve([] as MonthPlan[]),
    supabase.from("app_notifications").select("notification_type, title, body, cta_href, severity, status, action_status, metadata, period_key, created_at")
      .eq("user_id", person.user_id).neq("status", "dismissed").neq("notification_type", "weekly_digest")
      .or(`expires_at.is.null,expires_at.gt.${today.toISOString()}`)
      .gte("created_at", new Date(today.getTime() - 8 * 86400000).toISOString())
      .order("created_at", { ascending: false }).limit(50),
  ]);
  const rows: any[] = notes.data ?? [];

  // 1. This month, and why it differs from last month.
  const [lastMonth, thisMonth] = plans;
  const hasMoney = Boolean(thisMonth && (thisMonth.income > 0 || thisMonth.outgoings > 0));
  const left = thisMonth?.surplus ?? 0;
  const change = hasMoney && lastMonth ? left - lastMonth.surplus : 0;
  const drivers = hasMoney && lastMonth ? monthDrivers(lastMonth, thisMonth, 2, 20) : [];

  // 2. The next few months.
  const ahead = hasMoney ? outlook(plans.slice(1), 4, 50, 3) : [];

  // 3. Things that need a look (alerts from the past week), most pressing first.
  const rank = (n: any) => (n.action_status == null && /invite|approval|allocation|claim|write_off/.test(n.notification_type) ? 0 : n.severity === "urgent" ? 1 : n.severity === "warning" ? 2 : 3);
  const heads = rows.filter((n) => rank(n) < 3 && !/weekly/.test(n.notification_type)).sort((a, b) => rank(a) - rank(b)).slice(0, 4);

  // 4. Investments and food, from this week's updates.
  const week = weekKey(today);
  const invest = rows.find((n) => n.notification_type === "investment_weekly_progress" && n.period_key === week) || rows.find((n) => n.notification_type === "investment_weekly_progress");
  const food = opts.health !== false ? rows.find((n) => n.notification_type === "nutrition_weekly_insight") : null;

  const first = (person.name || "").split(/\s+/)[0] || "there";
  const monthName = thisMonth ? longMonth(thisMonth.month) : today.toLocaleDateString("en-GB", { month: "long" });
  const headline = hasMoney
    ? left >= 0
      ? `You're on track to have ${pounds(left)} left over in ${monthName}`
      : `${monthName} is on track to be ${pounds(left)} short`
    : "Your week in LOOP";
  const changeLine = hasMoney && lastMonth && Math.abs(change) >= 5
    ? `That's ${pounds(change)} ${change > 0 ? "more" : "less"} than ${longMonth(lastMonth.month)}${drivers.length ? `, mainly because ${drivers.map((d) => d.text.replace(/^./, (c) => c.toLowerCase())).join(" and ")}` : ""}.`
    : hasMoney ? `About the same as last month.` : "";

  const empty = !hasMoney && !heads.length && !invest && !food;
  const subject = hasMoney ? `${headline} – your week in LOOP` : heads.length ? `${heads.length} thing${heads.length > 1 ? "s" : ""} to look at this week – LOOP` : "Your week in LOOP";

  // Plain text.
  const text = [
    `Hi ${first},`, "",
    headline + (hasMoney ? "." : ""), changeLine,
    ...(ahead.length ? ["", "COMING UP", ...ahead.map((a) => `- ${longMonth(a.month)}: ${a.text} (${a.effect >= 0 ? "+" : "-"}${pounds(a.effect)} ${a.lasting ? "a month from then" : "that month"})`)] : []),
    ...(heads.length ? ["", "WORTH A LOOK", ...heads.map((n) => `- ${n.title}`)] : []),
    ...(invest ? ["", "INVESTMENTS", invest.body] : []),
    ...(food ? ["", "FOOD THIS WEEK", food.body] : []),
    "", `Open LOOP: ${appUrl}/dashboard`, "",
    `You get this because the weekly email is on. Turn it off: ${appUrl}/account?tab=notifications`,
  ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");

  // HTML (table layout and inline styles, so it holds up in email apps).
  const section = (title: string, inner: string) => `
    <tr><td style="padding:20px 28px 0">
      <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#5c6964">${esc(title)}</p>${inner}
    </td></tr>`;
  const row = (label: string, value: string, tone: "up" | "down" | "plain" = "plain", sub = "") => `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e1e5e0"><tr>
        <td style="padding:10px 0;font-size:14px;color:#18211d">${esc(label)}${sub ? `<br><span style="font-size:12px;color:#5c6964">${esc(sub)}</span>` : ""}</td>
        <td align="right" style="padding:10px 0;font-size:14px;font-weight:700;white-space:nowrap;color:${tone === "up" ? "#17543f" : tone === "down" ? "#b42318" : "#18211d"}">${esc(value)}</td>
      </tr></table>`;
  const link = (href: string | null) => `${appUrl}${href && href.startsWith("/") ? href : "/notifications"}`;

  const html = `<!doctype html><html><body style="margin:0;background:#f4f6f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<span style="display:none;max-height:0;overflow:hidden">${esc(changeLine || headline)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f3;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e1e5e0;border-radius:16px;overflow:hidden">
  <tr><td style="padding:22px 28px 0">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="width:32px;height:32px;border-radius:9px;background:#1f6a50;color:#fff;font-size:18px;text-align:center;vertical-align:middle">&infin;</td>
      <td style="padding-left:10px;font-size:17px;font-weight:700;color:#18211d">LOOP</td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:22px 28px 0">
    <p style="margin:0;font-size:14px;color:#5c6964">Hi ${esc(first)},</p>
    <h1 style="margin:6px 0 0;font-size:22px;line-height:1.3;color:#18211d">${esc(headline)}</h1>
    ${changeLine ? `<p style="margin:8px 0 0;font-size:15px;line-height:1.5;color:#3d4a45">${esc(changeLine)}</p>` : ""}
  </td></tr>
  ${ahead.length ? section("Coming up", ahead.map((a) => row(`${longMonth(a.month)}: ${a.text}`, `${a.effect >= 0 ? "+" : "−"}${pounds(a.effect)}`, a.effect >= 0 ? "up" : "down", a.lasting ? "a month from then on" : "just that month")).join("")) : ""}
  ${heads.length ? section("Worth a look", heads.map((n) => `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e1e5e0"><tr><td style="padding:10px 0">
        <a href="${esc(link(n.cta_href))}" style="font-size:14px;font-weight:600;color:#18211d;text-decoration:none">${esc(n.title)}</a>
        <br><span style="font-size:12px;color:#5c6964">${esc(areaByKey(areaOf(n))?.label || "")}</span>
      </td></tr></table>`).join("")) : ""}
  ${invest ? section("Investments", `<p style="margin:0;font-size:14px;line-height:1.5;color:#18211d">${esc(invest.body || "")}</p>`) : ""}
  ${food ? section("Food this week", `<p style="margin:0;font-size:14px;line-height:1.5;color:#18211d">${esc(food.body || "")}</p>`) : ""}
  ${empty ? `<tr><td style="padding:16px 28px 0;font-size:14px;line-height:1.5;color:#3d4a45">Nothing new this week. Add your income and bills in LOOP and this email will show where your money is heading.</td></tr>` : ""}
  <tr><td style="padding:24px 28px 28px">
    <a href="${esc(appUrl)}/dashboard" style="display:inline-block;background:#1f6a50;color:#fff;font-size:14px;font-weight:600;text-decoration:none;padding:11px 18px;border-radius:10px">Open LOOP</a>
  </td></tr>
</table>
<p style="max-width:560px;margin:14px auto 0;font-size:12px;line-height:1.5;color:#7b8783;text-align:center">You get this every Monday because the weekly email is on. <a href="${esc(appUrl)}/account?tab=notifications" style="color:#5c6964">Change or turn it off</a>.</p>
</td></tr></table></body></html>`;

  const summary = [headline + (hasMoney ? "." : ""), changeLine, heads.length ? `${heads.length} thing${heads.length > 1 ? "s" : ""} worth a look.` : ""].filter(Boolean).join(" ");
  return { subject, html, text, summary, empty };
}

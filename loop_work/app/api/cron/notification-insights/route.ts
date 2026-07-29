import { NextResponse, type NextRequest } from "next/server";
import { createWorkerDatabaseClient } from "@/platform/database/worker-client";

function unauthorised() {
  return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
}

function num(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function money(value: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value);
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const headerSecret = request.headers.get("x-cron-secret") || request.nextUrl.searchParams.get("secret");
  if (!secret || headerSecret !== secret) return unauthorised();

  const supabase = createWorkerDatabaseClient("notifications");
  const { data: profiles, error } = await supabase.from("app_user_profiles").select("user_id, household_id").limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const weekStart = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  let created = 0;
  for (const profile of profiles || []) {
    const [holdings, logs] = await Promise.all([
      supabase.from("investment_holdings").select("asset_name, latest_price, average_buy_price, units, imported_current_value, imported_invested_value").eq("user_id", profile.user_id).limit(200),
      supabase.from("food_logs").select("label, calories, protein_g, fibre_g, salt_g, processed_score, gut_health_score, eaten_on").eq("user_id", profile.user_id).gte("eaten_on", weekStart).limit(200),
    ]);

    const holdingRows: any[] = holdings.data || [];
    const invested = holdingRows.reduce((sum, h) => sum + (num(h.imported_invested_value) || num(h.average_buy_price) * num(h.units)), 0);
    const current = holdingRows.reduce((sum, h) => sum + (num(h.imported_current_value) || num(h.latest_price) * num(h.units)), 0);
    const delta = current - invested;
    const deltaPct = invested > 0 ? (delta / invested) * 100 : 0;
    const logRows: any[] = logs.data || [];
    const avgFibre = logRows.length ? logRows.reduce((sum, row) => sum + num(row.fibre_g), 0) / 7 : 0;
    const avgProtein = logRows.length ? logRows.reduce((sum, row) => sum + num(row.protein_g), 0) / 7 : 0;
    const avgProcessed = logRows.length ? logRows.reduce((sum, row) => sum + num(row.processed_score), 0) / logRows.length : 0;

    const rows = [];
    if (holdingRows.length) rows.push({
      user_id: profile.user_id,
      household_id: profile.household_id,
      notification_type: "investment_weekly_progress",
      category: "wealth",
      channel: "in_app",
      severity: delta >= 0 ? "success" : "info",
      status: "unread",
      title: "Weekly investment progress",
      body: `Your tracked investments are ${delta >= 0 ? "up" : "down"} ${money(Math.abs(delta))} (${deltaPct.toFixed(1)}%) against the tracked baseline.`,
      cta_label: "Open investments",
      cta_href: "/investments",
      period_key: "week",
      metadata: { invested, current, delta, deltaPct, periods: ["week", "month", "year"] },
    });
    if (logRows.length) rows.push({
      user_id: profile.user_id,
      household_id: profile.household_id,
      notification_type: "nutrition_weekly_insight",
      category: "lifestyle",
      channel: "in_app",
      severity: avgProcessed > 65 || avgFibre < 10 ? "warning" : "info",
      status: "unread",
      title: "Weekly nutrition insight",
      body: `This week averages around ${avgProtein.toFixed(1)}g protein/day, ${avgFibre.toFixed(1)}g fibre/day and processed load ${avgProcessed.toFixed(0)}/100.`,
      cta_label: "Open LoopHealth",
      cta_href: "/nutrition",
      period_key: "week",
      metadata: { avgProtein, avgFibre, avgProcessed, loggedItems: logRows.length },
    });
    if (rows.length) {
      const { error: insertError } = await supabase.from("app_notifications").insert(rows);
      if (!insertError) created += rows.length;
    }
  }

  return NextResponse.json({ ok: true, created });
}

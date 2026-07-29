import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchAndClassifyDealPage } from "@/lib/money/dealAvailability";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runKey(date = new Date()) {
  return `money-deals-daily:${date.toISOString().slice(0, 10)}`;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const limit = Number(request.nextUrl.searchParams.get("limit") || process.env.LOOP_MONEY_DAILY_LIMIT || 75);
  const delayMs = Number(request.nextUrl.searchParams.get("delay_ms") || process.env.LOOP_MONEY_DAILY_DELAY_MS || 1000);
  const key = request.nextUrl.searchParams.get("run_key") || runKey();

  const { data: existing } = await supabase
    .from("loop_money_deal_daily_runs")
    .select("*")
    .eq("run_key", key)
    .maybeSingle();

  if (existing?.status === "completed") {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Daily money deal run already completed for this run_key.",
      run: existing,
    });
  }

  const { data: run, error: runError } = await supabase
    .from("loop_money_deal_daily_runs")
    .upsert({
      run_key: key,
      run_kind: "daily_8am",
      status: "started",
      started_at: new Date().toISOString(),
      payload: {
        requestUrl: request.url,
        limit,
        delayMs,
      },
    }, { onConflict: "run_key" })
    .select("*")
    .single();

  if (runError) return NextResponse.json({ error: runError.message }, { status: 400 });

  let checked = 0;
  let available = 0;
  let suspected = 0;
  let withdrawn = 0;
  let blocked = 0;
  let failed = 0;
  let notifications = 0;
  const results: any[] = [];

  try {
    const { data: deals, error } = await supabase
      .from("loop_money_savings_deals")
      .select("*")
      .in("status", ["active", "needs_review"])
      .not("source_url", "is", null)
      .order("rate_last_checked_at", { ascending: true, nullsFirst: true })
      .limit(Math.max(1, Math.min(limit, 150)));

    if (error) throw new Error(error.message);

    for (const deal of deals || []) {
      checked += 1;

      const result = await fetchAndClassifyDealPage(deal.source_url);

      await supabase.from("loop_money_deal_observations").insert({
        deal_id: deal.id,
        provider_name: deal.provider_name,
        product_name: deal.product_name,
        rate_aer: result.rateAer || null,
        max_monthly_pence: deal.max_monthly_pence,
        max_balance_pence: deal.max_balance_pence,
        term_months: deal.term_months,
        source_url: deal.source_url,
        source_provider: "daily_source_url",
        observed_payload: result,
        confidence: result.confidence,
      });

      const { data: applied, error: applyError } = await supabase.rpc("loop_money_apply_deal_check_result", {
        p_deal_id: deal.id,
        p_check_status: result.checkStatus,
        p_rate_aer: result.rateAer,
        p_detail: result.detail,
        p_payload: result.payload,
      });

      if (applyError) throw new Error(applyError.message);

      const newAvailability = applied?.availability_status;

      if (newAvailability === "available") available += 1;
      if (newAvailability === "suspected_withdrawn") suspected += 1;
      if (newAvailability === "withdrawn") withdrawn += 1;
      if (newAvailability === "blocked") blocked += 1;
      if (["unknown"].includes(newAvailability) || result.checkStatus === "failed") failed += 1;

      if (newAvailability === "suspected_withdrawn" || newAvailability === "withdrawn" || newAvailability === "blocked") {
        const { data: impacted } = await supabase
          .from("loop_money_strategy_opportunities")
          .select("id, profile_id, loop_money_profiles!inner(user_id)")
          .eq("deal_id", deal.id)
          .in("status", ["new", "seen", "watching"]);

        for (const opportunity of impacted || []) {
          const userId = (opportunity as any).loop_money_profiles?.user_id;
          if (!userId) continue;

          await supabase.from("loop_money_notifications").insert({
            user_id: userId,
            profile_id: opportunity.profile_id,
            opportunity_id: opportunity.id,
            notification_kind: newAvailability === "withdrawn" ? "deal_expiring" : "condition_change",
            title: newAvailability === "withdrawn" ? "Savings deal appears withdrawn" : "Savings deal needs checking",
            body: `${deal.provider_name} ${deal.product_name} is no longer being shown as confidently available. LOOP has hidden it from optimisation until reviewed.`,
            action_url: "/account/money-strategy",
            payload: {
              deal_id: deal.id,
              provider_name: deal.provider_name,
              product_name: deal.product_name,
              availability_status: newAvailability,
              check_result: result,
            },
          });
          notifications += 1;
        }

        await supabase
          .from("loop_money_strategy_opportunities")
          .update({
            status: newAvailability === "withdrawn" ? "expired" : "watching",
            updated_at: new Date().toISOString(),
          })
          .eq("deal_id", deal.id)
          .in("status", ["new", "seen", "watching"]);
      }

      results.push({
        deal_id: deal.id,
        provider_name: deal.provider_name,
        product_name: deal.product_name,
        result,
        applied,
      });

      if (delayMs > 0) await sleep(delayMs);
    }

    await supabase
      .from("loop_money_deal_daily_runs")
      .update({
        status: failed || blocked || suspected ? "completed_with_warnings" : "completed",
        finished_at: new Date().toISOString(),
        checked_deals: checked,
        available_count: available,
        suspected_withdrawn_count: suspected,
        withdrawn_count: withdrawn,
        blocked_count: blocked,
        failed_count: failed,
        notifications_created: notifications,
        payload: {
          results: results.slice(0, 50),
          result_count: results.length,
        },
      })
      .eq("id", run.id);

    return NextResponse.json({
      ok: true,
      run_id: run.id,
      checked,
      available,
      suspected_withdrawn: suspected,
      withdrawn,
      blocked,
      failed,
      notifications_created: notifications,
      note:
        "This run checks known configured/source-linked deals. To discover every market deal, add provider feeds/comparison sources/commercial data feeds into the source registry.",
    });
  } catch (error: any) {
    await supabase
      .from("loop_money_deal_daily_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        checked_deals: checked,
        available_count: available,
        suspected_withdrawn_count: suspected,
        withdrawn_count: withdrawn,
        blocked_count: blocked,
        failed_count: failed + 1,
        notifications_created: notifications,
        error: error?.message || "Daily money deal run failed.",
        payload: { results: results.slice(0, 50) },
      })
      .eq("id", run.id);

    return NextResponse.json({ error: error?.message || "Daily money deal run failed." }, { status: 500 });
  }
}

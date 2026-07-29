import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refreshSavingsDealFromUrl } from "@/lib/money/sourceRefresh";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const limit = Number(request.nextUrl.searchParams.get("limit") || process.env.LOOP_MONEY_DEAL_REFRESH_LIMIT || 20);
  const delayMs = Number(request.nextUrl.searchParams.get("delay_ms") || process.env.LOOP_MONEY_DEAL_REFRESH_DELAY_MS || 750);

  const { data: deals, error } = await supabase
    .from("loop_money_savings_deals")
    .select("*")
    .eq("status", "active")
    .not("source_url", "is", null)
    .or(`next_check_at.is.null,next_check_at.lte.${new Date().toISOString()}`)
    .order("rate_last_checked_at", { ascending: true, nullsFirst: true })
    .limit(Math.max(1, Math.min(limit, 50)));

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const results = [];

  for (const deal of deals || []) {
    const result = await refreshSavingsDealFromUrl(deal.source_url);

    await supabase.from("loop_money_deal_observations").insert({
      deal_id: deal.id,
      provider_name: deal.provider_name,
      product_name: deal.product_name,
      rate_aer: result.rateAer || null,
      max_monthly_pence: deal.max_monthly_pence,
      max_balance_pence: deal.max_balance_pence,
      term_months: deal.term_months,
      source_url: deal.source_url,
      source_provider: "source_url",
      observed_payload: result,
      confidence: result.confidence,
    });

    if (result.status === "ok" && result.rateAer) {
      await supabase
        .from("loop_money_savings_deals")
        .update({
          rate_aer: result.rateAer,
          source_confidence: result.confidence,
          rate_last_checked_at: new Date().toISOString(),
          next_check_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
          status: result.confidence >= 70 ? "active" : "needs_review",
        })
        .eq("id", deal.id);
    } else {
      await supabase
        .from("loop_money_savings_deals")
        .update({
          source_confidence: result.confidence,
          rate_last_checked_at: new Date().toISOString(),
          next_check_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
          status: result.status === "blocked" ? "needs_review" : deal.status,
        })
        .eq("id", deal.id);
    }

    results.push({ deal_id: deal.id, result });

    if (delayMs > 0) await sleep(delayMs);
  }

  return NextResponse.json({
    ok: true,
    checked: results.length,
    results,
  });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkDealNewsWithAi } from "@/lib/admin/dealNews";

export async function GET() {
  const supabase = await createClient();

  const { data: deals, error } = await supabase
    .from("loop_money_savings_deals")
    .select("*")
    .in("availability_status", ["unknown", "blocked", "suspected_withdrawn", "needs_review"])
    .in("status", ["needs_review", "active"])
    .order("rate_last_checked_at", { ascending: true, nullsFirst: true })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const results = [];

  for (const deal of deals || []) {
    const { data: review } = await supabase
      .from("loop_money_deal_news_reviews")
      .insert({
        deal_id: deal.id,
        provider_name: deal.provider_name,
        product_name: deal.product_name,
        source_url: deal.source_url,
        reason: `Deal is ${deal.availability_status}; source check status ${deal.last_check_status || "unknown"}.`,
        status: "checking",
        search_query: `${deal.provider_name} ${deal.product_name} savings account withdrawn available rate`,
      })
      .select("*")
      .single();

    const result = await checkDealNewsWithAi({
      providerName: deal.provider_name,
      productName: deal.product_name,
      sourceUrl: deal.source_url,
      reason: review?.reason || "Unknown deal availability",
    });

    const nextStatus =
      result.status === "confirmed_removed" ? "confirmed_removed"
      : result.status === "confirmed_available" ? "confirmed_available"
      : result.status === "failed" ? "failed"
      : "needs_admin_review";

    const alertId = await supabase.rpc("loop_admin_raise_alert", {
      p_area: "deals",
      p_severity: "medium",
      p_alert_key: "deal_news_review",
      p_title: "Deal needs AI/news/admin review",
      p_summary: `${deal.provider_name} ${deal.product_name}`,
      p_detail: result.summary,
      p_entity_kind: "money_deal",
      p_entity_id: deal.id,
      p_action_url: "/admin/money-deals/daily-watch",
      p_payload: { deal, result },
      p_check_cadence_minutes: 720,
    });

    await supabase.from("loop_money_deal_news_reviews").update({
      status: nextStatus,
      ai_summary: result.summary,
      evidence_urls: result.evidenceUrls,
      confidence: result.confidence,
      linked_alert_id: alertId.data || null,
      checked_at: new Date().toISOString(),
    }).eq("id", review?.id);

    if (result.status === "confirmed_removed" && result.confidence >= 75) {
      await supabase.rpc("loop_money_apply_deal_check_result", {
        p_deal_id: deal.id,
        p_check_status: "withdrawn",
        p_rate_aer: null,
        p_detail: result.summary,
        p_payload: { source: "ai_news_review", evidenceUrls: result.evidenceUrls, confidence: result.confidence },
      });
    }

    results.push({ deal_id: deal.id, result });
  }

  return NextResponse.json({ ok: true, checked: results.length, results });
}

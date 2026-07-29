import { NextRequest, NextResponse } from "next/server";
import { createWorkerDatabaseClient } from "@/platform/database/worker-client";
import { refreshProductPriceAndImage } from "@/lib/nutrition/imports/priceRefresh";

function authorised(request: NextRequest) {
  const expected = process.env.LOOP_CRON_SECRET || process.env.CRON_SECRET;
  if (!expected) return false;
  const header = request.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  return token === expected;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Unauthorised cron request." }, { status: 401 });
  }

  const supabase = createWorkerDatabaseClient("health");
  const limit = Math.min(50, Math.max(1, Number(request.nextUrl.searchParams.get("limit") || 20)));
  const delayMs = Math.min(5000, Math.max(0, Number(request.nextUrl.searchParams.get("delay_ms") || 750)));

  const { data: run, error: runError } = await supabase
    .from("loop_product_price_refresh_runs")
    .insert({
      run_kind: "cron",
      status: "running",
      notes: "Product price/image refresh. Uses polite source fetch; does not bypass anti-bot controls.",
    })
    .select("id")
    .single();

  if (runError) return NextResponse.json({ error: runError.message }, { status: 400 });

  const { data: cards, error } = await supabase
    .from("loop_nutrition_cards")
    .select("id, display_name, source_url, source_host, main_image_url, last_price_checked_at")
    .eq("visibility", "shared_database")
    .not("source_url", "is", null)
    .or("last_price_checked_at.is.null,last_price_checked_at.lt." + new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString())
    .order("last_price_checked_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) {
    await supabase.from("loop_product_price_refresh_runs").update({ status: "failed", finished_at: new Date().toISOString(), notes: error.message }).eq("id", run.id);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  let updated = 0;
  let failed = 0;
  const results: any[] = [];

  for (const card of cards || []) {
    if (!card.source_url) continue;

    const result = await refreshProductPriceAndImage(card.source_url);
    results.push({ card_id: card.id, display_name: card.display_name, ...result });

    if (result.ok) {
      const patch: Record<string, any> = {
        last_price_checked_at: new Date().toISOString(),
        last_price_status: "ok",
        last_price_error: null,
      };

      if (!card.main_image_url && result.main_image_url) patch.main_image_url = result.main_image_url;
      if (result.price_amount != null) patch.price_refresh_status = "updated";

      await supabase.from("loop_nutrition_cards").update(patch).eq("id", card.id);

      await supabase.from("loop_nutrition_source_snapshots").insert({
        card_id: card.id,
        source_url: card.source_url,
        source_host: card.source_host,
        retailer_name: result.retailer_name,
        formal_name: result.formal_name,
        main_image_url: result.main_image_url,
        price_amount: result.price_amount,
        price_currency: result.price_currency || "GBP",
        price_text: result.price_text,
        raw_payload: result,
        status: result.price_amount != null || result.main_image_url ? "applied" : "needs_review",
        confidence: result.price_amount != null ? 80 : 45,
        applied_at: new Date().toISOString(),
      });

      if (result.price_amount != null) {
        await supabase.from("loop_nutrition_price_observations").insert({
          card_id: card.id,
          retailer_name: result.retailer_name || card.source_host,
          source_url: card.source_url,
          price_amount: result.price_amount,
          price_currency: result.price_currency || "GBP",
          price_text: result.price_text || String(result.price_amount),
        });
        updated += 1;
      }
    } else {
      failed += 1;
      await supabase.from("loop_nutrition_cards").update({
        last_price_checked_at: new Date().toISOString(),
        last_price_status: "failed",
        last_price_error: result.error || "Refresh failed.",
        price_refresh_status: "failed",
      }).eq("id", card.id);
    }

    if (delayMs) await sleep(delayMs);
  }

  await supabase.from("loop_product_price_refresh_runs").update({
    status: "completed",
    scanned_count: cards?.length || 0,
    updated_count: updated,
    failed_count: failed,
    finished_at: new Date().toISOString(),
    notes: `Processed ${cards?.length || 0} products.`,
  }).eq("id", run.id);

  return NextResponse.json({
    ok: true,
    run_id: run.id,
    scanned: cards?.length || 0,
    updated,
    failed,
    results,
  });
}

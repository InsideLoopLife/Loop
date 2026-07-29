import { NextRequest, NextResponse } from "next/server";
import { createWorkerDatabaseClient } from "@/platform/database/worker-client";
import { verifyCronRequest } from "@/lib/security/cron";
import { searchInvestments } from "@/lib/investments/market-data";
import { quotePriceToGbp } from "@/lib/investments/fx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bestConfidence(item: any, query: string) {
  const explicit = Number(item?.confidence || 0);
  if (explicit > 0) return explicit;
  const q = query.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const haystack = `${item?.rawSymbol || ""} ${item?.assetName || ""} ${item?.isin || ""}`.toLowerCase();
  if (!q) return 0;
  if (haystack.includes(q)) return 88;
  const tokens = q.split(/\s+/).filter((t) => t.length > 2);
  if (!tokens.length) return 0;
  const hits = tokens.filter((t) => haystack.includes(t)).length;
  return Math.round((hits / tokens.length) * 80);
}

export async function processInvestmentCoverageRequests(limit = 5) {
  const supabase = createWorkerDatabaseClient("market");
  limit = Math.max(1, Math.min(25, Number(limit || 5)));
  const now = new Date().toISOString();

  const { data: rows, error } = await supabase
    .from("loop_investment_ai_market_requests")
    .select("id,created_by,request_query,exchange_hint,status,progress")
    .in("status", ["planned", "queued", "in_progress"])
    .not("request_query", "is", null)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) return { ok: false, error: error.message, processed: [], checked: 0 };

  const processed: any[] = [];
  for (const row of rows || []) {
    await supabase.from("loop_investment_ai_market_requests").update({
      status: "in_progress",
      progress: { ...(row.progress || {}), current_step: "Searching instrument and quote sources", ticker_found: false },
      updated_at: now,
    }).eq("id", row.id);

    let matches: any[] = [];
    try {
      matches = await searchInvestments(supabase, row.created_by, row.request_query, row.exchange_hint);
    } catch (caught) {
      await supabase.from("loop_investment_ai_market_requests").update({
        status: "failed",
        progress: { ...(row.progress || {}), current_step: caught instanceof Error ? caught.message : "Search failed" },
        updated_at: new Date().toISOString(),
      }).eq("id", row.id);
      processed.push({ id: row.id, ok: false, reason: "search_failed" });
      continue;
    }

    const ranked = matches.map((m) => ({ ...m, confidence: bestConfidence(m, row.request_query) })).sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0));
    const match = ranked.find((m) => Number(m.confidence || 0) >= 50);
    if (!match) {
      await supabase.from("loop_investment_ai_market_requests").update({
        status: "needs_review",
        match_confidence: ranked[0]?.confidence || 0,
        progress: { ...(row.progress || {}), current_step: "No 50%+ match found; needs admin review", ticker_found: false },
        updated_at: new Date().toISOString(),
      }).eq("id", row.id);
      await supabase.from("investment_instrument_coverage_placeholders").update({ status: "needs_review", eta_text: "Needs admin review", updated_at: new Date().toISOString() }).eq("request_id", row.id);
      processed.push({ id: row.id, ok: false, reason: "no_confident_match" });
      continue;
    }

    const exchangeCode = String(match.exchange || row.exchange_hint || "").toUpperCase();
    const ticker = String(match.rawSymbol || row.request_query).toUpperCase().replace(/\.UK$/i, ".L");
    const unit = String(match.priceQuoteUnit || "gbp").toLowerCase();
    const nativeCurrency = unit === "gbx" ? "GBX" : String(match.currency || (exchangeCode === "NASDAQ" || exchangeCode === "NYSE" ? "USD" : "GBP")).toUpperCase();
    const converted = await quotePriceToGbp(Number(match.price || 0), nativeCurrency).catch(() => ({ gbpPrice: 0, fxSource: "unavailable" }));
    const { data: instrument } = await supabase.from("investment_instruments").upsert({
      ticker,
      exchange_code: exchangeCode,
      exchange_name: exchangeCode,
      isin: match.isin || null,
      asset_name: match.assetName || ticker,
      asset_kind: match.assetType || "share",
      currency_code: nativeCurrency === "GBX" ? "GBP" : nativeCurrency,
      quote_unit: unit,
      logo_domain: match.logoDomain || null,
      source_url: match.sourceUrl || null,
      coverage_status: "active",
      confidence: match.confidence,
      requested_by: row.created_by,
      updated_at: new Date().toISOString(),
    }, { onConflict: "ticker,exchange_code" }).select("id").maybeSingle();

    if (Number(converted.gbpPrice || 0) > 0) {
      await supabase.from("investment_instrument_price_points").insert({
        instrument_id: instrument?.id || null,
        ticker,
        exchange_code: exchangeCode,
        price_gbp: Number(converted.gbpPrice),
        native_price: Number(match.price || 0),
        native_currency: nativeCurrency,
        quote_unit: unit,
        point_date: new Date().toISOString().slice(0, 10),
        point_at: new Date().toISOString(),
        bucket_interval: "raw",
        source: `coverage request; ${match.source || "quote search"}`,
        source_url: match.sourceUrl || null,
        source_confidence: match.confidence || 60,
      });
    }

    const progress = {
      ticker_found: true,
      investment_information_added: true,
      document_fee_information_added: Boolean(match.annualAssetFeePercent !== null && match.annualAssetFeePercent !== undefined),
      starter_history_added: Number(converted.gbpPrice || 0) > 0,
      current_step: Number(converted.gbpPrice || 0) > 0 ? "Instrument active with starter price point" : "Instrument active; history still needs provider data",
      minimum_history: "1 month target",
    };
    await supabase.from("loop_investment_ai_market_requests").update({
      status: "active",
      inferred_market_code: exchangeCode,
      match_confidence: match.confidence || 80,
      progress,
      updated_at: new Date().toISOString(),
    }).eq("id", row.id);
    await supabase.from("investment_instrument_coverage_placeholders").update({
      status: "active",
      instrument_id: instrument?.id || null,
      resolved_ticker: ticker,
      resolved_exchange: exchangeCode,
      resolved_asset_name: match.assetName || ticker,
      progress,
      eta_text: "Ready to add",
      updated_at: new Date().toISOString(),
    }).eq("request_id", row.id);
    processed.push({ id: row.id, ok: true, ticker, exchange: exchangeCode, confidence: match.confidence });
  }
  return { ok: true, processed, checked: rows?.length || 0 };
}

export async function GET(request: NextRequest) {
  const guard = verifyCronRequest(request);
  if (!guard.ok) return guard.response;
  const limit = Math.max(1, Math.min(25, Number(request.nextUrl.searchParams.get("limit") || 5)));
  const result = await processInvestmentCoverageRequests(limit);
  return NextResponse.json({ ...result, guard: guard.mode });
}


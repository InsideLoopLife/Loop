import crypto from "crypto";
import { fetchSourceText, parseMortgageDealsFromSource } from "@/lib/wealth/source-ingestion";
import { normaliseProviderSlug } from "@/lib/wealth/provider-normalise";

export type MortgageCatalogueRefreshOptions = {
  runKey?: string;
  limit?: number;
  sourceId?: string | null;
  triggeredBy?: string | null;
  publishConfidenceThreshold?: number;
};

function cleanText(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function numberOrNull(value: unknown) {
  const parsed = Number(String(value || "").replace(/[,£%]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function productKey(parts: Array<string | number | null | undefined>) {
  return crypto.createHash("sha256").update(parts.map((part) => String(part ?? "").toLowerCase().trim()).join("|")).digest("hex");
}

function rateMatches(text: string) {
  const out: Array<{ rate: number; index: number }> = [];
  for (const match of text.matchAll(/(\d{1,2}(?:\.\d{1,3})?)\s*%/g)) {
    const rate = Number(match[1]);
    if (Number.isFinite(rate) && rate > 0.1 && rate < 20) out.push({ rate, index: match.index || 0 });
  }
  const seen = new Set<string>();
  return out.filter((row) => {
    const context = text.slice(Math.max(0, row.index - 260), Math.min(text.length, row.index + 520));
    // Ignore promotional percentages, APR examples and unrelated page furniture.
    if (!/mortgage|remortgage|ltv|fixed|tracker|product fee|initial rate/i.test(context)) return false;
    const key = row.rate.toFixed(3);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
}

function ltvFromContext(context: string) {
  const direct = Array.from(context.matchAll(/(\d{2,3})\s*%\s*LTV/gi)).map((m) => Number(m[1])).filter((n) => n > 0 && n <= 100);
  if (direct.length) return Math.max(...direct);
  const upto = context.match(/(?:up to|max(?:imum)?|at)\s+(\d{2,3})\s*%\s*(?:loan[- ]to[- ]value|ltv)/i);
  const parsed = upto ? Number(upto[1]) : null;
  return parsed && parsed > 0 && parsed <= 100 ? parsed : null;
}

function termFromContext(context: string) {
  const years = context.match(/\b(2|3|5|7|10)\s*(?:year|yr)[-\s]*(?:fixed|fix|initial rate|tracker)\b/i);
  if (years) return Number(years[1]) * 12;
  const months = context.match(/\b(24|36|60|84|120)\s*month/i);
  return months ? Number(months[1]) : null;
}

function feeFromContext(context: string) {
  const explicit = context.match(/(?:fee|product fee|arrangement fee)[^£]{0,40}£\s?([0-9][0-9,]*(?:\.\d{1,2})?)/i);
  if (explicit) return Number(explicit[1].replace(/,/g, ""));
  const money = context.match(/£\s?([0-9][0-9,]*(?:\.\d{1,2})?)\s*(?:fee|product fee|arrangement fee)/i);
  return money ? Number(money[1].replace(/,/g, "")) : null;
}

function rateTypeFromContext(context: string) {
  const lower = context.toLowerCase();
  if (lower.includes("tracker")) return "tracker";
  if (lower.includes("variable") || lower.includes("svr")) return "variable";
  return "fixed";
}

function existingCustomerOnly(context: string) {
  return /existing customer|product transfer|switching rate|current borrower|existing mortgage customer/i.test(context);
}

function titleFor(lenderName: string, rateType: string, initialTermMonths: number | null, ltvMax: number | null, ratePercent: number) {
  const term = initialTermMonths ? `${Math.round(initialTermMonths / 12)} year` : "Sourced";
  const ltv = ltvMax ? ` · ${ltvMax}% LTV` : "";
  return `${lenderName} ${term} ${rateType}${ltv} · ${ratePercent.toFixed(2)}%`;
}

export function parseMortgageCatalogueDeals(args: { lenderName: string; sourceUrl: string; text: string }) {
  const text = cleanText(args.text);
  const lenderName = cleanText(args.lenderName) || "Unknown lender";
  const lenderSlug = normaliseProviderSlug(lenderName);
  const rates = rateMatches(text);

  if (!rates.length) return parseMortgageDealsFromSource(args).map((deal) => ({ ...deal, externalProductKey: productKey([deal.lenderSlug, deal.productName, deal.rateType, deal.initialTermMonths, deal.ltvMax, deal.ratePercent, args.sourceUrl]) }));

  return rates.map(({ rate, index }) => {
    const context = text.slice(Math.max(0, index - 600), Math.min(text.length, index + 900));
    const rateType = rateTypeFromContext(context);
    const initialTermMonths = termFromContext(context);
    const ltvMax = ltvFromContext(context);
    const productFee = feeFromContext(context);
    const existingOnly = existingCustomerOnly(context);
    const hasProductRateLabel = /initial rate|mortgage rate|fixed rate|tracker rate/i.test(context);
    const hasMortgagePurpose = /remortgage|moving home|purchase|first[- ]time buyer|mortgage/i.test(context);
    const plausibleRate = rate >= 1 && rate <= 15;
    const confidence = 50 + (initialTermMonths ? 15 : 0) + (ltvMax ? 15 : 0) + (productFee !== null ? 5 : 0) + (hasProductRateLabel ? 10 : 0) + (hasMortgagePurpose ? 5 : 0);
    const productName = titleFor(lenderName, rateType, initialTermMonths, ltvMax, rate);
    return {
      lenderSlug,
      lenderName,
      productName,
      rateType,
      initialTermMonths,
      ltvMax,
      ltvMin: null,
      ratePercent: rate,
      productFee,
      existingCustomerOnly: existingOnly,
      newCustomerAvailable: !existingOnly || /new customer|remortgage|purchase|moving home/i.test(context),
      sourceUrl: args.sourceUrl,
      confidence: plausibleRate ? Math.min(100, confidence) : Math.min(55, confidence),
      summary: `Detected possible mortgage deal at ${rate.toFixed(2)}%${initialTermMonths ? ` for ${initialTermMonths} months` : ""}${ltvMax ? ` up to ${ltvMax}% LTV` : ""}. Admin review required before users see it.`,
      externalProductKey: productKey([lenderSlug, productName, rateType, initialTermMonths, ltvMax, rate, args.sourceUrl]),
    };
  });
}

export async function refreshMortgageCatalogueFromSources(supabase: any, options: MortgageCatalogueRefreshOptions = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit || 10), 50));
  const now = new Date().toISOString();
  const runKey = options.runKey || `mortgage-catalogue-refresh:${new Date().toISOString().slice(0, 10)}:${Date.now()}`;
  const publishThreshold = Number(options.publishConfidenceThreshold || 95);

  const { data: run } = await supabase
    .from("wealth_watch_source_jobs")
    .insert({
      job_kind: "mortgage_catalogue_refresh",
      status: "running",
      created_by: null,
      result_payload: { runKey, limit, sourceId: options.sourceId || null, triggeredBy: options.triggeredBy || null },
    })
    .select("id")
    .single();

  let sources: any[] = [];
  let sourceQuery = supabase
    .from("mortgage_lender_sources")
    .select("id,lender_slug,lender_name,source_url,source_kind,status,last_checked_at,check_frequency_hours")
    // Failed sources must remain retryable; otherwise one transient block permanently
    // removes a lender from all future catalogue runs.
    .in("status", ["active", "needs_review", "failed", "blocked"])
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (options.sourceId) sourceQuery = sourceQuery.eq("id", options.sourceId);
  const { data: sourceRows, error: sourceError } = await sourceQuery;
  if (sourceError) throw new Error(sourceError.message);
  sources = sourceRows || [];

  let checked = 0;
  let inserted = 0;
  let updated = 0;
  let failed = 0;
  let removed = 0;
  const detail: any[] = [];

  for (const source of sources) {
    checked += 1;
    const sourceStartedAt = new Date().toISOString();
    const existingForSource = await supabase
      .from("mortgage_rate_deals")
      .select("id,external_product_key,status,missing_observation_count")
      .eq("source_url", source.source_url)
      .in("catalogue_status", ["active", "needs_review", "broken"]);
    const existingKeys = new Map<string, any>((existingForSource.data || []).map((row: any) => [row.external_product_key, row]));
    const seenKeys = new Set<string>();

    try {
      const fetched = await fetchSourceText(source.source_url);
      const parsedDeals = parseMortgageCatalogueDeals({ lenderName: source.lender_name, sourceUrl: fetched.url, text: fetched.text });
      for (const parsed of parsedDeals) {
        const externalProductKey = (parsed as any).externalProductKey || productKey([parsed.lenderSlug, parsed.productName, parsed.rateType, parsed.initialTermMonths, parsed.ltvMax, parsed.ratePercent, fetched.url]);
        seenKeys.add(externalProductKey);
        const safeStatus = parsed.confidence >= publishThreshold ? "active" : "needs_review";
        const existing = existingKeys.get(externalProductKey);
        const row = {
          lender_slug: parsed.lenderSlug,
          lender_name: parsed.lenderName,
          product_name: parsed.productName,
          rate_type: parsed.rateType,
          initial_term_months: parsed.initialTermMonths,
          ltv_max: parsed.ltvMax,
          ltv_min: parsed.ltvMin,
          rate_percent: parsed.ratePercent,
          product_fee: parsed.productFee,
          existing_customer_only: parsed.existingCustomerOnly,
          new_customer_available: parsed.newCustomerAvailable,
          source_url: fetched.url,
          source_name: new URL(fetched.url).hostname,
          source_checked_at: now,
          confidence: parsed.confidence,
          status: existing?.status === "active" ? "active" : safeStatus,
          catalogue_status: existing?.status === "active" ? "active" : safeStatus,
          ingestion_method: "ai_source_catalogue",
          source_id: source.id,
          external_product_key: externalProductKey,
          admin_review_reason: parsed.confidence >= publishThreshold ? null : "AI/source extraction needs admin review before users see it.",
          removed_detected_at: null,
          missing_observation_count: 0,
          updated_at: now,
          payload: {
            summary: parsed.summary,
            source_kind: source.source_kind,
            source_started_at: sourceStartedAt,
            source_checked_at: now,
            auto_publish_threshold: publishThreshold,
          },
        };
        const { data, error } = await supabase
          .from("mortgage_rate_deals")
          .upsert(row, { onConflict: "external_product_key" })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        if (existing) updated += 1;
        else inserted += 1;
        detail.push({ source_id: source.id, deal_id: data?.id, product: parsed.productName, status: row.status, confidence: parsed.confidence });
      }

      const missing = Array.from(existingKeys.entries()).filter(([key, row]) => key && !seenKeys.has(key) && row.status !== "expired");
      if (missing.length) {
        for (const [, row] of missing) {
          const missingCount = Number(row.missing_observation_count || 0) + 1;
          const withdraw = missingCount >= 3;
          const { data } = await supabase
            .from("mortgage_rate_deals")
            .update({
              missing_observation_count: missingCount,
              status: withdraw ? "expired" : row.status,
              catalogue_status: withdraw ? "removed" : "needs_review",
              removed_detected_at: withdraw ? now : null,
              admin_review_reason: withdraw ? "Removed after three consecutive missing observations." : `Missing from source observation ${missingCount}/3; held for review.`,
              updated_at: now,
            })
            .eq("id", row.id)
            .select("id");
          if (withdraw) removed += data?.length || 0;
        }
      }

      await supabase.from("mortgage_lender_sources").update({ last_checked_at: now, last_success_at: now, last_error: null, status: parsedDeals.length ? "active" : "needs_review", updated_at: now }).eq("id", source.id);
    } catch (error: any) {
      failed += 1;
      detail.push({ source_id: source.id, source_url: source.source_url, error: error?.message || "Source refresh failed" });
      await supabase.from("mortgage_lender_sources").update({ last_checked_at: now, last_error: error?.message || "Source refresh failed", status: "needs_review", updated_at: now }).eq("id", source.id);
    }
  }

  const result = { ok: failed === 0, checked, inserted, updated, removed, failed, detail: detail.slice(0, 100) };
  if (run?.id) {
    await supabase.from("wealth_watch_source_jobs").update({ status: failed ? "failed" : "completed", updated_at: new Date().toISOString(), result_payload: result, error: failed ? `${failed} source(s) failed` : null }).eq("id", run.id);
  }
  return result;
}

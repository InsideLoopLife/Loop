import { createHash } from "node:crypto";
import { normaliseProviderSlug } from "@/lib/wealth/provider-normalise";
import { fetchSourceText, parseSavingsDealsFromSource } from "@/lib/wealth/source-ingestion";

export type SavingsCatalogueRefreshOptions = {
  runKey?: string;
  limit?: number;
  sourceId?: string | null;
  triggeredBy?: string | null;
  publishConfidenceThreshold?: number;
  force?: boolean;
  freshnessHours?: number;
};

export async function refreshSavingsCatalogueFromSources(supabase: any, options: SavingsCatalogueRefreshOptions = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit || 20), 80));
  const now = new Date().toISOString();
  const threshold = new Date(Date.now() - Math.max(1, Number(options.freshnessHours || 12)) * 60 * 60 * 1000).toISOString();
  const publishThreshold = Number(options.publishConfidenceThreshold || 92);

  const { data: run } = await supabase.from("wealth_watch_source_jobs").insert({
    job_kind: "savings_catalogue_refresh",
    source_url: null,
    status: "running",
    created_by: null,
    result_payload: { limit, sourceId: options.sourceId || null, triggeredBy: options.triggeredBy || null, freshnessHours: options.freshnessHours || 12 },
  }).select("id").single();

  let query = supabase
    .from("savings_rate_sources")
    .select("id,provider_slug,provider_name,source_url,source_kind,product_hint,status,last_checked_at,check_frequency_hours")
    .in("status", ["active", "needs_review"])
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (options.sourceId) query = query.eq("id", options.sourceId);
  if (!options.force && !options.sourceId) query = query.or(`last_checked_at.is.null,last_checked_at.lt.${threshold}`);

  const { data: sources, error: sourceError } = await query;
  if (sourceError) throw new Error(sourceError.message);

  let checked = 0;
  let inserted = 0;
  let updated = 0;
  let failed = 0;
  const detail: any[] = [];

  for (const source of sources || []) {
    checked += 1;
    try {
      const fetched = await fetchSourceText(source.source_url);
      const parsedDeals = parseSavingsDealsFromSource({
        providerName: source.provider_name,
        productName: source.product_hint || undefined,
        sourceUrl: fetched.url,
        text: fetched.text,
      });

      let sourceWrites = 0;
      const seenDealIds = new Set<string>();
      for (const parsed of parsedDeals) {
        const row = {
          provider_slug: parsed.providerSlug || normaliseProviderSlug(parsed.providerName || source.provider_name),
          provider_name: parsed.providerName || source.provider_name,
          product_name: parsed.productName || source.product_hint || `${source.provider_name} savings product`,
          account_type: parsed.accountType || "easy_access",
          gross_aer: parsed.grossAer,
          bonus_rate: parsed.bonusRate ?? null,
          minimum_balance: parsed.minimumBalance ?? null,
          maximum_balance: parsed.maximumBalance ?? null,
          monthly_max_deposit: parsed.monthlyMaxDeposit ?? null,
          access_type: parsed.accessType ?? null,
          withdrawal_rules: parsed.withdrawalRules ?? null,
          notice_period_days: parsed.noticePeriodDays ?? null,
          term_length_months: parsed.termLengthMonths ?? null,
          rate_type: parsed.rateType ?? null,
          requires_existing_customer: parsed.requiresExistingCustomer,
          eligible_provider_slug: parsed.requiresExistingCustomer ? (parsed.providerSlug || source.provider_slug) : null,
          eligibility_note: parsed.eligibilityNote,
          source_url: fetched.url,
          source_name: new URL(fetched.url).hostname,
          detected_by: parsedDeals.length > 1 ? "rate_table_source_catalogue" : "ai_source_catalogue",
          confidence: parsed.confidence,
          status: parsed.confidence >= publishThreshold ? "active" : "needs_review",
          ai_summary: parsed.summary,
          admin_notes: parsed.confidence >= publishThreshold ? "Auto-published from seeded source because extraction confidence met threshold." : "AI/source extraction needs admin review before users see it.",
          source_payload: { parsed, parsedDealCount: parsedDeals.length, sourceId: source.id, sourceKind: source.source_kind, productHint: source.product_hint || null },
          canonical_source: String(source.id),
          source_product_id: `${parsed.providerSlug || source.provider_slug || normaliseProviderSlug(source.provider_name)}:${String(parsed.productName || source.product_hint || "savings-product").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
          provider_product_code: null,
          last_seen_at: now,
          last_verified_at: now,
          verification_status: parsed.confidence >= publishThreshold ? "AUTO_VERIFIED" : "REVIEW_REQUIRED",
          lifecycle_status: parsed.confidence >= publishThreshold ? "ACTIVE" : "DATA_REVIEW",
          missing_observation_count: 0,
          raw_payload_hash: createHash("sha256").update(JSON.stringify({ parsed, sourceUrl: fetched.url })).digest("hex"),
          last_checked_at: now,
          updated_at: now,
        } as Record<string, any>;
        const existing = await supabase
          .from("savings_rate_deals")
          .select("id,status")
          .eq("provider_slug", row.provider_slug)
          .eq("product_name", row.product_name)
          .eq("source_url", row.source_url)
          .maybeSingle();
        if (existing.error) throw new Error(existing.error.message);
        const write = existing.data?.id
          ? await supabase.from("savings_rate_deals").update(row).eq("id", existing.data.id).select("id").single()
          : await supabase.from("savings_rate_deals").insert(row).select("id").single();
        if (write.error) throw new Error(write.error.message);
        if (write.data?.id) {
          seenDealIds.add(String(write.data.id));
          await supabase.from("savings_rate_deal_versions").insert({
            savings_rate_deal_id: write.data.id,
            lifecycle_status: row.lifecycle_status,
            verification_status: row.verification_status,
            gross_aer: row.gross_aer,
            product_payload: row.source_payload,
            source_url: row.source_url,
            source_published_at: row.source_published_at || null,
            effective_from: now,
            raw_payload_hash: row.raw_payload_hash,
          });
        }
        if (existing.data?.id) updated += 1;
        else inserted += 1;
        sourceWrites += 1;
        detail.push({ source_id: source.id, deal_id: write.data?.id, provider: row.provider_name, confidence: parsed.confidence, status: row.status, lifecycle_status: row.lifecycle_status, product: row.product_name, rate: row.gross_aer });
      }

      // One missing observation only moves a product into review. Three consecutive misses
      // are required before it is treated as withdrawn, preserving what users previously saw.
      const sourceUrls = Array.from(new Set([source.source_url, fetched.url].filter(Boolean)));
      const { data: sourceDealRows, error: sourceDealError } = await supabase
        .from("savings_rate_deals")
        .select("id,status,lifecycle_status,missing_observation_count,gross_aer,source_payload,source_url,verification_status")
        .in("source_url", sourceUrls);
      if (sourceDealError) throw new Error(sourceDealError.message);
      for (const existingDeal of sourceDealRows || []) {
        if (seenDealIds.has(String(existingDeal.id))) continue;
        const missingCount = Number(existingDeal.missing_observation_count || 0) + 1;
        const withdrawn = missingCount >= 3;
        const lifecycleStatus = withdrawn ? "WITHDRAWN" : "PENDING_WITHDRAWAL";
        const missingWrite = await supabase.from("savings_rate_deals").update({
          missing_observation_count: missingCount,
          lifecycle_status: lifecycleStatus,
          status: withdrawn ? "expired" : existingDeal.status,
          effective_to: withdrawn ? now : null,
          updated_at: now,
        }).eq("id", existingDeal.id);
        if (missingWrite.error) throw new Error(missingWrite.error.message);
        await supabase.from("savings_rate_deal_versions").insert({
          savings_rate_deal_id: existingDeal.id,
          lifecycle_status: lifecycleStatus,
          verification_status: existingDeal.verification_status || "UNVERIFIED",
          gross_aer: existingDeal.gross_aer,
          product_payload: { ...(existingDeal.source_payload || {}), missingObservationCount: missingCount },
          source_url: existingDeal.source_url,
          effective_from: now,
          effective_to: withdrawn ? now : null,
        });
        detail.push({ source_id: source.id, deal_id: existingDeal.id, lifecycle_status: lifecycleStatus, missing_observation_count: missingCount });
      }
      const sourceUpdate = await supabase.from("savings_rate_sources").update({ last_checked_at: now, last_success_at: now, last_error: null, updated_at: now, last_result_payload: { parsed_deals: parsedDeals.length, writes: sourceWrites } }).eq("id", source.id);
      if (sourceUpdate.error && /last_result_payload/i.test(sourceUpdate.error.message || "")) {
        const retry = await supabase.from("savings_rate_sources").update({ last_checked_at: now, last_success_at: now, last_error: null, updated_at: now }).eq("id", source.id);
        if (retry.error) throw new Error(retry.error.message);
      } else if (sourceUpdate.error) {
        throw new Error(sourceUpdate.error.message);
      }
    } catch (error: any) {
      failed += 1;
      detail.push({ source_id: source.id, provider: source.provider_name, source_url: source.source_url, error: error?.message || "Source refresh failed" });
      const failUpdate = await supabase.from("savings_rate_sources").update({ last_checked_at: now, last_error: error?.message || "Source refresh failed", updated_at: now }).eq("id", source.id);
      if (failUpdate.error) detail.push({ source_id: source.id, provider: source.provider_name, update_error: failUpdate.error.message });
    }
  }

  const result = { ok: failed === 0, checked, inserted, updated, failed, skipped_fresh: Math.max(0, limit - checked), detail: detail.slice(0, 100) };
  if (run?.id) await supabase.from("wealth_watch_source_jobs").update({ status: failed ? "failed" : "completed", updated_at: new Date().toISOString(), result_payload: result, error: failed ? `${failed} source(s) failed` : null }).eq("id", run.id);
  return result;
}

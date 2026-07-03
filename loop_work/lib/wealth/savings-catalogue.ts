import { normaliseProviderSlug } from "@/lib/wealth/provider-normalise";
import { fetchSourceText, parseSavingsDealFromSource } from "@/lib/wealth/source-ingestion";

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
      const parsed = parseSavingsDealFromSource({
        providerName: source.provider_name,
        productName: source.product_hint || undefined,
        sourceUrl: fetched.url,
        text: fetched.text,
      });
      const row = {
        provider_slug: parsed.providerSlug || normaliseProviderSlug(source.provider_name),
        provider_name: parsed.providerName || source.provider_name,
        product_name: parsed.productName || source.product_hint || `${source.provider_name} savings product`,
        account_type: parsed.accountType || "easy_access",
        gross_aer: parsed.grossAer,
        requires_existing_customer: parsed.requiresExistingCustomer,
        eligible_provider_slug: parsed.requiresExistingCustomer ? (parsed.providerSlug || source.provider_slug) : null,
        eligibility_note: parsed.eligibilityNote,
        source_url: fetched.url,
        source_name: new URL(fetched.url).hostname,
        detected_by: "ai_source_catalogue",
        confidence: parsed.confidence,
        status: parsed.confidence >= publishThreshold ? "active" : "needs_review",
        ai_summary: parsed.summary,
        admin_notes: parsed.confidence >= publishThreshold ? "Auto-published from seeded source because extraction confidence met threshold." : "AI/source extraction needs admin review before users see it.",
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
      if (existing.data?.id) updated += 1;
      else inserted += 1;
      detail.push({ source_id: source.id, deal_id: write.data?.id, provider: source.provider_name, confidence: parsed.confidence, status: row.status, product: row.product_name });
      await supabase.from("savings_rate_sources").update({ last_checked_at: now, last_success_at: now, last_error: null, updated_at: now }).eq("id", source.id);
    } catch (error: any) {
      failed += 1;
      detail.push({ source_id: source.id, provider: source.provider_name, source_url: source.source_url, error: error?.message || "Source refresh failed" });
      await supabase.from("savings_rate_sources").update({ last_checked_at: now, last_error: error?.message || "Source refresh failed", updated_at: now }).eq("id", source.id);
    }
  }

  const result = { ok: failed === 0, checked, inserted, updated, failed, skipped_fresh: Math.max(0, limit - checked), detail: detail.slice(0, 100) };
  if (run?.id) await supabase.from("wealth_watch_source_jobs").update({ status: failed ? "failed" : "completed", updated_at: new Date().toISOString(), result_payload: result, error: failed ? `${failed} source(s) failed` : null }).eq("id", run.id);
  return result;
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SavingsDealLike } from "@/lib/wealth/savings-intelligence";

/**
 * Keep the main project's existing foreign keys valid after the live savings
 * catalogue moved to a separate Supabase project.
 *
 * This is intentionally a small, on-demand parent record. Scrape payloads,
 * catalogue history and routine rate writes stay exclusively in the rates
 * project; the main database only receives deals referenced by personal data.
 */
export async function ensureSavingsDealShadow(
  mainSupabase: SupabaseClient,
  deal: SavingsDealLike,
) {
  const now = new Date().toISOString();
  const { error } = await mainSupabase.from("savings_rate_deals").upsert({
    id: deal.id,
    provider_slug: deal.provider_slug ?? null,
    provider_name: deal.provider_name ?? null,
    product_name: deal.product_name ?? null,
    account_type: deal.account_type ?? "savings",
    gross_aer: deal.gross_aer ?? null,
    bonus_rate: deal.bonus_rate ?? null,
    minimum_balance: deal.minimum_balance ?? null,
    maximum_balance: deal.maximum_balance ?? null,
    monthly_min_deposit: deal.monthly_min_deposit ?? null,
    monthly_max_deposit: deal.monthly_max_deposit ?? null,
    access_type: deal.access_type ?? null,
    withdrawal_rules: deal.withdrawal_rules ?? null,
    notice_period_days: deal.notice_period_days ?? null,
    term_length_months: deal.term_length_months ?? null,
    rate_type: deal.rate_type ?? null,
    requires_existing_customer: Boolean(deal.requires_existing_customer),
    eligible_provider_slug: deal.eligible_provider_slug ?? null,
    eligibility_note: deal.eligibility_note ?? null,
    // Do not duplicate the external URL into the shadow table. The legacy
    // main table has a unique provider/product/source index, so retaining the
    // URL could collide with an older local catalogue row that used another
    // UUID. Recommendations keep their own source URL for the user-facing link.
    source_url: null,
    detected_by: "rates_database_shadow",
    status: "active",
    publishable: false,
    lifecycle_status: "ACTIVE",
    verification_status: "UNVERIFIED",
    source_payload: { sourceProject: "rates", shadowOnly: true },
    evidence: {},
    review_reasons: ["External rates catalogue shadow"],
    last_checked_at: deal.last_checked_at ?? now,
    last_seen_at: now,
    updated_at: now,
  }, { onConflict: "id" });

  if (error) throw new Error(`Unable to link savings deal to personal data: ${error.message}`);
}

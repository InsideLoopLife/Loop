import "server-only";

import { unstable_cache } from "next/cache";
import { createWorkerDatabaseClient } from "@/platform/database/worker-client";

const loadSavingsRateDeals = unstable_cache(
  async () => {
    const { data, error } = await createWorkerDatabaseClient("rates")
      .from("savings_rate_deals")
      .select("id, provider_slug, provider_name, product_name, account_type, gross_aer, bonus_rate, minimum_balance, maximum_balance, monthly_min_deposit, monthly_max_deposit, access_type, withdrawal_rules, notice_period_days, term_length_months, rate_type, requires_existing_customer, eligible_provider_slug, eligibility_note, source_url, status, last_checked_at")
      .eq("status", "active")
      .order("gross_aer", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data || [];
  },
  ["loop", "reference", "savings-rate-deals", "v1"],
  { revalidate: 15 * 60, tags: ["savings-rate-deals"] },
);

// This catalogue is shared reference data, not personal/household data, so it is
// safe to reuse between requests. Authenticated balances stay on the live client.
export async function getCachedSavingsRateDeals() {
  return loadSavingsRateDeals();
}


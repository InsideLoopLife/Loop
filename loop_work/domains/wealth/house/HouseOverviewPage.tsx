import Link from "next/link";
import { Nav } from "@/components/Nav";
import { HouseWorkspaceOverview } from "@/components/mortgage/HouseWorkspaceOverview";
import type {
  Home,
  HomeMortgageDeal,
  HomeValuationSource,
  MarketRateBenchmark,
  MortgageMarketDeal,
  MortgageRenewalRecommendation,
  PropertyMoveQuery,
} from "@/components/mortgage/MortgagePlannerClient";
import { PageLandingExperience } from "@/components/landing/PageLandingExperience";
import { requireWealthPageAccess } from "@/domains/wealth/access";
import { householdMemberDataOrFilter } from "@/lib/auth/household-context";
import { createWorkerDatabaseClient } from "@/platform/database/worker-client";

export type LenderTrackerProduct = {
  id: string;
  lender_name: string;
  product_name: string;
  reference_rate_kind: string;
  margin_percent: number;
  active: boolean;
  effective_from: string | null;
  last_verified_at: string | null;
  source_url: string | null;
  notes: string | null;
};

function TrackerProductsPanel({
  products,
  bankRate,
}: {
  products: LenderTrackerProduct[];
  bankRate: number | null;
}) {
  if (!products.length) return null;

  return (
    <section className="mx-auto w-[95vw] max-w-[1580px] px-4 pb-2 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50 via-white to-violet-50 p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-sky-700">
              Lender tracker formulas
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-950">
              See how lender margins sit above their variable reference rate
            </h2>
            <p className="mt-1 max-w-3xl text-xs font-semibold leading-5 text-slate-500">
              Tracker products are stored as a reference rate plus a lender margin.
              Where a lender uses its own base rate, LOOP keeps that distinction
              instead of treating it as identical to Bank Rate.
            </p>
          </div>
          {bankRate !== null ? (
            <div className="rounded-xl bg-white px-4 py-3 text-right ring-1 ring-slate-200">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                BoE Bank Rate
              </p>
              <p className="text-2xl font-black text-slate-950">
                {bankRate.toFixed(2)}%
              </p>
            </div>
          ) : null}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => {
            const usesOwnBase = product.reference_rate_kind !== "bank_rate";
            const indicative =
              bankRate !== null
                ? bankRate + Number(product.margin_percent || 0)
                : null;

            return (
              <article
                key={product.id}
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-950">
                      {product.lender_name}
                    </p>
                    <p className="mt-0.5 text-xs font-semibold text-slate-500">
                      {product.product_name}
                    </p>
                  </div>
                  <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-black uppercase text-sky-700 ring-1 ring-sky-200">
                    Tracker
                  </span>
                </div>

                <p className="mt-4 text-3xl font-black tracking-tight text-slate-950">
                  +{Number(product.margin_percent || 0).toFixed(2)}%
                </p>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  above{" "}
                  {usesOwnBase
                    ? `${product.lender_name} base rate`
                    : "Bank Rate"}
                </p>

                {indicative !== null ? (
                  <div className="mt-4 rounded-xl bg-slate-50 p-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                      BoE-linked illustration
                    </p>
                    <p className="mt-1 text-lg font-black text-slate-950">
                      {indicative.toFixed(2)}%
                    </p>
                    <p className="mt-1 text-[10px] font-semibold leading-4 text-slate-500">
                      {usesOwnBase
                        ? "Illustrative only: this lender tracks its own base rate, which is influenced by Bank Rate but can differ from it."
                        : "Bank Rate plus the stored lender margin."}
                    </p>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

async function HouseOverviewContent() {
  const { supabase, user, householdContext } = await requireWealthPageAccess({
    feature: "mortgage",
    deniedRedirect: "/account?tab=wealth&feature=mortgage",
  });

  const dataOwnerUserId = householdContext.dataOwnerUserId || user.id;
  const householdVisibleFilter = householdMemberDataOrFilter(householdContext);
  const ratesSupabase = createWorkerDatabaseClient("rates");

  const [
    { data: homes },
    { data: deals },
    { data: valuations },
    { data: moveQueries },
    { data: trackerProducts },
    { data: renewalRecommendations },
    { data: marketDeals },
    { data: boeBenchmarks },
  ] = await Promise.all([
    supabase
      .from("homes")
      .select(
        "id, label, house_number, address_line, postcode, full_address, city, region, country, latitude, longitude, map_url, lookup_source, uprn, property_type, purchase_source_url, last_lookup_at, ownership_status, property_value, estimated_value_low, estimated_value_mid, estimated_value_high, estimated_value_date, purchase_price, purchase_date, target_purchase_price, target_extra_cash, target_interest_rate, target_term_years, notes",
      )
      .or(householdVisibleFilter)
      .order("created_at", { ascending: false })
      .returns<Home[]>(),
    supabase
      .from("home_mortgage_deals")
      .select(
        "id, home_id, lender, product_name, balance, balance_as_of_date, interest_rate, rate_type, repayment_type, initial_period_end, term_years, monthly_payment_override, start_date, end_date, notes",
      )
      .or(householdVisibleFilter)
      .order("created_at", { ascending: false })
      .returns<HomeMortgageDeal[]>(),
    supabase
      .from("home_valuation_sources")
      .select(
        "id, home_id, source_name, source_type, valuation_low, valuation_mid, valuation_high, valuation_amount, confidence, valuation_date, source_url, notes",
      )
      .or(householdVisibleFilter)
      .order("valuation_date", { ascending: false })
      .returns<HomeValuationSource[]>(),
    supabase
      .from("property_move_queries")
      .select(
        "id, home_id, title, property_url, asking_price, postcode, address_hint, bedrooms, council_tax_band, council_tax_estimate_annual, council_tax_confidence, council_tax_authority, council_tax_source_url, epc_rating, epc_energy_cost_estimate_annual, expected_heating_cost_monthly, stamp_duty_estimate, moving_cost_estimate, target_deposit, expected_mortgage_balance, expected_rate, expected_term_years, expected_payment, affordability_score, status, source_status, source_confidence, image_url, property_use, map_latitude, map_longitude, map_embed_url, service_charge_monthly, maintenance_allowance_monthly, running_cost_breakdown, archived_at, delete_after, notes, payload, created_at, updated_at",
      )
      .eq("user_id", dataOwnerUserId)
      .in("status", ["watching", "saved"])
      .order("created_at", { ascending: false })
      .limit(10)
      .returns<PropertyMoveQuery[]>(),
    supabase
      .from("lender_tracker_products")
      .select(
        "id, lender_name, product_name, reference_rate_kind, margin_percent, active, effective_from, last_verified_at, source_url, notes",
      )
      .eq("active", true)
      .order("lender_name")
      .returns<LenderTrackerProduct[]>(),
    ratesSupabase
      .from("mortgage_renewal_recommendations")
      .select(
        "id, home_id, mortgage_deal_id, mortgage_rate_deal_id, recommendation_kind, lender_name, product_name, current_lender, current_rate, suggested_rate, rate_delta, estimated_current_payment, estimated_new_payment, estimated_monthly_saving, product_fee, ltv, months_until_end, source_url, reason, status, created_at, payload",
      )
      .eq("user_id", dataOwnerUserId)
      .in("status", ["new", "seen", "watching", "saved"])
      .order("estimated_monthly_saving", {
        ascending: false,
        nullsFirst: false,
      })
      .limit(12)
      .returns<MortgageRenewalRecommendation[]>(),
    ratesSupabase
      .from("mortgage_rate_deals")
      .select(
        "id, lender_name, product_name, rate_percent, initial_term_months, product_fee, ltv_max, source_url, status, catalogue_status, existing_customer_only",
      )
      .eq("status", "active")
      .eq("catalogue_status", "active")
      .order("rate_percent", { ascending: true, nullsFirst: false })
      .limit(12)
      .returns<MortgageMarketDeal[]>(),
    ratesSupabase
      .from("mortgage_market_rate_benchmarks")
      .select("term_type, ltv_tier, rate_percent, effective_month")
      .order("effective_month", { ascending: false })
      .limit(50)
      .returns<MarketRateBenchmark[]>(),
  ]);

  if (
    (homes ?? []).length + (deals ?? []).length + (moveQueries ?? []).length ===
    0
  ) {
    return (
      <main className="mx-auto w-[95vw] max-w-[2000px] px-4 py-6 sm:px-6 lg:px-8">
        <PageLandingExperience kind="mortgage" />
      </main>
    );
  }

  const bankRate = Number(
    (boeBenchmarks ?? []).find((row) => row.term_type === "bank_rate")
      ?.rate_percent ?? NaN,
  );

  return (
    <>
      <HouseWorkspaceOverview
        homes={homes ?? []}
        deals={deals ?? []}
        valuations={valuations ?? []}
        renewalRecommendations={renewalRecommendations ?? []}
        marketDeals={marketDeals ?? []}
        moveQueries={moveQueries ?? []}
        boeBenchmarks={boeBenchmarks ?? []}
      />

      <TrackerProductsPanel
        products={trackerProducts ?? []}
        bankRate={Number.isFinite(bankRate) ? bankRate : null}
      />

      <section className="mx-auto w-[95vw] max-w-[1580px] px-4 pb-10 sm:px-6 lg:px-8">
        <div
          id="house-advanced-workspace"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                Full House workspace
              </p>
              <h2 className="mt-1 text-xl font-black text-slate-950">
                Property, affordability, moving-home and valuation tools
              </h2>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                The detailed workspace is still available; the main House page
                now opens with the simpler decision-focused view.
              </p>
            </div>
            <Link
              href="/mortgage/advanced"
              className="rounded-xl bg-slate-950 px-5 py-3 text-center text-sm font-black text-white"
            >
              Open full workspace
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

export default function HouseOverviewPage() {
  return (
    <>
      <Nav />
      <HouseOverviewContent />
    </>
  );
}

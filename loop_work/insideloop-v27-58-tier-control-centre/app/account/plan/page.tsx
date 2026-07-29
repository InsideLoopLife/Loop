import Link from "next/link";
import { requestPlanChange } from "./actions";
import { createClient } from "@/lib/supabase/server";

function money(pence?: number | null) {
  const value = Number(pence || 0) / 100;
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);
}

export default async function PlanPage() {
  const supabase = await createClient();

  const [{ data: myPlan }, { data: plans }] = await Promise.all([
    supabase.rpc("app_get_my_plan"),
    supabase
      .from("app_tier_plans")
      .select("*")
      .eq("is_active", true)
      .eq("visible_to_users", true)
      .order("sort_order"),
  ]);

  const currentSlug = myPlan?.current_plan?.slug || "free";
  const features = myPlan?.features || [];
  const requests = myPlan?.recent_requests || [];

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-8">
      <section className="rounded-[2rem] bg-slate-950 p-8 text-white shadow-2xl">
        <p className="text-xs font-black uppercase tracking-[0.35em] text-emerald-300">Loop plan</p>
        <h1 className="mt-3 text-4xl font-black">Your plan</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/75">
          View your current plan and test upgrade requests before payments are turned on.
        </p>
        <div className="mt-6 inline-flex rounded-full bg-white/10 px-4 py-2 text-sm font-bold">
          Current: {myPlan?.current_plan?.name || "Free"}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {plans?.map((plan: any) => {
          const active = plan.slug === currentSlug;
          return (
            <article
              key={plan.slug}
              className={`rounded-3xl border p-6 shadow-lg ${
                active ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.25em] text-slate-400">{plan.badge || "Plan"}</p>
                  <h2 className="mt-2 text-2xl font-black">{plan.name}</h2>
                </div>
                {active ? <span className="rounded-full bg-emerald-200 px-3 py-1 text-xs font-black text-emerald-900">Current</span> : null}
              </div>
              <p className="mt-3 min-h-12 text-sm text-slate-600">{plan.description}</p>
              <p className="mt-5 text-3xl font-black">
                {money(plan.monthly_price_pence)}
                <span className="text-sm font-bold text-slate-500"> / month</span>
              </p>

              {!active ? (
                <form action={requestPlanChange} className="mt-5 space-y-3">
                  <input type="hidden" name="plan_slug" value={plan.slug} />
                  <input
                    name="note"
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                    placeholder="Optional note for beta testing"
                  />
                  <button className="w-full rounded-2xl bg-slate-950 px-4 py-3 font-black text-white">
                    Request / test upgrade
                  </button>
                </form>
              ) : (
                <div className="mt-5 rounded-2xl bg-white px-4 py-3 text-center text-sm font-black text-slate-700">
                  You are on this plan
                </div>
              )}
            </article>
          );
        })}
      </section>

      <section className="rounded-3xl bg-white p-6 shadow-lg">
        <h2 className="text-2xl font-black">What your plan includes</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {features.map((feature: any) => (
            <div key={feature.feature_key} className="rounded-2xl bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">{feature.category}</p>
                  <h3 className="font-black">{feature.name}</h3>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-black ${feature.enabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-500"}`}>
                  {feature.enabled ? "On" : "Off"}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600">{feature.user_message || feature.description}</p>
              {feature.limit_value ? (
                <p className="mt-2 text-xs font-bold text-slate-500">
                  Limit: {feature.limit_value} {feature.limit_period !== "none" ? `/ ${feature.limit_period}` : ""}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {requests.length ? (
        <section className="rounded-3xl bg-white p-6 shadow-lg">
          <h2 className="text-2xl font-black">Recent plan requests</h2>
          <div className="mt-4 space-y-3">
            {requests.map((request: any) => (
              <div key={request.id} className="rounded-2xl bg-slate-50 p-4 text-sm">
                <strong>{request.requested_plan_slug}</strong> — {request.status}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <Link href="/account" className="inline-flex rounded-full bg-slate-100 px-4 py-2 text-sm font-bold">
        Back to account
      </Link>
    </main>
  );
}

import { AdminTabs } from "@/components/admin/AdminTabs";
import { createClient } from "@/lib/supabase/server";
import { requireAdminAccess } from "@/lib/admin/access";

function planLabel(cell: any) {
  if (!cell?.enabled) return "Not included";
  if (cell.limit_value === null || cell.limit_value === undefined) return "Included";
  if (cell.limit_period && cell.limit_period !== "none") return `${Number(cell.limit_value).toLocaleString("en-GB")}/${cell.limit_period}`;
  return `Up to ${Number(cell.limit_value).toLocaleString("en-GB")}`;
}

function tone(cell: any) {
  return cell?.enabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500";
}

export default async function AdminFeaturesPage() {
  await requireAdminAccess();
  const supabase = await createClient();

  const [{ data: features }, { data: plans }, { data: cells }] = await Promise.all([
    supabase.from("app_tier_features").select("feature_key, category, name, description, customer_benefit, customer_visible, is_active").eq("is_active", true).order("category").order("name"),
    supabase.from("app_tier_plans").select("slug, name, sort_order, is_active, visible_to_users").eq("is_active", true).order("sort_order"),
    supabase.from("app_tier_plan_features").select("plan_slug, feature_key, enabled, limit_value, limit_period, enforcement_mode, health_status"),
  ]);

  const activePlans = (plans || []).filter((plan: any) => plan.visible_to_users !== false);
  const byFeature = new Map<string, Record<string, any>>();
  for (const cell of cells || []) {
    const row = byFeature.get(cell.feature_key) || {};
    row[cell.plan_slug] = cell;
    byFeature.set(cell.feature_key, row);
  }

  const customerFeatures = (features || []).filter((feature: any) => feature.customer_visible !== false);
  const internalFeatures = (features || []).filter((feature: any) => feature.customer_visible === false);

  const grouped = customerFeatures.reduce((acc: Record<string, any[]>, feature: any) => {
    const category = feature.category || "Other";
    (acc[category] ||= []).push(feature);
    return acc;
  }, {});

  return (
    <main className="mx-auto w-[95vw] max-w-[1800px] space-y-6 px-4 py-8 md:px-6">
      <section className="rounded-[2.5rem] bg-slate-950 p-7 text-white">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Feature catalogue</p>
        <h1 className="mt-2 text-4xl font-black">What LOOP actually gives people</h1>
        <p className="mt-3 max-w-4xl text-sm font-bold leading-6 text-white/65">
          Customer-facing capabilities are separated from technical controls so the plan page stays understandable.
        </p>
      </section>

      <AdminTabs />

      <section className="space-y-8">
        {Object.entries(grouped).map(([category, categoryFeatures]) => (
          <div key={category}>
            <p className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-slate-400">{category}</p>
            <div className="grid gap-4 xl:grid-cols-2">
              {(categoryFeatures as any[]).map((feature: any) => {
                const featureCells = byFeature.get(feature.feature_key) || {};
                return (
                  <article key={feature.feature_key} className="rounded-[2rem] border border-slate-200 bg-white p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="max-w-2xl">
                        <h2 className="text-xl font-black text-slate-950">{feature.name}</h2>
                        <p className="mt-2 text-sm font-bold leading-6 text-slate-600">{feature.description}</p>
                        {feature.customer_benefit ? (
                          <div className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3">
                            <p className="text-xs font-black uppercase tracking-wide text-emerald-700">Why someone cares</p>
                            <p className="mt-1 text-sm font-bold text-emerald-900">{feature.customer_benefit}</p>
                          </div>
                        ) : null}
                      </div>
                      <code className="rounded-xl bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-500">{feature.feature_key}</code>
                    </div>

                    <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      {activePlans.map((plan: any) => {
                        const cell = featureCells[plan.slug];
                        return (
                          <div key={`${feature.feature_key}-${plan.slug}`} className="rounded-2xl border border-slate-100 p-3">
                            <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">{plan.name}</p>
                            <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-black ${tone(cell)}`}>{planLabel(cell)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <details className="rounded-[2rem] border border-amber-200 bg-amber-50 p-5">
        <summary className="cursor-pointer text-base font-black text-amber-950">Internal controls ({internalFeatures.length})</summary>
        <p className="mt-2 text-sm font-bold text-amber-800">
          These entitlement keys still exist for backend enforcement, but are excluded from the customer plan comparison because they describe implementation rather than customer value.
        </p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {internalFeatures.map((feature: any) => (
            <div key={feature.feature_key} className="rounded-2xl border border-amber-200 bg-white p-4">
              <p className="font-black text-slate-950">{feature.name}</p>
              <p className="mt-1 text-sm font-bold text-slate-500">{feature.description}</p>
              <code className="mt-2 inline-block text-[11px] font-bold text-slate-400">{feature.feature_key}</code>
            </div>
          ))}
        </div>
      </details>
    </main>
  );
}

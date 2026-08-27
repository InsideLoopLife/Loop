import { AdminTabs } from "@/components/admin/AdminTabs";
import { PlainEnglishTierFeatureCell } from "@/components/admin/PlainEnglishTierFeatureCell";
import { ProviderModelFields, TierAiRouteForm } from "@/components/admin/TierAiConfigurator";
import { createClient } from "@/lib/supabase/server";
import { requireAdminAccess } from "@/lib/admin/access";
import { resolveLoopAiRoute, type LoopAiTaskKind } from "@/lib/ai/model-routing";
import {
  deleteUserFacingFeature,
  deleteUserFacingPlan,
  reviewPlanRequest,
  saveTierAiModelConfig,
  saveUserFacingFeatureDefinition,
  saveUserFacingPlan,
  saveUserFacingPlanFeature,
  setUserPlan,
} from "./actions";

type AiRoute = {
  route_key: string;
  display_name: string;
  task_kind: LoopAiTaskKind;
  default_model: string;
  fallback_model: string | null;
  default_api_key_env: string;
  recommended_effort: string | null;
  notes: string | null;
  billing_scope?: string | null;
};

type TierAiConfig = {
  id: string;
  tier_key: string;
  route_key: string;
  provider: string;
  model: string;
  api_key_env_name: string;
  daily_limit: number | null;
  monthly_budget_pence: number | null;
  enabled: boolean;
  notes: string | null;
};

const customerRouteKeys = ["profile_insight", "nutrition_recommendation", "property_insight"];

const fallbackRoutes: AiRoute[] = [
  { route_key: "profile_insight", display_name: "Profile insight", task_kind: "profile_insight", default_model: "gpt-4.1-mini", fallback_model: "gpt-4.1-mini", default_api_key_env: "OPENAI_API_KEY", recommended_effort: "normal", billing_scope: "user_tier", notes: "How am I doing? profile summaries, household/user insight and personal coaching." },
  { route_key: "nutrition_recommendation", display_name: "Nutrition recommendations", task_kind: "nutrition_recommendation", default_model: "gpt-4.1-mini", fallback_model: "gpt-4.1-mini", default_api_key_env: "OPENAI_API_KEY", recommended_effort: "normal", billing_scope: "user_tier", notes: "Food log recommendations, substitutions and next-best actions." },
  { route_key: "property_insight", display_name: "House/property insight", task_kind: "property_insight", default_model: "gpt-4.1-mini", fallback_model: "gpt-4.1-mini", default_api_key_env: "OPENAI_API_KEY", recommended_effort: "normal", billing_scope: "user_tier", notes: "House values, mortgage comments and affordability/property insight." },
  { route_key: "quick_runtime", display_name: "Quick runtime/admin issue checks", task_kind: "quick_runtime", default_model: "gpt-4.1-mini", fallback_model: "gpt-4.1-mini", default_api_key_env: "OPENAI_API_KEY", recommended_effort: "low", billing_scope: "system", notes: "Cheap, fast checks and non-critical suggestions." },
  { route_key: "security_review", display_name: "Security and high severity diagnostics", task_kind: "security_review", default_model: "gpt-4.1", fallback_model: "gpt-4.1-mini", default_api_key_env: "OPENAI_SECURITY_API_KEY", recommended_effort: "high", billing_scope: "system", notes: "Use a stronger model and separate key for security-sensitive issues." },
  { route_key: "product_enrichment", display_name: "Product and nutrition enrichment", task_kind: "product_enrichment", default_model: "gpt-4.1-mini", fallback_model: "gpt-4.1-mini", default_api_key_env: "OPENAI_API_KEY", recommended_effort: "normal", billing_scope: "system", notes: "High-volume product quality and source extraction." },
  { route_key: "investment_research", display_name: "Investment/source coverage research", task_kind: "investment_research", default_model: "gpt-4.1-mini", fallback_model: "gpt-4.1-mini", default_api_key_env: "OPENAI_API_KEY", recommended_effort: "normal", billing_scope: "system", notes: "Market/source research and SQL generation." },
  { route_key: "vision_label_scan", display_name: "Vision / label scan", task_kind: "vision_label_scan", default_model: "gpt-4.1-mini", fallback_model: "gpt-4.1-mini", default_api_key_env: "OPENAI_API_KEY", recommended_effort: "normal", billing_scope: "system", notes: "Photos, labels and image-backed product checks." },
];

function money(pence?: number | null) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(Number(pence || 0) / 100);
}

function featureText(cell: any) {
  if (!cell?.enabled) return "â€”";
  if (cell.limit_value === null || cell.limit_value === undefined) return "âœ“";
  if (Number(cell.limit_value) >= 9999) return "Unlimited";
  if (cell.limit_period && cell.limit_period !== "none") return `${cell.limit_value} / ${cell.limit_period}`;
  return String(cell.limit_value);
}

function featureTone(cell: any) {
  if (!cell?.enabled) return "bg-slate-100 text-slate-400";
  if (cell.health_status === "hidden" || cell.enforcement_mode === "upgrade") return "bg-amber-100 text-amber-900";
  return "bg-emerald-100 text-emerald-800";
}

function configFor(configs: TierAiConfig[], tierKey: string, routeKey: string) {
  return configs.find((config) => config.tier_key === tierKey && config.route_key === routeKey);
}

function valueForInput(value: any) {
  return value === null || value === undefined ? "" : String(value);
}

function PlanSettings({ plan }: { plan: any }) {
  return (
    <details className="relative inline-block">
      <summary className="list-none rounded-full bg-slate-950 px-3 py-2 text-xs font-black text-white shadow-sm [&::-webkit-details-marker]:hidden" title="Edit tier column">âš™</summary>
      <div className="absolute right-0 z-30 mt-2 w-[min(92vw,760px)] rounded-[2rem] border border-slate-200 bg-white p-5 text-slate-950 shadow-2xl">
        <h3 className="text-xl font-black">Edit {plan.name}</h3>
        <p className="mt-1 text-sm font-bold text-slate-500">This updates the same tier column users see on the plan comparison page.</p>
        <form action={saveUserFacingPlan} className="mt-4 grid gap-3 md:grid-cols-2">
          <input type="hidden" name="slug" value={plan.slug} />
          <input name="name" defaultValue={plan.name || ""} placeholder="Plan name" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
          <input name="monthly_price_pence" type="number" defaultValue={plan.monthly_price_pence ?? 0} placeholder="Monthly price in pence, e.g. 499" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
          <input name="annual_price_pence" type="number" defaultValue={plan.annual_price_pence ?? 0} placeholder="Annual price in pence" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
          <input name="sort_order" type="number" defaultValue={plan.sort_order ?? 100} placeholder="Sort order" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
          <textarea name="description" defaultValue={plan.description || ""} placeholder="Description shown under the tier name" className="min-h-20 rounded-2xl border border-slate-200 px-4 py-3 font-bold md:col-span-2" />
          <div className="grid gap-2 md:col-span-2 md:grid-cols-3">
            <label className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold"><input type="checkbox" name="is_active" defaultChecked={plan.is_active ?? true} className="mr-2" /> Active</label>
            <label className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold"><input type="checkbox" name="visible_to_users" defaultChecked={plan.visible_to_users ?? true} className="mr-2" /> Show to users</label>
            <label className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold"><input type="checkbox" name="is_paid" defaultChecked={plan.is_paid ?? false} className="mr-2" /> Paid tier</label>
          </div>
          <button className="rounded-2xl bg-slate-950 px-5 py-3 font-black text-white md:col-span-2">Save tier column</button>
        </form>
        <form action={deleteUserFacingPlan} className="mt-3">
          <input type="hidden" name="slug" value={plan.slug} />
          <button className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-black text-rose-800">Hide/delete this column from the user chart</button>
        </form>
      </div>
    </details>
  );
}

function FeatureSettings({ row }: { row: any }) {
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs font-black text-slate-500 [&::-webkit-details-marker]:hidden">Edit row</summary>
      <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <form action={saveUserFacingFeatureDefinition} className="grid gap-2">
          <input type="hidden" name="feature_key" value={row.feature_key} />
          <input name="category" defaultValue={row.category || "General"} placeholder="Category" className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold" />
          <input name="name" defaultValue={row.name || ""} placeholder="Feature name" className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold" />
          <textarea name="description" defaultValue={row.description || ""} placeholder="Description shown to users" className="min-h-16 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold" />
          <input type="hidden" name="is_active" value="on" />
          <button className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white">Save row</button>
        </form>
        <form action={deleteUserFacingFeature} className="mt-2">
          <input type="hidden" name="feature_key" value={row.feature_key} />
          <button className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-800">Hide/delete row</button>
        </form>
      </div>
    </details>
  );
}

function PlanFeatureCell({ plan, row, cell }: { plan: any; row: any; cell: any }) {
  return (
    <details className="group">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${featureTone(cell)}`}>{featureText(cell)}</span>
        {cell?.message ? <p className="mt-2 max-w-xs text-xs text-slate-500">{cell.message}</p> : null}
        {cell?.health_status && cell.health_status !== "active" ? <p className="mt-2 text-xs font-bold text-amber-700">{cell.health_status}</p> : null}
      </summary>
      <form action={saveUserFacingPlanFeature} className="mt-3 grid min-w-72 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
        <input type="hidden" name="plan_slug" value={plan.slug} />
        <input type="hidden" name="feature_key" value={row.feature_key} />
        <label className="rounded-xl bg-white px-3 py-2 text-xs font-black"><input type="checkbox" name="enabled" defaultChecked={cell?.enabled ?? false} className="mr-2" /> Show/enable</label>
        <input name="limit_value" defaultValue={valueForInput(cell?.limit_value)} placeholder="Limit value, blank for tick" className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold" />
        <select name="limit_period" defaultValue={cell?.limit_period || "none"} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold">
          <option value="none">No period</option>
          <option value="day">Per day</option>
          <option value="week">Per week</option>
          <option value="month">Per month</option>
          <option value="year">Per year</option>
        </select>
        <select name="enforcement_mode" defaultValue={cell?.enforcement_mode || "audit"} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold">
          <option value="audit">Audit only</option>
          <option value="warn">Warn</option>
          <option value="block">Block</option>
          <option value="upgrade">Upgrade required</option>
        </select>
        <select name="health_status" defaultValue={cell?.health_status || "active"} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold">
          <option value="active">Active</option>
          <option value="degraded">Degraded</option>
          <option value="disabled">Disabled</option>
          <option value="hidden">Hidden to user</option>
        </select>
        <textarea name="user_message" defaultValue={cell?.message || ""} placeholder="User-facing helper text" className="min-h-16 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold" />
        <button className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white">Save cell</button>
      </form>
    </details>
  );
}

function AddPlanForm() {
  return (
    <details className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-4">
      <summary className="cursor-pointer text-sm font-black text-slate-800">+ Add a tier / column</summary>
      <form action={saveUserFacingPlan} className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <input name="slug" placeholder="slug, e.g. premium" required className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
        <input name="name" placeholder="Visible name" required className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
        <input name="monthly_price_pence" type="number" placeholder="Monthly pence" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
        <input name="sort_order" type="number" placeholder="Sort order" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
        <textarea name="description" placeholder="Description" className="min-h-20 rounded-2xl border border-slate-200 px-4 py-3 font-bold lg:col-span-4" />
        <label className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold"><input type="checkbox" name="is_active" defaultChecked className="mr-2" /> Active</label>
        <label className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold"><input type="checkbox" name="visible_to_users" defaultChecked className="mr-2" /> Show to users</label>
        <label className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold"><input type="checkbox" name="is_paid" defaultChecked className="mr-2" /> Paid tier</label>
        <button className="rounded-2xl bg-slate-950 px-5 py-3 font-black text-white">Add tier</button>
      </form>
    </details>
  );
}

function AddFeatureForm() {
  return (
    <details className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-4">
      <summary className="cursor-pointer text-sm font-black text-slate-800">+ Add a feature / row</summary>
      <form action={saveUserFacingFeatureDefinition} className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <input name="feature_key" placeholder="feature_key, e.g. profile_ai" required className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
        <input name="category" placeholder="Category" defaultValue="AI" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
        <input name="name" placeholder="Visible feature name" required className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
        <input type="hidden" name="is_active" value="on" />
        <textarea name="description" placeholder="User-facing description" className="min-h-20 rounded-2xl border border-slate-200 px-4 py-3 font-bold lg:col-span-4" />
        <button className="rounded-2xl bg-slate-950 px-5 py-3 font-black text-white lg:col-span-4">Add feature row</button>
      </form>
    </details>
  );
}

export default async function AdminTiersPage() {
  await requireAdminAccess();
  const supabase = await createClient();
  const [dashboardResult, routesResult, configsResult] = await Promise.all([
    supabase.rpc("app_admin_tier_dashboard"),
    supabase.from("loop_ai_model_routes").select("*").order("route_key", { ascending: true }),
    supabase.from("loop_tier_ai_model_config").select("*").order("tier_key", { ascending: true }).order("route_key", { ascending: true }),
  ]);

  const dashboard = dashboardResult.data || {};
  const dashboardError = dashboardResult.error;
  const comparison = dashboard?.comparison || {};
  const plans = dashboard?.plans?.length ? dashboard.plans : comparison.plans || [];
  const comparisonPlans = comparison.plans?.length ? comparison.plans : plans.filter((p: any) => p.visible_to_users !== false && p.is_active !== false);
  const comparisonRows = comparison.features || [];
  const users = dashboard?.users || [];
  const pending = dashboard?.pending_requests || [];
  const usersByTier = dashboard?.users_by_tier || [];

  const dbRoutes = (routesResult.data || []) as AiRoute[];
  const routes = dbRoutes.length ? dbRoutes : fallbackRoutes;
  const configs = (configsResult.data || []) as TierAiConfig[];
  const aiTablesMissing = routesResult.error || configsResult.error;
  const customerRoutes = routes.filter((route) => route.billing_scope === "user_tier" || customerRouteKeys.includes(route.route_key));
  const systemRoutes = routes.filter((route) => !(route.billing_scope === "user_tier" || customerRouteKeys.includes(route.route_key)));

  return (
    <main className="mx-auto w-[95vw] max-w-[2000px] space-y-6 p-4">
      <section className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">Admin tiers</p>
        <h1 className="mt-2 text-4xl font-black">User-facing plan chart and upgrade control</h1>
        <p className="mt-3 max-w-4xl text-sm font-bold text-white/75">
          This is now driven by the same comparison data users see on /account/plan. Edit a tier column, edit a feature row, or click any cell to control whether that function is shown, hidden, blocked or limited.
        </p>
      </section>

      <AdminTabs />

      {dashboardError ? (
        <section className="rounded-[2rem] border border-rose-200 bg-rose-50 p-5 text-sm font-bold text-rose-900">
          <h2 className="text-xl font-black">Tier dashboard unavailable</h2>
          <p className="mt-2">{dashboardError.message}</p>
          <p className="mt-2">Run <code>db/v27_94_snaptrade_tier_dashboard_hotfix.sql</code> and refresh. This repairs the tier dashboard RPC without relying on pgcrypto digest search-path behaviour.</p>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-4">
        {usersByTier.map((row: any) => (
          <div key={row.plan_slug} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">{row.plan_name || row.plan_slug}</p>
            <p className="mt-2 text-3xl font-black">{row.user_count || 0}</p>
            <p className="text-sm font-bold text-slate-500">{row.manual_overrides || 0} manual override(s)</p>
          </div>
        ))}
      </section>

      {pending.length ? (
        <section className="rounded-[2rem] border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <h2 className="text-2xl font-black text-slate-950">Pending upgrade requests</h2>
          <p className="mt-1 text-sm font-bold text-amber-900">Approve a request here to move the user immediately onto the requested tier.</p>
          <div className="mt-4 space-y-3">
            {pending.map((request: any) => (
              <form key={request.id} action={reviewPlanRequest} className="grid gap-3 rounded-2xl bg-white p-4 md:grid-cols-[1.3fr_1fr_2fr_auto_auto] md:items-center">
                <input type="hidden" name="request_id" value={request.id} />
                <div>
                  <p className="font-black">{request.display_name || request.email || request.masked_email || request.user_id}</p>
                  <p className="text-xs font-bold text-slate-500">{request.email || request.masked_email || request.user_id}</p>
                </div>
                <p className="text-sm font-black">{request.current_plan_slug || "free"} â†’ {request.requested_plan_slug}</p>
                <input name="note" defaultValue={request.note || ""} placeholder="Decision note" className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold" />
                <button name="decision" value="approve" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white">Approve</button>
                <button name="decision" value="reject" className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-black text-white">Reject</button>
              </form>
            ))}
          </div>
        </section>
      ) : (
        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 text-sm font-bold text-slate-500 shadow-sm">
          No pending upgrade requests at the moment. When a user clicks â€œRequest upgradeâ€, it will appear here.
        </section>
      )}

      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <h2 className="text-2xl font-black">User-facing comparison chart</h2>
          <p className="mt-1 text-sm font-bold text-slate-500">This mirrors the user upgrade page. Use the cog in a column header for tier settings; use â€œEdit rowâ€ for feature text; click a pill to edit that planâ€™s feature cell.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="sticky left-0 z-20 w-72 bg-slate-50 px-5 py-4 text-xs font-black uppercase tracking-[0.2em] text-slate-500">Feature</th>
                {comparisonPlans.map((plan: any) => (
                  <th key={plan.slug} className="min-w-64 px-5 py-4 align-top">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">{plan.badge || plan.slug}</p>
                        <p className="mt-1 text-xl font-black">{plan.name}</p>
                        <p className="mt-2 text-2xl font-black">{money(plan.monthly_price_pence)} <span className="text-xs text-slate-500">/ month</span></p>
                        {plan.description ? <p className="mt-2 max-w-xs text-xs font-bold text-slate-500">{plan.description}</p> : null}
                      </div>
                      <PlanSettings plan={plans.find((p: any) => p.slug === plan.slug) || plan} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row: any) => (
                <tr key={row.feature_key} className="border-b border-slate-100">
                  <td className="sticky left-0 z-10 bg-white px-5 py-4 align-top shadow-[8px_0_16px_-18px_rgba(15,23,42,.5)]">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{row.category}</p>
                    <p className="font-black text-slate-950">{row.name}</p>
                    <p className="mt-1 max-w-xs text-xs text-slate-500">{row.description}</p>
                    <FeatureSettings row={row} />
                  </td>
                  {comparisonPlans.map((plan: any) => {
                    const cell = row.plans?.[plan.slug];
                    return (
                      <td key={`${row.feature_key}-${plan.slug}`} className="px-5 py-4 align-top">
                        <PlainEnglishTierFeatureCell planSlug={plan.slug} featureKey={row.feature_key} featureName={row.name} cell={cell} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <AddPlanForm />
        <AddFeatureForm />
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-black">Upgrade a user manually</h2>
        <p className="mt-1 text-sm font-bold text-slate-500">Use this when payment/tier automation is not wired yet, or to approve a beta upgrade by hand.</p>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-[0.2em] text-slate-400">
                <th className="py-3">User</th>
                <th>Email</th>
                <th>Current plan</th>
                <th>Source</th>
                <th>Change plan</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user: any) => (
                <tr key={user.user_id} className="border-b border-slate-100">
                  <td className="py-3 font-black">{user.display_name || user.anon_user_ref || "User"}</td>
                  <td>{user.email || user.masked_email || "â€”"}</td>
                  <td>{user.plan_slug || "free"}</td>
                  <td>{user.manual_override ? "admin override" : user.source || "default"}</td>
                  <td>
                    <form action={setUserPlan} className="flex flex-wrap gap-2">
                      <input type="hidden" name="user_id" value={user.user_id} />
                      <select name="plan_slug" defaultValue={user.plan_slug || "free"} className="rounded-xl border border-slate-200 px-3 py-2 font-bold">
                        {plans.map((plan: any) => <option key={plan.slug} value={plan.slug}>{plan.name}</option>)}
                      </select>
                      <input name="reason" placeholder="Reason" className="rounded-xl border border-slate-200 px-3 py-2 font-bold" />
                      <button className="rounded-xl bg-slate-950 px-3 py-2 font-black text-white">Apply</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {aiTablesMissing ? (
        <section className="rounded-[2rem] border border-amber-200 bg-amber-50 p-5 text-sm font-bold text-amber-900">
          AI model routing tables are not available yet. Run <code>db/v27_83_tier_models_markets_products.sql</code> or the newer v27.84 SQL, then refresh.
        </section>
      ) : null}

      <details className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <summary className="cursor-pointer text-2xl font-black text-slate-950 [&::-webkit-details-marker]:hidden">Customer AI budget lanes by tier</summary>
        <p className="mt-2 text-sm font-bold text-slate-500">These are the only user-budgeted AI routes: profile insight, nutrition recommendations and house/property insight. Spend is counted per user, not as a platform-wide limit.</p>
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {comparisonPlans.map((tier: any) => (
            <details key={`${tier.slug}-customer-ai`} className="rounded-[2rem] border border-slate-200 bg-slate-50 p-4">
              <summary className="cursor-pointer text-xl font-black text-slate-950 [&::-webkit-details-marker]:hidden">{tier.name || tier.slug}</summary>
              <div className="mt-4 space-y-3">
                {customerRoutes.map((route) => {
                  const existing = configFor(configs, tier.slug, route.route_key);
                  const resolved = resolveLoopAiRoute({ task: route.task_kind, tierKey: tier.slug });
                  return <TierAiRouteForm key={`${tier.slug}-${route.route_key}`} tierKey={tier.slug} route={{ ...route, default_model: existing?.model || resolved.model, default_api_key_env: existing?.api_key_env_name || resolved.apiKeyEnvName }} existing={existing} action={saveTierAiModelConfig} />;
                })}
              </div>
            </details>
          ))}
        </div>
      </details>

      <details className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <summary className="cursor-pointer text-2xl font-black text-slate-950 [&::-webkit-details-marker]:hidden">System/admin AI lanes</summary>
        <p className="mt-2 text-sm font-bold text-slate-500">These are not user tiers. They are internal routes for runtime fixes, security review, product enrichment, investment coverage and vision/label scans.</p>
        <div className="mt-5 space-y-3">
          {systemRoutes.map((route) => {
            const existing = configFor(configs, "_system", route.route_key);
            return (
              <form key={`system-${route.route_key}`} action={saveTierAiModelConfig} className="grid gap-3 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[1.2fr_1fr_1fr_1fr_.8fr_.8fr_auto] lg:items-center">
                <input type="hidden" name="tier_key" value="_system" />
                <input type="hidden" name="route_key" value={route.route_key} />
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">{route.route_key}</p>
                  <h3 className="font-black text-slate-950">{route.display_name}</h3>
                  <p className="mt-1 text-xs font-bold text-slate-500">{route.notes || "System AI route"}</p>
                </div>
                <ProviderModelFields defaultProvider={existing?.provider || "openai"} defaultModel={existing?.model || route.default_model} defaultApiKeyEnv={existing?.api_key_env_name || route.default_api_key_env} />
                <input name="daily_limit" type="number" defaultValue={existing?.daily_limit ?? ""} placeholder="Daily cap" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
                <input name="monthly_budget_pence" type="number" defaultValue={existing?.monthly_budget_pence ?? ""} placeholder="Monthly pence" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
                <label className="flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 font-bold"><input type="checkbox" name="enabled" defaultChecked={existing?.enabled ?? true} /> On</label>
                <textarea name="notes" defaultValue={existing?.notes || ""} placeholder="Note" className="min-h-12 rounded-2xl border border-slate-200 px-4 py-3 font-bold lg:col-span-2" />
                <button className="rounded-2xl bg-slate-950 px-5 py-3 font-black text-white">Save</button>
              </form>
            );
          })}
        </div>
      </details>
    </main>
  );
}

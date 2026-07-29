import { savePlan, savePlanFeature, setUserPlan } from "./actions";
import { createClient } from "@/lib/supabase/server";

function money(pence?: number | null) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(Number(pence || 0) / 100);
}

export default async function TierControlPage() {
  const supabase = await createClient();

  const [{ data: dashboard, error }, { data: users }] = await Promise.all([
    supabase.rpc("app_admin_tier_dashboard"),
    supabase.rpc("app_admin_list_users_by_tier", { p_plan_slug: null }),
  ]);

  if (error) {
    return (
      <main className="mx-auto max-w-5xl p-8">
        <div className="rounded-3xl bg-red-50 p-6 text-red-800">
          <h1 className="text-2xl font-black">Tier Control unavailable</h1>
          <p className="mt-2">{error.message}</p>
          <p className="mt-2 text-sm">Run db/v27_58_tier_control_centre.sql and make sure your account is admin/owner.</p>
        </div>
      </main>
    );
  }

  const plans = dashboard?.plans || [];
  const features = dashboard?.features || [];
  const usersByTier = dashboard?.users_by_tier || [];
  const pending = dashboard?.pending_requests || [];

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-8">
      <section className="rounded-[2rem] bg-slate-950 p-8 text-white shadow-2xl">
        <p className="text-xs font-black uppercase tracking-[0.35em] text-emerald-300">Admin control centre</p>
        <h1 className="mt-3 text-4xl font-black">Tier Control Centre</h1>
        <p className="mt-2 max-w-3xl text-sm text-white/75">
          Control plans, feature availability, limits, degraded features and user overrides before payment enforcement goes live.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {usersByTier.map((row: any) => (
          <div key={row.plan_slug} className="rounded-3xl bg-white p-5 shadow-lg">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">{row.plan_slug}</p>
            <p className="mt-2 text-3xl font-black">{row.user_count}</p>
            <p className="text-sm text-slate-500">{row.manual_overrides} manual override(s)</p>
          </div>
        ))}
      </section>

      <section className="rounded-3xl bg-white p-6 shadow-lg">
        <h2 className="text-2xl font-black">Plans</h2>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {plans.map((plan: any) => (
            <form key={plan.slug} action={savePlan} className="space-y-3 rounded-3xl border border-slate-200 p-5">
              <input type="hidden" name="slug" value={plan.slug} />
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">{plan.slug}</p>
                  <input name="name" defaultValue={plan.name} className="mt-1 w-full rounded-xl border px-3 py-2 text-xl font-black" />
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black">{money(plan.monthly_price_pence)}</span>
              </div>
              <textarea name="description" defaultValue={plan.description || ""} className="min-h-20 w-full rounded-xl border px-3 py-2 text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <label className="rounded-xl bg-slate-50 p-3 text-sm font-bold"><input type="checkbox" name="is_active" defaultChecked={plan.is_active} /> Active</label>
                <label className="rounded-xl bg-slate-50 p-3 text-sm font-bold"><input type="checkbox" name="visible_to_users" defaultChecked={plan.visible_to_users} /> User visible</label>
                <label className="rounded-xl bg-slate-50 p-3 text-sm font-bold"><input type="checkbox" name="is_paid" defaultChecked={plan.is_paid} /> Paid later</label>
                <input name="sort_order" type="number" defaultValue={plan.sort_order} className="rounded-xl border px-3 py-2" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input name="monthly_price_pence" type="number" defaultValue={plan.monthly_price_pence} className="rounded-xl border px-3 py-2" placeholder="Monthly pence" />
                <input name="annual_price_pence" type="number" defaultValue={plan.annual_price_pence} className="rounded-xl border px-3 py-2" placeholder="Annual pence" />
              </div>
              <button className="rounded-2xl bg-slate-950 px-4 py-3 font-black text-white">Save plan</button>
            </form>
          ))}
        </div>
      </section>

      <section className="rounded-3xl bg-white p-6 shadow-lg">
        <h2 className="text-2xl font-black">Feature controls</h2>
        <p className="mt-1 text-sm text-slate-500">
          Use health status to temporarily downgrade broken features without changing the plan itself.
        </p>
        <div className="mt-5 space-y-4">
          {plans.filter((p: any) => p.slug !== "staff").map((plan: any) => (
            <details key={plan.slug} className="rounded-3xl bg-slate-50 p-5">
              <summary className="cursor-pointer text-xl font-black">{plan.name} features</summary>
              <div className="mt-4 grid gap-3">
                {features.map((feature: any) => (
                  <form key={`${plan.slug}-${feature.feature_key}`} action={savePlanFeature} className="grid gap-2 rounded-2xl bg-white p-4 md:grid-cols-8">
                    <input type="hidden" name="plan_slug" value={plan.slug} />
                    <input type="hidden" name="feature_key" value={feature.feature_key} />
                    <label className="md:col-span-2 text-sm font-black">
                      <input type="checkbox" name="enabled" className="mr-2" />
                      {feature.name}
                      <span className="block text-xs font-bold text-slate-400">{feature.category}</span>
                    </label>
                    <input name="limit_value" placeholder="Limit" className="rounded-xl border px-3 py-2" />
                    <select name="limit_period" defaultValue="none" className="rounded-xl border px-3 py-2">
                      <option value="none">No period</option>
                      <option value="day">Day</option>
                      <option value="week">Week</option>
                      <option value="month">Month</option>
                      <option value="year">Year</option>
                    </select>
                    <select name="enforcement_mode" defaultValue="audit" className="rounded-xl border px-3 py-2">
                      <option value="audit">Audit only</option>
                      <option value="warn">Warn</option>
                      <option value="block">Block</option>
                      <option value="upgrade">Upgrade</option>
                    </select>
                    <select name="health_status" defaultValue="active" className="rounded-xl border px-3 py-2">
                      <option value="active">Active</option>
                      <option value="degraded">Degraded</option>
                      <option value="disabled">Disabled</option>
                      <option value="hidden">Hidden</option>
                    </select>
                    <input name="user_message" placeholder="User message" className="rounded-xl border px-3 py-2" />
                    <button className="rounded-xl bg-slate-950 px-3 py-2 text-sm font-black text-white">Save</button>
                  </form>
                ))}
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="rounded-3xl bg-white p-6 shadow-lg">
        <h2 className="text-2xl font-black">Users by plan</h2>
        <p className="mt-1 text-sm text-slate-500">Anonymised user refs are shown by default, with masked email only for support identification.</p>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-[0.2em] text-slate-400">
                <th className="py-3">Anon user</th>
                <th>Email</th>
                <th>Current plan</th>
                <th>Source</th>
                <th>Override</th>
                <th>Change plan</th>
              </tr>
            </thead>
            <tbody>
              {users?.map((user: any) => (
                <tr key={user.user_id} className="border-b">
                  <td className="py-3 font-black">{user.anon_user_ref}</td>
                  <td>{user.masked_email || "—"}</td>
                  <td>{user.plan_slug}</td>
                  <td>{user.source}</td>
                  <td>{user.manual_override ? "Yes" : "No"}</td>
                  <td>
                    <form action={setUserPlan} className="flex gap-2">
                      <input type="hidden" name="user_id" value={user.user_id} />
                      <select name="plan_slug" defaultValue={user.plan_slug} className="rounded-xl border px-3 py-2">
                        {plans.map((plan: any) => (
                          <option key={plan.slug} value={plan.slug}>{plan.name}</option>
                        ))}
                      </select>
                      <input name="reason" placeholder="Reason" className="rounded-xl border px-3 py-2" />
                      <button className="rounded-xl bg-slate-950 px-3 py-2 font-black text-white">Apply</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {pending.length ? (
        <section className="rounded-3xl bg-amber-50 p-6 shadow-lg">
          <h2 className="text-2xl font-black">Pending plan requests</h2>
          <div className="mt-4 space-y-2">
            {pending.map((request: any) => (
              <div key={request.id} className="rounded-2xl bg-white p-4 text-sm">
                User requested <strong>{request.requested_plan_slug}</strong> from {request.current_plan_slug || "free"}.
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { SectionCard } from "@/components/SectionCard";
import { SubmitButton } from "@/components/SubmitButton";
import { FormInput } from "@/components/FormInput";
import { createClient } from "@/lib/supabase/server";
import { ensureDefaultAssumptions } from "@/lib/assumptions/server";
import { OFFICIAL_ASSUMPTION_DEFAULTS } from "@/lib/assumptions/catalog";
import { clearAssumptionLog, deleteAssumption, runAssumptionHealthCheck, saveAssumption, seedOfficialAssumptions } from "./actions";

type Assumption = {
  id: string;
  rate_key: string;
  label: string;
  value_numeric: number | null;
  value_text: string | null;
  source_url: string | null;
  source_name: string | null;
  effective_from: string | null;
  effective_until: string | null;
  checked_at: string;
  notes: string | null;
  category: string | null;
  verified_by: string | null;
  review_status: string | null;
};

type CheckLog = {
  id: string;
  area: string;
  status: "ok" | "warning" | "needs_review";
  message: string;
  assumption_keys: string[] | null;
  created_at: string;
};

function formatValue(rate: Assumption) {
  if (rate.value_numeric !== null && rate.value_numeric !== undefined) return String(rate.value_numeric);
  return rate.value_text || "No value";
}

function statusClasses(status: string | null | undefined) {
  if (status === "needs_review") return "border-amber-200 bg-amber-50 text-amber-900";
  if (status === "warning") return "border-orange-200 bg-orange-50 text-orange-900";
  if (status === "archived") return "border-slate-200 bg-slate-50 text-slate-500";
  return "border-emerald-200 bg-emerald-50 text-emerald-900";
}

export default async function AssumptionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  await ensureDefaultAssumptions(supabase, user.id);

  const [{ data: assumptions }, { data: checks }, { data: token }] = await Promise.all([
    supabase
      .from("statutory_rate_assumptions")
      .select("id, rate_key, label, value_numeric, value_text, source_url, source_name, effective_from, effective_until, checked_at, notes, category, verified_by, review_status")
      .eq("user_id", user.id)
      .order("category", { ascending: true })
      .order("rate_key", { ascending: true })
      .returns<Assumption[]>(),
    supabase
      .from("assumption_check_log")
      .select("id, area, status, message, assumption_keys, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(12)
      .returns<CheckLog[]>(),
    supabase
      .from("integration_secrets")
      .select("id")
      .eq("user_id", user.id)
      .eq("provider", "openai")
      .eq("status", "active")
      .limit(1)
      .maybeSingle(),
  ]);

  const grouped = (assumptions ?? []).reduce<Record<string, Assumption[]>>((acc, rate) => {
    const key = rate.category || (rate.notes?.split(":")[0] ?? "other");
    acc[key] = acc[key] || [];
    acc[key].push(rate);
    return acc;
  }, {});

  const missingDefaults = OFFICIAL_ASSUMPTION_DEFAULTS.filter(
    (item) => !(assumptions ?? []).some((rate) => rate.rate_key === item.rate_key),
  );

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl space-y-7 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-slate-950 md:text-5xl">Assumptions</h1>
            <p className="mt-1 max-w-3xl text-slate-600">
              Source-controlled values for SMP, tax, NI, student loans, stamp duty and mortgage stress testing. These are the numbers the app should check before salary, maternity, student-loan or affordability calculations are trusted.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <form action={seedOfficialAssumptions}><SubmitButton>Seed defaults</SubmitButton></form>
            <form action={runAssumptionHealthCheck}><SubmitButton>Run checks</SubmitButton></form>
          </div>
        </div>

        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Active assumptions</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{assumptions?.length ?? 0}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Missing defaults</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{missingDefaults.length}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">OpenAI checker</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{token ? "Ready" : "Off"}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Latest check</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{checks?.[0]?.status?.replaceAll("_", " ") ?? "None"}</p>
          </div>
        </section>

        <SectionCard title="How the checker works" description="The app seeds trusted source URLs, logs checks when relevant finance records are added/updated, and gives you a single place to review assumptions before calculations use them.">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="font-semibold text-slate-950">On account creation / first dashboard load</p>
              <p className="mt-2 text-sm text-slate-600">Baseline assumptions are created for SMP, tax, NI, student loans, SDLT and mortgage stress testing.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="font-semibold text-slate-950">When a related record changes</p>
              <p className="mt-2 text-sm text-slate-600">Salary, maternity, student-loan and affordability entries log whether the relevant assumptions were checked.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="font-semibold text-slate-950">With OpenAI later</p>
              <p className="mt-2 text-sm text-slate-600">The saved OpenAI token can be used server-side to summarise official pages and suggest updates, but it should never silently overwrite values.</p>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Add or update assumption" description="Use this for payroll-confirmed figures, a future tax year, or your own stress-rate assumptions.">
          <form action={saveAssumption} className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Category</span>
              <select name="category" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-orange-500 focus:ring-2">
                <option value="maternity">Maternity</option>
                <option value="tax">Tax</option>
                <option value="ni">National Insurance</option>
                <option value="student_loan">Student loan</option>
                <option value="stamp_duty">Stamp duty</option>
                <option value="mortgage">Mortgage</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <FormInput label="Rate key" name="rate_key" placeholder="smp_weekly_rate" required />
            <FormInput label="Label" name="label" placeholder="SMP weekly rate 2026/27" required />
            <FormInput label="Numeric value" name="value_numeric" type="number" step="0.0001" />
            <FormInput label="Text value" name="value_text" placeholder="For bands/rules" />
            <FormInput label="Effective from" name="effective_from" type="date" />
            <FormInput label="Effective until" name="effective_until" type="date" />
            <FormInput label="Source name" name="source_name" placeholder="GOV.UK" />
            <FormInput label="Source URL" name="source_url" placeholder="https://www.gov.uk/..." />
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Review status</span>
              <select name="review_status" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-orange-500 focus:ring-2">
                <option value="active">Active</option>
                <option value="needs_review">Needs review</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            <div className="lg:col-span-4"><FormInput label="Notes" name="notes" placeholder="Why this value is being used" /></div>
            <div className="flex items-end"><SubmitButton>Save assumption</SubmitButton></div>
          </form>
        </SectionCard>

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-6">
            {Object.entries(grouped).map(([category, rates]) => (
              <SectionCard key={category} title={category.replaceAll("_", " ")}>
                <div className="space-y-3">
                  {rates.map((rate) => (
                    <details key={rate.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <summary className="cursor-pointer list-none">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <p className="font-semibold text-slate-950">{rate.label}</p>
                            <p className="text-sm text-slate-500">{rate.rate_key} · {formatValue(rate)}</p>
                            <p className="mt-1 text-xs text-slate-500">Effective {rate.effective_from ?? "unknown"} → {rate.effective_until ?? "ongoing"} · checked {rate.checked_at.slice(0, 10)}</p>
                          </div>
                          <span className={`w-fit rounded-full border px-3 py-1 text-xs font-semibold capitalize ${statusClasses(rate.review_status)}`}>
                            {(rate.review_status ?? "active").replaceAll("_", " ")}
                          </span>
                        </div>
                      </summary>
                      <div className="mt-4 border-t border-slate-100 pt-4">
                        {rate.source_url ? (
                          <a className="text-sm font-medium text-blue-700 underline" href={rate.source_url} target="_blank" rel="noreferrer">{rate.source_name || "Open source"}</a>
                        ) : (
                          <p className="text-sm text-amber-700">No source URL saved.</p>
                        )}
                        {rate.notes ? <p className="mt-2 text-sm text-slate-600">{rate.notes}</p> : null}
                        <form action={saveAssumption} className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                          <input type="hidden" name="id" value={rate.id} />
                          <input type="hidden" name="category" value={rate.category ?? category} />
                          <FormInput label="Rate key" name="rate_key" defaultValue={rate.rate_key} />
                          <FormInput label="Label" name="label" defaultValue={rate.label} />
                          <FormInput label="Numeric value" name="value_numeric" type="number" step="0.0001" defaultValue={rate.value_numeric ?? undefined} />
                          <FormInput label="Text value" name="value_text" defaultValue={rate.value_text ?? undefined} />
                          <FormInput label="Effective from" name="effective_from" type="date" defaultValue={rate.effective_from ?? undefined} />
                          <FormInput label="Effective until" name="effective_until" type="date" defaultValue={rate.effective_until ?? undefined} />
                          <FormInput label="Source name" name="source_name" defaultValue={rate.source_name ?? undefined} />
                          <FormInput label="Source URL" name="source_url" defaultValue={rate.source_url ?? undefined} />
                          <label className="block">
                            <span className="text-sm font-medium text-slate-700">Review status</span>
                            <select name="review_status" defaultValue={rate.review_status ?? "active"} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-orange-500 focus:ring-2">
                              <option value="active">Active</option>
                              <option value="needs_review">Needs review</option>
                              <option value="archived">Archived</option>
                            </select>
                          </label>
                          <div className="lg:col-span-2"><FormInput label="Notes" name="notes" defaultValue={rate.notes ?? undefined} /></div>
                          <div className="flex items-end gap-3">
                            <SubmitButton>Update</SubmitButton>
                          </div>
                        </form>
                        <form action={deleteAssumption} className="mt-3">
                          <input type="hidden" name="id" value={rate.id} />
                          <button className="text-sm font-medium text-red-600">Delete assumption</button>
                        </form>
                      </div>
                    </details>
                  ))}
                </div>
              </SectionCard>
            ))}
          </div>

          <SectionCard title="Check log" description="Recent automatic/manual checks triggered by assumptions or intersecting records.">
            <div className="space-y-3">
              {(checks ?? []).map((check) => (
                <div key={check.id} className={`rounded-2xl border p-4 ${statusClasses(check.status)}`}>
                  <p className="text-sm font-semibold capitalize">{check.area} · {check.status.replaceAll("_", " ")}</p>
                  <p className="mt-1 text-sm">{check.message}</p>
                  {check.assumption_keys?.length ? <p className="mt-2 text-xs">{check.assumption_keys.join(", ")}</p> : null}
                  <p className="mt-2 text-xs opacity-80">{new Date(check.created_at).toLocaleString("en-GB")}</p>
                </div>
              ))}
              {(checks ?? []).length === 0 ? <p className="text-sm text-slate-500">No checks logged yet.</p> : null}
            </div>
            {(checks ?? []).length > 0 ? (
              <form action={clearAssumptionLog} className="mt-4"><button className="text-sm font-medium text-red-600">Clear log</button></form>
            ) : null}
          </SectionCard>
        </div>
      </main>
    </>
  );
}

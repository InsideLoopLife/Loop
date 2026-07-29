import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { SectionCard } from "@/components/SectionCard";
import { FormInput } from "@/components/FormInput";
import { SubmitButton } from "@/components/SubmitButton";
import { SnapTradeAccountImportPanel } from "@/components/integrations/SnapTradeAccountImportPanel";
import { createClient } from "@/lib/supabase/server";
import { integrationProviderPlan } from "@/lib/integrations/provider-plan";
import { investmentDataEntitlementForProfile } from "@/lib/wealth/user-tiers";
import { addIntegrationConnection, deleteIntegrationConnection, deleteIntegrationSecret, deleteStatutoryRateAssumption, saveIntegrationSecret, saveStatutoryRateAssumption } from "./actions";

type IntegrationConnection = {
  id: string;
  provider: string;
  connection_type: string;
  status: string;
  notes: string | null;
  consent_expires_at: string | null;
  last_synced_at: string | null;
};

type IntegrationSecret = {
  id: string;
  provider: string;
  key_label: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type StatutoryRateAssumption = {
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
};

export default async function IntegrationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: connections }, { data: secrets }, { data: statutoryRates }, { data: profile }, { data: snapTradeConnection }] = await Promise.all([
    supabase
      .from("integration_connections")
      .select("id, provider, connection_type, status, notes, consent_expires_at, last_synced_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .returns<IntegrationConnection[]>(),
    supabase
      .from("integration_secrets")
      .select("id, provider, key_label, status, created_at, updated_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .returns<IntegrationSecret[]>(),
    supabase
      .from("statutory_rate_assumptions")
      .select("id, rate_key, label, value_numeric, value_text, source_url, source_name, effective_from, effective_until, checked_at, notes")
      .eq("user_id", user.id)
      .order("checked_at", { ascending: false })
      .limit(10)
      .returns<StatutoryRateAssumption[]>(),
    supabase
      .from("app_user_profiles")
      .select("payment_tier, payment_tier_status, payment_tier_override, market_data_tier, market_data_tier_override, market_data_provider_status, market_data_realtime_enabled")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("integration_connections")
      .select("status, external_connection_id, last_synced_at, updated_at")
      .eq("user_id", user.id)
      .eq("provider", "SnapTrade")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl space-y-7 px-4 py-6 sm:px-6 lg:px-8">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-950 md:text-5xl">Integrations</h1>
          <p className="mt-1 text-slate-600">
            Keep provider plans and local-development API tokens here. Secrets are never rendered back to the browser after saving.
          </p>
        </div>


        <SectionCard title="Broker account imports" description="Connect SnapTrade/Trading 212 and choose exactly which ISA, GIA or SIPP accounts appear as separate investment pots.">
          <SnapTradeAccountImportPanel
            enabled={investmentDataEntitlementForProfile(profile).canConnectPaidProvider}
            connection={{
              connected: String(snapTradeConnection?.status || "").toLowerCase() === "connected" || profile?.market_data_provider_status === "connected",
              status: snapTradeConnection?.status || null,
              externalConnectionId: snapTradeConnection?.external_connection_id || null,
              lastSyncedAt: snapTradeConnection?.last_synced_at || null,
            }}
          />
        </SectionCard>

        <SectionCard title="How this should work" description="The OpenAI token is for research and summarising source pages. Bank data still needs a financial-data provider and consent flow.">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-bold text-slate-950">Banking</p>
              <p className="mt-2 text-sm text-slate-600">Use Open Banking/Open Finance providers for account access. GPT should not be given bank credentials and should not be treated as the banking connection.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-bold text-slate-950">Rates and thresholds</p>
              <p className="mt-2 text-sm text-slate-600">Use GOV.UK/official source checks for SMP, student loans, tax and stamp duty. Store the date checked, rate and source URL before using the number in calculators.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-bold text-slate-950">Mortgage rates</p>
              <p className="mt-2 text-sm text-slate-600">Start with manual lender rates attached to homes. Later, OpenAI can create research notes against each home/rate scenario from sourced pages.</p>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="OpenAI token for mortgage-rate and statutory-rate research" description="For local development, paste a project-scoped OpenAI API key here rather than putting it in a NEXT_PUBLIC variable. Before production, move this to a proper vault or managed secret store.">
          <form action={saveIntegrationSecret} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <input type="hidden" name="provider" value="openai" />
            <FormInput label="Key label" name="key_label" defaultValue="OpenAI mortgage research" />
            <label className="block lg:col-span-2">
              <span className="text-sm font-medium text-slate-700">API token</span>
              <input
                name="secret_value"
                type="password"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-orange-500 focus:ring-2"
                placeholder="sk-..."
                autoComplete="off"
                required
              />
            </label>
            <div className="flex items-end"><SubmitButton>Save token</SubmitButton></div>
          </form>
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Use this only server-side for mortgage-rate research, statutory-rate checks and summarisation tasks. The app should never send this key to client components, and it should not be used in any variable starting <code>NEXT_PUBLIC_</code>.
          </div>
        </SectionCard>

        <SectionCard title="Statutory rate assumptions" description="Store official rates you have checked, so calculators have an audit trail. Later the OpenAI token can help check GOV.UK pages and prepare a suggested update, but you should still review before saving.">
          <form action={saveStatutoryRateAssumption} className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Rate key</span>
              <select name="rate_key" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-orange-500 focus:ring-2">
                <option value="smp_weekly_rate">SMP weekly rate</option>
                <option value="student_loan_plan_1_threshold">Student loan Plan 1 threshold</option>
                <option value="tax_personal_allowance">Tax personal allowance</option>
                <option value="stamp_duty_band">Stamp duty band</option>
                <option value="mortgage_rate_assumption">Mortgage rate assumption</option>
              </select>
            </label>
            <FormInput label="Label" name="label" defaultValue="SMP weekly rate 2026/27" />
            <FormInput label="Numeric value" name="value_numeric" type="number" step="0.0001" defaultValue={194.32} />
            <FormInput label="Effective from" name="effective_from" type="date" defaultValue="2026-04-05" />
            <FormInput label="Effective until" name="effective_until" type="date" />
            <FormInput label="Source name" name="source_name" defaultValue="GOV.UK" />
            <FormInput label="Source URL" name="source_url" placeholder="Paste GOV.UK or lender source URL" />
            <FormInput label="Notes" name="notes" placeholder="Checked manually / AI suggested / payroll confirmed" />
            <div className="flex items-end"><SubmitButton>Save rate</SubmitButton></div>
          </form>

          <div className="mt-5 space-y-3">
            {(statutoryRates ?? []).map((rate) => (
              <div key={rate.id} className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 p-4">
                <div>
                  <p className="font-semibold text-slate-950">{rate.label}</p>
                  <p className="text-sm text-slate-500">{rate.rate_key.replaceAll("_", " ")} · {rate.value_numeric ?? rate.value_text ?? "No value"}</p>
                  <p className="mt-1 text-xs text-slate-500">Effective {rate.effective_from ?? "unknown"} → {rate.effective_until ?? "ongoing"} · checked {rate.checked_at.slice(0, 10)}</p>
                  {rate.source_name || rate.source_url ? <p className="mt-1 text-xs text-slate-500">Source: {rate.source_name ?? "source"}{rate.source_url ? ` · ${rate.source_url}` : ""}</p> : null}
                </div>
                <form action={deleteStatutoryRateAssumption}>
                  <input type="hidden" name="id" value={rate.id} />
                  <button className="text-sm font-medium text-red-600">Delete</button>
                </form>
              </div>
            ))}
            {(statutoryRates ?? []).length === 0 ? <p className="text-sm text-slate-500">No statutory rates saved yet. Add the current SMP rate and source first.</p> : null}
          </div>
        </SectionCard>

        <SectionCard title="Saved API tokens">
          <div className="space-y-3">
            {(secrets ?? []).map((secret) => (
              <div key={secret.id} className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 p-4">
                <div>
                  <p className="font-semibold text-slate-950">{secret.key_label}</p>
                  <p className="text-sm capitalize text-slate-500">{secret.provider} · {secret.status}</p>
                  <p className="mt-1 text-xs text-slate-500">Stored token hidden · saved {secret.created_at.slice(0, 10)}</p>
                </div>
                <form action={deleteIntegrationSecret}>
                  <input type="hidden" name="id" value={secret.id} />
                  <button className="text-sm font-medium text-red-600">Delete</button>
                </form>
              </div>
            ))}
            {(secrets ?? []).length === 0 ? <p className="text-sm text-slate-500">No API tokens saved yet.</p> : null}
          </div>
        </SectionCard>

        <SectionCard title="Recommended integration path">
          <div className="grid gap-4 lg:grid-cols-2">
            {integrationProviderPlan.map((item) => (
              <div key={item.area} className="rounded-2xl border border-slate-200 p-5">
                <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{item.area}</p>
                <h3 className="mt-1 font-semibold text-slate-950">{item.recommended}</h3>
                <p className="mt-2 text-sm text-slate-600">{item.status}</p>
                <p className="mt-2 text-sm text-slate-500">{item.notes}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Add planned connection">
          <form action={addIntegrationConnection} className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <FormInput label="Provider" name="provider" placeholder="TrueLayer, Moneyhub, Vanguard, Land Registry" required />
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Type</span>
              <select name="connection_type" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-orange-500 focus:ring-2">
                <option value="open_banking">Open Banking</option>
                <option value="banking">Banking/manual</option>
                <option value="open_finance">Open Finance/investments</option>
                <option value="investment">Investment/manual</option>
                <option value="property">Property</option>
                <option value="property_valuation">Property valuation</option>
                <option value="geocoding">Geocoding</option>
                <option value="maps">Maps</option>
                <option value="mortgage_rates">Mortgage rates</option>
                <option value="statutory_rates">Statutory/tax rates</option>
                <option value="ai_research">AI research</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Status</span>
              <select name="status" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-orange-500 focus:ring-2">
                <option value="planned">Planned</option>
                <option value="sandbox">Sandbox</option>
                <option value="connected">Connected</option>
                <option value="needs_reauth">Needs reauth</option>
                <option value="disabled">Disabled</option>
              </select>
            </label>
            <FormInput label="Notes" name="notes" placeholder="Coverage, cost, API notes" />
            <div className="flex items-end"><SubmitButton>Add connection</SubmitButton></div>
          </form>
        </SectionCard>

        <SectionCard title="Connection tracker">
          <div className="space-y-3">
            {(connections ?? []).map((connection) => (
              <div key={connection.id} className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 p-4">
                <div>
                  <p className="font-semibold text-slate-950">{connection.provider}</p>
                  <p className="text-sm capitalize text-slate-500">{connection.connection_type.replaceAll("_", " ")} · {connection.status.replaceAll("_", " ")}</p>
                  {connection.notes ? <p className="mt-2 text-sm text-slate-600">{connection.notes}</p> : null}
                </div>
                <form action={deleteIntegrationConnection}>
                  <input type="hidden" name="id" value={connection.id} />
                  <button className="text-sm font-medium text-red-600">Delete</button>
                </form>
              </div>
            ))}
            {(connections ?? []).length === 0 ? <p className="text-sm text-slate-500">No planned integrations yet.</p> : null}
          </div>
        </SectionCard>
      </main>
    </>
  );
}

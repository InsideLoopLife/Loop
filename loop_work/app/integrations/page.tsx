import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { SectionCard } from "@/components/SectionCard";
import { SnapTradeAccountImportPanel } from "@/components/integrations/SnapTradeAccountImportPanel";
import { createClient } from "@/lib/supabase/server";
import { investmentDataEntitlementForProfile } from "@/lib/wealth/user-tiers";
import { deleteIntegrationConnection } from "./actions";

type IntegrationConnection = {
  id: string;
  provider: string;
  connection_type: string;
  status: string;
  notes: string | null;
  consent_expires_at: string | null;
  last_synced_at: string | null;
};

function connectionStatusClass(status: string) {
  const clean = String(status || "").toLowerCase();
  if (["connected", "synced", "active"].includes(clean)) return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  if (["needs_reauth", "expired", "warning"].includes(clean)) return "bg-amber-50 text-amber-700 ring-amber-100";
  return "bg-slate-50 text-slate-600 ring-slate-100";
}

export default async function IntegrationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: connections }, { data: profile }, { data: snapTradeConnection }] = await Promise.all([
    supabase
      .from("integration_connections")
      .select("id, provider, connection_type, status, notes, consent_expires_at, last_synced_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .returns<IntegrationConnection[]>(),
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
          <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">User integrations</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-950 md:text-5xl">Integrations</h1>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
            Connect and manage your own broker/account connections. Admin-only source catalogues, statutory rates, API keys and future provider setup now live under Admin.
          </p>
        </div>

        <SectionCard title="Brokerage accounts" description="Connect SnapTrade/Trading 212 and choose exactly which ISA, GIA or SIPP accounts appear as separate investment pots.">
          <SnapTradeAccountImportPanel
            enabled={investmentDataEntitlementForProfile(profile).canConnectPaidProvider}
            connection={{
              connected:
                String(snapTradeConnection?.status || "").toLowerCase() === "connected" ||
                profile?.market_data_provider_status === "connected",
              status: snapTradeConnection?.status || null,
              externalConnectionId: snapTradeConnection?.external_connection_id || null,
              lastSyncedAt: snapTradeConnection?.last_synced_at || null,
            }}
          />
        </SectionCard>

        <SectionCard title="Connection tracker" description="These are the user-level connections attached to your LOOP account. Admin platform integrations are deliberately not shown here.">
          <div className="space-y-3">
            {(connections ?? []).map((connection) => (
              <div key={connection.id} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-black text-slate-950">{connection.provider}</p>
                    <span className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${connectionStatusClass(connection.status)}`}>
                      {connection.status.replaceAll("_", " ")}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-semibold capitalize text-slate-500">{connection.connection_type.replaceAll("_", " ")}</p>
                  {connection.last_synced_at ? <p className="mt-1 text-xs font-bold text-slate-400">Last synced {connection.last_synced_at.slice(0, 16).replace("T", " ")}</p> : null}
                  {connection.consent_expires_at ? <p className="mt-1 text-xs font-bold text-amber-600">Consent expires {connection.consent_expires_at.slice(0, 10)}</p> : null}
                </div>
                <form action={deleteIntegrationConnection}>
                  <input type="hidden" name="id" value={connection.id} />
                  <button className="rounded-full bg-slate-100 px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-200">Remove</button>
                </form>
              </div>
            ))}
            {(connections ?? []).length === 0 ? <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm font-bold text-slate-500">No user-level integrations connected yet.</p> : null}
          </div>
        </SectionCard>
      </main>
    </>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { createClient } from "@/lib/supabase/server";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SnapTradeCallbackPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const status = String(first(params.status) || first(params.connection_status) || "unknown").toUpperCase();
  const connectionId = String(first(params.connection_id) || first(params.connectionId) || first(params.brokerage_authorization_id) || first(params.brokerageAuthorizationId) || "");
  const errorMessage = String(first(params.error) || first(params.message) || "");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/integrations/snaptrade/callback")}`);

  const isSuccess = status === "SUCCESS" || status === "CONNECTED" || status === "OK";
  let saveError: string | null = null;

  if (isSuccess) {
    const payload = {
      user_id: user.id,
      provider: "SnapTrade",
      connection_type: "open_finance",
      status: "connected",
      external_connection_id: connectionId || null,
      category: "wealth",
      review_status: "active",
      verified_by: "provider_callback",
      last_synced_at: new Date().toISOString(),
      notes: connectionId ? `SnapTrade callback success. Connection ID: ${connectionId}` : "SnapTrade callback success.",
    } as Record<string, any>;

    const existing = connectionId
      ? await supabase
          .from("integration_connections")
          .select("id")
          .eq("user_id", user.id)
          .eq("provider", "SnapTrade")
          .eq("external_connection_id", connectionId)
          .maybeSingle()
      : await supabase
          .from("integration_connections")
          .select("id")
          .eq("user_id", user.id)
          .eq("provider", "SnapTrade")
          .is("external_connection_id", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

    const write = existing.data?.id
      ? await supabase.from("integration_connections").update(payload).eq("id", existing.data.id).eq("user_id", user.id)
      : await supabase.from("integration_connections").insert(payload);

    if (write.error) saveError = write.error.message;

    await supabase
      .from("app_user_profiles")
      .update({ market_data_provider_status: "connected" })
      .eq("user_id", user.id)
      .then(() => null, () => null);
  }

  return (
    <>
      <Nav />
      <main className="mx-auto w-[95vw] max-w-[2000px] space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <section className={`rounded-[2rem] border p-8 shadow-xl ${isSuccess && !saveError ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
          <p className={`text-xs font-black uppercase tracking-[0.22em] ${isSuccess && !saveError ? "text-emerald-700" : "text-red-700"}`}>SnapTrade callback</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-950">
            {isSuccess && !saveError ? "Broker connection saved" : "Broker connection needs attention"}
          </h1>
          <p className="mt-3 max-w-3xl text-sm font-bold text-slate-700">
            {isSuccess && !saveError
              ? "LOOP received the SnapTrade success callback and marked your provider connection as live. Go back to Investments to review the accounts returned by SnapTrade and choose which ones to import/track."
              : saveError || errorMessage || "SnapTrade returned without a successful connection status."}
          </p>
          {connectionId ? <p className="mt-4 rounded-2xl bg-white/80 px-4 py-3 text-sm font-black text-slate-700">Connection ID: {connectionId}</p> : null}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/investments" className="rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white">Review/import accounts</Link>
            <Link href="/integrations" className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700">View integrations</Link>
          </div>
        </section>
      </main>
    </>
  );
}

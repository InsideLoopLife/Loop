import type React from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { approveInboundImport, claimInboundAlias, rejectInboundImport } from "./actions";

export const dynamic = "force-dynamic";

function StatusPill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-slate-600">{children}</span>;
}

export default async function InboundEmailPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: aliasRows }, { data: imports }, { data: plan }] = await Promise.all([
    supabase.from("loop_inbound_aliases").select("*").eq("user_id", user.id).limit(1),
    supabase.from("loop_inbound_imports").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(25),
    supabase.rpc("app_get_my_plan"),
  ]);

  const alias = aliasRows?.[0];
  const currentPlan = (plan as any)?.current_plan?.name || "Free";
  const premium = ["Plus", "Pro", "Premium", "Extra", "Founder"].some((name) => currentPlan.toLowerCase().includes(name.toLowerCase()));

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <section className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-xl">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">Premium automation</p>
        <h1 className="mt-2 text-3xl font-black">Email-to-LOOP</h1>
        <p className="mt-3 max-w-3xl text-sm font-semibold text-slate-300">
          Send property URLs or stock tickers to your personal LOOP address. The system only accepts mail from your verified login email and stages everything for review before it updates your account.
        </p>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <StatusPill>{currentPlan}</StatusPill>
            <h2 className="mt-3 text-2xl font-black text-slate-950">Your inbound alias</h2>
            {alias ? (
              <p className="mt-2 text-xl font-black text-blue-700">{alias.alias}@{alias.domain}</p>
            ) : (
              <p className="mt-2 text-sm font-bold text-slate-500">No alias has been claimed yet. Premium users can claim one automatically, without admin setup.</p>
            )}
            <p className="mt-2 text-xs font-bold text-slate-400">Allowed sender: {user.email}</p>
          </div>
          {!alias && (
            <form action={claimInboundAlias} className="min-w-80 rounded-3xl bg-slate-50 p-4">
              <label className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Choose alias</label>
              <div className="mt-2 flex overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <input name="alias" placeholder="danmunstar" className="min-w-0 flex-1 px-4 py-3 text-sm font-bold outline-none" />
                <span className="bg-slate-100 px-3 py-3 text-sm font-black text-slate-500">@inbox.insideloop.life</span>
              </div>
              <button className="mt-3 w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white">Claim alias</button>
              {!premium && <p className="mt-2 text-xs font-bold text-amber-700">This will unlock once the user is on a paid tier.</p>}
            </form>
          )}
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-black text-slate-950">Review imports</h2>
        <p className="mt-1 text-sm font-bold text-slate-500">Inbound items land here first. Property URLs can then use the existing property scraper; tickers can feed the investment/watch analysis flow.</p>
        <div className="mt-5 space-y-3">
          {(imports || []).length ? imports?.map((item: any) => (
            <div key={item.id} className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{item.import_kind} · {item.status}</p>
                  <p className="mt-1 break-all text-sm font-black text-slate-950">{item.source_value}</p>
                  {item.title && <p className="mt-1 text-sm font-bold text-slate-500">{item.title}</p>}
                </div>
                <div className="flex gap-2">
                  {!["imported", "rejected", "blocked"].includes(item.status) && (
                    <form action={approveInboundImport}>
                      <input type="hidden" name="id" value={item.id} />
                      <button className="rounded-full bg-blue-600 px-4 py-2 text-xs font-black text-white shadow-sm">Approve</button>
                    </form>
                  )}
                  {!["imported", "rejected", "blocked"].includes(item.status) && (
                    <form action={rejectInboundImport}>
                      <input type="hidden" name="id" value={item.id} />
                      <button className="rounded-full bg-white px-4 py-2 text-xs font-black text-slate-600 shadow-sm">Reject</button>
                    </form>
                  )}
                </div>
              </div>
            </div>
          )) : (
            <div className="rounded-3xl bg-slate-50 p-6 text-sm font-bold text-slate-500">No inbound imports yet.</div>
          )}
        </div>
      </section>
    </main>
  );
}

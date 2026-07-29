import { AdminTabs } from "@/components/admin/AdminTabs";
import { createClient } from "@/lib/supabase/server";
import { createBestAdminClient, requireAdminAccess } from "@/lib/admin/access";
import { saveBetaFlag, createPrivateBetaCode, disablePrivateBetaCode, enablePrivateBetaCode, deletePrivateBetaCode } from "./actions";

const defaults = [
  { flag_key: "site_beta_enabled", label: "Whole site beta mode", scope: "site", description: "Marks the whole product as beta and allows beta-only UI copy/features.", enabled: true, rollout_percent: 100, requires_admin_approval: false },
  { flag_key: "private_beta_access_gate", label: "Private beta access gate", scope: "site", description: "Require a server-validated access code before login/sign-up.", enabled: true, rollout_percent: 100, requires_admin_approval: false },
  { flag_key: "manual_upgrade_review", label: "Manual upgrade review", scope: "tiers", description: "Upgrade requests stay pending and appear in Admin → Tiers.", enabled: true, rollout_percent: 100, requires_admin_approval: true },
  { flag_key: "auto_approve_paid_tier_requests", label: "Auto-approve paid tier requests", scope: "tiers", description: "When billing is wired, paid plan requests can be moved automatically instead of pending review.", enabled: false, rollout_percent: 0, requires_admin_approval: false },
  { flag_key: "new_savings_ladder", label: "Savings ladder beta", scope: "wealth", description: "Use the savings/cash ladder in place of live current-account tracking.", enabled: true, rollout_percent: 100, requires_admin_approval: false },
];

function rowValue(flag: any, key: string) {
  return flag?.[key] ?? defaults.find((item) => item.flag_key === flag?.flag_key)?.[key as keyof typeof defaults[number]] ?? "";
}

function FlagForm({ flag }: { flag: any }) {
  return (
    <form action={saveBetaFlag} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-700">{rowValue(flag, "scope") || "site"}</p>
          <h3 className="mt-1 text-xl font-black text-slate-950">{rowValue(flag, "label") || flag.flag_key}</h3>
        </div>
        <label className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-2 text-xs font-black text-slate-700"><input type="checkbox" name="enabled" defaultChecked={Boolean(flag.enabled)} /> Enabled</label>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <input name="flag_key" defaultValue={flag.flag_key} readOnly className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-bold text-slate-500" />
        <input name="label" defaultValue={rowValue(flag, "label")} className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
        <select name="scope" defaultValue={rowValue(flag, "scope") || "site"} className="rounded-2xl border border-slate-200 px-4 py-3 font-bold"><option value="site">Site</option><option value="tiers">Tiers</option><option value="wealth">Wealth</option><option value="health">Health</option><option value="admin">Admin</option></select>
        <input name="rollout_percent" type="number" min="0" max="100" defaultValue={rowValue(flag, "rollout_percent") || 0} className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
        <textarea name="description" defaultValue={rowValue(flag, "description")} placeholder="What this flag controls" className="min-h-20 rounded-2xl border border-slate-200 px-4 py-3 font-bold md:col-span-2" />
        <textarea name="notes" defaultValue={flag.notes || ""} placeholder="Internal notes" className="min-h-16 rounded-2xl border border-slate-200 px-4 py-3 font-bold md:col-span-2" />
        <label className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900"><input type="checkbox" name="requires_admin_approval" defaultChecked={Boolean(rowValue(flag, "requires_admin_approval"))} className="mr-2" /> Requires admin approval</label>
        <button className="rounded-2xl bg-slate-950 px-5 py-3 font-black text-white">Save beta flag</button>
      </div>
    </form>
  );
}

function CodeStatus({ code }: { code: any }) {
  const disabled = Boolean(code.disabled_at);
  const expired = code.expires_at ? new Date(code.expires_at).getTime() < Date.now() : false;
  const usedUp = Number(code.max_uses || 0) > 0 && Number(code.used_count || 0) >= Number(code.max_uses || 0);
  const tone = disabled ? "bg-slate-100 text-slate-600" : expired || usedUp ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800";
  const label = disabled ? "Disabled" : expired ? "Expired" : usedUp ? "Used up" : "Active";
  return <span className={`rounded-full px-3 py-1 text-xs font-black ${tone}`}>{label}</span>;
}

function BetaCodeRow({ code }: { code: any }) {
  return (
    <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><h3 className="text-lg font-black text-slate-950">{code.label || "Private beta code"}</h3><CodeStatus code={code} /></div>
          <p className="mt-1 text-xs font-bold text-slate-500">Hash prefix: {code.code_hash_prefix || String(code.code_hash || "").slice(0, 12)} · Created {code.created_at ? new Date(code.created_at).toLocaleDateString() : "unknown"}</p>
        </div>
        <div className="text-right text-sm font-black text-slate-700">{Number(code.used_count || 0)} / {Number(code.max_uses || 0) || "∞"} uses</div>
      </div>
      <div className="mt-4 grid gap-3 text-sm font-bold text-slate-600 md:grid-cols-3">
        <div className="rounded-2xl bg-slate-50 p-3"><span className="block text-[10px] uppercase tracking-wide text-slate-400">Expires</span>{code.expires_at ? new Date(code.expires_at).toLocaleString() : "No expiry"}</div>
        <div className="rounded-2xl bg-slate-50 p-3"><span className="block text-[10px] uppercase tracking-wide text-slate-400">Last used</span>{code.last_used_at ? new Date(code.last_used_at).toLocaleString() : "Not yet"}</div>
        <div className="rounded-2xl bg-slate-50 p-3"><span className="block text-[10px] uppercase tracking-wide text-slate-400">Notes</span>{code.notes || "—"}</div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {code.disabled_at ? (
          <form action={enablePrivateBetaCode}><input type="hidden" name="id" value={code.id} /><button className="rounded-full bg-emerald-700 px-4 py-2 text-xs font-black text-white">Enable</button></form>
        ) : (
          <form action={disablePrivateBetaCode}><input type="hidden" name="id" value={code.id} /><button className="rounded-full bg-amber-100 px-4 py-2 text-xs font-black text-amber-900">Disable</button></form>
        )}
        <form action={deletePrivateBetaCode}><input type="hidden" name="id" value={code.id} /><button className="rounded-full bg-red-50 px-4 py-2 text-xs font-black text-red-700">Delete hash</button></form>
      </div>
    </div>
  );
}

export default async function AdminBetaPage() {
  await requireAdminAccess();
  const supabase = await createClient();
  const { data, error } = await supabase.from("app_beta_flags").select("*").order("scope").order("flag_key");
  const flags = data?.length ? data : defaults;

  const adminSupabase = createBestAdminClient();
  const codeResult = adminSupabase
    ? await adminSupabase.from("private_beta_codes").select("*").order("created_at", { ascending: false }).limit(50)
    : { data: null, error: { message: "Add SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY to manage private beta codes." } as any };
  const codes = codeResult.data || [];

  return (
    <main className="mx-auto w-[95vw] max-w-[2000px] space-y-6 p-4">
      <section className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">Admin beta</p>
        <h1 className="mt-2 text-4xl font-black">Private beta access + release switches</h1>
        <p className="mt-3 max-w-4xl text-sm font-bold text-white/75">Create hashed invite codes, keep the login wall active, and manage staged beta flags while InsideLoop runs on localhost and insideloop.life against the same Supabase project.</p>
      </section>
      <AdminTabs />

      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <form action={createPrivateBetaCode} className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-700">Access codes</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950">Create private beta code</h2>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-600">The code below is never stored in plain text. It is normalised, HMAC-hashed server-side, and only the hash is saved.</p>
          <div className="mt-4 grid gap-3">
            <label className="block"><span className="text-sm font-black text-slate-700">Label</span><input name="label" placeholder="Founders family invite" required className="mt-1 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 font-bold" /></label>
            <label className="block"><span className="text-sm font-black text-slate-700">Access code</span><input name="plain_code" type="password" autoComplete="off" spellCheck={false} placeholder="Type the code you will share" required minLength={6} className="mt-1 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 font-black tracking-[0.14em]" /></label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block"><span className="text-sm font-black text-slate-700">Max uses</span><input name="max_uses" type="number" min="1" defaultValue="1" className="mt-1 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 font-bold" /></label>
              <label className="block"><span className="text-sm font-black text-slate-700">Expires</span><input name="expires_at" type="datetime-local" className="mt-1 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 font-bold" /></label>
            </div>
            <textarea name="notes" placeholder="Internal notes only" className="min-h-20 rounded-2xl border border-emerald-200 bg-white px-4 py-3 font-bold" />
            <button className="rounded-2xl bg-slate-950 px-5 py-3 font-black text-white">Create hashed code</button>
          </div>
        </form>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Deployment guard</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950">Private beta deployment settings</h2>
          <div className="mt-4 grid gap-3 text-sm font-bold text-slate-700 md:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-4"><span className="block text-[10px] uppercase tracking-wide text-slate-400">Production domain</span>https://insideloop.life</div>
            <div className="rounded-2xl bg-slate-50 p-4"><span className="block text-[10px] uppercase tracking-wide text-slate-400">Local beta URL</span>http://localhost:3000</div>
            <div className="rounded-2xl bg-slate-50 p-4"><span className="block text-[10px] uppercase tracking-wide text-slate-400">Gate env</span>LOOP_BETA_GATE_ENABLED=true</div>
            <div className="rounded-2xl bg-slate-50 p-4"><span className="block text-[10px] uppercase tracking-wide text-slate-400">Do not expose</span>LOOP_BETA_CODE_PEPPER / LOOP_BETA_COOKIE_SECRET</div>
          </div>
          {codeResult.error ? <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">{codeResult.error.message}</div> : null}
        </section>
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div><p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Invite list</p><h2 className="text-2xl font-black text-slate-950">Private beta codes</h2></div>
          <p className="text-sm font-bold text-slate-500">Only hash prefixes are shown.</p>
        </div>
        {codes.length ? <div className="grid gap-3 xl:grid-cols-2">{codes.map((code: any) => <BetaCodeRow key={code.id} code={code} />)}</div> : <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-6 text-sm font-bold text-slate-600">No database beta codes yet. Create the first one above after running <code>db/v28_51_private_beta_access_gate.sql</code>.</div>}
      </section>

      {error ? <section className="rounded-[2rem] border border-rose-200 bg-rose-50 p-5 text-sm font-bold text-rose-900">Run <code>db/v27_88_investment_ticker_tiers_beta_fix.sql</code> to create the beta flags table. Showing default flags only.</section> : null}
      <section className="grid gap-4 xl:grid-cols-2">{flags.map((flag: any) => <FlagForm key={flag.flag_key} flag={flag} />)}</section>
    </main>
  );
}

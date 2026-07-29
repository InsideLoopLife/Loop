import Link from "next/link";
import { redirect } from "next/navigation";
import { Mail, Send, ShieldAlert } from "lucide-react";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import { createClient } from "@/lib/supabase/server";
import { createBestAdminClient, getAdminAccess } from "@/lib/admin/access";
import { createDigestPreview, saveEmailTemplate, sendTestDigest } from "../actions";

const inputClass = "mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none ring-orange-500 transition focus:ring-2";

function fmtDate(value?: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "—";
  }
}

export default async function AdminEmailFormatsPage() {
  const access = await getAdminAccess();
  if (!access.user) redirect(`/login?next=${encodeURIComponent("/admin/email-formats")}`);

  if (!access.isAdmin) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10 md:px-6">
        <section className="rounded-[2rem] border border-red-100 bg-red-50 p-8">
          <div className="flex items-start gap-4"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-red-600 text-white"><ShieldAlert className="h-6 w-6" /></span><div><h1 className="text-2xl font-black text-red-950">Admin access is not enabled</h1><p className="mt-2 text-sm font-bold text-red-700">You are signed in as {access.user.email || "unknown email"}.</p></div></div>
        </section>
      </main>
    );
  }

  const supabase = createBestAdminClient() || await createClient();
  const [{ data: templates, error: templateError }, { data: runs }, { data: users }] = await Promise.all([
    supabase.from("app_email_templates").select("*").order("category").order("name"),
    supabase.from("app_email_runs").select("*").order("created_at", { ascending: false }).limit(20),
    supabase.rpc("loop_admin_users_list", { p_limit: 100 }),
  ]);
  const enabledTemplates = (templates || []).filter((template: any) => template.enabled).length;
  const failedRuns = (runs || []).filter((run: any) => run.status === "failed").length;

  return (
    <main className="mx-auto w-[95vw] max-w-none space-y-8 px-4 py-8 md:px-6">
      <section className="relative overflow-hidden rounded-[2.5rem] bg-slate-950 p-7 text-white shadow-[0_30px_120px_-70px_rgba(15,23,42,.9)]">
        <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-wide text-white/80"><Mail className="h-4 w-4" /> Admin email formats</div>
            <h1 className="text-4xl font-black tracking-tight md:text-5xl">Email templates and test sends</h1>
            <p className="mt-3 max-w-4xl text-sm font-medium leading-6 text-white/72">Email formatting now lives in its own replaceable admin tab instead of being buried in the main control centre.</p>
          </div>
          <Link href="/admin/notifications" className="rounded-full bg-white px-5 py-3 text-sm font-black text-slate-950">Open notifications</Link>
        </div>
      </section>

      <AdminTabs />

      {templateError ? <section className="rounded-[2rem] border border-rose-200 bg-rose-50 p-5 text-sm font-bold text-rose-900">{templateError.message}</section> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="Templates" value={String((templates || []).length)} helper={`${enabledTemplates} enabled`} />
        <StatCard title="Recent runs" value={String((runs || []).length)} helper={`${failedRuns} failed`} />
        <StatCard title="Preview users" value={String((users || []).length)} helper="from admin user RPC" />
      </div>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
        <SectionCard title="Email templates" description="Templates use variables such as {{monthly_income}}, {{monthly_outgoings}}, {{finance_nudges}} and {{meal_nudges}}.">
          <div className="space-y-4">
            {(templates || []).map((template: any) => (
              <article key={template.id} className="rounded-3xl border border-slate-200/80 bg-white/80 p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-black text-slate-950">{template.name}</p>
                    <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">{template.template_key} · {template.category} · {template.cadence}</p>
                    <p className="mt-2 text-sm font-medium text-slate-600">{template.subject}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-black ${template.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{template.enabled ? "Enabled" : "Off"}</span>
                </div>
                <div className="mt-4 grid gap-2 md:grid-cols-2">
                  <form action={createDigestPreview} className="rounded-2xl bg-slate-50 p-3">
                    <input type="hidden" name="template_id" value={template.id} />
                    <label className="text-xs font-black text-slate-500">Preview as user</label>
                    <select name="target_user_id" defaultValue={access.user.id} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold">
                      <option value={access.user.id}>Me</option>
                      {(users || []).map((user: any) => <option key={user.user_id} value={user.user_id}>{user.display_name || user.email || user.user_id}</option>)}
                    </select>
                    <button className="mt-2 w-full rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white">Create preview</button>
                  </form>
                  <form action={sendTestDigest} className="rounded-2xl bg-slate-50 p-3">
                    <input type="hidden" name="template_id" value={template.id} />
                    <input type="hidden" name="target_user_id" value={access.user.id} />
                    <label className="text-xs font-black text-slate-500">Send test to</label>
                    <input name="target_email" defaultValue={access.user.email || ""} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold" />
                    <button className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-black text-white"><Send className="h-4 w-4" /> Send test</button>
                  </form>
                </div>
              </article>
            ))}
            {!templates?.length ? <p className="rounded-3xl border border-dashed border-slate-300 p-5 text-sm font-bold text-slate-500">No templates found. Add the first email format using the form.</p> : null}
          </div>
        </SectionCard>

        <SectionCard title="Add / edit template" description="Use a stable template key so future jobs can call the same email format.">
          <form action={saveEmailTemplate} className="space-y-4">
            <label><span className="text-sm font-black text-slate-700">Template key</span><input name="template_key" required placeholder="weekly_custom_digest" className={inputClass} /></label>
            <label><span className="text-sm font-black text-slate-700">Name</span><input name="name" required placeholder="Weekly money digest" className={inputClass} /></label>
            <div className="grid gap-3 md:grid-cols-2">
              <label><span className="text-sm font-black text-slate-700">Category</span><select name="category" className={inputClass}><option value="finance">Finance</option><option value="health">Health</option><option value="household">Household</option><option value="platform">Platform</option><option value="security">Security</option><option value="admin">Admin</option></select></label>
              <label><span className="text-sm font-black text-slate-700">Cadence</span><select name="cadence" className={inputClass}><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="event">Event based</option><option value="manual">Manual</option></select></label>
            </div>
            <label><span className="text-sm font-black text-slate-700">Subject</span><input name="subject" required placeholder="Your LOOP weekly update" className={inputClass} /></label>
            <label><span className="text-sm font-black text-slate-700">Preheader</span><input name="preheader" placeholder="A short inbox preview" className={inputClass} /></label>
            <label><span className="text-sm font-black text-slate-700">Body markdown</span><textarea name="body_markdown" required rows={10} placeholder="Hi {{first_name}}, ..." className={`${inputClass} min-h-[220px] resize-y`} /></label>
            <label className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4 text-sm font-black text-slate-700"><input type="checkbox" name="enabled" defaultChecked /> Enabled</label>
            <button className="w-full rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white">Save template</button>
          </form>
        </SectionCard>
      </section>

      <SectionCard title="Recent email runs" description="Preview and test-send history. Errors here are useful for notification/runtime issue checks.">
        <div className="overflow-hidden rounded-3xl border border-slate-200">
          <div className="grid grid-cols-[1fr_.7fr_.7fr_1fr] bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-wide text-slate-400">
            <span>Subject</span><span>Type</span><span>Status</span><span>Created</span>
          </div>
          {(runs || []).map((run: any) => (
            <article key={run.id} className="grid grid-cols-[1fr_.7fr_.7fr_1fr] items-center gap-3 border-t border-slate-100 px-4 py-3 text-sm">
              <p className="font-black text-slate-950">{run.subject || "Untitled run"}</p>
              <p className="font-bold text-slate-500">{run.run_type || "run"}</p>
              <p className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-black ${run.status === "sent" ? "bg-emerald-100 text-emerald-800" : run.status === "failed" ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-700"}`}>{run.status || "created"}</p>
              <p className="text-xs font-bold text-slate-500">{fmtDate(run.created_at)}</p>
            </article>
          ))}
          {!runs?.length ? <p className="border-t border-slate-100 p-5 text-sm font-bold text-slate-500">No email runs found yet.</p> : null}
        </div>
      </SectionCard>
    </main>
  );
}

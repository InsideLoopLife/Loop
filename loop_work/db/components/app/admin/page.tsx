import { redirect } from "next/navigation";
import { BellRing, Crown, Mail, ShieldAlert, Sparkles } from "lucide-react";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import { createClient } from "@/lib/supabase/server";
import { createBestAdminClient, getAdminAccess } from "@/lib/admin/access";
import { createDigestPreview, createInsightNotification, saveEmailTemplate, sendTestDigest } from "./actions";

function inputClass() {
  return "mt-1 w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm font-semibold outline-none ring-orange-500 transition focus:ring-2";
}

export default async function AdminPage() {
  const access = await getAdminAccess();
  if (!access.user) redirect("/login");

  const supabase = createBestAdminClient() || await createClient();

  if (!access.isAdmin) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10 md:px-6">
        <section className="rounded-[2rem] border border-red-100 bg-red-50 p-8">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-red-600 text-white"><ShieldAlert className="h-6 w-6" /></span>
            <div>
              <h1 className="text-2xl font-black text-red-950">Admin access is not enabled for this account</h1>
              <p className="mt-2 text-sm font-bold text-red-700">Add your email to APP_CREATOR_EMAILS or insert it into app_admin_users after running db/v22_account_admin_schema.sql.</p>
            </div>
          </div>
        </section>
      </main>
    );
  }

  const [templatesResult, runsResult, notificationsResult, usersResult] = await Promise.all([
    supabase.from("app_email_templates").select("*").order("category").order("name"),
    supabase.from("app_email_runs").select("*").order("created_at", { ascending: false }).limit(10),
    supabase.from("app_notifications").select("id, status, severity, title, created_at").order("created_at", { ascending: false }).limit(10),
    supabase.from("app_user_profiles").select("user_id, display_name, email").order("updated_at", { ascending: false }).limit(50),
  ]);

  const templates = templatesResult.data || [];
  const runs = runsResult.data || [];
  const notifications = notificationsResult.data || [];
  const users = usersResult.data || [];
  const defaultUserId = access.user.id;
  const defaultEmail = access.user.email || "";

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 md:px-6">
      <section className="relative overflow-hidden rounded-[2rem] bg-slate-950 p-7 text-white shadow-[0_30px_120px_-70px_rgba(15,23,42,.9)]">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-orange-500/30 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-wide text-white/80">
              <Crown className="h-4 w-4" /> Creator admin
            </div>
            <h1 className="text-4xl font-black tracking-tight">Insight engine & email control</h1>
            <p className="mt-2 max-w-3xl text-sm font-medium text-white/70">Format weekly/monthly email updates, create in-app nudges and test how spending, savings and health insights will feel.</p>
          </div>
          <div className="rounded-3xl border border-white/15 bg-white/10 p-5 text-sm font-bold text-white/75">
            Access via: <span className="text-white">{access.reason}</span>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Templates" value={String(templates.length)} helper="Email formats" />
        <StatCard title="Recent runs" value={String(runs.length)} helper="Preview/test sends" />
        <StatCard title="Recent notifications" value={String(notifications.length)} helper="In-app nudges" />
        <StatCard title="Profiles" value={String(users.length)} helper="Known account profiles" />
      </div>

      <SectionCard title="Create a useful nudge" description="Send an in-app notification to yourself or a selected user. This is useful for testing spending, savings and food/health morale nudges.">
        <form action={createInsightNotification} className="grid gap-4 lg:grid-cols-4">
          <label>
            <span className="text-sm font-black text-slate-700">User</span>
            <select name="target_user_id" defaultValue={defaultUserId} className={inputClass()}>
              <option value={defaultUserId}>Me ({defaultEmail})</option>
              {users.map((user: any) => <option key={user.user_id} value={user.user_id}>{user.display_name || user.email || user.user_id}</option>)}
            </select>
          </label>
          <label>
            <span className="text-sm font-black text-slate-700">Type</span>
            <select name="notification_type" className={inputClass()}>
              <option value="finance_insight">Finance insight</option>
              <option value="renewal_reminder">Bill renewal</option>
              <option value="savings_morale">Savings morale</option>
              <option value="health_food">Health/food</option>
            </select>
          </label>
          <label>
            <span className="text-sm font-black text-slate-700">Severity</span>
            <select name="severity" className={inputClass()}>
              <option value="info">Info</option>
              <option value="success">Success</option>
              <option value="warning">Warning</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>
          <label>
            <span className="text-sm font-black text-slate-700">Link</span>
            <input name="cta_href" placeholder="/spending" className={inputClass()} />
          </label>
          <label className="lg:col-span-2">
            <span className="text-sm font-black text-slate-700">Title</span>
            <input name="title" placeholder="You have a renewal to check soon" required className={inputClass()} />
          </label>
          <label className="lg:col-span-2">
            <span className="text-sm font-black text-slate-700">Body</span>
            <input name="body" placeholder="Broadband is due in 32 days — compare deals this week." className={inputClass()} />
          </label>
          <div className="lg:col-span-4"><button className="rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white">Create notification</button></div>
        </form>
      </SectionCard>

      <SectionCard title="Email templates" description="Templates use variables such as {{monthly_income}}, {{monthly_outgoings}}, {{finance_nudges}} and {{meal_nudges}}.">
        <div className="grid gap-6 xl:grid-cols-[.9fr_1.1fr]">
          <div className="space-y-3">
            {templates.map((template: any) => (
              <article key={template.id} className="rounded-3xl border border-slate-200/80 bg-white/80 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-slate-950">{template.name}</p>
                    <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">{template.category} · {template.cadence}</p>
                    <p className="mt-2 text-sm font-medium text-slate-600">{template.subject}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-black ${template.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{template.enabled ? "Enabled" : "Off"}</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <form action={createDigestPreview}>
                    <input type="hidden" name="template_id" value={template.id} />
                    <input type="hidden" name="target_user_id" value={defaultUserId} />
                    <input type="hidden" name="target_email" value={defaultEmail} />
                    <button className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">Preview</button>
                  </form>
                  <form action={sendTestDigest}>
                    <input type="hidden" name="template_id" value={template.id} />
                    <input type="hidden" name="target_user_id" value={defaultUserId} />
                    <input type="hidden" name="target_email" value={defaultEmail} />
                    <button className="inline-flex items-center gap-1 rounded-full bg-slate-950 px-3 py-2 text-xs font-black text-white"><Mail className="h-4 w-4" /> Test email</button>
                  </form>
                </div>
              </article>
            ))}
          </div>

          <form action={saveEmailTemplate} className="rounded-3xl border border-slate-200/80 bg-slate-50/80 p-5">
            <div className="mb-4 flex items-center gap-2"><Sparkles className="h-5 w-5 text-orange-500" /><h3 className="font-black text-slate-950">Add/edit template</h3></div>
            <div className="grid gap-4 md:grid-cols-2">
              <label><span className="text-sm font-black text-slate-700">Template key</span><input name="template_key" required placeholder="weekly_custom_digest" className={inputClass()} /></label>
              <label><span className="text-sm font-black text-slate-700">Name</span><input name="name" required placeholder="Weekly custom digest" className={inputClass()} /></label>
              <label><span className="text-sm font-black text-slate-700">Category</span><select name="category" className={inputClass()}><option value="finance">Finance</option><option value="health">Health</option><option value="household">Household</option><option value="platform">Platform</option><option value="security">Security</option></select></label>
              <label><span className="text-sm font-black text-slate-700">Cadence</span><select name="cadence" className={inputClass()}><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="event">Event</option><option value="manual">Manual</option></select></label>
              <label className="md:col-span-2"><span className="text-sm font-black text-slate-700">Subject</span><input name="subject" required placeholder="Your update for {{period_label}}" className={inputClass()} /></label>
              <label className="md:col-span-2"><span className="text-sm font-black text-slate-700">Preheader</span><input name="preheader" placeholder="A short preview line" className={inputClass()} /></label>
              <label className="md:col-span-2"><span className="text-sm font-black text-slate-700">Body markdown</span><textarea name="body_markdown" required rows={12} className={inputClass()} placeholder={'Hi {{first_name}},\n\n## This week\n{{finance_nudges}}'} /></label>
              <label className="flex items-center gap-2 text-sm font-black text-slate-700"><input name="enabled" type="checkbox" defaultChecked /> Enabled</label>
            </div>
            <button className="mt-4 rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white">Save template</button>
          </form>
        </div>
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Recent email previews/tests" description="These are stored so you can compare tone and usefulness over time.">
          <div className="space-y-3">
            {runs.length === 0 ? <p className="text-sm font-bold text-slate-500">No runs yet.</p> : null}
            {runs.map((run: any) => (
              <article key={run.id} className="rounded-3xl border border-slate-200/80 bg-white/80 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-black text-slate-950">{run.subject || "Untitled run"}</p>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase text-slate-600">{run.status}</span>
                </div>
                {run.error_message ? <p className="mt-2 text-xs font-bold text-orange-600">{run.error_message}</p> : null}
                <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-2xl bg-slate-950 p-4 text-xs font-medium text-white/80">{run.preview_body}</pre>
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Recent nudges" description="Last in-app notifications created by admin/scheduled jobs.">
          <div className="space-y-3">
            {notifications.length === 0 ? <p className="text-sm font-bold text-slate-500">No notifications yet.</p> : null}
            {notifications.map((item: any) => (
              <article key={item.id} className="rounded-3xl border border-slate-200/80 bg-white/80 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-black text-slate-950">{item.title}</p>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase text-slate-600">{item.status}</span>
                </div>
                <p className="mt-1 text-xs font-bold text-slate-400">{new Date(item.created_at).toLocaleString("en-GB")}</p>
              </article>
            ))}
          </div>
        </SectionCard>
      </div>
    </main>
  );
}

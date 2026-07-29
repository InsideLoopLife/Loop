"use client";

import { useState } from "react";
import { Wrench } from "lucide-react";

type Props = {
  title: string;
  status?: string;
  detail?: string;
  action?: string;
  envKey?: string;
  sql?: string;
};

function envExample(title: string, action?: string, envKey?: string) {
  if (envKey) return `${envKey}=<set value here>`;
  const text = `${title} ${action || ""}`.toLowerCase();
  if (text.includes("encryption")) return "APP_ENCRYPTION_KEY=<output of openssl rand -base64 32>";
  if (text.includes("cron")) return "CRON_SECRET=<long random string>";
  if (text.includes("base url")) return "APP_BASE_URL=https://your-domain.example";
  if (text.includes("resend") || text.includes("email")) return "RESEND_API_KEY=<resend key>\nEMAIL_FROM=Loop <hello@your-domain.example>";
  if (text.includes("signup")) return "APP_SIGNUP_MODE=invite";
  return action || "Check the matching environment variable, run the latest SQL migration if database-related, then redeploy/restart the app.";
}

export function RuntimeFixButton({ title, status, detail, action, envKey, sql }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ml-auto inline-flex shrink-0 items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white"
      >
        <Wrench className="h-3.5 w-3.5" /> Fix
      </button>
      {open ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-6">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-t-[2rem] border border-white/70 bg-white p-6 shadow-2xl sm:rounded-[2rem]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">{status || "check"}</p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">{title}</h2>
                {detail ? <p className="mt-2 text-sm font-bold text-slate-600">{detail}</p> : null}
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700">Close</button>
            </div>

            <div className="mt-5 space-y-4">
              <section className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="font-black text-slate-950">What to do</h3>
                <p className="mt-1 text-sm font-bold text-slate-600">{action || "Apply the suggested configuration change, then restart/redeploy the app and refresh this check."}</p>
              </section>
              <section className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4">
                <h3 className="font-black text-emerald-950">Suggested config</h3>
                <pre className="mt-2 overflow-x-auto rounded-2xl bg-white p-3 text-xs font-bold text-slate-800">{envExample(title, action, envKey)}</pre>
              </section>
              {sql ? (
                <section className="rounded-3xl border border-sky-100 bg-sky-50 p-4">
                  <h3 className="font-black text-sky-950">SQL to run in Supabase</h3>
                  <pre className="mt-2 max-h-72 overflow-auto rounded-2xl bg-white p-3 text-xs font-bold text-slate-800">{sql}</pre>
                </section>
              ) : null}
              <p className="text-xs font-bold text-slate-500">This button explains the fix and gives copyable config/SQL. It cannot edit deployed environment variables automatically because those live in Vercel/Render/Supabase.</p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

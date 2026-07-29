import Link from "next/link";
import { KeyRound, ShieldCheck } from "lucide-react";
import { allowedAdminEmails } from "@/lib/admin/access";
import { requestAdminPasswordSetup } from "./actions";

export default async function AdminSetupPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = (await searchParams) || {};
  const error = typeof params.error === "string" ? params.error : null;
  const warning = typeof params.warning === "string" ? params.warning : null;
  const sent = params.sent === "1";
  const allowed = allowedAdminEmails();

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <section className="w-full max-w-xl rounded-[2.25rem] border border-slate-200 bg-white p-8 shadow-2xl shadow-slate-200/80">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-emerald-800">
          <ShieldCheck className="h-4 w-4" /> Admin setup
        </div>
        <h1 className="text-4xl font-black tracking-tight text-slate-950">Set the protected admin password</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
          The developer/admin area is restricted to the configured admin email. First-time setup creates or recovers that account and sends a secure password-set link.
        </p>

        <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-700">
          Allowed admin email: <span className="text-slate-950">{allowed.join(", ")}</span>
        </div>

        {sent ? <div className="mt-5 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-black text-emerald-800">Password setup email sent. Open the email link, set the password, then sign in to /admin.</div> : null}
        {warning ? <div className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm font-black text-amber-800">{warning}</div> : null}
        {error ? <div className="mt-5 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-black text-red-700">{error}</div> : null}

        <form action={requestAdminPasswordSetup} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-black text-slate-700">Admin email</span>
            <input name="email" type="email" defaultValue={allowed[0] || "help@gamingnectar.com"} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none ring-orange-500 focus:ring-2" required />
          </label>
          <button className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-lg shadow-slate-950/20">
            <KeyRound className="h-4 w-4" /> Send password setup link
          </button>
        </form>

        <div className="mt-5 flex justify-between gap-3 text-sm font-bold text-slate-500">
          <Link href="/login?next=/admin" className="hover:text-slate-950">Already have the password?</Link>
          <Link href="/access?next=/admin" className="hover:text-slate-950">Private beta access</Link>
        </div>
      </section>
    </main>
  );
}

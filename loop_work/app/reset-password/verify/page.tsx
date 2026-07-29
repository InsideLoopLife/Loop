
import Link from "next/link";
import { resetPasswordWithCode } from "../actions";

export default async function VerifyResetCodePage({ searchParams }: { searchParams?: Promise<{ email?: string; sent?: string }> }) {
  const params = searchParams ? await searchParams : {};
  const email = params.email || "";
  const sent = params.sent === "1";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <form action={resetPasswordWithCode} className="w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-black text-slate-950">Enter reset code</h1>
        <p className="mt-2 text-sm font-medium text-slate-600">Use the 8 digit code sent to your email, then choose a new password.</p>
        {sent ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">If that email exists, a reset code has been sent.</div> : null}
        <label className="mt-6 block"><span className="text-sm font-black text-slate-700">Email</span><input name="email" type="email" required defaultValue={email} className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold" /></label>
        <label className="mt-4 block"><span className="text-sm font-black text-slate-700">8 digit code</span><input name="code" inputMode="numeric" pattern="[0-9]{8}" maxLength={8} required className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-center text-xl font-black tracking-[0.35em]" /></label>
        <label className="mt-4 block"><span className="text-sm font-black text-slate-700">New password</span><input name="password" type="password" required minLength={8} className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold" /></label>
        <label className="mt-4 block"><span className="text-sm font-black text-slate-700">Confirm password</span><input name="confirm_password" type="password" required minLength={8} className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold" /></label>
        <button className="mt-5 w-full rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white">Update password</button>
        <Link href="/reset-password" className="mt-4 block text-center text-sm font-bold text-slate-600">Request a fresh code</Link>
      </form>
    </main>
  );
}

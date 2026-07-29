
import Link from "next/link";
import { requestPasswordResetCode } from "./actions";

export default async function ResetPasswordPage({ searchParams }: { searchParams?: Promise<{ sent?: string; error?: string; native?: string }> }) {
  const params = searchParams ? await searchParams : {};
  const sent = params.sent === "1";
  const native = params.native === "1";
  const error = params.error ? decodeURIComponent(params.error) : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <form action={requestPasswordResetCode} className="w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-black text-slate-950">Reset your password</h1>
        <p className="mt-2 text-sm font-medium text-slate-600">Enter your account email. Loop will send an 8 digit code when the server admin key is configured, otherwise it will send a standard Supabase recovery link.</p>
        <label className="mt-6 block">
          <span className="text-sm font-black text-slate-700">Email</span>
          <input name="email" type="email" required className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold" />
        </label>
        {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{error}</div> : null}
        {sent ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{native ? "If that email exists, a secure recovery link has been sent. Open the latest email, then set the new password." : "If that email exists, a reset code has been sent."}</div> : null}
        <button className="mt-5 w-full rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white">Send reset code</button>
        <Link href="/login" className="mt-4 block text-center text-sm font-bold text-slate-600">Back to sign in</Link>
      </form>
    </main>
  );
}

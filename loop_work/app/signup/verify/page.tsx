
import Link from "next/link";
import { verifySignupCodeAndCreateAccount } from "../actions";

export default async function SignupVerifyPage({ searchParams }: { searchParams?: Promise<{ email?: string; next?: string; sent?: string; native?: string }> }) {
  const params = searchParams ? await searchParams : {};
  const native = params.native === "1";
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <form action={verifySignupCodeAndCreateAccount} className="w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-black text-slate-950">{native ? "Create your account" : "Verify your email"}</h1>
        <p className="mt-2 text-sm font-medium text-slate-600">{native ? "Choose a password. Supabase will send the normal email confirmation when your project requires it." : "Enter the 8 digit code and choose your password."}</p>
        <input type="hidden" name="next" value={params.next || "/dashboard"} />
        {native ? <input type="hidden" name="native_mode" value="1" /> : null}
        <label className="mt-6 block"><span className="text-sm font-black text-slate-700">Email</span><input name="email" type="email" required defaultValue={params.email || ""} className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold" /></label>
        {native ? null : <label className="mt-4 block"><span className="text-sm font-black text-slate-700">8 digit code</span><input name="code" inputMode="numeric" pattern="[0-9]{8}" maxLength={8} required className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-center text-xl font-black tracking-[0.35em]" /></label>}
        <label className="mt-4 block"><span className="text-sm font-black text-slate-700">Password</span><input name="password" type="password" minLength={8} required className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold" /></label>
        <label className="mt-4 block"><span className="text-sm font-black text-slate-700">Confirm password</span><input name="confirm_password" type="password" minLength={8} required className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold" /></label>
        <button className="mt-5 w-full rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white">Create account</button>
        <Link href="/signup" className="mt-4 block text-center text-sm font-bold text-slate-600">{native ? "Back to sign up" : "Request a fresh code"}</Link>
      </form>
    </main>
  );
}

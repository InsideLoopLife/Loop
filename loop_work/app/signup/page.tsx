
import Link from "next/link";
import { requestSignupCode } from "./actions";
import { SocialAuthButtons } from "@/components/auth/SocialAuthButtons";

export default async function SignupPage({ searchParams }: { searchParams?: Promise<{ next?: string; email?: string; invite?: string; error?: string }> }) {
  const params = searchParams ? await searchParams : {};
  const next = params.next || (params.invite ? `/accept-invite?token=${params.invite}` : "/dashboard");
  const error = params.error ? decodeURIComponent(params.error) : null;
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <form action={requestSignupCode} className="w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-black text-slate-950">Create your Loop account</h1>
        <p className="mt-2 text-sm font-medium text-slate-600">Use Google, Apple, or an email code to start your private household tracker.</p>
        <div className="mt-6">
          <SocialAuthButtons next={next} mode="signup" />
        </div>
        <div className="my-6 flex items-center gap-3 text-xs font-black uppercase tracking-wide text-slate-400"><span className="h-px flex-1 bg-slate-200" /> or email <span className="h-px flex-1 bg-slate-200" /></div>
        <input type="hidden" name="next" value={next} />
        <label className="block"><span className="text-sm font-black text-slate-700">Email</span><input name="email" type="email" required defaultValue={params.email || ""} className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold" /></label>
        {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{error}</div> : null}
        <button className="mt-5 w-full rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white">Send sign-up code</button>
        <Link href="/login" className="mt-4 block text-center text-sm font-bold text-slate-600">Already have an account?</Link>
      </form>
    </main>
  );
}

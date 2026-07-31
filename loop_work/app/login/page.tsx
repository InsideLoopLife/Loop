"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SocialAuthButtons } from "@/components/auth/SocialAuthButtons";

// BUGFIX (production build failure): useSearchParams() requires the
// component using it to be wrapped in a <Suspense> boundary for Next.js
// to statically prerender the page — search params aren't known at
// build time, only per-request. The actual page content is now this
// inner component; the default export below just adds the required
// Suspense wrapper around it.
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const next = searchParams.get("next") || "/dashboard";
  const [message, setMessage] = useState<string | null>(
    searchParams.get("created") === "1" ? "Account created. Sign in with your new password." :
    searchParams.get("reset") === "1" ? "Password updated. Sign in with your new password." :
    searchParams.get("already") === "1" ? "That email already has an account. Sign in or reset the password." : null
  );
  const [loading, setLoading] = useState<"signin" | null>(null);
  // Only ever read email from the URL for a one-time prefill (e.g. coming
  // back from signup) — captured once into state, never re-read from
  // searchParams after this, so editing the URL bar later can't affect
  // what's in the field.
  const [emailPrefill] = useState(() => searchParams.get("email") || "");

  useEffect(() => {
    // BUGFIX (credentials-in-URL hardening): regardless of how a URL like
    // /login?email=...&password=... gets visited (typed directly, an old
    // bookmark, browser autofill, etc.), scrub it from the address bar and
    // browser history immediately. Password is never read from the URL by
    // this page's logic — only email is, and only once, above — but this
    // makes sure nothing sensitive lingers visibly regardless of how it
    // got there.
    if (searchParams.get("password") || searchParams.get("email")) {
      const cleaned = new URLSearchParams(searchParams.toString());
      cleaned.delete("password");
      cleaned.delete("email");
      const query = cleaned.toString();
      router.replace(query ? `/login?${query}` : "/login");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getValues(form: HTMLFormElement) {
    const formData = new FormData(form);
    return { email: String(formData.get("email") || "").trim(), password: String(formData.get("password") || "") };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { email, password } = getValues(event.currentTarget);
    if (!email || !password) { setMessage("Please enter both an email address and password."); return; }
    setLoading("signin");
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(null);
    if (error) { setMessage(error.message); return; }
    router.push(next);
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-4xl font-black tracking-tight text-slate-950 md:text-5xl">Loop</h1>
        <p className="mt-2 text-sm text-slate-600">Sign in to your private household tracker.</p>

        <div className="mt-6">
          <SocialAuthButtons next={next} mode="login" />
        </div>

        <div className="my-6 flex items-center gap-3 text-xs font-black uppercase tracking-wide text-slate-400"><span className="h-px flex-1 bg-slate-200" /> or email <span className="h-px flex-1 bg-slate-200" /></div>

        <form className="space-y-4" method="post" onSubmit={handleSubmit} autoComplete="on">
          <label className="block"><span className="text-sm font-medium text-slate-700">Email</span><input name="email" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-orange-500 focus:ring-2" type="email" autoComplete="email" defaultValue={emailPrefill} required /></label>
          <label className="block"><span className="text-sm font-medium text-slate-700">Password</span><input name="password" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-orange-500 focus:ring-2" type="password" autoComplete="current-password" required minLength={8} /></label>
          {message ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</div> : null}
          <div className="flex justify-between gap-3"><Link href={`/signup?next=${encodeURIComponent(next)}`} className="text-xs font-bold text-slate-500 hover:text-slate-950">Create account</Link><Link href="/reset-password" className="text-xs font-bold text-slate-500 hover:text-slate-950">Forgot password?</Link></div>
          <button type="submit" disabled={loading !== null} className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">{loading === "signin" ? "Signing in..." : "Sign in"}</button>
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-slate-50 p-6" />}>
      <LoginForm />
    </Suspense>
  );
}

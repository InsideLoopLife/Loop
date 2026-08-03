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
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* ---- Showcase panel ---- */}
      <div className="relative hidden overflow-hidden bg-[#0B1220] px-12 py-10 lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{ background: "radial-gradient(60% 50% at 30% 20%, rgba(45,212,191,0.18), transparent), radial-gradient(50% 40% at 80% 85%, rgba(245,158,11,0.14), transparent)" }}
        />
        <div className="relative flex items-center gap-2">
          <span className="text-2xl font-black tracking-tight text-white">Loop</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-teal-300">Household</span>
        </div>

        <div className="relative flex flex-1 items-center justify-center py-16">
          <ConvergenceVisual />
        </div>

        <div className="relative max-w-sm">
          <p className="text-2xl font-black leading-snug text-white">Every account.<br />One picture.</p>
          <p className="mt-3 text-sm font-medium text-slate-400">
            Investments, pensions, the mortgage, savings, family costs — Loop pulls it all into one number you can actually trust, updated as it happens.
          </p>
        </div>
      </div>

      {/* ---- Form panel ---- */}
      <div className="flex items-center justify-center bg-[#FAF9F6] p-6">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <span className="text-3xl font-black tracking-tight text-slate-950">Loop</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-950">Welcome back</h1>
          <p className="mt-2 text-sm text-slate-500">Sign in to your private household tracker.</p>

          <div className="mt-6">
            <SocialAuthButtons next={next} mode="login" />
          </div>

          <div className="my-6 flex items-center gap-3 text-xs font-black uppercase tracking-wide text-slate-400"><span className="h-px flex-1 bg-slate-200" /> or email <span className="h-px flex-1 bg-slate-200" /></div>

          <form className="space-y-4" method="post" onSubmit={handleSubmit} autoComplete="on">
            <label className="block"><span className="text-sm font-medium text-slate-700">Email</span><input name="email" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-teal-500 focus:ring-2" type="email" autoComplete="email" defaultValue={emailPrefill} required /></label>
            <label className="block"><span className="text-sm font-medium text-slate-700">Password</span><input name="password" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-teal-500 focus:ring-2" type="password" autoComplete="current-password" required minLength={8} /></label>
            {message ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</div> : null}
            <div className="flex justify-between gap-3"><Link href={`/signup?next=${encodeURIComponent(next)}`} className="text-xs font-bold text-slate-500 hover:text-slate-950">Create account</Link><Link href="/reset-password" className="text-xs font-bold text-slate-500 hover:text-slate-950">Forgot password?</Link></div>
            <button type="submit" disabled={loading !== null} className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">{loading === "signin" ? "Signing in..." : "Sign in"}</button>
          </form>
        </div>
      </div>
    </main>
  );
}

// The signature visual: five household-finance threads gently flowing
// toward one total — literally what Loop does, rendered as motion.
// Pure CSS, no images, so it stays crisp at any size and costs nothing to
// load. Respects prefers-reduced-motion by disabling the flow/pulse
// keyframes entirely, leaving a clean static arrangement.
function ConvergenceVisual() {
  const threads = [
    { label: "Investments", color: "#2DD4BF", angle: -72, delay: "0s" },
    { label: "Pensions", color: "#F59E0B", angle: -18, delay: "0.4s" },
    { label: "Mortgage", color: "#818CF8", angle: 36, delay: "0.8s" },
    { label: "Savings", color: "#34D399", angle: 90, delay: "1.2s" },
    { label: "Family", color: "#FB923C", angle: 144, delay: "1.6s" },
  ];
  const radius = 150;

  return (
    <div className="relative h-[340px] w-[340px]">

      <svg className="absolute inset-0 h-full w-full" viewBox="-170 -170 340 340">
        {threads.map((t) => {
          const rad = (t.angle * Math.PI) / 180;
          const x = Math.cos(rad) * radius;
          const y = Math.sin(rad) * radius;
          return (
            <line
              key={t.label}
              className="loop-thread-line"
              x1={x}
              y1={y}
              x2={0}
              y2={0}
              stroke={t.color}
              strokeWidth="1.5"
              strokeDasharray="6 6"
              strokeLinecap="round"
              style={{ animationDelay: t.delay }}
              opacity="0.5"
            />
          );
        })}
      </svg>

      {threads.map((t) => {
        const rad = (t.angle * Math.PI) / 180;
        const x = Math.cos(rad) * radius;
        const y = Math.sin(rad) * radius;
        return (
          <div
            key={t.label}
            className="loop-thread-node absolute flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 backdrop-blur-sm"
            style={{ left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)`, animationDelay: t.delay }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.color }} />
            <span className="whitespace-nowrap text-[11px] font-bold text-slate-200">{t.label}</span>
          </div>
        );
      })}

      <div className="loop-total-glow absolute left-1/2 top-1/2 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-teal-400/30 bg-[#0F1B2E]">
        <span className="text-[9px] font-black uppercase tracking-widest text-teal-300">Total</span>
        <span className="text-lg font-black text-white">One view</span>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#FAF9F6]" />}>
      <LoginForm />
    </Suspense>
  );
}

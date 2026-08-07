"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Eye,
  EyeOff,
  HeartPulse,
  Home,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SocialAuthButtons } from "@/components/auth/SocialAuthButtons";

type Message = { text: string; tone: "success" | "error" };

function safeNextPath(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const next = safeNextPath(searchParams.get("next"));
  const [message, setMessage] = useState<Message | null>(() => {
    if (searchParams.get("created") === "1") return { text: "Your account is ready. Sign in with your new password.", tone: "success" };
    if (searchParams.get("reset") === "1") return { text: "Password updated. You can sign in now.", tone: "success" };
    if (searchParams.get("already") === "1") return { text: "That email already has an account. Sign in or reset your password.", tone: "error" };
    return null;
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailPrefill] = useState(() => searchParams.get("email") || "");

  useEffect(() => {
    // Keep credentials out of the address bar and browser history. Email is
    // captured once above for a legitimate post-signup prefill; passwords are
    // never read from the URL.
    if (searchParams.get("password") || searchParams.get("email")) {
      const cleaned = new URLSearchParams(searchParams.toString());
      cleaned.delete("password");
      cleaned.delete("email");
      const query = cleaned.toString();
      router.replace(query ? `/login?${query}` : "/login");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");

    if (!email || !password) {
      setMessage({ text: "Enter your email address and password.", tone: "error" });
      return;
    }

    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      setMessage({ text: error.message, tone: "error" });
      return;
    }

    router.push(next);
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-[#f5f6f8] lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(440px,0.92fr)]">
      <section className="relative hidden min-h-screen overflow-hidden bg-[#071225] px-10 py-9 text-white lg:flex lg:flex-col xl:px-16 xl:py-12">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -left-32 -top-32 h-[32rem] w-[32rem] rounded-full bg-indigo-500/20 blur-[120px]" />
          <div className="absolute -bottom-40 right-0 h-[34rem] w-[34rem] rounded-full bg-emerald-400/15 blur-[130px]" />
          <div className="absolute right-[18%] top-[18%] h-56 w-56 rounded-full bg-orange-400/10 blur-[100px]" />
        </div>

        <header className="relative z-10 flex items-center justify-between">
          <LoopWordmark />
          <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-300">
            Private beta
          </span>
        </header>

        <div className="relative z-10 my-auto grid items-center gap-10 py-12 xl:grid-cols-[minmax(0,0.86fr)_minmax(360px,1.14fr)] xl:gap-14">
          <div className="max-w-xl">
            <p className="mb-5 text-xs font-bold uppercase tracking-[0.24em] text-emerald-300">Your life, connected</p>
            <h1 className="text-5xl font-black leading-[1.02] tracking-[-0.055em] xl:text-6xl">
              See the whole picture.<br />Shape what comes next.
            </h1>
            <p className="mt-6 max-w-lg text-base font-medium leading-7 text-slate-300 xl:text-lg">
              LOOP brings your wealth, health, home and household into one calm, useful view—so every decision has context.
            </p>
          </div>

          <SystemPreview />
        </div>

        <footer className="relative z-10 flex items-center justify-between gap-8 border-t border-white/10 pt-7">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
            <ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" />
            Private by design. Your household stays yours.
          </div>
          <div className="hidden items-center gap-5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 xl:flex" aria-label="LOOP systems">
            <span>Wealth</span><span>Health</span><span>Home</span><span>Household</span>
          </div>
        </footer>
      </section>

      <section className="relative flex min-h-screen items-center justify-center px-5 py-10 sm:px-8 lg:bg-white lg:px-12">
        <div className="w-full max-w-[430px]">
          <div className="mb-10 flex items-center justify-between lg:hidden">
            <LoopWordmark dark />
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Health + Wealth</span>
          </div>

          <div className="mb-8">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">Welcome back</p>
            <h2 className="text-[2rem] font-black tracking-[-0.045em] text-slate-950 sm:text-4xl">Sign in to your LOOP</h2>
            <p className="mt-3 text-sm font-medium text-slate-500">Everything you track, ready where you left it.</p>
          </div>

          <SocialAuthButtons next={next} mode="login" />

          <div className="my-7 flex items-center gap-4 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            Continue with email
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          <form className="space-y-5" method="post" onSubmit={handleSubmit} autoComplete="on">
            <label className="block">
              <span className="text-sm font-bold text-slate-700">Email address</span>
              <input
                name="email"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-medium text-slate-950 outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="you@example.com"
                defaultValue={emailPrefill}
                required
              />
            </label>

            <label className="block">
              <span className="flex items-center justify-between gap-4">
                <span className="text-sm font-bold text-slate-700">Password</span>
                <Link href="/reset-password" className="text-xs font-bold text-indigo-600 hover:text-indigo-800">Forgot password?</Link>
              </span>
              <span className="relative mt-2 block">
                <input
                  name="password"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 pr-12 text-sm font-medium text-slate-950 outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute inset-y-0 right-0 grid w-12 place-items-center text-slate-400 hover:text-slate-700"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </span>
            </label>

            {message ? (
              <div
                role="status"
                aria-live="polite"
                className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
                  message.tone === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-red-200 bg-red-50 text-red-800"
                }`}
              >
                {message.text}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-slate-950/10 hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
            >
              {loading ? "Signing you in…" : "Sign in"}
              {!loading ? <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /> : null}
            </button>
          </form>

          <p className="mt-8 text-center text-sm font-medium text-slate-500">
            New to LOOP?{" "}
            <Link href={`/signup?next=${encodeURIComponent(next)}`} className="font-bold text-slate-950 hover:text-indigo-700">Create your account</Link>
          </p>

          <div className="mt-10 grid grid-cols-4 gap-2 lg:hidden" aria-label="LOOP systems">
            <MobileSystem icon={<Wallet />} label="Wealth" />
            <MobileSystem icon={<HeartPulse />} label="Health" />
            <MobileSystem icon={<Home />} label="Home" />
            <MobileSystem icon={<Users />} label="Family" />
          </div>
        </div>
      </section>
    </main>
  );
}

function LoopWordmark({ dark = false }: { dark?: boolean }) {
  return (
    <div className="flex items-center gap-3" aria-label="LOOP">
      <span className={`grid h-9 w-9 place-items-center rounded-full border ${dark ? "border-slate-200 bg-white" : "border-white/15 bg-white/[0.07]"}`}>
        <span className={`h-3.5 w-5 rounded-full border-[3px] ${dark ? "border-slate-950" : "border-white"}`} />
      </span>
      <span className={`text-lg font-black tracking-[0.12em] ${dark ? "text-slate-950" : "text-white"}`}>LOOP</span>
    </div>
  );
}

const systems = [
  { label: "Wealth", detail: "Accounts, savings & investments", icon: Wallet, accent: "bg-indigo-400", position: "left-0 top-5" },
  { label: "Health", detail: "Nutrition, habits & progress", icon: HeartPulse, accent: "bg-emerald-400", position: "right-0 top-5" },
  { label: "Home", detail: "Property, mortgage & bills", icon: Home, accent: "bg-orange-400", position: "bottom-5 left-0" },
  { label: "Household", detail: "People, plans & shared life", icon: Users, accent: "bg-fuchsia-400", position: "bottom-5 right-0" },
];

function SystemPreview() {
  return (
    <div className="relative mx-auto h-[410px] w-full max-w-[460px]" aria-label="LOOP connects wealth, health, home and household">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 460 410" fill="none" aria-hidden="true">
        <path d="M112 91 C150 91 168 157 211 178" stroke="rgba(129,140,248,.55)" strokeWidth="1.5" strokeDasharray="5 7" />
        <path d="M348 91 C310 91 292 157 249 178" stroke="rgba(52,211,153,.55)" strokeWidth="1.5" strokeDasharray="5 7" />
        <path d="M112 319 C150 319 168 253 211 232" stroke="rgba(251,146,60,.55)" strokeWidth="1.5" strokeDasharray="5 7" />
        <path d="M348 319 C310 319 292 253 249 232" stroke="rgba(232,121,249,.55)" strokeWidth="1.5" strokeDasharray="5 7" />
      </svg>

      {systems.map(({ label, detail, icon: Icon, accent, position }) => (
        <div key={label} className={`absolute ${position} w-[46%] rounded-2xl border border-white/10 bg-white/[0.065] p-4 shadow-2xl shadow-black/10 backdrop-blur-xl`}>
          <div className="flex items-start gap-3">
            <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10">
              <span className={`absolute -right-1 -top-1 h-2 w-2 rounded-full ${accent}`} />
              <Icon className="h-4 w-4 text-white" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-bold text-white">{label}</span>
              <span className="mt-0.5 block text-[10px] font-medium leading-4 text-slate-400">{detail}</span>
            </span>
          </div>
        </div>
      ))}

      <div className="absolute left-1/2 top-1/2 w-[210px] -translate-x-1/2 -translate-y-1/2 rounded-[2rem] border border-white/15 bg-[#101d34]/95 p-5 text-center shadow-[0_30px_80px_-28px_rgba(0,0,0,.8)] backdrop-blur-xl">
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-indigo-400 via-violet-400 to-emerald-300 shadow-lg shadow-indigo-500/25">
          <span className="h-4 w-6 rounded-full border-[3px] border-white" />
        </span>
        <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">One connected view</p>
        <p className="mt-1 text-xl font-black tracking-tight text-white">Your LOOP</p>
        <div className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-emerald-300/10 bg-emerald-300/[0.07] px-3 py-2 text-[10px] font-semibold text-emerald-200">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
          Systems in sync
        </div>
      </div>
    </div>
  );
}

function MobileSystem({ icon, label }: { icon: React.ReactElement; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-1 py-3 text-[10px] font-bold text-slate-500">
      <span className="[&>svg]:h-4 [&>svg]:w-4" aria-hidden="true">{icon}</span>
      {label}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#f5f6f8]" />}>
      <LoginForm />
    </Suspense>
  );
}

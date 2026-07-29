"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type SocialAuthButtonsProps = {
  next?: string;
  mode?: "login" | "signup";
};

const googleAuthEnabled = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH !== "false";
const appleAuthEnabled = process.env.NEXT_PUBLIC_ENABLE_APPLE_AUTH !== "false";

function ProviderIcon({ provider }: { provider: "google" | "apple" }) {
  if (provider === "apple") {
    return <span className="text-lg leading-none"></span>;
  }
  return (
    <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-xs font-black text-slate-950 shadow-sm">
      G
    </span>
  );
}

export function SocialAuthButtons({ next = "/dashboard", mode = "login" }: SocialAuthButtonsProps) {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState<"google" | "apple" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const googleEnabled = googleAuthEnabled;
  const appleEnabled = appleAuthEnabled;

  async function oauth(provider: "google" | "apple") {
    const enabled = provider === "google" ? googleEnabled : appleEnabled;
    if (!enabled) {
      setMessage(`${provider === "google" ? "Google" : "Apple"} sign-in is disabled by environment flag.`);
      return;
    }

    setLoading(provider);
    setMessage(null);
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next || "/dashboard")}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        queryParams: provider === "google" ? { prompt: "select_account" } : undefined,
      },
    });

    if (error) {
      setMessage(error.message);
      setLoading(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => oauth("google")}
          disabled={loading !== null || !googleEnabled}
          className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ProviderIcon provider="google" />
          {loading === "google" ? "Opening..." : `${mode === "signup" ? "Sign up" : "Continue"} with Google`}
        </button>
        <button
          type="button"
          onClick={() => oauth("apple")}
          disabled={loading !== null || !appleEnabled}
          className="flex items-center justify-center gap-2 rounded-2xl border border-slate-950 bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ProviderIcon provider="apple" />
          {loading === "apple" ? "Opening..." : `${mode === "signup" ? "Sign up" : "Continue"} with Apple`}
        </button>
      </div>
      {message ? <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">{message}</p> : null}
    </div>
  );
}

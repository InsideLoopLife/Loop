"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type SocialAuthButtonsProps = {
  next?: string;
  mode?: "login" | "signup";
};

// Default posture is OFF: a provider only shows once it's actually
// configured in Supabase and the env var explicitly opts it in. The old
// default (enabled unless explicitly disabled) meant an unconfigured
// provider was live and clickable, and failed with a raw Supabase error
// message in the UI instead of not being there at all.
const googleAuthEnabled = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === "true";
const appleAuthEnabled = process.env.NEXT_PUBLIC_ENABLE_APPLE_AUTH === "true";

/** Whether any social provider is enabled — pages use this to decide
 *  whether to render SocialAuthButtons and its "or continue with email"
 *  divider at all, rather than showing an orphaned divider with no
 *  buttons above it. */
export const socialAuthAnyEnabled = googleAuthEnabled || appleAuthEnabled;

function ProviderIcon({ provider }: { provider: "google" | "apple" }) {
  if (provider === "apple") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
        <path d="M17.05 12.54c-.03-3.02 2.47-4.49 2.58-4.56a5.54 5.54 0 0 0-4.36-2.36c-1.84-.19-3.62 1.1-4.56 1.1-.96 0-2.41-1.08-3.97-1.05a5.79 5.79 0 0 0-4.87 2.98c-2.12 3.67-.54 9.07 1.49 12.04 1.01 1.45 2.19 3.06 3.74 3 1.51-.06 2.08-.97 3.91-.97 1.81 0 2.35.97 3.93.93 1.63-.03 2.66-1.46 3.63-2.92a12 12 0 0 0 1.66-3.39 5.23 5.23 0 0 1-3.18-4.8ZM14.07 3.67A5.3 5.3 0 0 0 15.28 0a5.4 5.4 0 0 0-3.5 1.75 5.07 5.07 0 0 0-1.24 3.53 4.46 4.46 0 0 0 3.53-1.61Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.89h5.38a4.6 4.6 0 0 1-2 3.02v2.52h3.24c1.9-1.75 2.98-4.32 2.98-7.37Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.63-2.4l-3.24-2.52c-.9.6-2.05.96-3.39.96-2.61 0-4.83-1.77-5.62-4.14H3.03v2.6A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.38 13.9a6 6 0 0 1 0-3.8V7.5H3.03a10 10 0 0 0 0 9l3.35-2.6Z" />
      <path fill="#EA4335" d="M12 5.96c1.47 0 2.79.5 3.83 1.5l2.87-2.88A9.65 9.65 0 0 0 12 2a10 10 0 0 0-8.97 5.5l3.35 2.6C7.17 7.73 9.39 5.96 12 5.96Z" />
    </svg>
  );
}

export function SocialAuthButtons({ next = "/dashboard", mode = "login" }: SocialAuthButtonsProps) {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState<"google" | "apple" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const googleEnabled = googleAuthEnabled;
  const appleEnabled = appleAuthEnabled;

  if (!googleEnabled && !appleEnabled) return null;

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
          className="flex items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-bold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ProviderIcon provider="google" />
          {loading === "google" ? "Opening..." : `${mode === "signup" ? "Sign up" : "Continue"} with Google`}
        </button>
        <button
          type="button"
          onClick={() => oauth("apple")}
          disabled={loading !== null || !appleEnabled}
          className="flex items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-bold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ProviderIcon provider="apple" />
          {loading === "apple" ? "Opening..." : `${mode === "signup" ? "Sign up" : "Continue"} with Apple`}
        </button>
      </div>
      {message ? <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">{message}</p> : null}
    </div>
  );
}

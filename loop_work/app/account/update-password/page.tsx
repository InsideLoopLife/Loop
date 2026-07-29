"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const nextPath = searchParams.get("next") || "/account";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>("Checking recovery link…");
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function prepareRecoverySession() {
      setMessage("Checking recovery link…");

      const type = searchParams.get("type");
      const tokenHash = searchParams.get("token_hash");
      if (tokenHash && (!type || type === "recovery")) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
        if (!cancelled) {
          if (error) {
            setSessionReady(false);
            setMessage(`Recovery link could not be opened: ${error.message}`);
          } else {
            setSessionReady(true);
            setMessage("Recovery link accepted. Enter your new password.");
            router.replace(`/account/update-password?next=${encodeURIComponent(nextPath)}`);
          }
        }
        return;
      }

      const code = searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!cancelled) {
          if (error) {
            setSessionReady(false);
            setMessage(`Recovery link could not be opened: ${error.message}`);
          } else {
            setSessionReady(true);
            setMessage("Recovery link accepted. Enter your new password.");
            router.replace(`/account/update-password?next=${encodeURIComponent(nextPath)}`);
          }
        }
        return;
      }

      if (typeof window !== "undefined" && window.location.hash) {
        const hash = new URLSearchParams(window.location.hash.slice(1));
        const accessToken = hash.get("access_token");
        const refreshToken = hash.get("refresh_token");
        const errorDescription = hash.get("error_description");
        if (errorDescription) {
          setSessionReady(false);
          setMessage(errorDescription);
          return;
        }
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (!cancelled) {
            if (error) {
              setSessionReady(false);
              setMessage(`Recovery link could not be opened: ${error.message}`);
            } else {
              setSessionReady(true);
              setMessage("Recovery link accepted. Enter your new password.");
              window.history.replaceState({}, document.title, `/account/update-password?next=${encodeURIComponent(nextPath)}`);
            }
          }
          return;
        }
      }

      const { data } = await supabase.auth.getSession();
      if (!cancelled) {
        setSessionReady(Boolean(data.session));
        setMessage(data.session ? "Enter your new password." : "Auth session missing. Open the latest password-reset email link again, or request a fresh reset.");
      }
    }

    prepareRecoverySession();
    return () => { cancelled = true; };
  }, [nextPath, router, searchParams, supabase]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    if (!sessionReady) {
      setMessage("Auth session missing. Open the reset link from your email again, then set the password on this page.");
      return;
    }
    if (password.length < 8) {
      setMessage("Use at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("Password updated. You can return to the app.");
    setTimeout(() => router.push(nextPath), 750);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <form onSubmit={submit} className="w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-black text-slate-950">Set a new password</h1>
        <p className="mt-2 text-sm font-medium text-slate-600">Open this page from the recovery link in your email.</p>
        <label className="mt-6 block">
          <span className="text-sm font-black text-slate-700">New password</span>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required minLength={8} className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold" />
        </label>
        <label className="mt-4 block">
          <span className="text-sm font-black text-slate-700">Confirm password</span>
          <input value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} type="password" required minLength={8} className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold" />
        </label>
        {message ? <div className={`mt-4 rounded-2xl border p-3 text-sm font-bold ${sessionReady ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>{message}</div> : null}
        <button disabled={loading || !sessionReady} className="mt-5 w-full rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-40">{loading ? "Updating..." : "Update password"}</button>
        <Link href="/dashboard" className="mt-4 block text-center text-sm font-bold text-slate-600">Back to app</Link>
      </form>
    </main>
  );
}

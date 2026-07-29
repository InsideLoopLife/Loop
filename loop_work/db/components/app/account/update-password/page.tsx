"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function UpdatePasswordPage() {
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
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
    setMessage(error ? error.message : "Password updated. You can return to the app.");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <form onSubmit={submit} className="w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-black text-slate-950">Set a new password</h1>
        <p className="mt-2 text-sm font-medium text-slate-600">This page is reached from the Supabase recovery link.</p>
        <label className="mt-6 block">
          <span className="text-sm font-black text-slate-700">New password</span>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required minLength={8} className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold" />
        </label>
        <label className="mt-4 block">
          <span className="text-sm font-black text-slate-700">Confirm password</span>
          <input value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} type="password" required minLength={8} className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold" />
        </label>
        {message ? <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">{message}</div> : null}
        <button disabled={loading} className="mt-5 w-full rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white">{loading ? "Updating..." : "Update password"}</button>
        <Link href="/dashboard" className="mt-4 block text-center text-sm font-bold text-slate-600">Back to app</Link>
      </form>
    </main>
  );
}

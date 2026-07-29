"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/account/update-password`,
    });
    setLoading(false);
    setMessage(error ? error.message : "If that email exists, a password reset link has been sent.");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <form onSubmit={submit} className="w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-black text-slate-950">Reset your password</h1>
        <p className="mt-2 text-sm font-medium text-slate-600">Enter your account email and we’ll send a recovery link.</p>
        <label className="mt-6 block">
          <span className="text-sm font-black text-slate-700">Email</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold" />
        </label>
        {message ? <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">{message}</div> : null}
        <button disabled={loading} className="mt-5 w-full rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white">{loading ? "Sending..." : "Send reset link"}</button>
        <Link href="/login" className="mt-4 block text-center text-sm font-bold text-slate-600">Back to sign in</Link>
      </form>
    </main>
  );
}

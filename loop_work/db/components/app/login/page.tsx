"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<"signin" | "signup" | null>(null);

  function getValues(form: HTMLFormElement) {
    const formData = new FormData(form);
    return {
      email: String(formData.get("email") || "").trim(),
      password: String(formData.get("password") || ""),
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await signIn(event.currentTarget);
  }

  async function signIn(form: HTMLFormElement) {
    const { email, password } = getValues(form);

    if (!email || !password) {
      setMessage("Please enter both an email address and password.");
      return;
    }

    setLoading("signin");
    setMessage(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(null);

    if (error) {
      setMessage(error.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function createAccount(form: HTMLFormElement) {
    const { email, password } = getValues(form);

    if (!email || !password) {
      setMessage("Please enter both an email address and password before creating an account.");
      return;
    }

    if (password.length < 6) {
      setMessage("Please use a password with at least 6 characters.");
      return;
    }

    setLoading("signup");
    setMessage(null);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });

    setLoading(null);

    if (error) {
      setMessage(error.message);
      return;
    }

    if (data.session) {
      router.push("/dashboard");
      router.refresh();
      return;
    }

    setMessage("Account created. If email confirmation is enabled in Supabase, check your inbox before signing in.");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-4xl font-black tracking-tight text-slate-950 md:text-5xl">Life Tracker</h1>
        <p className="mt-2 text-sm text-slate-600">
          Sign in to your private dashboard for income, spending, accounts, mortgage and house move planning.
        </p>

        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Email</span>
            <input
              name="email"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-orange-500 focus:ring-2"
              type="email"
              autoComplete="email"
              required
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Password</span>
            <input
              name="password"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-orange-500 focus:ring-2"
              type="password"
              autoComplete="current-password"
              required
              minLength={6}
            />
          </label>

          {message ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {message}
            </div>
          ) : null}

          <div className="flex justify-end">
            <Link href="/reset-password" className="text-xs font-bold text-slate-500 hover:text-slate-950">Forgot password?</Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="submit"
              disabled={loading !== null}
              className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {loading === "signin" ? "Signing in..." : "Sign in"}
            </button>

            <button
              type="button"
              onClick={(event) => {
                const form = event.currentTarget.form;
                if (form) void createAccount(form);
              }}
              disabled={loading !== null}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {loading === "signup" ? "Creating..." : "Create account"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

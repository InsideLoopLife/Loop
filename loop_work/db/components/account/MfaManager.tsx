"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, KeyRound, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Factor = {
  id: string;
  friendly_name?: string | null;
  factor_type?: string | null;
  status?: string | null;
};

export function MfaManager() {
  const supabase = createClient();
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadFactors() {
    setLoading(true);
    setMessage(null);
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      setMessage(error.message);
    } else {
      setFactors((data?.totp || []) as Factor[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadFactors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startEnroll() {
    setBusy(true);
    setMessage(null);
    setQrCode(null);
    setSecret(null);
    setFactorId(null);

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Life Tracker authenticator",
    });

    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setFactorId(data.id);
    setQrCode(data.totp.qr_code);
    setSecret(data.totp.secret);
  }

  async function verifyEnroll() {
    if (!factorId || !verifyCode.trim()) return;
    setBusy(true);
    setMessage(null);

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) {
      setMessage(challengeError.message);
      setBusy(false);
      return;
    }

    const { error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: verifyCode.trim(),
    });

    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Authenticator app enabled. Sign out and back in to test the second-factor flow.");
    setQrCode(null);
    setSecret(null);
    setFactorId(null);
    setVerifyCode("");
    await loadFactors();
  }

  async function removeFactor(id: string) {
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    setBusy(false);
    if (error) setMessage(error.message);
    await loadFactors();
  }

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="flex items-center gap-2 rounded-3xl border border-slate-200 bg-white/80 p-4 text-sm font-bold text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking MFA status...
        </div>
      ) : factors.length ? (
        <div className="space-y-3">
          {factors.map((factor) => (
            <div key={factor.id} className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-emerald-100 bg-emerald-50/80 p-4">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-600 text-white"><CheckCircle2 className="h-5 w-5" /></span>
                <div>
                  <p className="text-sm font-black text-emerald-950">Authenticator app active</p>
                  <p className="text-xs font-bold text-emerald-700">{factor.friendly_name || "TOTP factor"} · {factor.status || "verified"}</p>
                </div>
              </div>
              <button type="button" disabled={busy} onClick={() => removeFactor(factor.id)} className="inline-flex items-center gap-2 rounded-full border border-red-100 bg-white px-3 py-2 text-xs font-black text-red-600">
                <Trash2 className="h-4 w-4" /> Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-amber-100 bg-amber-50/80 p-4">
          <p className="text-sm font-black text-amber-950">MFA is not enabled on this user</p>
          <p className="mt-1 text-xs font-bold text-amber-700">Use an authenticator app such as Apple Passwords, 1Password, Microsoft Authenticator or Google Authenticator.</p>
        </div>
      )}

      {qrCode ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-black text-slate-950">Scan this QR code</p>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
            <img src={qrCode} alt="MFA QR code" className="h-48 w-48 rounded-3xl border border-slate-200 bg-white p-3" />
            <div className="flex-1">
              <p className="text-xs font-bold text-slate-500">Manual code</p>
              <p className="mt-1 break-all rounded-2xl bg-slate-50 p-3 text-sm font-black text-slate-700">{secret}</p>
              <label className="mt-4 block text-sm font-black text-slate-700">6-digit code</label>
              <input value={verifyCode} onChange={(e) => setVerifyCode(e.target.value)} inputMode="numeric" className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold" />
              <button type="button" disabled={busy} onClick={verifyEnroll} className="mt-3 rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white">
                Verify and enable
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button type="button" disabled={busy} onClick={startEnroll} className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-lg shadow-slate-950/15">
          <ShieldCheck className="h-4 w-4" /> Enable authenticator app
        </button>
      )}

      {message ? (
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-700">
          <KeyRound className="mr-2 inline h-4 w-4" /> {message}
        </div>
      ) : null}
    </div>
  );
}

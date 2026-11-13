"use client";

// The one "check the real figure" flow. Check opens the provider's sign-in page
// (or an email search) in a new tab, and this stays open in LOOP for the answer.
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveCheckedFigure, type CheckedFigure } from "@/app/accuracy/actions";
import type { CheckLink } from "@/lib/accuracy/checks";

export type CheckTarget = {
  kind: CheckedFigure["kind"];
  recordId: string;
  title: string;
  reason?: string;
  current: number | null;
  currentLabel?: string;
  link?: CheckLink | null;
  emailSearch?: string;
  amountLabel: string;
  askLastPayment?: boolean;
  askEffective?: boolean;
  effectiveDefault?: string | null;
  watchKey?: string | null;
  /** Price changes: ask "have you had confirmation?" before the form. */
  confirmQuestion?: string;
};

const pounds = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);

type EmailProvider = "gmail" | "outlook" | "yahoo" | "icloud" | "other";
const EMAIL_PROVIDERS: Array<{ id: EmailProvider; label: string }> = [
  { id: "gmail", label: "Gmail" },
  { id: "outlook", label: "Outlook / Hotmail" },
  { id: "yahoo", label: "Yahoo" },
  { id: "icloud", label: "iCloud" },
  { id: "other", label: "Something else" },
];
const EMAIL_KEY = "loop:email-provider";

/** A link that searches the inbox where the provider supports it, otherwise opens it. */
export function emailSearchUrl(provider: EmailProvider, search: string): string | null {
  const q = encodeURIComponent(search);
  if (provider === "gmail") return `https://mail.google.com/mail/u/0/#search/${q}`;
  if (provider === "yahoo") return `https://mail.yahoo.com/d/search/keyword=${q}`;
  if (provider === "outlook") return "https://outlook.live.com/mail/0/";
  if (provider === "icloud") return "https://www.icloud.com/mail/";
  return null;
}

function readProvider(): EmailProvider | null {
  try { return (window.localStorage.getItem(EMAIL_KEY) as EmailProvider | null) || null; } catch { return null; }
}
function rememberProvider(provider: EmailProvider) {
  try { window.localStorage.setItem(EMAIL_KEY, provider); } catch { /* private mode: just don't remember */ }
}
function openTab(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

function EmailOpener({ search }: { search: string }) {
  const [provider, setProvider] = useState<EmailProvider | null>(null);
  const [opened, setOpened] = useState(false);
  useEffect(() => { setProvider(readProvider()); }, []);
  const open = (choice: EmailProvider) => {
    setProvider(choice);
    rememberProvider(choice);
    const url = emailSearchUrl(choice, search);
    if (url) openTab(url);
    setOpened(true);
  };
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-sm font-semibold text-slate-900">Check your email</p>
      <p className="mt-0.5 text-xs text-slate-500">Who do you use for email? LOOP opens it in a new tab{provider === "gmail" || provider === "yahoo" ? ", already searched" : ""}. On a phone it opens your email app if you have it.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {EMAIL_PROVIDERS.map((option) => (
          <button key={option.id} type="button" onClick={() => open(option.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${provider === option.id ? "bg-slate-950 text-white ring-slate-950" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-100"}`}>
            {option.label}
          </button>
        ))}
      </div>
      {opened || provider === "other" ? <p className="mt-2 text-xs text-slate-600">Search for <span className="rounded bg-white px-1.5 py-0.5 font-mono text-slate-900 ring-1 ring-slate-200">{search}</span></p> : null}
    </div>
  );
}

export function CheckModal({ target, onClose }: { target: CheckTarget; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<boolean | null>(target.confirmQuestion ? null : true);
  const [amount, setAmount] = useState(target.current != null && !target.askEffective ? "" : target.current != null ? String(target.current) : "");
  const [asOf, setAsOf] = useState(today());
  const [lastPayment, setLastPayment] = useState("");
  const [effective, setEffective] = useState(target.effectiveDefault || "");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = () => start(async () => {
    setError(null);
    try {
      await saveCheckedFigure({
        kind: target.kind,
        recordId: target.recordId,
        amount: Number(String(amount).replace(/[£,\s]/g, "")),
        asOf: target.askEffective ? null : asOf,
        lastPaymentDate: lastPayment || null,
        effective: target.askEffective ? effective : null,
        watchKey: target.watchKey ?? null,
      });
      router.refresh();
      onClose();
    } catch (e: any) {
      setError(e?.message || "That didn't save.");
    }
  });

  const input = "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label={`Check ${target.title}`} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Check the real figure</p>
            <h2 className="mt-1 text-lg font-bold text-slate-950">{target.title}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full px-2 py-1 text-slate-400 hover:bg-slate-100" aria-label="Close">✕</button>
        </div>
        {target.reason ? <p className="mt-2 text-sm text-slate-600">{target.reason}</p> : null}
        {target.current != null ? <p className="mt-2 text-xs text-slate-500">{target.currentLabel || "LOOP is using"}: <span className="font-semibold text-slate-800">{pounds(target.current)}</span></p> : null}

        <div className="mt-4 space-y-3">
          {target.link ? (
            <button type="button" onClick={() => openTab(target.link!.url)} className="flex w-full items-center justify-between rounded-xl bg-slate-50 p-3 text-left hover:bg-slate-100">
              <span>
                <span className="block text-sm font-semibold text-slate-900">Open {target.link.label}</span>
                <span className="block text-xs text-slate-500">Opens in a new tab, so this stays here for the figure.</span>
              </span>
              <span aria-hidden="true">↗</span>
            </button>
          ) : null}
          {target.emailSearch ? <EmailOpener search={target.emailSearch} /> : null}

          {target.confirmQuestion && confirmed === null ? (
            <div>
              <p className="text-sm font-semibold text-slate-900">{target.confirmQuestion}</p>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => setConfirmed(true)} className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white">Yes</button>
                <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Not yet</button>
              </div>
              <p className="mt-2 text-xs text-slate-500">Not yet keeps the estimate, and LOOP asks again.</p>
            </div>
          ) : null}

          {confirmed ? (
            <form onSubmit={(event) => { event.preventDefault(); save(); }} className="space-y-3">
              <label className="block text-xs font-semibold text-slate-600">
                {target.amountLabel}
                <span className="relative block">
                  <span className="pointer-events-none absolute left-3 top-1/2 mt-0.5 -translate-y-1/2 text-sm text-slate-400">£</span>
                  <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" required autoFocus className={`${input} pl-7`} />
                </span>
              </label>
              {target.askEffective ? (
                <label className="block text-xs font-semibold text-slate-600">
                  When does it start?
                  <input type="date" value={effective} onChange={(e) => setEffective(e.target.value)} required className={input} />
                </label>
              ) : (
                <label className="block text-xs font-semibold text-slate-600">
                  Correct on
                  <input type="date" value={asOf} max={today()} onChange={(e) => setAsOf(e.target.value)} className={input} />
                </label>
              )}
              {target.askLastPayment ? (
                <label className="block text-xs font-semibold text-slate-600">
                  Date of the last payment <span className="font-normal text-slate-400">(optional, sets the payment day)</span>
                  <input type="date" value={lastPayment} max={today()} onChange={(e) => setLastPayment(e.target.value)} className={input} />
                </label>
              ) : null}
              <div className="flex items-center gap-2 pt-1">
                <button type="submit" disabled={pending || !amount} className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{pending ? "Saving…" : "Save"}</button>
                <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50">Cancel</button>
                {error ? <span className="text-xs text-rose-600">{error}</span> : null}
              </div>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}

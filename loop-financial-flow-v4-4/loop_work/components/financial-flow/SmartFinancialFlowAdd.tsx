"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Search, Sparkles, X } from "lucide-react";

type AddKind =
  | "monthly"
  | "one_off"
  | "child_cost"
  | "savings"
  | "pot"
  | "income";

function amountFromText(value: string) {
  const match = value.replace(/,/g, "").match(/(?:£\s*)?(\d+(?:\.\d{1,2})?)/);
  return match ? Number(match[1]) : null;
}

function cleanedLabel(value: string) {
  return value
    .replace(/£\s*\d[\d,]*(?:\.\d{1,2})?/g, "")
    .replace(/\b\d+(?:\.\d{1,2})?\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function inferKind(value: string): AddKind {
  const text = value.toLowerCase();

  if (/(nursery|childcare|school|wraparound|after school|breakfast club|child cost|kids? club)/.test(text)) return "child_cost";
  if (/(save|saving|saver|deposit|isa|zopa|chip|plum|revolut savings|nationwide savings)/.test(text)) return "savings";
  if (/(pot|goal|holiday fund|emergency fund|car fund)/.test(text)) return "pot";
  if (/(salary|pay rise|income|dividend|bonus|benefit|child benefit|money in)/.test(text)) return "income";
  if (/(netflix|spotify|subscription|mortgage|rent|council tax|energy|electric|gas|water|insurance|broadband|phone|monthly|every month|regular)/.test(text)) return "monthly";
  return "one_off";
}

function kindLabel(kind: AddKind) {
  return {
    monthly: "Regular payment",
    one_off: "One-off spending",
    child_cost: "Child cost",
    savings: "Savings",
    pot: "Pot or goal",
    income: "Income",
  }[kind];
}

function destination(kind: AddKind, text: string, month?: string | null) {
  const label = cleanedLabel(text);
  const amount = amountFromText(text);
  const query = new URLSearchParams();
  if (month) query.set("month", month);

  if (kind === "monthly" || kind === "one_off" || kind === "child_cost") {
    query.set("add", kind);
    if (label) query.set("prefill_label", label);
    if (amount != null) query.set("prefill_amount", String(amount));
    return `/spending?${query.toString()}`;
  }

  if (kind === "savings") {
    return `/financial-flow?tab=savings${month ? `&month=${encodeURIComponent(month)}` : ""}`;
  }
  if (kind === "pot") return "/accounts?tab=pots";
  return "/income";
}

export function SmartFinancialFlowAdd({
  month,
  onClose,
}: {
  month?: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const inferred = useMemo(() => inferKind(text), [text]);
  const amount = useMemo(() => amountFromText(text), [text]);
  const label = useMemo(() => cleanedLabel(text), [text]);

  const examples = [
    "Netflix £18",
    "Nursery £336",
    "£200 to Zopa savings",
    "New car pot",
  ];

  const continueWith = (kind: AddKind) => {
    router.push(destination(kind, text, month));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[180] grid place-items-center bg-slate-950/35 p-4 backdrop-blur-sm">
      <section className="w-full max-w-2xl rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700"><Sparkles className="h-3.5 w-3.5" /> Quick add</p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">Tell LOOP what changed</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">LOOP will choose the shortest existing workflow. You can still change the type before continuing.</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-slate-100"><X className="h-4 w-4" /></button>
        </div>

        <label className="mt-5 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus-within:border-emerald-300 focus-within:bg-white">
          <Search className="h-5 w-5 text-slate-400" />
          <input
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && text.trim()) continueWith(inferred);
            }}
            placeholder='e.g. "Netflix £18" or "Nursery £336"'
            className="min-w-0 flex-1 bg-transparent text-base font-bold text-slate-950 outline-none placeholder:text-slate-400"
          />
        </label>

        {!text.trim() ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {examples.map((example) => (
              <button key={example} type="button" onClick={() => setText(example)} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200">
                {example}
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">Best route</p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-lg font-black text-slate-950">{kindLabel(inferred)}</p>
                <p className="text-xs font-bold text-slate-500">
                  {label || "New item"}{amount != null ? ` · £${amount.toLocaleString("en-GB", { maximumFractionDigits: 2 })}` : ""}
                </p>
              </div>
              <button type="button" onClick={() => continueWith(inferred)} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white">
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        <div className="mt-5">
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Or choose manually</p>
          <div className="flex flex-wrap gap-2">
            {(["monthly", "one_off", "child_cost", "savings", "pot", "income"] as AddKind[]).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => continueWith(kind)}
                className={`rounded-full px-3 py-2 text-xs font-black ${text.trim() && inferred === kind ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}
              >
                {kindLabel(kind)}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

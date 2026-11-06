"use client";

// One question at a time. Shared by the Spending and Income quick-add so
// adding something feels the same everywhere: type, press Enter, next.
import { useEffect, useRef, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2, X } from "lucide-react";

export type QuickStep = {
  key: string;
  question: string;
  hint?: string;
  content: ReactNode;
  /** false disables Next. */
  canContinue?: boolean;
  /** Steps whose answer is a single tap advance themselves; hide Next. */
  autoAdvance?: boolean;
};

export function StepModal({
  title,
  steps,
  index,
  onIndexChange,
  onClose,
  onFinish,
  saving = false,
  finishLabel = "Save",
  error,
}: {
  title: string;
  steps: QuickStep[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onFinish: () => void;
  saving?: boolean;
  finishLabel?: string;
  error?: string | null;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const step = steps[Math.min(index, steps.length - 1)];
  const isLast = index >= steps.length - 1;
  const canContinue = step.canContinue !== false;

  // Focus the first field of each step so typing just works.
  useEffect(() => {
    const field = bodyRef.current?.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea");
    field?.focus();
  }, [index]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function next() {
    if (!canContinue || saving) return;
    if (isLast) onFinish();
    else onIndexChange(index + 1);
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-t-[2rem] bg-white p-6 shadow-2xl sm:rounded-[2rem]">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">{title}</p>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 flex gap-1.5" aria-hidden>
          {steps.map((s, i) => (
            <span key={s.key} className={`h-1.5 flex-1 rounded-full transition ${i <= index ? "bg-emerald-500" : "bg-slate-200"}`} />
          ))}
        </div>

        <form
          onSubmit={(event) => { event.preventDefault(); next(); }}
          className="mt-6"
        >
          <h2 className="text-2xl font-black tracking-tight text-slate-950">{step.question}</h2>
          {step.hint ? <p className="mt-1 text-sm font-semibold text-slate-500">{step.hint}</p> : null}
          <div ref={bodyRef} className="mt-5">{step.content}</div>
          {error ? <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800">{error}</p> : null}

          <div className="mt-6 flex items-center justify-between gap-3">
            {index > 0 ? (
              <button type="button" onClick={() => onIndexChange(index - 1)} className="inline-flex items-center gap-2 rounded-full px-4 py-3 text-sm font-black text-slate-600 hover:bg-slate-100">
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
            ) : <span />}
            {step.autoAdvance && !isLast ? <span /> : (
              <button type="submit" disabled={!canContinue || saving} className={`inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-black text-white disabled:opacity-40 ${isLast ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-950 hover:bg-slate-800"}`}>
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : isLast ? <>{finishLabel} <Check className="h-4 w-4" /></> : <>Next <ArrowRight className="h-4 w-4" /></>}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

export const quickInputClass =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-xl font-black text-slate-950 outline-none transition focus:border-slate-950 focus:ring-4 focus:ring-slate-950/10";

export function MoneyField({ value, onChange, placeholder = "0.00" }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-xl font-black text-slate-400">£</span>
      <input inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={`${quickInputClass} pl-9`} />
    </div>
  );
}

export function ChoiceGrid<T extends string>({ options, value, onPick, columns = 1 }: { options: ReadonlyArray<{ value: T; label: string; detail?: string }>; value: T | ""; onPick: (value: T) => void; columns?: 1 | 2 | 3 }) {
  return (
    <div className={`grid gap-2 ${columns === 2 ? "grid-cols-2" : columns === 3 ? "grid-cols-3" : ""}`}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onPick(option.value)}
          aria-pressed={value === option.value}
          className={`rounded-2xl border px-4 py-3 text-left transition ${value === option.value ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white hover:border-slate-400"}`}
        >
          <span className={`block text-sm font-black ${value === option.value ? "text-white" : "text-slate-900"}`}>{option.label}</span>
          {option.detail ? <span className={`block text-xs font-semibold ${value === option.value ? "text-white/70" : "text-slate-500"}`}>{option.detail}</span> : null}
        </button>
      ))}
    </div>
  );
}

export const toNumber = (value: string) => Number(String(value).replace(/[£,\s]/g, "")) || 0;
export const todayIso = () => new Date().toISOString().slice(0, 10);

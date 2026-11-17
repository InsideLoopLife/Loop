"use client";

// A button that asks before it acts: the first click shows what will change, with "Yes" and "Cancel"
// in place of the button. Use it for one-click actions that change Loop's numbers (tariffs, status
// changes, deletes) so a stray click can't change anything.

import { useEffect, useRef, useState, type ReactNode } from "react";

export function ConfirmButton({
  children,
  question,
  detail,
  confirmLabel = "Yes, change it",
  onConfirm,
  disabled = false,
  className = "",
  danger = false,
}: {
  children: ReactNode;
  question: string;
  detail?: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
  className?: string;
  danger?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const yes = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (asking) yes.current?.focus(); }, [asking]);

  if (!asking) {
    return <button type="button" disabled={disabled} onClick={() => setAsking(true)} className={className}>{children}</button>;
  }
  return (
    <span
      role="alertdialog"
      aria-label={question}
      onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setAsking(false); } }}
      className={`inline-flex max-w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl px-3 py-2 text-xs ring-1 ${danger ? "bg-rose-50 ring-rose-200" : "bg-amber-50 ring-amber-200"}`}
    >
      <span className={`font-bold ${danger ? "text-rose-950" : "text-amber-950"}`}>{question}</span>
      {detail ? <span className={`basis-full text-[11px] font-semibold ${danger ? "text-rose-900/80" : "text-amber-900/80"}`}>{detail}</span> : null}
      <button
        ref={yes}
        type="button"
        disabled={disabled}
        onClick={() => { setAsking(false); onConfirm(); }}
        className={`rounded-lg px-3 py-1.5 font-bold text-white disabled:opacity-50 ${danger ? "bg-rose-700" : "bg-slate-950"}`}
      >
        {confirmLabel}
      </button>
      <button type="button" onClick={() => setAsking(false)} className="font-bold text-slate-600">Cancel</button>
    </span>
  );
}

/**
 * The same ask-first pattern for buttons inside a <form action={…}> (including server-rendered forms):
 * the first click asks, and "Yes" is the real submit button, so the form's action runs as before.
 */
export function ConfirmSubmit({
  children,
  question,
  detail,
  confirmLabel = "Yes, change it",
  danger = false,
  className = "",
  disabled = false,
  name,
  value,
  formAction,
  title,
}: {
  children: ReactNode;
  question: string;
  detail?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  className?: string;
  disabled?: boolean;
  name?: string;
  value?: string | number;
  formAction?: string | ((formData: FormData) => void | Promise<void>);
  title?: string;
}) {
  const [asking, setAsking] = useState(false);
  const yes = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (asking) yes.current?.focus(); }, [asking]);

  if (!asking) {
    return <button type="button" title={title} disabled={disabled} onClick={() => setAsking(true)} className={className}>{children}</button>;
  }
  return (
    <span
      role="alertdialog"
      aria-label={question}
      onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setAsking(false); } }}
      className={`inline-flex max-w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl px-3 py-2 text-left text-xs font-normal normal-case tracking-normal ring-1 ${danger ? "bg-rose-50 ring-rose-200" : "bg-amber-50 ring-amber-200"}`}
    >
      <span className={`font-bold ${danger ? "text-rose-950" : "text-amber-950"}`}>{question}</span>
      {detail ? <span className={`basis-full text-[11px] font-semibold ${danger ? "text-rose-900/80" : "text-amber-900/80"}`}>{detail}</span> : null}
      {/* Not unmounted on click: the browser needs the button to still be there to submit the form. */}
      <button
        ref={yes}
        type="submit"
        name={name}
        value={value}
        formAction={formAction as never}
        className={`rounded-lg px-3 py-1.5 font-bold text-white ${danger ? "bg-rose-700" : "bg-slate-950"}`}
      >
        {confirmLabel}
      </button>
      <button type="button" onClick={() => setAsking(false)} className="font-bold text-slate-600">Cancel</button>
    </span>
  );
}

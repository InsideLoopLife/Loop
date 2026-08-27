"use client";

import { useState, type FormEvent } from "react";
import { ArrowUp } from "lucide-react";

export function ChatComposer({
  onSend,
  disabled,
  placeholder = "Ask about your LOOP…",
  hint,
}: {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  hint?: string | null;
}) {
  const [value, setValue] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  }

  return (
    <div className="sticky bottom-10 z-10 pt-2">
      <form className="flex items-center gap-2 rounded-full border border-slate-200 bg-white p-1.5 pl-5 shadow-[0_18px_48px_-24px_rgba(15,23,42,.35)] ring-1 ring-transparent transition focus-within:border-indigo-300 focus-within:ring-indigo-100" onSubmit={submit}>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus-visible:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          aria-label="Send"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-indigo-600 text-white transition focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </form>
      {hint && <p className="mt-1.5 px-4 text-center text-[11px] font-semibold text-slate-400">{hint}</p>}
    </div>
  );
}

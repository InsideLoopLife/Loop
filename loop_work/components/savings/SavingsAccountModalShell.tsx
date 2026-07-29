"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function SavingsAccountModalShell({
  trigger,
  title,
  subtitle,
  children,
  triggerClassName = "",
}: {
  trigger: ReactNode;
  title: string;
  subtitle?: string | null;
  children: ReactNode;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const modal = open ? (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="absolute inset-0 cursor-default" />
      <div className="relative my-8 w-full max-w-5xl overflow-hidden rounded-[2.2rem] border border-slate-200 bg-white shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 bg-gradient-to-br from-slate-50 via-white to-emerald-50 p-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Savings account</p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">{title}</h2>
            {subtitle ? <p className="mt-1 max-w-2xl text-sm font-bold text-slate-500">{subtitle}</p> : null}
          </div>
          <button type="button" onClick={() => setOpen(false)} className="rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white shadow-sm hover:bg-slate-800">
            Close
          </button>
        </div>
        <div className="max-h-[74vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={triggerClassName}>
        {trigger}
      </button>
      {mounted && modal ? createPortal(modal, document.body) : null}
    </>
  );
}

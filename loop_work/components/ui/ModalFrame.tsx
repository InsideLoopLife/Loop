"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

export function ModalFrame({
  title,
  description,
  eyebrow,
  children,
  onClose,
  maxWidth = "max-w-5xl",
  zIndex = "z-[100]",
}: {
  title: string;
  description?: string | null;
  eyebrow?: string | null;
  children: ReactNode;
  onClose: () => void;
  maxWidth?: string;
  zIndex?: string;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      className={`fixed inset-0 ${zIndex} flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-6`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={`relative flex max-h-[94dvh] w-full ${maxWidth} flex-col overflow-hidden rounded-t-[2rem] border border-white/70 bg-white shadow-2xl sm:max-h-[92dvh] sm:rounded-[2rem]`}
      >
        <header className="relative shrink-0 border-b border-slate-100 bg-white px-5 py-5 pr-16 sm:px-6 sm:pr-20">
          {eyebrow ? (
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
              {eyebrow}
            </p>
          ) : null}
          <h2 className={`${eyebrow ? "mt-1" : ""} text-2xl font-black tracking-tight text-slate-950`}>
            {title}
          </h2>
          {description ? (
            <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500">
              {description}
            </p>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-700 shadow-sm transition hover:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:right-5 sm:top-5"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 [scrollbar-gutter:stable] sm:p-6">
          {children}
        </div>
      </section>
    </div>
  );
}

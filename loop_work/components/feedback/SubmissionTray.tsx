"use client";

// Every save on the site shows up here: "Saving …" the moment it's sent,
// then "Saved – it's live" once the page has refreshed with it, or a clear
// "didn't save" if it failed. Works for every form without changing them.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2, X } from "lucide-react";

type Item = { id: number; label: string; state: "saving" | "saved" | "failed"; detail?: string };

const clean = (text: string | null | undefined) => String(text || "").replace(/\s+/g, " ").trim().slice(0, 70);

/** A short name for what's being saved: the form's own label, its heading, or its button. */
function labelFor(form: HTMLFormElement, submitter?: HTMLElement | null) {
  const own = form.getAttribute("data-save-label");
  if (own) return clean(own);
  const scope = form.closest("[role=dialog], section, details, article, li") || form;
  const heading = scope.querySelector("h1, h2, h3, summary, legend");
  const button = clean(submitter?.textContent);
  const name = clean(heading?.textContent);
  if (name && button && !/^(save|saving|submit|add|ok)/i.test(button)) return `${button} – ${name}`;
  return name || button || "your changes";
}

function hasActionHeader(init?: RequestInit) {
  const h = init?.headers;
  if (!h) return false;
  if (h instanceof Headers) return h.has("next-action");
  if (Array.isArray(h)) return h.some(([k]) => k.toLowerCase() === "next-action");
  return Object.keys(h).some((k) => k.toLowerCase() === "next-action");
}

export function SubmissionTray() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const nextId = useRef(1);
  const waiting = useRef<Array<{ id: number; label: string; at: number }>>([]);

  const update = (id: number, patch: Partial<Item>) => setItems((list) => list.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const dismiss = (id: number) => setItems((list) => list.filter((item) => item.id !== id));

  useEffect(() => {
    // 1. A form is sent: note what it was, ready to pair with its request.
    const onSubmit = (event: SubmitEvent) => {
      const form = event.target as HTMLFormElement | null;
      if (!form || form.hasAttribute("data-quiet")) return;
      waiting.current = [...waiting.current.filter((w) => Date.now() - w.at < 2000), { id: 0, label: labelFor(form, event.submitter as HTMLElement | null), at: Date.now() }];
    };
    document.addEventListener("submit", onSubmit, true);

    // 2. Every server action is a POST with a Next-Action header: track it.
    const originalFetch = window.fetch;
    window.fetch = async function patched(input: RequestInfo | URL, init?: RequestInit) {
      if (!hasActionHeader(init)) return originalFetch(input as any, init);
      // Pair with a recent form submit; otherwise it's a button or background save.
      const recent = waiting.current.findIndex((w) => Date.now() - w.at < 2000);
      const fromForm = recent >= 0 ? waiting.current.splice(recent, 1)[0] : null;
      const id = nextId.current++;
      const label = fromForm?.label || "your changes";
      // Background saves only show if they take a moment, so quick taps stay quiet.
      let shown = Boolean(fromForm);
      const show = () => { shown = true; setItems((list) => [...list, { id, label, state: "saving" as const }].slice(-3)); };
      const timer = fromForm ? (show(), null) : window.setTimeout(show, 700);
      try {
        const response = await originalFetch(input as any, init);
        if (timer) window.clearTimeout(timer);
        if (!response.ok) {
          if (!shown) show();
          update(id, { state: "failed", detail: response.status === 413 ? "That file is too big." : "Nothing was changed. Please try again." });
        } else if (shown) {
          // The response carries the refreshed page; refresh once more so every
          // panel shows the saved version, then confirm.
          router.refresh();
          update(id, { state: "saved" });
          window.setTimeout(() => dismiss(id), 3500);
        }
        return response;
      } catch (error) {
        if (timer) window.clearTimeout(timer);
        if (!shown) show();
        update(id, { state: "failed", detail: "Couldn't reach LOOP. Check your connection and try again." });
        throw error;
      }
    } as typeof window.fetch;

    return () => {
      document.removeEventListener("submit", onSubmit, true);
      window.fetch = originalFetch;
    };
  }, [router]);

  if (!items.length) return null;
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-3 bottom-4 z-[300] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-5 sm:items-end">
      {items.map((item) => (
        <div key={item.id} role="status"
          className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-[0_18px_50px_-20px_rgba(15,23,42,.45)] ${item.state === "failed" ? "border-red-200 bg-red-50 text-red-900" : item.state === "saved" ? "border-[var(--pine)]/30 bg-white text-[var(--ink)]" : "border-[var(--line)] bg-white text-[var(--ink)]"}`}>
          <span className="mt-0.5">
            {item.state === "saving" ? <Loader2 className="h-4 w-4 animate-spin text-[var(--muted)]" /> : item.state === "saved" ? <span className="grid h-4 w-4 place-items-center rounded-full bg-[var(--pine)] text-white"><Check className="h-3 w-3" /></span> : <AlertTriangle className="h-4 w-4 text-red-600" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">
              {item.state === "saving" ? "Saving…" : item.state === "saved" ? "Saved – it's live" : "That didn't save"}
            </span>
            <span className="block truncate text-xs text-[var(--muted)]">{item.state === "failed" ? item.detail : item.label}</span>
          </span>
          {item.state !== "saving" ? (
            <button type="button" onClick={() => dismiss(item.id)} aria-label="Close" className="text-[var(--muted)] hover:text-[var(--ink)]"><X className="h-4 w-4" /></button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

"use client";

// The bell in the header: a count, and a dropdown of the latest notifications
// with a way through to the full notification centre.
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Bell, CheckCheck, CheckCircle2, Settings2, X } from "lucide-react";
import { AreaIcon } from "./AreaIcon";
import { areaByKey, timeAgo, type AreaKey } from "@/lib/notifications/areas";
import { dismissById, markRead } from "@/app/notifications/actions";

type Item = {
  id: string;
  title: string;
  body: string | null;
  cta_href: string | null;
  cta_label: string | null;
  severity: string | null;
  status: string;
  created_at: string;
  area: AreaKey;
  decision: boolean;
};

export function NotificationBell({ count, onCountChange, compact = false }: { count: number; onCountChange?: (n: number) => void; compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"unread" | "all">("unread");
  const [items, setItems] = useState<Item[] | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<CSSProperties>({});

  // The panel is portalled to <body> so headers and side bars can't clip it;
  // place it under the bell, or beside it when the bell is in the side bar.
  const position = useCallback(() => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    const vw = window.innerWidth;
    if (vw < 640) setPlace({ left: 12, right: 12, top: rect.bottom + 10 });
    else if (rect.right < 420) setPlace({ left: rect.right + 12, top: Math.max(12, rect.top - 8), width: 400 });
    else setPlace({ right: Math.max(12, vw - rect.right), top: rect.bottom + 10, width: 400 });
  }, []);
  useEffect(() => {
    if (!open) return;
    position();
    window.addEventListener("resize", position);
    return () => window.removeEventListener("resize", position);
  }, [open, position]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/recent", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      setItems(json.items || []);
      onCountChange?.(Number(json.unread || 0));
    } catch {
      /* keep what we have */
    }
  }, [onCountChange]);

  useEffect(() => { if (open) load(); }, [open, load]);
  useEffect(() => { if (open && items) load(); }, [count]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!box.current?.contains(t) && !panel.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const changed = () => { window.dispatchEvent(new Event("loop:notifications-updated")); };

  const openItem = async (item: Item) => {
    setOpen(false);
    if (item.status === "unread" && !item.decision) {
      setItems((list) => list?.map((n) => (n.id === item.id ? { ...n, status: "read" } : n)) ?? null);
      onCountChange?.(Math.max(0, count - 1));
      markRead({ ids: [item.id] }).then(changed).catch(() => undefined);
    }
    router.push(item.decision ? `/notifications/${item.id}` : item.cta_href || "/notifications");
  };

  const dismiss = async (item: Item) => {
    setItems((list) => list?.filter((n) => n.id !== item.id) ?? null);
    if (item.status === "unread") onCountChange?.(Math.max(0, count - 1));
    await dismissById(item.id).catch(() => undefined);
    changed();
  };

  const readAll = async () => {
    setItems((list) => list?.map((n) => (n.decision ? n : { ...n, status: "read" })) ?? null);
    await markRead({}).catch(() => undefined);
    changed();
    load();
  };

  const shown = (items || []).filter((n) => view === "all" || n.status === "unread");
  const unreadHere = (items || []).filter((n) => n.status === "unread" && !n.decision).length;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onPointerEnter={() => { if (!items) load(); }}
        aria-label={count ? `Notifications, ${count} unread` : "Notifications"}
        aria-expanded={open}
        className={`relative grid place-items-center rounded-full border text-slate-700 transition ${open ? "border-[var(--pine)] bg-[var(--pine-wash)] text-[var(--pine-strong)]" : "border-slate-200 bg-white hover:bg-slate-50"} ${compact ? "h-9 w-9" : "h-10 w-10"}`}
      >
        <Bell className={compact ? "h-4 w-4" : "h-[18px] w-[18px]"} />
        {count > 0 ? (
          <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[var(--pine)] px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>

      {open && typeof document !== "undefined" ? createPortal(
        <div
          ref={panel}
          role="dialog"
          aria-label="Notifications"
          style={{ ...place, maxHeight: `min(640px, calc(100vh - ${Number(place.top ?? 80) + 16}px))` }}
          className="fixed z-[160] flex flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_24px_70px_-20px_rgba(15,23,42,.35)]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 pb-3 pt-4">
            <div>
              <p className="text-[15px] font-bold text-[var(--ink)]">Notifications</p>
              <p className="text-xs text-[var(--muted)]">{count ? `${count} unread` : "You're all caught up"}</p>
            </div>
            <div className="flex items-center gap-1">
              {unreadHere > 0 ? (
                <button type="button" onClick={readAll} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-[var(--pine-strong)] hover:bg-[var(--pine-wash)]">
                  <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                </button>
              ) : null}
              <Link href="/account?tab=notifications" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-slate-50" aria-label="Notification settings" title="Notification settings">
                <Settings2 className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="flex gap-1 px-4 pt-3" role="tablist">
            {(["unread", "all"] as const).map((key) => (
              <button key={key} type="button" role="tab" aria-selected={view === key} onClick={() => setView(key)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${view === key ? "bg-[var(--ink)] text-white" : "text-[var(--muted)] hover:bg-slate-100"}`}>
                {key === "unread" ? "Unread" : "All recent"}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {items === null ? (
              <div className="space-y-2 p-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}</div>
            ) : shown.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-10 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--pine-wash)] text-[var(--pine-strong)]"><CheckCircle2 className="h-6 w-6" /></span>
                <p className="mt-3 text-sm font-semibold text-[var(--ink)]">{view === "unread" ? "Nothing new" : "No notifications yet"}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">Bill rises, deals ending and your weekly updates will show up here.</p>
              </div>
            ) : (
              <ul className="space-y-0.5">
                {shown.map((item) => {
                  const area = areaByKey(item.area);
                  const unread = item.status === "unread";
                  return (
                    <li key={item.id} className="group relative">
                      <button type="button" onClick={() => openItem(item)} className={`flex w-full gap-3 rounded-xl p-2.5 pr-8 text-left transition hover:bg-slate-50 ${unread ? "" : "opacity-75"}`}>
                        <AreaIcon area={item.area} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className={`line-clamp-2 text-[13px] leading-snug text-[var(--ink)] ${unread ? "font-semibold" : "font-medium"}`}>{item.title}</span>
                          {item.body ? <span className="mt-0.5 line-clamp-1 text-xs text-[var(--muted)]">{item.body}</span> : null}
                          <span className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
                            {item.decision ? <span className="rounded-full bg-amber-100 px-1.5 py-px font-semibold text-amber-800">Needs you</span> : item.severity === "urgent" ? <span className="rounded-full bg-rose-100 px-1.5 py-px font-semibold text-rose-700">Urgent</span> : null}
                            <span>{area?.label}</span><span aria-hidden>·</span><span>{timeAgo(item.created_at)}</span>
                          </span>
                        </span>
                      </button>
                      {unread ? <span className={`pointer-events-none absolute right-3 top-4 h-2 w-2 rounded-full ${area?.accent ?? "bg-[var(--pine)]"} group-hover:hidden`} /> : null}
                      {!item.decision ? (
                        <button type="button" onClick={() => dismiss(item)} aria-label={`Dismiss: ${item.title}`} title="Dismiss"
                          className="absolute right-1.5 top-2 hidden h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-white hover:text-slate-700 group-hover:grid focus:grid">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <Link href="/notifications" onClick={() => setOpen(false)} className="flex items-center justify-center gap-1.5 border-t border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-[13px] font-semibold text-[var(--pine-strong)] hover:bg-[var(--pine-wash)]">
            Open notification centre <ArrowRight className="h-4 w-4" />
          </Link>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

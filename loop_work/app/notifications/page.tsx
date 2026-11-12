import { getVerifiedUser } from "@/lib/supabase/verified-user";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Check, CheckCheck, CheckCircle2, RefreshCw, Settings2, X } from "lucide-react";
import { NotificationAutoRefresh } from "@/components/notifications/NotificationAutoRefresh";
import { AreaIcon } from "@/components/notifications/AreaIcon";
import { createClient } from "@/lib/supabase/server";
import { AREAS, areaByKey, areaOf, needsDecision, timeAgo, type AreaKey } from "@/lib/notifications/areas";
import { acceptNotificationRequest, createWeeklyPreview, declineNotificationRequest, dismissNotification, markAllReadForm, markNotificationRead } from "./actions";

type Row = Record<string, any> & { id: string; area: AreaKey; decision: boolean };

const severityRank = (n: Row) => (n.severity === "urgent" ? 0 : n.severity === "warning" ? 1 : 2);
const newestFirst = (a: Row, b: Row) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
// Unread first, then the most pressing, then newest.
const byImportance = (a: Row, b: Row) => Number(b.status === "unread") - Number(a.status === "unread") || severityRank(a) - severityRank(b) || newestFirst(a, b);

function SeverityPill({ n }: { n: Row }) {
  if (n.decision) return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Needs you</span>;
  if (n.severity === "urgent") return <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">Urgent</span>;
  if (n.severity === "warning" && n.status === "unread") return <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-800">Heads up</span>;
  return null;
}

function IconButton({ action, id, label, children }: { action: (fd: FormData) => Promise<void>; id: string; label: string; children: React.ReactNode }) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button aria-label={label} title={label} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-white hover:text-slate-700 hover:shadow-sm">{children}</button>
    </form>
  );
}

function Item({ n, showArea = false }: { n: Row; showArea?: boolean }) {
  const area = areaByKey(n.area);
  const unread = n.status === "unread";
  const type = String(n.notification_type || "");
  const writeOff = type === "investment_write_off_approval";
  const loss = Number(n.metadata?.loss_gbp || 0);
  return (
    <article className={`group relative flex gap-3 rounded-xl px-3 py-3.5 transition hover:bg-slate-50 sm:px-4 ${unread ? "" : "opacity-80"}`}>
      {unread ? <span className={`absolute left-0 top-4 h-8 w-1 rounded-r-full ${area?.accent ?? "bg-[var(--pine)]"}`} aria-hidden /> : null}
      <AreaIcon area={n.area} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className={`text-[15px] leading-snug text-[var(--ink)] ${unread ? "font-semibold" : "font-medium"}`}>{n.title}</h3>
          <SeverityPill n={n} />
        </div>
        {n.body ? <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{n.body}</p> : null}
        <p className="mt-1.5 text-xs text-slate-400">
          {showArea && area ? <>{area.label} · </> : null}
          <time dateTime={n.created_at} title={new Date(n.created_at).toLocaleString("en-GB")}>{timeAgo(n.created_at)}</time>
          {!unread && !n.decision ? " · Read" : null}
        </p>

        {n.decision ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {writeOff ? (
              <>
                <form action={acceptNotificationRequest}><input type="hidden" name="id" value={n.id} /><button className="rounded-lg bg-[var(--ink)] px-3 py-1.5 text-xs font-semibold text-white">{loss > 0 ? `Record £${loss.toFixed(2)} loss and archive` : "Archive it"}</button></form>
                <form action={declineNotificationRequest}><input type="hidden" name="id" value={n.id} /><button className="rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">It&apos;s still trading</button></form>
              </>
            ) : (
              <>
                <Link href={`/notifications/${n.id}`} className="rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">See details</Link>
                <form action={acceptNotificationRequest}><input type="hidden" name="id" value={n.id} /><button className="rounded-lg bg-[var(--pine)] px-3 py-1.5 text-xs font-semibold text-white">Accept</button></form>
                <form action={declineNotificationRequest}><input type="hidden" name="id" value={n.id} /><button className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-white">Decline</button></form>
              </>
            )}
          </div>
        ) : n.cta_href ? (
          <Link href={`/notifications/open/${n.id}`} prefetch={false} className="mt-2.5 inline-flex items-center gap-1 text-[13px] font-semibold text-[var(--pine-strong)] hover:underline">
            {n.cta_label || "Open"} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>
      {!n.decision ? (
        <div className="flex flex-none items-start gap-0.5 opacity-100 sm:opacity-0 sm:transition sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          {unread ? <IconButton action={markNotificationRead} id={n.id} label="Mark as read"><Check className="h-4 w-4" /></IconButton> : null}
          <IconButton action={dismissNotification} id={n.id} label="Dismiss"><X className="h-4 w-4" /></IconButton>
        </div>
      ) : null}
    </article>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-[var(--line)] bg-white px-6 py-14 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-[var(--pine-wash)] text-[var(--pine-strong)]"><CheckCircle2 className="h-7 w-7" /></span>
      <p className="mt-4 text-base font-semibold text-[var(--ink)]">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-[var(--muted)]">{body}</p>
    </div>
  );
}

export default async function NotificationsPage({ searchParams }: { searchParams?: Promise<{ area?: string; tab?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await getVerifiedUser(supabase);
  if (!user) redirect("/login");
  const params = searchParams ? await searchParams : {};
  const active: AreaKey | "all" = areaByKey(params.area || "") ? (params.area as AreaKey) : "all";

  await supabase.rpc("app_cleanup_household_invite_state", { p_user_id: user.id });
  const { data } = await supabase
    .from("app_notifications")
    .select("*")
    .eq("user_id", user.id)
    .neq("status", "dismissed")
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order("created_at", { ascending: false })
    .limit(200);

  const rows: Row[] = (data || []).map((n: any) => ({ ...n, area: areaOf(n), decision: needsDecision(n) }));
  const inArea = (key: AreaKey) => rows.filter((n) => n.area === key).sort(byImportance);
  const unread = rows.filter((n) => n.status === "unread").length;
  const decisions = inArea("decisions");
  const urgent = rows.filter((n) => n.status === "unread" && (n.severity === "urgent" || n.severity === "warning")).length;
  const areas = AREAS.filter((a) => a.key !== "decisions");
  const withItems = areas.filter((a) => inArea(a.key).length);
  const current = active === "all" ? null : areaByKey(active)!;
  const currentRows = active === "all" ? [] : inArea(active);
  const currentUnread = currentRows.filter((n) => n.status === "unread" && !n.decision).length;

  const navItem = (key: AreaKey | "all", label: string, count: number, unreadCount: number) => {
    const on = active === key;
    return (
      <Link key={key} href={key === "all" ? "/notifications" : `/notifications?area=${key}`} scroll={false}
        className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition lg:w-full ${on ? "bg-white font-semibold text-[var(--ink)] shadow-sm ring-1 ring-[var(--line)]" : "text-[var(--muted)] hover:bg-white/70 hover:text-[var(--ink)]"} ${count === 0 && !on ? "opacity-50" : ""}`}>
        {key === "all" ? <span className="hidden h-8 w-8 place-items-center rounded-[10px] bg-[var(--ink)] text-white lg:grid"><CheckCheck className="h-4 w-4" /></span> : <span className="hidden lg:block"><AreaIcon area={key} size="sm" /></span>}
        <span className="flex-1 whitespace-nowrap">{label}</span>
        {unreadCount ? <span className="rounded-full bg-[var(--pine)] px-1.5 py-px text-[11px] font-bold text-white">{unreadCount}</span> : count ? <span className="text-xs text-slate-400">{count}</span> : null}
      </Link>
    );
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
      <NotificationAutoRefresh />

      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--ink)]">Notifications</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {unread ? <><strong className="font-semibold text-[var(--ink)]">{unread} new</strong>{decisions.length ? <> · {decisions.length} waiting for your decision</> : null}{urgent ? <> · {urgent} need attention soon</> : null}</> : "You're all caught up."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form action={markAllReadForm}>
            <input type="hidden" name="area" value={active === "all" ? "" : active} />
            <button disabled={active === "all" ? unread - decisions.length <= 0 : currentUnread === 0} className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm font-semibold text-[var(--ink)] hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
              <CheckCheck className="h-4 w-4" /> {active === "all" ? "Mark all read" : "Mark these read"}
            </button>
          </form>
          <form action={createWeeklyPreview}>
            <button className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm font-semibold text-[var(--ink)] hover:bg-slate-50" title="Check your bills, deals and investments for anything new">
              <RefreshCw className="h-4 w-4" /> Check now
            </button>
          </form>
          <Link href="/account?tab=notifications" className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--line)] bg-white text-[var(--muted)] hover:bg-slate-50" aria-label="Notification settings" title="Notification settings">
            <Settings2 className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="Notification areas" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:sticky lg:top-24 lg:mx-0 lg:flex-col lg:self-start lg:overflow-visible lg:px-0">
          {navItem("all", "Everything", rows.length, unread)}
          {decisions.length ? navItem("decisions", "Needs your decision", decisions.length, decisions.length) : null}
          <p className="mb-1 mt-4 hidden px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 lg:block">By area</p>
          {areas.map((a) => { const list = inArea(a.key); return navItem(a.key, a.label, list.length, list.filter((n) => n.status === "unread").length); })}
        </nav>

        <div className="min-w-0 space-y-5">
          {active === "all" ? (
            <>
              {decisions.length ? (
                <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-2">
                  <div className="flex items-center gap-2 px-3 pb-1 pt-2">
                    <h2 className="text-sm font-semibold text-amber-900">Needs your decision</h2>
                    <span className="rounded-full bg-amber-200/70 px-1.5 text-[11px] font-bold text-amber-900">{decisions.length}</span>
                  </div>
                  <div className="divide-y divide-amber-100">{decisions.map((n) => <Item key={n.id} n={n} showArea />)}</div>
                </section>
              ) : null}

              {withItems.length === 0 && !decisions.length ? (
                <Empty title="You're all caught up" body="When a bill is about to go up, a deal is ending or your weekly update is ready, it'll show up here." />
              ) : null}

              {withItems.map((a) => {
                const list = inArea(a.key);
                const fresh = list.filter((n) => n.status === "unread").length;
                return (
                  <section key={a.key} className="rounded-2xl border border-[var(--line)] bg-white">
                    <div className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3">
                      <AreaIcon area={a.key} size="sm" />
                      <div className="min-w-0 flex-1">
                        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-[var(--ink)]">
                          {a.label}
                          {fresh ? <span className="rounded-full bg-[var(--pine-wash)] px-2 py-px text-[11px] font-semibold text-[var(--pine-strong)]">{fresh} new</span> : null}
                        </h2>
                        <p className="truncate text-xs text-[var(--muted)]">{a.blurb}</p>
                      </div>
                      {a.href ? <Link href={a.href} className="hidden shrink-0 items-center gap-1 text-xs font-semibold text-[var(--muted)] hover:text-[var(--ink)] sm:inline-flex">Go to {a.label.split(" ")[0]} <ArrowRight className="h-3.5 w-3.5" /></Link> : null}
                    </div>
                    <div className="divide-y divide-[var(--line)] p-1">{list.slice(0, 3).map((n) => <Item key={n.id} n={n} />)}</div>
                    {list.length > 3 ? (
                      <Link href={`/notifications?area=${a.key}`} className="block border-t border-[var(--line)] px-4 py-2.5 text-center text-xs font-semibold text-[var(--pine-strong)] hover:bg-[var(--paper)]">
                        See all {list.length} in {a.label}
                      </Link>
                    ) : null}
                  </section>
                );
              })}
            </>
          ) : (
            <>
              <section className="flex items-center gap-4 rounded-2xl border border-[var(--line)] bg-white p-5">
                <AreaIcon area={current!.key} />
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold text-[var(--ink)]">{current!.label}</h2>
                  <p className="text-sm text-[var(--muted)]">{current!.blurb}</p>
                </div>
                {current!.href ? <Link href={current!.href} className="hidden shrink-0 items-center gap-1 rounded-xl bg-[var(--ink)] px-3 py-2 text-sm font-semibold text-white sm:inline-flex">Open <ArrowRight className="h-4 w-4" /></Link> : null}
              </section>
              {currentRows.length === 0 ? (
                <Empty title={`Nothing in ${current!.label}`} body="New notifications for this part of LOOP will show up here." />
              ) : (
                ([["New", currentRows.filter((n) => n.status === "unread")], ["Earlier", currentRows.filter((n) => n.status !== "unread").sort(newestFirst)]] as const).map(([label, list]) =>
                  list.length ? (
                    <section key={label}>
                      <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</h3>
                      <div className="divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)] bg-white p-1">{list.map((n) => <Item key={n.id} n={n} />)}</div>
                    </section>
                  ) : null,
                )
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}

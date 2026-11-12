// Which part of LOOP a notification belongs to. Shared by the bell dropdown
// and the notification centre, so both group things the same way.

export type AreaKey = "decisions" | "money" | "home" | "invest" | "savings" | "health" | "household" | "account";

export type Area = {
  key: AreaKey;
  label: string;
  blurb: string;
  href: string | null;
  /** Tailwind classes for the icon tile. */
  tile: string;
  /** Accent for the unread bar and dots. */
  accent: string;
};

export const AREAS: Area[] = [
  { key: "decisions", label: "Needs your decision", blurb: "Invites and requests waiting for a yes or no.", href: null, tile: "bg-amber-100 text-amber-800", accent: "bg-amber-500" },
  { key: "money", label: "Bills & spending", blurb: "Price rises, bills and money in and out.", href: "/financial-flow", tile: "bg-orange-50 text-orange-700", accent: "bg-orange-500" },
  { key: "home", label: "Home & mortgage", blurb: "Your mortgage deal, renewal and council tax.", href: "/mortgage", tile: "bg-sky-50 text-sky-700", accent: "bg-sky-500" },
  { key: "invest", label: "Investments & pensions", blurb: "Weekly progress and changes to your holdings.", href: "/investments", tile: "bg-indigo-50 text-indigo-700", accent: "bg-indigo-500" },
  { key: "savings", label: "Savings", blurb: "Rates ending and better places for your cash.", href: "/financial-flow?tab=savings", tile: "bg-emerald-50 text-emerald-700", accent: "bg-emerald-500" },
  { key: "health", label: "Health & food", blurb: "Your food week and menu imports.", href: "/nutrition", tile: "bg-rose-50 text-rose-700", accent: "bg-rose-500" },
  { key: "household", label: "Household", blurb: "People in your household and shared records.", href: "/household", tile: "bg-violet-50 text-violet-700", accent: "bg-violet-500" },
  { key: "account", label: "Account & updates", blurb: "Your account and news from LOOP.", href: "/account", tile: "bg-slate-100 text-slate-700", accent: "bg-slate-500" },
];

export const areaByKey = (key: string) => AREAS.find((a) => a.key === key) ?? null;

type Row = { notification_type?: string | null; cta_href?: string | null; status?: string | null; action_status?: string | null };

/** Waiting on a yes/no from this person. */
export function needsDecision(n: Row) {
  const type = String(n.notification_type || "").toLowerCase();
  const asks = /household_invite|profile_claim|allocation|approval|write_off/.test(type);
  return asks && n.status === "unread" && !n.action_status;
}

export function areaOf(n: Row): AreaKey {
  if (needsDecision(n)) return "decisions";
  const type = String(n.notification_type || "").toLowerCase();
  if (/savings/.test(type)) return "savings";
  if (/mortgage|renewal|council|house|home/.test(type)) return "home";
  if (/investment|pension|stock|holding|write_off/.test(type)) return "invest";
  if (/nutrition|food|meal|health|lifestyle/.test(type)) return "health";
  if (/bill|price|spending|income|budget|pay/.test(type)) return "money";
  if (/household|invite|profile|allocation/.test(type)) return "household";
  const href = String(n.cta_href || "");
  if (href.includes("tab=savings")) return "savings";
  if (/^\/(mortgage|house|home)/.test(href)) return "home";
  if (/^\/(investments|pensions)/.test(href)) return "invest";
  if (/^\/(nutrition|lifestyle|health)/.test(href)) return "health";
  if (/^\/(financial-flow|spending|income|dashboard)/.test(href)) return "money";
  if (/^\/household/.test(href)) return "household";
  return "account";
}

/** "Just now", "5m ago", "3h ago", "Yesterday", "Mon", "12 Nov". */
export function timeAgo(iso: string, now = new Date()) {
  const then = new Date(iso);
  const mins = Math.round((now.getTime() - then.getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24 && then.getDate() === now.getDate()) return `${hours}h ago`;
  const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(then.toDateString()).getTime()) / 86400000);
  if (days <= 1) return "Yesterday";
  if (days < 7) return then.toLocaleDateString("en-GB", { weekday: "short" });
  return then.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(then.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}

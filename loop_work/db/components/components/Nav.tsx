"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BadgePoundSterling,
  Banknote,
  BellRing,
  Building2,
  ChevronDown,
  CreditCard,
  HeartPulse,
  Home,
  LineChart,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  UserRound,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { signOut } from "@/app/actions";

const wealthLinks = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/household", label: "Household", icon: UsersRound },
  { href: "/accounts", label: "Accounts", icon: WalletCards },
  { href: "/income", label: "Income", icon: Banknote },
  { href: "/spending", label: "Spending", icon: CreditCard },
  { href: "/mortgage", label: "Mortgage", icon: Building2 },
  { href: "/affordability", label: "Affordability", icon: Home },
  { href: "/investments", label: "Investments", icon: LineChart },
];

const healthLinks = [
  { href: "/lifestyle", label: "Lifestyle", icon: HeartPulse },
];

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isHealthPath(pathname: string) {
  return healthLinks.some((link) => isActivePath(pathname, link.href));
}

function NavPill({ href, label, icon: Icon, active }: { href: string; label: string; icon: React.ElementType; active: boolean }) {
  return (
    <Link
      href={href}
      className={`group flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-black transition ${
        active
          ? "bg-slate-950 text-white shadow-lg shadow-slate-950/15"
          : "text-slate-600 hover:bg-white hover:text-slate-950 hover:shadow-sm"
      }`}
    >
      <Icon className="h-4 w-4" />
      <span className="hidden xl:inline">{label}</span>
    </Link>
  );
}

export function Nav() {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    fetch("/api/notifications/unread-count", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => { if (mounted) setUnreadCount(Number(payload.count || 0)); })
      .catch(() => { if (mounted) setUnreadCount(0); });
    return () => { mounted = false; };
  }, [pathname]);

  const healthMode = isHealthPath(pathname);
  const links = healthMode ? healthLinks : wealthLinks;
  const toggleHref = healthMode ? "/dashboard" : "/lifestyle";
  const toggleLabel = healthMode ? "LoopWealth" : "LoopHealth";
  const wealthActive = !healthMode;

  return (
    <header className="sticky top-0 z-40 border-b border-white/70 bg-white/82 shadow-[0_18px_70px_-48px_rgba(15,23,42,.75)] backdrop-blur-2xl">
      <div className="mx-auto flex w-[95vw] max-w-none flex-col gap-4 py-3 xl:flex-row xl:items-center xl:justify-between">
        <Link href="/dashboard" className="group flex shrink-0 items-center gap-3">
          <span className="relative grid h-12 w-12 place-items-center overflow-hidden rounded-2xl bg-slate-950 text-white shadow-xl shadow-slate-950/20">
            <span className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,.38),transparent_30%),linear-gradient(135deg,#061225,#10223c_52%,#ff6b00)]" />
            <BadgePoundSterling className="relative h-6 w-6" />
          </span>
          <span>
            <span className="flex items-center gap-2 text-lg font-black tracking-tight text-slate-950">
              Loop
              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-orange-700">Private beta</span>
            </span>
            <span className="mt-0.5 flex items-center gap-1 text-xs font-bold text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Secure household OS
            </span>
          </span>
        </Link>

        <div className="flex min-w-0 items-center gap-3 xl:justify-end">
          <div className="min-w-0 flex-1 overflow-x-auto pb-1 xl:pb-0">
            <div className="flex min-w-max items-center gap-2 rounded-full border border-slate-200/80 bg-slate-50/85 p-1 shadow-inner shadow-white/80">
              <nav className="flex items-center gap-1.5">
                {links.map((link) => (
                  <NavPill key={link.href} {...link} active={isActivePath(pathname, link.href)} />
                ))}
              </nav>
            </div>
          </div>

          <Link
            href={toggleHref}
            className="flex shrink-0 items-center overflow-hidden rounded-full border border-slate-200 bg-white p-1 text-xs font-black shadow-sm"
            aria-label={`Switch to ${toggleLabel}`}
            title={`Switch to ${toggleLabel}`}
          >
            <span className={`rounded-full px-3 py-2 transition ${wealthActive ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-50"}`}>Wealth</span>
            <span className="h-5 w-px bg-slate-200" aria-hidden="true" />
            <span className={`rounded-full px-3 py-2 transition ${healthMode ? "bg-emerald-700 text-white" : "text-emerald-700 hover:bg-emerald-50"}`}>Health</span>
          </Link>

          <details className="relative shrink-0">
            <summary className="relative flex cursor-pointer list-none items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
              <span className="relative">
                <UserRound className="h-4 w-4" />
                {unreadCount > 0 ? <span className="absolute -right-1.5 -top-1.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" /> : null}
              </span>
              <span className="hidden sm:inline">Account</span>
              <ChevronDown className="h-4 w-4" />
            </summary>
            <div className="fixed right-[2.5vw] top-[4.75rem] z-50 w-64 overflow-hidden rounded-3xl border border-slate-200 bg-white p-2 shadow-2xl">
              <Link href="/account" className="flex items-center gap-2 rounded-2xl px-3 py-3 text-sm font-black text-slate-700 hover:bg-slate-50"><UserRound className="h-4 w-4" /> Account</Link>
              <Link href="/notifications" className="flex items-center justify-between gap-2 rounded-2xl px-3 py-3 text-sm font-black text-slate-700 hover:bg-slate-50"><span className="flex items-center gap-2"><BellRing className="h-4 w-4" /> Notifications</span>{unreadCount > 0 ? <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">{unreadCount}</span> : null}</Link>
              <form action={signOut}>
                <button className="flex w-full items-center gap-2 rounded-2xl px-3 py-3 text-left text-sm font-black text-red-600 hover:bg-red-50"><LogOut className="h-4 w-4" /> Sign out</button>
              </form>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_USER_FEATURE_ACCESS,
  type UserFeatureAccess,
} from "@/lib/features/user-feature-access";
import {
  Activity,
  BellRing,
  ChevronDown,
  CircleUserRound,
  HeartPulse,
  HelpCircle,
  Home,
  House,
  LayoutGrid,
  LayoutDashboard,
  LineChart,
  LogOut,
  Menu,
  MoonStar,
  PanelLeft,
  PanelBottom,
  PanelTop,
  Salad,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import { signOut } from "@/app/actions";

type NavigationLayout = "top" | "side";
type MobileNavigationLayout = "cards" | "bar";
type NavigationDomain = "wealth" | "health";

type NavLink = {
  href: string;
  label: string;
  icon: React.ElementType;
  feature?: keyof UserFeatureAccess;
  anyFeature?: Array<keyof UserFeatureAccess>;
};

const wealthLinks: NavLink[] = [
  {
    href: "/briefing",
    label: "Your LOOP",
    icon: Sparkles,
    feature: "aiFinancialBriefing",
  },
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  // Income, spending, accounts, savings and pots now live behind one Financial Flow entry.
  // Their existing routes remain available from the Financial Flow tabs and account context links.
  { href: "/financial-flow", label: "Financial Flow", icon: WalletCards },
  {
    href: "/investments",
    label: "Pensions & Investments",
    icon: LineChart,
    anyFeature: ["investments", "pensions"],
  },
  { href: "/mortgage", label: "House", icon: House, feature: "mortgage" },
];

const healthLinks: NavLink[] = [
  { href: "/nutrition", label: "Nutrition", icon: Salad },
  { href: "/lifestyle", label: "Lifestyle", icon: HeartPulse },
  { href: "/lifestyle?tab=sleep", label: "Sleep", icon: MoonStar },
  { href: "/lifestyle?tab=activity", label: "Activity", icon: Activity },
];

const eagerWealthRoutes = ["/briefing", "/dashboard", "/financial-flow", "/investments", "/mortgage"];

type NavigationBootstrap = {
  navigationLayout?: NavigationLayout;
  hasChosenNavigationLayout?: boolean;
  mobileNavigationLayout?: MobileNavigationLayout;
  hasChosenMobileNavigationLayout?: boolean;
  unreadCount?: number;
  isAdmin?: boolean;
  features?: Partial<UserFeatureAccess>;
};

let navigationBootstrapPromise: Promise<NavigationBootstrap | null> | null = null;

function loadNavigationBootstrap() {
  if (!navigationBootstrapPromise) {
    navigationBootstrapPromise = fetch("/api/user/navigation-bootstrap", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<NavigationBootstrap> : null)
      .catch(() => null);
  }
  return navigationBootstrapPromise;
}

function pathOnly(href: string) {
  return href.split("?")[0];
}

function isActivePath(pathname: string, href: string) {
  const base = pathOnly(href);
  return pathname === base || pathname.startsWith(`${base}/`);
}

const wealthRouteFamilies: Record<string, string[]> = {
  "/dashboard": ["/dashboard", "/net-worth"],
  "/financial-flow": [
    "/financial-flow",
    "/spending",
    "/income",
    "/accounts",
    "/savings",
    "/pots",
  ],
  "/investments": ["/investments", "/pensions"],
  "/mortgage": ["/mortgage", "/house", "/affordability", "/affordability-lab"],
};

function matchesRouteFamily(pathname: string, href: string) {
  const base = pathOnly(href);
  const family = wealthRouteFamilies[base] || [base];
  return family.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function isActiveLink(
  pathname: string,
  searchParams: URLSearchParams | Readonly<URLSearchParams>,
  href: string,
  siblings: NavLink[],
) {
  if (!matchesRouteFamily(pathname, href)) return false;
  const [base, query = ""] = href.split("?");
  const expected = new URLSearchParams(query);
  if (expected.size > 0) {
    return Array.from(expected.entries()).every(
      ([key, value]) => searchParams.get(key) === value,
    );
  }

  const specificSiblingMatches = siblings
    .filter((link) => pathOnly(link.href) === base && link.href.includes("?"))
    .some((link) => {
      const siblingQuery = new URLSearchParams(link.href.split("?")[1] || "");
      return Array.from(siblingQuery.entries()).every(
        ([key, value]) => searchParams.get(key) === value,
      );
    });
  return !specificSiblingMatches;
}

function isHealthPath(pathname: string) {
  return healthLinks.some((link) => isActivePath(pathname, link.href));
}

function canShow(link: NavLink, features: UserFeatureAccess) {
  if (link.feature && !features[link.feature]) return false;
  if (link.anyFeature && !link.anyFeature.some((key) => features[key]))
    return false;
  return true;
}

function Brand({
  compact = false,
  dark = false,
}: {
  compact?: boolean;
  dark?: boolean;
}) {
  return (
    <Link href="/briefing" className="group flex items-center gap-3">
      <span className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-2xl bg-slate-950 text-white shadow-xl shadow-indigo-950/30">
        <span className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,.34),transparent_30%),linear-gradient(135deg,#08152e,#24358f_55%,#7357ff)]" />
        <span className="relative text-xl font-black">∞</span>
      </span>
      {!compact ? (
        <span
          className={`text-2xl font-black tracking-[-0.06em] ${dark ? "text-white" : "text-slate-950 group-hover:text-indigo-700"}`}
        >
          LOOP
        </span>
      ) : null}
    </Link>
  );
}

function NavItem({
  link,
  active,
  side = false,
  onNavigate,
  onIntent,
}: {
  link: NavLink;
  active: boolean;
  side?: boolean;
  onNavigate?: () => void;
  onIntent?: (href: string) => void;
}) {
  const Icon = link.icon;
  return (
    <Link
      href={link.href}
      prefetch
      onClick={onNavigate}
      onMouseEnter={() => onIntent?.(link.href)}
      onFocus={() => onIntent?.(link.href)}
      onTouchStart={() => onIntent?.(link.href)}
      className={
        side
          ? `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-bold transition ${
              active
                ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-950/25"
                : "text-slate-300 hover:bg-white/10 hover:text-white"
            }`
          : `group relative flex items-center gap-1.5 px-2.5 py-2 text-[13px] font-black transition ${
              active
                ? "text-slate-950 after:absolute after:inset-x-2 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-slate-950"
                : "text-slate-500 hover:text-slate-950"
            }`
      }
    >
      <Icon className={side ? "h-[18px] w-[18px]" : "h-4 w-4"} />
      <span className={side ? "" : "hidden lg:inline"}>{link.label}</span>
    </Link>
  );
}

function LayoutButtons({
  layout,
  onChange,
  large = false,
}: {
  layout: NavigationLayout;
  onChange: (layout: NavigationLayout) => void;
  large?: boolean;
}) {
  return (
    <div className={`grid grid-cols-2 ${large ? "gap-4" : "gap-1"}`}>
      <button
        type="button"
        onClick={() => onChange("top")}
        className={`${large ? "rounded-3xl p-5 text-left" : "rounded-xl px-2 py-2 text-xs"} border font-black transition ${
          layout === "top"
            ? "border-slate-950 bg-slate-950 text-white shadow-xl"
            : "border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50"
        }`}
      >
        <span
          className={`flex ${large ? "items-start gap-4" : "items-center justify-center gap-1.5"}`}
        >
          <PanelTop className={large ? "mt-0.5 h-6 w-6" : "h-4 w-4"} />
          <span>
            <span className="block">Top navigation</span>
            {large ? (
              <span
                className={`mt-2 block text-sm font-semibold leading-5 ${layout === "top" ? "text-white/70" : "text-slate-500"}`}
              >
                A wide navigation bar across the top of each page.
              </span>
            ) : null}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => onChange("side")}
        className={`${large ? "rounded-3xl p-5 text-left" : "rounded-xl px-2 py-2 text-xs"} border font-black transition ${
          layout === "side"
            ? "border-indigo-600 bg-indigo-600 text-white shadow-xl shadow-indigo-600/20"
            : "border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50"
        }`}
      >
        <span
          className={`flex ${large ? "items-start gap-4" : "items-center justify-center gap-1.5"}`}
        >
          <PanelLeft className={large ? "mt-0.5 h-6 w-6" : "h-4 w-4"} />
          <span>
            <span className="block">Side navigation</span>
            {large ? (
              <span
                className={`mt-2 block text-sm font-semibold leading-5 ${layout === "side" ? "text-white/75" : "text-slate-500"}`}
              >
                A permanent left-hand menu with more room for the dashboard.
              </span>
            ) : null}
          </span>
        </span>
      </button>
    </div>
  );
}

function MobileLayoutButtons({ layout, onChange }: { layout: MobileNavigationLayout; onChange: (layout: MobileNavigationLayout) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={() => onChange("cards")} className={`rounded-2xl border px-3 py-3 text-xs font-black transition ${layout === "cards" ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-700"}`}><span className="flex items-center justify-center gap-2"><LayoutGrid className="h-4 w-4" /> Cards</span></button>
      <button type="button" onClick={() => onChange("bar")} className={`rounded-2xl border px-3 py-3 text-xs font-black transition ${layout === "bar" ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-700"}`}><span className="flex items-center justify-center gap-2"><PanelBottom className="h-4 w-4" /> Navigation bar</span></button>
    </div>
  );
}

function NavigationChoiceDialog({
  layout,
  onChoose,
}: {
  layout: NavigationLayout;
  onChoose: (layout: NavigationLayout) => void;
}) {
  const [selected, setSelected] = useState<NavigationLayout>(layout);
  const [saving, setSaving] = useState(false);

  async function confirm() {
    setSaving(true);
    await onChoose(selected);
    setSaving(false);
  }

  return (
    <div
      className="fixed inset-0 z-[160] grid place-items-center bg-slate-950/65 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="navigation-choice-title"
    >
      <div className="w-full max-w-3xl overflow-hidden rounded-[2.25rem] border border-white/50 bg-white shadow-[0_40px_140px_-45px_rgba(15,23,42,.95)]">
        <div className="bg-[radial-gradient(circle_at_85%_10%,rgba(118,87,255,.18),transparent_18rem),linear-gradient(135deg,#f8fbff,#ffffff_55%,#f4f0ff)] p-7 sm:p-9">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-indigo-700">
            <Sparkles className="h-4 w-4" /> Make LOOP yours
          </div>
          <h2
            id="navigation-choice-title"
            className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl"
          >
            How would you like to move around LOOP?
          </h2>
          <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
            Choose the layout that feels most natural. This only changes
            navigation, not your data or available features. You can switch
            again at any time from Account.
          </p>
          <div className="mt-7">
            <LayoutButtons layout={selected} onChange={setSelected} large />
          </div>
          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-bold text-slate-500">
              Your choice is saved to your account and follows you across
              devices.
            </p>
            <button
              type="button"
              onClick={confirm}
              disabled={saving}
              className="rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white disabled:cursor-wait disabled:opacity-60"
            >
              {saving ? "Saving…" : `Use ${selected} navigation`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountModal({
  open,
  onClose,
  layout,
  onLayoutChange,
  isMobileViewport,
  mobileLayout,
  onMobileLayoutChange,
  unreadCount,
  showAdmin,
}: {
  open: boolean;
  onClose: () => void;
  layout: NavigationLayout;
  onLayoutChange: (layout: NavigationLayout) => void;
  isMobileViewport: boolean;
  mobileLayout: MobileNavigationLayout;
  onMobileLayoutChange: (layout: MobileNavigationLayout) => void;
  unreadCount: number;
  showAdmin: boolean;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[150] flex items-end justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:items-center"
      onMouseDown={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-menu-title"
        onMouseDown={(event) => event.stopPropagation()}
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[2rem] border border-white/70 bg-white p-5 shadow-[0_35px_120px_-35px_rgba(15,23,42,.9)] sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-600">
              Account & settings
            </p>
            <h2
              id="account-menu-title"
              className="mt-1 text-2xl font-black text-slate-950"
            >
              Manage your LOOP
            </h2>
            <p className="mt-2 text-sm font-semibold text-slate-500">
              Quick settings here, or open the full account centre for profiles,
              household access, plans and integrations.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
            aria-label="Close account menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link
            href="/account"
            onClick={onClose}
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 font-black text-slate-800 hover:border-indigo-300 hover:bg-indigo-50"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-100 text-indigo-700">
              <UserRound className="h-5 w-5" />
            </span>
            <span>
              <span className="block">Open account centre</span>
              <span className="mt-1 block text-xs font-semibold text-slate-500">
                Profile, household and plan
              </span>
            </span>
          </Link>
          <Link
            href="/notifications"
            onClick={onClose}
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 font-black text-slate-800 hover:border-indigo-300 hover:bg-indigo-50"
          >
            <span className="relative grid h-10 w-10 place-items-center rounded-xl bg-violet-100 text-violet-700">
              <BellRing className="h-5 w-5" />
              {unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 rounded-full bg-violet-600 px-1.5 text-[10px] text-white">
                  {unreadCount}
                </span>
              ) : null}
            </span>
            <span>
              <span className="block">Notifications</span>
              <span className="mt-1 block text-xs font-semibold text-slate-500">
                Alerts and recent updates
              </span>
            </span>
          </Link>
          <Link
            href="/account?tab=info#households"
            onClick={onClose}
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 font-black text-slate-800 hover:border-indigo-300 hover:bg-indigo-50"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
              <Home className="h-5 w-5" />
            </span>
            <span>
              <span className="block">Household</span>
              <span className="mt-1 block text-xs font-semibold text-slate-500">
                Members and sharing
              </span>
            </span>
          </Link>
          <Link
            href="/help"
            onClick={onClose}
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 font-black text-slate-800 hover:border-indigo-300 hover:bg-indigo-50"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-100 text-sky-700">
              <HelpCircle className="h-5 w-5" />
            </span>
            <span>
              <span className="block">Help & support</span>
              <span className="mt-1 block text-xs font-semibold text-slate-500">
                Guides and assistance
              </span>
            </span>
          </Link>
        </div>

        <div className="mt-5 rounded-3xl bg-slate-50 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
            <Settings2 className="h-4 w-4" /> Navigation layout
          </div>
          {isMobileViewport ? <MobileLayoutButtons layout={mobileLayout} onChange={onMobileLayoutChange} /> : <LayoutButtons layout={layout} onChange={onLayoutChange} />}
          <p className="mt-3 text-xs font-semibold text-slate-500">
            {isMobileViewport ? "Mobile choices are saved separately from desktop." : "This setting is also available in Account → Personal."}
          </p>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {showAdmin ? (
              <Link
                href="/admin"
                onClick={onClose}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
              >
                <ShieldCheck className="h-4 w-4" /> Admin
              </Link>
            ) : null}
            <Link
              href="/account?tab=plan"
              onClick={onClose}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
            >
              <Sparkles className="h-4 w-4" /> Plan
            </Link>
          </div>
          <form action={signOut}>
            <button className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-red-50 px-4 py-2 text-sm font-black text-red-700 hover:bg-red-100 sm:w-auto">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}

// BUGFIX (production build failure): useSearchParams() (used inside this
// component below) requires a <Suspense> boundary for Next.js to
// statically prerender any page that renders this component. Since <Nav />
// is used directly across most pages in the app, wrapping it here — once
// — fixes every one of those pages at once, rather than needing each
// page's own file changed individually.
function NavInner() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [unreadCount, setUnreadCount] = useState(0);
  const [showAdmin, setShowAdmin] = useState(false);
  const [features, setFeatures] = useState<UserFeatureAccess>(
    DEFAULT_USER_FEATURE_ACCESS,
  );
  const [layout, setLayout] = useState<NavigationLayout>("side");
  const [mobileLayout, setMobileLayout] = useState<MobileNavigationLayout>("bar");
  const [preferenceLoaded, setPreferenceLoaded] = useState(false);
  const [hasChosenLayout, setHasChosenLayout] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const prefetchedRoutes = useRef(new Set<string>());
  const prefetchRoute = useCallback((href: string) => {
    if (prefetchedRoutes.current.has(href)) return;
    prefetchedRoutes.current.add(href);
    router.prefetch(href);
  }, [router]);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsMobileViewport(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem(
      "loop:navigation-layout",
    ) as NavigationLayout | null;
    const mobileStored = window.localStorage.getItem("loop:mobile-navigation-layout");
    queueMicrotask(() => {
      if (stored === "side" || stored === "top") setLayout(stored);
      if (mobileStored === "cards" || mobileStored === "bar") setMobileLayout(mobileStored);
    });
  }, []);

  useEffect(() => {
    const handleMobileLayoutChange = (event: Event) => {
      const next = (event as CustomEvent<{ layout?: MobileNavigationLayout }>).detail?.layout;
      if (next === "cards" || next === "bar") setMobileLayout(next);
    };
    window.addEventListener("loop:mobile-navigation-layout-changed", handleMobileLayoutChange);
    return () => window.removeEventListener("loop:mobile-navigation-layout-changed", handleMobileLayoutChange);
  }, []);

  useEffect(() => {
    document.body.dataset.loopNav = layout;
    window.localStorage.setItem("loop:navigation-layout", layout);
    return () => {
      delete document.body.dataset.loopNav;
    };
  }, [layout]);

  useEffect(() => {
    const handleLayoutChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ layout?: NavigationLayout }>;
      if (
        customEvent.detail?.layout === "top" ||
        customEvent.detail?.layout === "side"
      ) {
        setLayout(customEvent.detail.layout);
        setHasChosenLayout(true);
      }
    };
    window.addEventListener(
      "loop:navigation-layout-changed",
      handleLayoutChange,
    );
    return () =>
      window.removeEventListener(
        "loop:navigation-layout-changed",
        handleLayoutChange,
      );
  }, []);

  useEffect(() => {
    let mounted = true;
    loadNavigationBootstrap()
      .then((payload) => {
        if (!mounted || !payload) return;
        if (payload.navigationLayout === "side" || payload.navigationLayout === "top") {
          setLayout(payload.navigationLayout);
        }
        if (payload.mobileNavigationLayout === "cards" || payload.mobileNavigationLayout === "bar") {
          setMobileLayout(payload.mobileNavigationLayout);
          window.localStorage.setItem("loop:mobile-navigation-layout", payload.mobileNavigationLayout);
        }
        const localConfirmed = window.localStorage.getItem("loop:navigation-layout-confirmed-v28_84") === "true";
        setHasChosenLayout(Boolean(payload.hasChosenNavigationLayout) || localConfirmed);
        setUnreadCount(Number(payload.unreadCount || 0));
        setShowAdmin(Boolean(payload.isAdmin));
        setFeatures({ ...DEFAULT_USER_FEATURE_ACCESS, ...(payload.features || {}) });
      })
      .catch(() => undefined)
      .finally(() => {
        if (!mounted) return;
        const localConfirmed = window.localStorage.getItem("loop:navigation-layout-confirmed-v28_84") === "true";
        setHasChosenLayout((current) => current || localConfirmed);
        setPreferenceLoaded(true);
      });

    const refreshUnreadCount = () =>
      fetch("/api/notifications/unread-count", { cache: "no-store" })
        .then((response) => response.json())
        .then((payload) => mounted && setUnreadCount(Number(payload.count || 0)))
        .catch(() => undefined);
    const timer = window.setInterval(
      refreshUnreadCount,
      15000,
    );

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const warmRoutes = () => {
      if (cancelled) return;
      eagerWealthRoutes.forEach((href, index) => {
        window.setTimeout(() => {
          if (!cancelled && href !== pathname) prefetchRoute(href);
        }, index * 180);
      });
    };
    const idleWindow = window as typeof window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const idleHandle = idleWindow.requestIdleCallback?.(warmRoutes, { timeout: 1_500 });
    const fallbackHandle = idleHandle === undefined ? window.setTimeout(warmRoutes, 800) : null;
    return () => {
      cancelled = true;
      if (idleHandle !== undefined) idleWindow.cancelIdleCallback?.(idleHandle);
      if (fallbackHandle !== null) window.clearTimeout(fallbackHandle);
    };
  }, [pathname, prefetchRoute]);

  useEffect(() => {
    queueMicrotask(() => {
      setMobileOpen(false);
      setAccountOpen(false);
    });
  }, [pathname]);

  useEffect(() => {
    if (!accountOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [accountOpen]);

  useEffect(() => {
    const shouldLock = accountOpen || (preferenceLoaded && !hasChosenLayout && !isMobileViewport) || mobileOpen;
    if (!shouldLock) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [accountOpen, preferenceLoaded, hasChosenLayout, isMobileViewport, mobileOpen]);

  async function changeLayout(next: NavigationLayout, confirmed = true) {
    setLayout(next);
    setMobileOpen(false);
    window.localStorage.setItem("loop:navigation-layout", next);
    if (confirmed) {
      setHasChosenLayout(true);
      window.localStorage.setItem(
        "loop:navigation-layout-confirmed-v28_84",
        "true",
      );
    }
    await fetch("/api/user/ui-preferences", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ navigationLayout: next, markChosen: confirmed }),
    }).catch(() => undefined);
  }

  async function changeMobileLayout(next: MobileNavigationLayout) {
    setMobileLayout(next);
    setMobileOpen(false);
    window.localStorage.setItem("loop:mobile-navigation-layout", next);
    await fetch("/api/user/ui-preferences", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ mobileNavigationLayout: next, markChosen: true }) }).catch(() => undefined);
  }

  const healthMode = isHealthPath(pathname);
  const domain: NavigationDomain = healthMode ? "health" : "wealth";
  const visibleWealthLinks = useMemo(
    () => wealthLinks.filter((link) => canShow(link, features)),
    [features],
  );
  const currentLinks = domain === "health" ? healthLinks : visibleWealthLinks;
  const wealthHome = features.aiFinancialBriefing ? "/briefing" : "/dashboard";

  const overlays = (
    <>
      {preferenceLoaded && !hasChosenLayout && !isMobileViewport ? (
        <NavigationChoiceDialog
          layout={layout}
          onChoose={(next) => changeLayout(next, true)}
        />
      ) : null}
      <AccountModal
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        layout={layout}
        onLayoutChange={(next) => changeLayout(next, true)}
        isMobileViewport={isMobileViewport}
        mobileLayout={mobileLayout}
        onMobileLayoutChange={changeMobileLayout}
        unreadCount={unreadCount}
        showAdmin={showAdmin}
      />
    </>
  );

  if (isMobileViewport) {
    return (
      <>
        {overlays}
        <header className="loop-mobile-navigation sticky top-0 z-40 border-b border-slate-200/70 bg-white/92 px-4 py-3 backdrop-blur-2xl">
          <div className="flex items-center justify-between gap-3">
            <Brand />
            <div className="flex items-center gap-2">
              <Link href={domain === "wealth" ? "/nutrition" : wealthHome} className="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">{domain === "wealth" ? "Health" : "Wealth"}</Link>
              <button type="button" onClick={() => setAccountOpen(true)} className="relative grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-700" aria-label="Account and settings"><UserRound className="h-5 w-5" />{unreadCount > 0 ? <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full bg-violet-600 ring-2 ring-white" /> : null}</button>
              {mobileLayout === "cards" ? <button type="button" onClick={() => setMobileOpen(true)} className="grid h-10 w-10 place-items-center rounded-full bg-slate-950 text-white" aria-label="Open navigation cards"><Menu className="h-5 w-5" /></button> : null}
            </div>
          </div>
        </header>
        <div id="loop-page-actions" className="fixed right-4 top-[4.5rem] z-30 flex items-center" />
        {mobileLayout === "bar" ? (
          <nav className="loop-mobile-bottom-nav fixed inset-x-3 bottom-3 z-50 grid rounded-[1.4rem] border border-white/20 bg-slate-950/95 p-1.5 text-white shadow-2xl backdrop-blur-2xl" style={{ gridTemplateColumns: `repeat(${currentLinks.length}, minmax(0, 1fr))` }} aria-label={`${domain} mobile navigation`}>
            {currentLinks.map((link) => { const Icon = link.icon; const active = isActiveLink(pathname, searchParams, link.href, currentLinks); return <Link key={link.href} href={link.href} onMouseEnter={() => prefetchRoute(link.href)} className={`flex min-w-0 flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[9px] font-black ${active ? "bg-white text-slate-950" : "text-slate-300"}`}><Icon className="h-4 w-4" /><span className="max-w-full truncate">{link.label.replace("Pensions & Investments", "Invest")}</span></Link>; })}
          </nav>
        ) : null}
        {mobileLayout === "cards" && mobileOpen ? (
          <div className="fixed inset-0 z-[140] overflow-y-auto bg-[linear-gradient(180deg,#07142d,#102d68)] p-4 text-white">
            <div className="mx-auto max-w-lg pt-[max(1rem,env(safe-area-inset-top))]">
              <div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-200">{domain}</p><h2 className="mt-1 text-3xl font-black">Where would you like to go?</h2></div><button type="button" onClick={() => setMobileOpen(false)} className="grid h-11 w-11 place-items-center rounded-full bg-white/10" aria-label="Close navigation cards"><X className="h-5 w-5" /></button></div>
              <nav className="mt-6 grid grid-cols-2 gap-3" aria-label={`${domain} navigation cards`}>{currentLinks.map((link) => { const Icon = link.icon; return <Link key={link.href} href={link.href} onClick={() => setMobileOpen(false)} className="min-h-36 rounded-[1.75rem] border border-white/10 bg-white/10 p-5 shadow-lg backdrop-blur"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-indigo-700"><Icon className="h-5 w-5" /></span><span className="mt-5 block text-base font-black">{link.label}</span></Link>; })}</nav>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  if (layout === "side") {
    return (
      <>
        {overlays}
        <div id="loop-page-actions" className="fixed right-6 top-5 z-30 hidden items-center lg:flex" />
        <button
          onClick={() => setMobileOpen(true)}
          className="fixed left-4 top-4 z-50 grid h-11 w-11 place-items-center rounded-2xl bg-slate-950 text-white shadow-xl lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
        {mobileOpen ? (
          <button
            className="fixed inset-0 z-40 bg-slate-950/55 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation overlay"
          />
        ) : null}
        <aside
          className={`loop-side-nav fixed inset-y-0 left-0 z-50 flex w-[228px] flex-col overflow-y-auto border-r border-white/10 bg-[linear-gradient(180deg,#07142d_0%,#092452_58%,#102d68_100%)] px-4 py-5 text-white shadow-2xl transition-transform lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="mb-4 flex items-center justify-between">
            <Brand dark />
            <button
              className="rounded-xl p-2 text-slate-300 hover:bg-white/10 lg:hidden"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mb-5 grid grid-cols-2 rounded-2xl border border-white/10 bg-white/5 p-1 text-xs font-black">
            <Link
              href={wealthHome}
              onClick={() => setMobileOpen(false)}
              className={`rounded-xl px-3 py-2 text-center transition ${domain === "wealth" ? "bg-white text-slate-950 shadow-lg" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}
            >
              Wealth
            </Link>
            <Link
              href="/nutrition"
              onClick={() => setMobileOpen(false)}
              className={`rounded-xl px-3 py-2 text-center transition ${domain === "health" ? "bg-emerald-400 text-emerald-950 shadow-lg" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}
            >
              Health
            </Link>
          </div>

          <div className="mb-2 px-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
            {domain}
          </div>
          <nav className="space-y-1">
            {currentLinks.map((link) => (
              <NavItem
                key={link.href}
                link={link}
                active={isActiveLink(
                  pathname,
                  searchParams,
                  link.href,
                  currentLinks,
                )}
                side
                onNavigate={() => setMobileOpen(false)}
                onIntent={prefetchRoute}
              />
            ))}
          </nav>

          <div className="mt-auto pt-8">
            {features.aiFinancialBriefing ? (
              <div className="mb-3 rounded-2xl border border-violet-300/20 bg-gradient-to-br from-violet-500/35 to-indigo-500/20 p-4 shadow-inner">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-black">Pro Plan</span>
                  <span className="rounded-full bg-emerald-300/20 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-200">
                    Active
                  </span>
                </div>
                <p className="text-xs leading-5 text-indigo-100">
                  AI insights, advanced analysis and alerts.
                </p>
                <Link
                  href="/account?tab=plan"
                  className="mt-3 block rounded-xl border border-white/25 px-3 py-2 text-center text-xs font-black hover:bg-white/10"
                >
                  View plan
                </Link>
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => setAccountOpen(true)}
              className="relative flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-black text-slate-200 hover:bg-white/10"
            >
              <CircleUserRound className="h-5 w-5" />
              <span className="flex-1">Account & settings</span>
              <ChevronDown className="h-4 w-4" />
              {unreadCount > 0 ? (
                <span className="absolute left-7 top-1 h-2.5 w-2.5 rounded-full bg-violet-400 ring-2 ring-[#102d68]" />
              ) : null}
            </button>
          </div>
        </aside>
      </>
    );
  }

  return (
    <>
      {overlays}
      <header className="loop-desktop-navigation sticky top-0 z-40 border-b border-slate-200/70 bg-white/88 backdrop-blur-2xl">
        <div className="mx-auto grid w-[min(96vw,1800px)] grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-2 py-3 2xl:grid-cols-[auto_minmax(0,1fr)_auto] 2xl:px-4">
          <div className="flex items-center">
            <Brand />
          </div>
          <div className="col-span-2 row-start-2 min-w-0 2xl:col-span-1 2xl:col-start-2 2xl:row-start-1">
            <nav className="loop-top-nav mx-auto flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1" aria-label={`${domain} navigation`}>
              {currentLinks.map((link) => (
                <NavItem key={link.href} link={link} active={isActiveLink(pathname, searchParams, link.href, currentLinks)} onIntent={prefetchRoute} />
              ))}
            </nav>
          </div>
          <div className="col-start-2 row-start-1 flex shrink-0 items-center justify-end gap-2 2xl:col-start-3">
              <div className="flex shrink-0 items-center overflow-hidden rounded-full border border-slate-200 bg-white p-1 text-xs font-black shadow-sm">
                <Link
                  href={wealthHome}
                  className={`rounded-full px-3 py-2 ${domain === "wealth" ? "bg-slate-950 text-white" : "text-slate-500"}`}
                >
                  Wealth
                </Link>
                <span className="h-5 w-px bg-slate-200" />
                <Link
                  href="/nutrition"
                  className={`rounded-full px-3 py-2 ${domain === "health" ? "bg-emerald-700 text-white" : "text-emerald-700"}`}
                >
                  Health
                </Link>
              </div>
              <button
                type="button"
                onClick={() => setAccountOpen(true)}
                className="relative flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700 shadow-sm"
              >
                <UserRound className="h-4 w-4" />
                <span className="hidden sm:inline">Account</span>
                <ChevronDown className="h-4 w-4" />
                {unreadCount > 0 ? (
                  <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full bg-violet-600 ring-2 ring-white" />
                ) : null}
              </button>
              <div id="loop-page-actions" className="hidden shrink-0 items-center md:flex" />
          </div>
        </div>
      </header>
    </>
  );
}

export function Nav() {
  return (
    <Suspense fallback={null}>
      <NavInner />
    </Suspense>
  );
}

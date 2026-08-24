"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { readRouteSnapshot } from "@/lib/client/route-snapshot-cache";
import { publishRouteBootSnapshot } from "@/components/performance/RouteBootSnapshotPublisher";
import type {
  RouteBootKey,
  RouteBootPayload,
} from "@/lib/performance/route-boot";

const READ_TTL = 20 * 60 * 1000;

function money(value: unknown) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "£0";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(amount);
}

function buildPayload(
  snapshotKey: string,
  raw: any,
): { routeKey: RouteBootKey; payload: RouteBootPayload } | null {
  if (!raw) return null;

  if (snapshotKey === "dashboard") {
    const overview = raw.dashboardContext?.overview;
    if (!overview) return null;
    return {
      routeKey: "dashboard",
      payload: {
        version: 1,
        eyebrow: "Your LOOP",
        title: "Your latest financial picture",
        headline: money(overview.netWorth),
        description:
          "Last complete dashboard view. Fresh household data is loading now.",
        tone: "violet",
        metrics: [
          { label: "Available", value: money(overview.leftOver) },
          { label: "Income", value: money(overview.income) },
          { label: "Outgoings", value: money(overview.outgoings) },
          { label: "Savings", value: money(overview.savings) },
        ],
      },
    };
  }

  if (snapshotKey === "net-worth") {
    const assets = Array.isArray(raw.assets) ? raw.assets : [];
    const liabilities = Array.isArray(raw.liabilities) ? raw.liabilities : [];
    const assetTotal = assets.reduce(
      (sum: number, row: any) => sum + Number(row?.value || 0),
      0,
    );
    const liabilityTotal = liabilities.reduce(
      (sum: number, row: any) => sum + Number(row?.balance || 0),
      0,
    );
    return {
      routeKey: "net-worth",
      payload: {
        version: 1,
        eyebrow: "Net worth",
        title: "Your latest complete position",
        headline: money(assetTotal - liabilityTotal),
        description: "Assets and liabilities are refreshing in the background.",
        tone: "blue",
        metrics: [
          { label: "Assets", value: money(assetTotal) },
          { label: "Liabilities", value: money(liabilityTotal) },
          { label: "Tracked items", value: String(assets.length + liabilities.length) },
        ],
      },
    };
  }

  if (snapshotKey === "retirement") {
    const assets = Array.isArray(raw.assets) ? raw.assets : [];
    const contributions = Array.isArray(raw.contributions)
      ? raw.contributions
      : [];
    const currentAssets = assets.reduce(
      (sum: number, row: any) => sum + Number(row?.currentValue || 0),
      0,
    );
    const monthly = contributions.reduce(
      (sum: number, row: any) => sum + Number(row?.monthlyAmount || 0),
      0,
    );
    return {
      routeKey: "retirement",
      payload: {
        version: 1,
        eyebrow: "Retirement",
        title: "Your latest retirement baseline",
        headline: money(currentAssets),
        description:
          "Your current assets are visible while projections and assumptions refresh.",
        tone: "violet",
        metrics: [
          { label: "Monthly contributions", value: money(monthly) },
          { label: "Current age", value: String(raw.currentAge ?? "—") },
          { label: "Tracked assets", value: String(assets.length) },
        ],
      },
    };
  }

  if (snapshotKey === "income") {
    const payEvents = Array.isArray(raw.payEvents) ? raw.payEvents : [];
    const entries = Array.isArray(raw.entries) ? raw.entries : [];
    const loans = Array.isArray(raw.studentLoanAccounts)
      ? raw.studentLoanAccounts
      : [];
    return {
      routeKey: "income",
      payload: {
        version: 1,
        eyebrow: "Financial Flow · Income",
        title: "Your income records are ready",
        headline: `${payEvents.length + entries.length} tracked source${
          payEvents.length + entries.length === 1 ? "" : "s"
        }`,
        description:
          "The latest saved income view is shown while deductions and household detail refresh.",
        tone: "green",
        metrics: [
          { label: "Recurring pay", value: String(payEvents.length) },
          { label: "Other income", value: String(entries.length) },
          { label: "Student loans", value: String(loans.length) },
          {
            label: "People",
            value: String(Array.isArray(raw.people) ? raw.people.length : 0),
          },
        ],
      },
    };
  }

  if (snapshotKey === "investments-core") {
    const accounts = Array.isArray(raw.investmentAccounts)
      ? raw.investmentAccounts
      : [];
    const holdings = Array.isArray(raw.investmentHoldings)
      ? raw.investmentHoldings
      : [];
    const pensions = Array.isArray(raw.pensionAccounts)
      ? raw.pensionAccounts
      : [];
    const funds = Array.isArray(raw.pensionFunds) ? raw.pensionFunds : [];
    return {
      routeKey: "investments",
      payload: {
        version: 1,
        eyebrow: "Investments & pensions",
        title: "Your portfolio structure is ready",
        headline: `${holdings.length} holding${holdings.length === 1 ? "" : "s"}`,
        description:
          "Core accounts are available while fresh prices, provider activity and deep history refresh.",
        tone: "blue",
        metrics: [
          { label: "Investment accounts", value: String(accounts.length) },
          { label: "Pension accounts", value: String(pensions.length) },
          { label: "Pension funds", value: String(funds.length) },
          {
            label: "People",
            value: String(Array.isArray(raw.people) ? raw.people.length : 0),
          },
        ],
      },
    };
  }

  if (snapshotKey === "house") {
    const homes = Array.isArray(raw.homes) ? raw.homes : [];
    const deals = Array.isArray(raw.deals) ? raw.deals : [];
    const home =
      homes.find((row: any) => row?.ownership_status === "current_home") ||
      homes[0];
    const deal =
      deals.find((row: any) => row?.home_id === home?.id) || deals[0];
    const propertyValue = Number(
      home?.estimated_value_mid ??
        home?.property_value ??
        home?.purchase_price ??
        0,
    );
    const mortgageBalance = Number(deal?.balance || 0);
    return {
      routeKey: "mortgage",
      payload: {
        version: 1,
        eyebrow: "House",
        title: home?.label || home?.full_address || "Your home",
        headline: propertyValue > 0 ? money(propertyValue) : "Property tracked",
        description:
          "Your property and mortgage baseline is visible while rates and planning context update.",
        tone: "orange",
        metrics: [
          { label: "Mortgage", value: money(mortgageBalance) },
          {
            label: "Equity",
            value: propertyValue > 0 ? money(propertyValue - mortgageBalance) : "—",
          },
          {
            label: "Rate",
            value:
              deal?.interest_rate != null
                ? `${Number(deal.interest_rate).toFixed(2)}%`
                : "—",
          },
          {
            label: "Homes",
            value: String(homes.length),
          },
        ],
      },
    };
  }

  if (snapshotKey === "nutrition") {
    const logs = Array.isArray(raw.logs) ? raw.logs : [];
    const selected = logs.filter(
      (row: any) => String(row?.eaten_on || "") === String(raw.selectedDate || ""),
    );
    const calories = selected.reduce(
      (sum: number, row: any) => sum + Number(row?.calories || 0),
      0,
    );
    const protein = selected.reduce(
      (sum: number, row: any) => sum + Number(row?.protein_g || 0),
      0,
    );
    return {
      routeKey: "nutrition",
      payload: {
        version: 1,
        eyebrow: "Health · Nutrition",
        title: "Your latest nutrition day",
        headline: calories > 0 ? `${Math.round(calories)} kcal` : `${selected.length} logged item${selected.length === 1 ? "" : "s"}`,
        description:
          "Today’s saved view is visible while recipes, logs and household nutrition refresh.",
        tone: "green",
        metrics: [
          { label: "Protein", value: `${Math.round(protein)}g` },
          { label: "Logged items", value: String(selected.length) },
          {
            label: "Recipes",
            value: String(Array.isArray(raw.meals) ? raw.meals.length : 0),
          },
        ],
      },
    };
  }

  return null;
}

function keyForPath(pathname: string) {
  if (pathname.startsWith("/dashboard")) return "dashboard";
  if (pathname.startsWith("/net-worth")) return "net-worth";
  if (pathname.startsWith("/retirement")) return "retirement";
  if (pathname.startsWith("/income")) return "income";
  if (pathname.startsWith("/investments")) return "investments-core";
  if (pathname.startsWith("/mortgage")) return "house";
  if (pathname.startsWith("/nutrition")) return "nutrition";
  return null;
}

export function RouteBootAutoPublisher() {
  const pathname = usePathname();

  useEffect(() => {
    const expectedKey = keyForPath(pathname);
    if (!expectedKey) return;

    const publish = (candidateKey?: string) => {
      if (candidateKey && candidateKey !== expectedKey) return;
      const snapshot = readRouteSnapshot<any>(expectedKey, READ_TTL);
      const built = buildPayload(expectedKey, snapshot);
      if (built) {
        void publishRouteBootSnapshot(built.routeKey, built.payload);
      }
    };

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string }>).detail;
      publish(detail?.key);
    };

    window.addEventListener("loop:route-snapshot-written", handler);
    const timer = window.setTimeout(() => publish(), 250);

    return () => {
      window.removeEventListener("loop:route-snapshot-written", handler);
      window.clearTimeout(timer);
    };
  }, [pathname]);

  return null;
}

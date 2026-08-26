"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SmartFinancialFlowAdd } from "@/components/financial-flow/SmartFinancialFlowAdd";
import { useFinancialFlowRetained } from "@/components/financial-flow/FinancialFlowRetainedStore";
import {
  ArrowRightLeft,
  Banknote,
  CreditCard,
  PiggyBank,
  Plus,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";

export type FinancialFlowWorkspaceSection =
  | "flow"
  | "income"
  | "spending"
  | "savings";

const ITEMS: Array<{
  key: FinancialFlowWorkspaceSection;
  label: string;
  copy: string;
  icon: LucideIcon;
}> = [
  { key: "flow", label: "Overview", copy: "Your whole month", icon: ArrowRightLeft },
  { key: "income", label: "Income", copy: "Pay and money in", icon: Banknote },
  { key: "spending", label: "Spending", copy: "Bills and money out", icon: CreditCard },
  { key: "savings", label: "Savings & pots", copy: "Cash building forward", icon: PiggyBank },
];

function hrefFor(section: FinancialFlowWorkspaceSection, month?: string | null) {
  const monthSuffix = month ? `month=${encodeURIComponent(month)}` : "";
  if (section === "flow") return monthSuffix ? `/financial-flow?${monthSuffix}` : "/financial-flow";
  if (section === "income") return monthSuffix ? `/income?${monthSuffix}` : "/income";
  if (section === "spending") return monthSuffix ? `/spending?${monthSuffix}` : "/spending";
  const query = new URLSearchParams({ tab: "savings" });
  if (month) query.set("month", month);
  return `/financial-flow?${query.toString()}`;
}

function summaryHrefFor(section: FinancialFlowWorkspaceSection, month?: string | null) {
  const query = new URLSearchParams();
  if (section !== "flow") query.set("tab", section);
  if (month) query.set("month", month);
  const value = query.toString();
  return value ? `/financial-flow?${value}` : "/financial-flow";
}

function detailHrefFor(section: FinancialFlowWorkspaceSection, month?: string | null) {
  const suffix = month ? `?month=${encodeURIComponent(month)}` : "";
  if (section === "income") return `/income${suffix}`;
  if (section === "spending") return `/spending${suffix}`;
  if (section === "savings") return "/accounts?tab=accounts";
  return summaryHrefFor(section, month);
}

function isDetailPath(section: FinancialFlowWorkspaceSection, pathname: string) {
  if (section === "income") return pathname === "/income";
  if (section === "spending") return pathname === "/spending";
  if (section === "savings") return pathname === "/accounts";
  return false;
}

export function FinancialFlowWorkspaceNav({
  section,
  month,
}: {
  section: FinancialFlowWorkspaceSection;
  month?: string | null;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { beginTransition } = useFinancialFlowRetained();

  useEffect(() => {
    const id = window.setTimeout(() => {
      for (const item of ITEMS) {
        router.prefetch(summaryHrefFor(item.key, month));
        router.prefetch(detailHrefFor(item.key, month));
      }
    }, 40);
    return () => window.clearTimeout(id);
  }, [router, month]);
  const monthQuery = month ? `&month=${encodeURIComponent(month)}` : "";

  return (
    <>
      <aside className="loop-financial-workspace-nav" aria-label="Financial Flow workspace">
        <div className="loop-flow-nav-card">
          <div className="loop-flow-nav-heading">
            <p>Financial Flow</p>
            <span>One money workspace</span>
          </div>

          <nav>
            {ITEMS.map((item) => {
              const Icon = item.icon;
              const active = item.key === section;
              const href = active ? (isDetailPath(item.key, pathname) ? summaryHrefFor(item.key, month) : detailHrefFor(item.key, month)) : summaryHrefFor(item.key, month);
              return (
                <Link
                  key={item.key}
                  href={href}
                  prefetch
                  onMouseEnter={() => router.prefetch(href)}
                  onFocus={() => router.prefetch(href)}
                  onClick={() => beginTransition(item.key, month)}
                  className={active ? "is-active" : ""}
                >
                  <span className="loop-flow-nav-icon"><Icon className="h-4 w-4" /></span>
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.copy}</small>
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="loop-flow-nav-actions">
            <button type="button" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Add
            </button>
            <Link href={`/spending?add=bank_import${monthQuery}`}>
              <Upload className="h-4 w-4" /> Import bank
            </Link>
          </div>
        </div>
      </aside>

      {addOpen ? <SmartFinancialFlowAdd month={month} onClose={() => setAddOpen(false)} /> : null}
    </>
  );
}

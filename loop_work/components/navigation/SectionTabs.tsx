"use client";

import Link from "next/link";
import type { ElementType } from "react";
import { usePathname } from "next/navigation";
import {
  Activity,
  Banknote,
  BellRing,
  BookOpen,
  Building2,
  CreditCard,
  Database,
  HeartPulse,
  Home,
  LayoutDashboard,
  LineChart,
  Mail,
  NotebookTabs,
  Salad,
  Search,
  PackageSearch,
  ShieldCheck,
  Sparkles,
  Utensils,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { isSectionActive, type LoopSection } from "@/lib/navigation/sections";

const icons: Record<string, ElementType> = {
  dashboard: LayoutDashboard,
  accounts: WalletCards,
  income: Banknote,
  spending: CreditCard,
  "net-worth": WalletCards,
  mortgage: Building2,
  home: Home,
  search: Search,
  investments: LineChart,
  nutrition: Salad,
  recipes: BookOpen,
  "food-log": Utensils,
  "meal-cards": NotebookTabs,
  lifestyle: HeartPulse,
  users: UsersRound,
  database: Database,
  notifications: BellRing,
  security: ShieldCheck,
  runtime: Activity,
  tiers: Sparkles,
  sparkles: Sparkles,
  email: Mail,
  products: PackageSearch,
};

export function iconForSection(icon: string) {
  return icons[icon] || LayoutDashboard;
}

export function SectionTabs({ sections, tone = "slate", className = "" }: { sections: LoopSection[]; tone?: "slate" | "emerald"; className?: string }) {
  const pathname = usePathname();
  const activeClass = tone === "emerald" ? "bg-emerald-700 text-white shadow-lg shadow-emerald-900/15" : "bg-slate-950 text-white shadow-lg shadow-slate-950/15";

  return (
    <div className={`min-w-0 overflow-x-auto ${className}`}>
      <nav className="flex min-w-max items-center gap-2 rounded-full border border-slate-200/80 bg-white/85 p-1 shadow-sm" aria-label="Section tabs">
        {sections.map((section) => {
          const Icon = iconForSection(section.icon);
          const active = isSectionActive(pathname, section);
          return (
            <Link
              key={section.key}
              href={section.href}
              title={section.description || section.label}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black transition ${
                active ? activeClass : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{section.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

import Link from "next/link";
import {
  ArrowRightLeft,
  Banknote,
  CreditCard,
  PiggyBank,
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
  {
    key: "flow",
    label: "Flow",
    copy: "See the whole month",
    icon: ArrowRightLeft,
  },
  {
    key: "income",
    label: "Income",
    copy: "Pay and money in",
    icon: Banknote,
  },
  {
    key: "spending",
    label: "Spending",
    copy: "Bills and money out",
    icon: CreditCard,
  },
  {
    key: "savings",
    label: "Savings & pots",
    copy: "Cash building forward",
    icon: PiggyBank,
  },
];

function hrefFor(
  section: FinancialFlowWorkspaceSection,
  month?: string | null,
) {
  const suffix = month ? `?month=${encodeURIComponent(month)}` : "";
  if (section === "flow") return `/financial-flow${suffix}`;
  if (section === "income") return `/income${suffix}`;
  if (section === "spending") return `/spending${suffix}`;
  const savingsQuery = new URLSearchParams();
  savingsQuery.set("tab", "savings");
  if (month) savingsQuery.set("month", month);
  return `/financial-flow?${savingsQuery.toString()}`;
}

export function FinancialFlowWorkspaceNav({
  section,
  month,
}: {
  section: FinancialFlowWorkspaceSection;
  month?: string | null;
}) {
  return (
    <section className="loop-financial-workspace-nav mx-auto w-[95vw] max-w-[2000px] px-4 pt-4 sm:px-6 lg:px-8">
      <div className="rounded-[1.35rem] border border-slate-200/80 bg-white/92 p-3 shadow-[0_18px_50px_-42px_rgba(15,23,42,.85)] backdrop-blur">
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
              Financial Flow
            </p>
            <p className="text-xs font-bold text-slate-500">
              One money workspace · edit the source, keep the whole picture connected
            </p>
          </div>
          <span className="hidden rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700 sm:block">
            Live household view
          </span>
        </div>

        <nav
          aria-label="Financial Flow workspace"
          className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 [overscroll-behavior-x:contain] [scrollbar-width:thin] lg:grid lg:grid-cols-4 lg:overflow-visible lg:pb-0"
        >
          {ITEMS.map((item) => {
            const Icon = item.icon;
            const active = item.key === section;
            return (
              <Link
                key={item.key}
                href={hrefFor(item.key, month)}
                className={`group min-w-[10.5rem] shrink-0 snap-start rounded-2xl border px-4 py-3 transition lg:min-w-0 ${
                  active
                    ? "border-emerald-200 bg-emerald-50/80 text-slate-950 shadow-sm"
                    : "border-transparent bg-slate-50/70 text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-950"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                      active
                        ? "bg-emerald-700 text-white"
                        : "bg-white text-slate-500 ring-1 ring-slate-200 group-hover:text-slate-950"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black">{item.label}</p>
                    <p className="truncate text-[11px] font-bold opacity-65">
                      {item.copy}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </nav>
      </div>
    </section>
  );
}

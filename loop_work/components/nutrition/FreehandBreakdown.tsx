import { BadgeCheck, Sparkles } from "lucide-react";
import type { FreehandBreakdownItem } from "@/lib/nutrition/freehand";

const SOURCE: Record<FreehandBreakdownItem["source"], { label: string; tone: string }> = {
  uk_reference: { label: "UK data", tone: "bg-emerald-100 text-emerald-800" },
  typical: { label: "Typical values", tone: "bg-sky-100 text-sky-800" },
  ai: { label: "AI estimate", tone: "bg-violet-100 text-violet-800" },
  rough: { label: "Rough estimate", tone: "bg-amber-100 text-amber-800" },
};

export function FreehandBreakdown({ items }: { items: FreehandBreakdownItem[] }) {
  const total = items.reduce((sum, item) => sum + item.calories, 0);
  return (
    <div className="mt-3 rounded-2xl bg-white p-3 ring-1 ring-slate-100">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">How Loop worked it out · {Math.round(total)} kcal</p>
      <ul className="mt-2 divide-y divide-slate-100">
        {items.map((item, idx) => {
          const source = SOURCE[item.source];
          return (
            <li key={`${item.name}-${idx}`} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-black capitalize text-slate-900">{item.name}</p>
                <p className="text-xs font-semibold text-slate-500">
                  {item.amount > 0 ? `${item.amount}${item.unit}${item.amountNote ? ` · ${item.amountNote}` : ""}` : "Amount not stated"}
                  {item.matched ? ` · ${item.matched}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black ${source.tone}`}>{item.source === "uk_reference" ? <BadgeCheck className="h-3 w-3" /> : item.source === "ai" ? <Sparkles className="h-3 w-3" /> : null}{source.label}</span>
                <span className="w-16 text-right text-xs font-black text-slate-800">{item.calories} kcal</span>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-1 text-xs font-semibold text-slate-500">If an amount is off, add it to your description (e.g. &ldquo;250g&rdquo;, &ldquo;2 slices&rdquo;) and work it out again.</p>
    </div>
  );
}

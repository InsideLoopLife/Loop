"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

const copy: Record<string, { title: string; body: string }[]> = {
  "/dashboard": [
    { title: "Overview", body: "This is your daily command centre. It pulls health, wealth and household context together once your setup data exists." },
    { title: "Start small", body: "Add a salary and one bill first. LOOP becomes more useful as you add more context." },
  ],
  "/nutrition": [
    { title: "Food logging", body: "Use Quick Search for products and saved cards, or Ask AI for freehand meals. The lower logging form appears only after LOOP has a food/card to log." },
  ],
  "/income": [{ title: "Income", body: "Salary, maternity and future pay changes live here. These feed affordability, monthly flow and household projections." }],
  "/spending": [{ title: "Spending", body: "Bills, subscriptions and one-off costs live here. Over time this becomes the renewal and drop-off watch." }],
  "/investments": [{ title: "Investments", body: "Free users can search stocks and ETFs using delayed/manual data. Paid data tiers can later unlock broader or realtime feeds." }],
};

export function PageTour() {
  const pathname = usePathname();
  const steps = useMemo(() => copy[pathname || ""] || [], [pathname]);
  const key = `loop-tour:${pathname}`;
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!steps.length) return;
    if (window.localStorage.getItem(key)) return;
    setOpen(true);
  }, [key, steps.length]);

  if (!open || !steps.length) return null;
  const step = steps[index];
  return (
    <div className="fixed inset-0 z-[80] grid place-items-end bg-slate-950/25 p-4 backdrop-blur-sm sm:place-items-end">
      <div className="w-full max-w-md rounded-[2rem] border border-white/70 bg-white p-5 shadow-2xl">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-600">Quick tour</p>
        <h2 className="mt-2 text-2xl font-black text-slate-950">{step.title}</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{step.body}</p>
        <div className="mt-5 flex items-center justify-between gap-3">
          <button onClick={() => { window.localStorage.setItem(key, "done"); setOpen(false); }} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700">Skip</button>
          <button onClick={() => { if (index + 1 < steps.length) setIndex(index + 1); else { window.localStorage.setItem(key, "done"); setOpen(false); } }} className="rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white">{index + 1 < steps.length ? "Next" : "Done"}</button>
        </div>
      </div>
    </div>
  );
}

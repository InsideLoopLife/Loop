"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { BriefingAction } from "@/lib/briefing/build-financial-briefing";

export function ActionsBeat({ actions }: { actions: BriefingAction[] }) {
  return (
    <section>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[.2em] text-orange-500">Priority order</p>
          <h2 className="text-3xl font-black text-slate-950">Your next three decisions</h2>
        </div>
        <Link href="/loopwatch" className="text-sm font-black text-indigo-700">
          Open LoopWatch →
        </Link>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {actions.slice(0, 3).map((a) => (
          <Link href={a.href} key={a.rank} className="group rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
            <div className="flex items-center justify-between">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-100 font-black text-emerald-700">{a.rank}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase text-slate-500">{a.confidence} confidence</span>
            </div>
            <h3 className="mt-5 text-xl font-black text-slate-950">{a.title}</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{a.body}</p>
            <p className="mt-4 text-sm font-black text-orange-600">{a.impact}</p>
            <ArrowRight className="mt-5 h-5 w-5 transition group-hover:translate-x-1" />
          </Link>
        ))}
      </div>
    </section>
  );
}

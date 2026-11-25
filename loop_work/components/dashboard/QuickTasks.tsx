import Link from "next/link";
import { ArrowLeftRight, Calculator, Home, Landmark, PiggyBank, Search } from "lucide-react";

// "What do you want to do?" — one click to each common job, so nobody has to hunt through tabs.
const TASKS = [
  { href: "/financial-flow", label: "See this month", hint: "Money in, bills and what's left", icon: ArrowLeftRight },
  { href: "/spending?plan=new#planned-purchases", label: "Plan a purchase", hint: "Car, holiday, big buy — can we afford it?", icon: Calculator },
  { href: "/bank-accounts?add=1", label: "Add an account", hint: "Joint, personal or savings", icon: Landmark },
  { href: "/loopwatch", label: "Check prices & renewals", hint: "Bills, contracts and deals", icon: Search },
  { href: "/investments", label: "Pensions & investments", hint: "Pots, funds and retirement", icon: PiggyBank },
  { href: "/mortgage", label: "Household", hint: "Home, bills, cars and emergency fund", icon: Home },
];

export function QuickTasks() {
  return (
    <nav aria-label="What do you want to do?" className="mb-5">
      <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-slate-400">What do you want to do?</p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {TASKS.map((task) => {
          const Icon = task.icon;
          return (
            <li key={task.href}>
              <Link href={task.href} className="group flex h-full items-start gap-3 rounded-2xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm transition hover:border-slate-950 hover:shadow">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-800 group-hover:bg-slate-950 group-hover:text-white"><Icon className="h-4.5 w-4.5" /></span>
                <span className="min-w-0">
                  <span className="block text-sm font-black leading-tight text-slate-950">{task.label}</span>
                  <span className="mt-0.5 block text-[11px] font-semibold leading-snug text-slate-500">{task.hint}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

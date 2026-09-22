import Link from "next/link";
import { ArrowRight, Bot, HeartPulse, Home, LineChart, PiggyBank, UsersRound } from "lucide-react";

const plans = [
  { name: "Free", strapline: "Build the picture", copy: "Core manual tracking plus a useful taste of LOOP's AI and investment tools." },
  { name: "Extra", strapline: "Do more, faster", copy: "More AI, nutrition scanning and investment searches for people using LOOP more regularly." },
  { name: "Plus", strapline: "Plan more deeply", copy: "Deeper household, home, savings and monitoring tools, with larger allowances." },
  { name: "Pro", strapline: "Connect and optimise", copy: "Connected investing, live-market capability and LOOP's most advanced financial tools." },
];

const groups = [
  { title: "Understand your money", icon: LineChart, description: "Bring income, bills, savings, pensions, investments, assets and liabilities into one clearer picture.", features: ["Manual wealth tracking", "Investment search", "Automatic investment matching", "Download your data"] },
  { title: "Get help from LOOP", icon: Bot, description: "Use AI to ask questions, understand what changed and turn the information you track into useful next steps.", features: ["Ask LOOP", "Daily financial briefing", "Food and meal analysis", "Nutrition label scanner"] },
  { title: "Make savings work harder", icon: PiggyBank, description: "Understand your savings position and spot opportunities to improve rates or make better use of spare cash.", features: ["Savings rate suggestions", "Surplus cash guidance"] },
  { title: "Plan your home", icon: Home, description: "Keep your mortgage and future home decisions connected to the rest of your household finances.", features: ["Mortgage rate monitoring", "Home move planner"] },
  { title: "Plan as a household", icon: UsersRound, description: "Build LOOP around the people who share your finances, goals and day-to-day decisions.", features: ["Household profiles", "Email things into LOOP"] },
  { title: "Track health and nutrition", icon: HeartPulse, description: "Log food with less effort and use trends to understand how everyday choices add up.", features: ["Daily nutrition tracking", "Nutrition insights", "Nutrition label scanner"] },
];

export default function FeaturesPage() {
  return (
    <main className="mx-auto w-[94vw] max-w-[1500px] space-y-16 px-4 py-12 md:px-6">
      <section className="overflow-hidden rounded-[3rem] bg-slate-950 px-6 py-12 text-white md:px-12 md:py-16">
        <div className="max-w-4xl">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">What LOOP can do</p>
          <h1 className="mt-4 text-4xl font-black tracking-tight md:text-6xl">A clearer picture of your household, with more help when you want it.</h1>
          <p className="mt-5 max-w-3xl text-base font-bold leading-7 text-white/65 md:text-lg">
            LOOP brings money, home, investments and health into one place. Higher plans add more automation, larger allowances and deeper tools rather than changing the basics of how your data works.
          </p>
        </div>
      </section>

      <section>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Choose the level that fits</p>
        <h2 className="mt-2 text-3xl font-black text-slate-950">What changes between plans?</h2>
        <p className="mt-3 max-w-3xl text-sm font-bold leading-6 text-slate-600">Every step up should have a reason. The difference is mainly how much help, automation and connected capability you want.</p>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => (
            <article key={plan.name} className="rounded-[2rem] border border-slate-200 bg-white p-6">
              <p className="text-xs font-black uppercase tracking-[0.15em] text-slate-400">{plan.strapline}</p>
              <h3 className="mt-2 text-2xl font-black text-slate-950">{plan.name}</h3>
              <p className="mt-3 text-sm font-bold leading-6 text-slate-500">{plan.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => {
          const Icon = group.icon;
          return (
            <article key={group.title} className="rounded-[2.25rem] border border-slate-200 bg-white p-6">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-900"><Icon className="h-6 w-6" /></span>
              <h2 className="mt-5 text-2xl font-black text-slate-950">{group.title}</h2>
              <p className="mt-2 text-sm font-bold leading-6 text-slate-500">{group.description}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {group.features.map((feature) => <span key={feature} className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-800">{feature}</span>)}
              </div>
            </article>
          );
        })}
      </section>

      <section className="flex flex-col gap-4 rounded-[2.5rem] bg-emerald-50 p-7 md:flex-row md:items-center md:justify-between md:p-9">
        <div>
          <h2 className="text-2xl font-black text-emerald-950">Start with what you need now.</h2>
          <p className="mt-2 max-w-2xl text-sm font-bold leading-6 text-emerald-800">You can move plans as you use more of LOOP. The plan controls are designed to make the limits clear before you hit them.</p>
        </div>
        <Link href="/account" className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white">
          View your account <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    </main>
  );
}

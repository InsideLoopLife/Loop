"use client";

import Link from "next/link";

const FLOW_ITEMS = [
  ["Income calendar", "Pay dates and regular household inflows."],
  ["Spending planner", "Recurring bills, flexible costs and upcoming changes."],
  ["Childcare considerations", "Nursery, funded hours, drop-off dates and changing monthly costs."],
  ["Assigned household costs", "See who owns a cost and what the household pays overall."],
];

const HOUSEHOLD_STATUS = [
  ["Profiles", "Live", "Adults, children and household relationships"],
  ["Assigned costs", "Live", "Personal vs household spending context"],
  ["Calendar logic", "Developing", "Financial and household events beginning to connect"],
  ["Nutrition logging", "Early", "Household-aware logging foundation in place"],
];

export function IntroductionPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#07100f] text-white">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -left-40 top-20 h-[34rem] w-[34rem] rounded-full bg-emerald-400/10 blur-[120px]" />
        <div className="absolute -right-56 top-[30rem] h-[40rem] w-[40rem] rounded-full bg-violet-500/10 blur-[140px]" />
      </div>

      <header className="sticky top-3 z-30 mx-auto mt-3 flex h-[72px] w-[min(1280px,calc(100%-24px))] max-w-[calc(100%-24px)] items-center justify-between rounded-[22px] border border-white/10 bg-[#07100f]/80 px-4 backdrop-blur-2xl sm:px-6">
        <LoopWordmark />
        <nav className="hidden items-center gap-7 text-sm font-semibold text-slate-300 lg:flex">
          <a href="#flow" className="hover:text-white">Money</a>
          <a href="#pensions" className="hover:text-white">Pensions</a>
          <a href="#home" className="hover:text-white">Home</a>
          <a href="#household" className="hover:text-white">Household</a>
          <a href="#coming" className="hover:text-white">Coming soon</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="hidden rounded-full px-4 py-2.5 text-sm font-bold text-slate-200 hover:bg-white/5 sm:block">
            Sign in
          </Link>
          <Link href="/signup" className="rounded-full bg-gradient-to-br from-emerald-300 to-emerald-100 px-4 py-2.5 text-sm font-black text-[#07100f] shadow-lg shadow-emerald-400/10">
            Start your Loop
          </Link>
        </div>
      </header>

      <section className="mx-auto grid min-h-[760px] w-[min(1180px,calc(100%-28px))] items-center gap-12 py-16 lg:grid-cols-[0.93fr_1.07fr] lg:py-20">
        <div className="text-center lg:text-left">
          <div className="mb-5 flex items-center justify-center gap-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-300 lg:justify-start">
            <span className="h-px w-7 bg-emerald-300" />
            One connected financial picture
          </div>
          <h1 className="text-[clamp(3.3rem,7vw,6.2rem)] font-black leading-[0.94] tracking-[-0.065em]">
            Your money.<br />
            <span className="font-semibold text-slate-400">Your household.<br />Your future.</span>
          </h1>
          <p className="mx-auto mt-7 max-w-xl text-lg font-semibold leading-8 text-slate-100 lg:mx-0">
            Spending, childcare, savings, pensions, investments and your home — connected in one financial picture.
          </p>
          <p className="mx-auto mt-3 max-w-xl text-sm font-medium leading-7 text-slate-400 lg:mx-0">
            See what is happening now, what is changing next, and how decisions in one part of your household affect another.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
            <Link href="/signup" className="rounded-full bg-gradient-to-br from-emerald-300 to-emerald-100 px-6 py-3.5 text-sm font-black text-[#07100f]">
              Start your Loop
            </Link>
            <a href="#features" className="rounded-full px-6 py-3.5 text-sm font-bold text-slate-200 hover:bg-white/5">
              Explore what Loop connects ↓
            </a>
          </div>
          <div className="mt-9 flex items-start justify-center gap-3 text-left text-xs font-semibold text-slate-400 lg:justify-start">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-emerald-300/20 bg-emerald-300/5 text-emerald-300">✓</span>
            <p className="max-w-md">
              <span className="text-slate-200">Built around households.</span> Personal information can stay personal while shared costs stay shared.
            </p>
          </div>
        </div>

        <DashboardPreview />
      </section>

      <section className="mx-auto grid w-[min(1180px,calc(100%-28px))] grid-cols-2 border-y border-white/10 py-5 lg:grid-cols-4">
        {[
          ["01", "Financial Flow", "Income, bills, spending & childcare"],
          ["02", "Save & Build", "Savings, goals & allowances"],
          ["03", "Future Wealth", "Pensions & investments"],
          ["04", "Home", "Property & mortgage"],
        ].map(([n, title, detail]) => (
          <div key={title} className="border-white/10 px-3 py-4 lg:border-r lg:px-6 lg:last:border-r-0">
            <span className="text-[9px] font-black text-emerald-300">{n}</span>
            <strong className="mt-1 block text-sm font-black">{title}</strong>
            <small className="mt-1 block text-[10px] leading-4 text-slate-500">{detail}</small>
          </div>
        ))}
      </section>

      <section id="features" className="mx-auto w-[min(1180px,calc(100%-28px))] py-28 lg:py-36">
        <div className="grid gap-5 lg:grid-cols-[180px_1fr]">
          <span className="pt-2 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300">What Loop connects today</span>
          <div>
            <h2 className="text-[clamp(2.6rem,5vw,4.5rem)] font-black leading-[1.02] tracking-[-0.055em]">
              Not just accounts.<br /><span className="font-semibold text-slate-400">The decisions around them.</span>
            </h2>
            <p className="mt-5 max-w-2xl text-sm font-medium leading-7 text-slate-400">
              Loop groups financial information around the way households actually think and plan.
            </p>
          </div>
        </div>

        <div className="mt-14 grid gap-4">
          <article id="flow" className="grid gap-10 rounded-[28px] border border-white/[0.07] bg-gradient-to-br from-[#101c1a] to-[#0b1614] p-6 md:p-8 lg:grid-cols-[0.95fr_1.05fr]">
            <div>
              <Pill color="emerald">FINANCIAL FLOW</Pill>
              <h3 className="mt-5 text-3xl font-black tracking-[-0.045em] sm:text-4xl">Know what the month really costs.</h3>
              <p className="mt-4 max-w-xl text-sm leading-7 text-slate-400">
                Bring income, recurring spending, bills, childcare and shared household commitments into one usable picture.
              </p>
              <div className="mt-6">
                {FLOW_ITEMS.map(([title, detail]) => (
                  <div key={title} className="grid gap-1 border-t border-white/[0.07] py-3 sm:grid-cols-[155px_1fr] sm:gap-4">
                    <b className="text-xs">{title}</b>
                    <span className="text-[11px] leading-5 text-slate-500">{detail}</span>
                  </div>
                ))}
              </div>
            </div>
            <CashFlowPanel />
          </article>

          <div className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-[28px] border border-white/[0.07] bg-gradient-to-br from-[#101c1a] to-[#0b1614] p-6 md:p-8">
              <Pill color="blue">SAVINGS & GOALS</Pill>
              <h3 className="mt-5 text-3xl font-black tracking-[-0.045em]">Give spare money a job.</h3>
              <p className="mt-4 text-sm leading-7 text-slate-400">
                Track pots, expected interest, goals and allowances without losing the wider household plan.
              </p>
              <div className="mt-8 rounded-2xl border border-white/[0.06] bg-[#091411] p-5">
                <div className="flex items-center justify-between"><span className="text-xs text-slate-400">Emergency fund</span><b>74%</b></div>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full w-[74%] rounded-full bg-gradient-to-r from-sky-400 to-violet-400" /></div>
                <small className="mt-3 block text-[10px] text-slate-500">£7,420 of £10,000 · on track</small>
              </div>
              <div className="mt-3 flex items-center justify-between rounded-xl border border-white/[0.05] px-4 py-3 text-[10px]">
                <span className="text-slate-500">ISA allowance</span><b>£11,240 remaining</b>
              </div>
            </article>

            <article id="home" className="rounded-[28px] border border-white/[0.07] bg-gradient-to-br from-[#101c1a] to-[#0b1614] p-6 md:p-8">
              <Pill color="orange">HOME & MORTGAGE</Pill>
              <h3 className="mt-5 text-3xl font-black tracking-[-0.045em]">See the home and debt together.</h3>
              <p className="mt-4 text-sm leading-7 text-slate-400">
                Property value, mortgage position, LTV, renewal timing and deal considerations in one place.
              </p>
              <div className="mt-8 rounded-2xl border border-white/[0.06] bg-[#091411] p-5">
                <small className="text-[9px] font-black tracking-[0.14em] text-slate-500">HOME POSITION</small>
                <strong className="mt-2 block text-3xl font-black">£290,000</strong>
                {[
                  ["Mortgage", "£104,812"],
                  ["Estimated LTV", "36%"],
                  ["Current fix", "7 months left"],
                ].map(([a,b]) => (
                  <div key={a} className="flex justify-between border-t border-white/[0.07] py-3 text-[11px]">
                    <span className="text-slate-500">{a}</span><b>{b}</b>
                  </div>
                ))}
              </div>
            </article>
          </div>

          <article id="pensions" className="grid gap-10 rounded-[28px] border border-white/[0.07] bg-gradient-to-br from-[#101c1a] to-[#0b1614] p-6 md:p-8 lg:grid-cols-[0.95fr_1.05fr]">
            <div>
              <Pill color="violet">PENSIONS & INVESTMENTS</Pill>
              <h3 className="mt-5 text-3xl font-black tracking-[-0.045em] sm:text-4xl">Different pension types.<br />One retirement picture.</h3>
              <p className="mt-4 max-w-xl text-sm leading-7 text-slate-400">
                Loop distinguishes between money you own as a pot and pension income you are building as a benefit.
              </p>
              <div className="mt-6 grid gap-3">
                <PensionType badge="DC" title="Defined Contribution">
                  Workplace pensions, SIPPs and personal pensions tracked as values, contributions and investments.
                </PensionType>
                <PensionType badge="DB" title="Defined Benefit" blue>
                  NHS and other schemes modelled around service, accrual and expected retirement income.
                </PensionType>
              </div>
            </div>
            <div className="self-center rounded-2xl border border-white/[0.06] bg-[#091411] p-5">
              <small className="text-[9px] font-black tracking-[0.14em] text-slate-500">RETIREMENT POSITION</small>
              <div className="flex items-end justify-between py-5"><span className="text-xs text-slate-400">Tracked pots</span><strong className="text-3xl font-black">£92,148</strong></div>
              {[
                ["Defined contribution", "£83,282"],
                ["Personal pension", "£8,866"],
                ["NHS defined benefit", "Income model →"],
                ["Investments alongside pension", "Connected"],
              ].map(([a,b]) => (
                <div key={a} className="flex justify-between border-t border-white/[0.07] py-3 text-[11px]">
                  <span className="text-slate-500">{a}</span><b>{b}</b>
                </div>
              ))}
            </div>
          </article>

          <article id="household" className="grid gap-10 rounded-[28px] border border-white/[0.07] bg-gradient-to-br from-[#101c1a] to-[#0b1614] p-6 md:p-8 lg:grid-cols-[0.95fr_1.05fr]">
            <div>
              <Pill color="slate">HOUSEHOLD CONTEXT</Pill>
              <h3 className="mt-5 text-3xl font-black tracking-[-0.045em] sm:text-4xl">One person’s numbers rarely tell the whole story.</h3>
              <p className="mt-4 max-w-xl text-sm leading-7 text-slate-400">
                Profiles create context for who an account, cost, goal or responsibility belongs to — without forcing everything to be shared.
              </p>
              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                {HOUSEHOLD_STATUS.map(([title,status,detail]) => (
                  <div key={title} className="rounded-xl border border-white/[0.06] p-4">
                    <span className="block text-[9px] font-black tracking-[0.1em] text-slate-500">{title.toUpperCase()}</span>
                    <b className="mt-1 block text-xs">{status}</b>
                    <small className="mt-1 block text-[9px] leading-4 text-slate-500">{detail}</small>
                  </div>
                ))}
              </div>
            </div>
            <HouseholdMap />
          </article>
        </div>
      </section>

      <section id="coming" className="bg-[#e9efec] py-24 text-[#10201c] lg:py-32">
        <div className="mx-auto grid w-[min(1180px,calc(100%-28px))] gap-10 lg:grid-cols-[0.75fr_1.25fr]">
          <div>
            <span className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">What’s growing next</span>
            <h2 className="mt-4 text-[clamp(2.5rem,5vw,4.3rem)] font-black leading-[1.03] tracking-[-0.055em]">
              Health and family.<br /><span className="font-semibold text-[#6c7b75]">Growing into the same Loop.</span>
            </h2>
            <p className="mt-5 max-w-xl text-sm font-medium leading-7 text-[#5d6d67]">
              These areas are still developing. The aim is to connect them to the same household foundation rather than bolt on separate mini-apps.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <ComingCard label="HEALTH" status="COMING SOON" title="Health that makes sense in context.">
              Nutrition, activity, recovery and longer-term health trends, designed to become part of the same personal picture.
            </ComingCard>
            <ComingCard label="FAMILY" status="IN DEVELOPMENT" title="A household layer that does more.">
              Shared calendar and richer family organisation, building on profiles, assigned costs and existing nutrition logging.
            </ComingCard>
          </div>
        </div>
      </section>

      <section className="mx-auto w-[min(1180px,calc(100%-28px))] py-28 text-center lg:py-36">
        <span className="text-[10px] font-black uppercase tracking-[0.17em] text-emerald-300">Start with your financial picture</span>
        <h2 className="mt-5 text-[clamp(2.6rem,5vw,4.5rem)] font-black leading-[1.03] tracking-[-0.055em]">
          Understand today.<br /><span className="font-semibold text-slate-400">Plan what comes next.</span>
        </h2>
        <p className="mt-5 text-sm text-slate-400">Then let Loop grow with the rest of your household.</p>
        <Link href="/signup" className="mt-7 inline-block rounded-full bg-gradient-to-br from-emerald-300 to-emerald-100 px-7 py-4 text-sm font-black text-[#07100f]">
          Start your Loop
        </Link>
      </section>

      <footer className="mx-auto flex w-[min(1180px,calc(100%-28px))] flex-col items-center justify-between gap-4 border-t border-white/10 py-8 text-[10px] text-slate-500 sm:flex-row">
        <LoopWordmark />
        <p>Financial Flow · Savings · Pensions · Investments · Home · Household</p>
        <span>Private beta</span>
      </footer>
    </main>
  );
}

function LoopWordmark() {
  return (
    <span className="flex items-center gap-3" aria-label="LOOP">
      <span className="grid h-9 w-9 place-items-center rounded-xl border border-emerald-300/20 bg-emerald-300/5 text-3xl font-black leading-none text-emerald-300">∞</span>
      <span className="text-base font-black tracking-[0.2em]">LOOP</span>
    </span>
  );
}

function Pill({ children, color }: { children: React.ReactNode; color: "emerald" | "blue" | "orange" | "violet" | "slate" }) {
  const styles = {
    emerald: "border-emerald-300/20 bg-emerald-300/5 text-emerald-300",
    blue: "border-sky-300/20 bg-sky-300/5 text-sky-300",
    orange: "border-orange-300/20 bg-orange-300/5 text-orange-300",
    violet: "border-violet-300/20 bg-violet-300/5 text-violet-300",
    slate: "border-white/10 bg-white/[0.03] text-slate-200",
  }[color];

  return <span className={`inline-flex rounded-full border px-3 py-1.5 text-[9px] font-black tracking-[0.13em] ${styles}`}>{children}</span>;
}

function DashboardPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[575px]">
      <div className="rounded-[30px] border border-white/10 bg-gradient-to-b from-[#13221f] to-[#0a1513] p-4 shadow-[0_35px_100px_rgba(0,0,0,.4)] sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <div><small className="block text-[8px] font-black tracking-[0.14em] text-slate-600">YOUR HOUSEHOLD</small><strong className="mt-1 block text-base">Good afternoon, Dan.</strong></div>
          <div className="flex">
            {["D","A","O","M"].map((x,i)=><span key={x} className={`grid h-8 w-8 place-items-center rounded-full border-2 border-[#13211f] bg-[#20302c] text-[9px] font-bold ${i ? "-ml-1.5" : ""}`}>{x}</span>)}
          </div>
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-[#17302a] to-[#10211d] p-4">
          <div className="flex justify-between text-[9px] font-bold uppercase tracking-[0.1em] text-slate-500"><span>Household position</span><span className="rounded-full bg-emerald-300/5 px-2 py-1 text-emerald-300">Live</span></div>
          <strong className="mt-3 block text-4xl font-black tracking-[-0.05em]">£142,480</strong>
          <div className="mt-1 flex justify-between text-[9px] text-slate-500"><span>Net worth</span><span className="text-emerald-300">+£1,284 this month ↗</span></div>
          <svg className="mt-3 h-16 w-full" viewBox="0 0 500 90" fill="none" aria-hidden="true">
            <defs><linearGradient id="previewLine" x1="0" x2="1"><stop offset="0%" stopColor="#69edc6"/><stop offset="55%" stopColor="#6cb7ff"/><stop offset="100%" stopColor="#b18cff"/></linearGradient></defs>
            <path d="M0 78 C55 80 72 66 110 69 C152 72 179 47 216 52 C267 59 291 38 329 42 C372 45 399 28 432 32 C462 36 477 18 500 15" stroke="url(#previewLine)" strokeWidth="3"/>
          </svg>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {[
            ["SPENDING","£2,014","£212 below plan"],
            ["CHILDCARE","£684","2 upcoming changes"],
            ["PENSIONS","£92,148","DC + DB combined"],
            ["MORTGAGE","£104,812","Fix ends in 7 months"],
          ].map(([a,b,c])=>(
            <div key={a} className="rounded-xl border border-white/[0.05] bg-[#0f1d1a] p-3">
              <span className="block text-[8px] font-black tracking-[0.1em] text-slate-600">{a}</span><strong className="mt-1 block text-base">{b}</strong><small className="text-[8px] text-slate-600">{c}</small>
            </div>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-[auto_1fr_auto] gap-3 rounded-xl border border-violet-300/10 bg-gradient-to-br from-sky-400/[0.05] to-violet-400/[0.06] p-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-violet-300/[0.06] text-violet-300">✦</span>
          <div><small className="text-[8px] font-black tracking-[0.12em] text-slate-600">LOOP INSIGHT</small><strong className="mt-1 block text-[11px]">Your childcare costs fall before your mortgage renewal.</strong><p className="mt-1 text-[8px] text-slate-500">That could create £326/month of additional headroom.</p></div>
          <span>→</span>
        </div>
      </div>
      <div className="absolute -right-5 top-16 hidden w-36 rounded-2xl border border-white/10 bg-[#0e1b18]/90 p-3 shadow-xl backdrop-blur-xl sm:block">
        <small className="block text-[8px] uppercase tracking-[0.1em] text-slate-500">ISA allowance</small><strong className="mt-1 block text-xl">£11,240</strong><span className="text-[8px] text-slate-500">remaining</span>
      </div>
      <div className="absolute -left-3 bottom-16 hidden w-36 rounded-2xl border border-white/10 bg-[#0e1b18]/90 p-3 shadow-xl backdrop-blur-xl sm:block">
        <small className="block text-[8px] uppercase tracking-[0.1em] text-slate-500">NHS pension</small><strong className="mt-1 block text-xl">DB</strong><span className="text-[8px] text-slate-500">income model tracked</span>
      </div>
    </div>
  );
}

function CashFlowPanel() {
  return (
    <div className="self-center rounded-2xl border border-white/[0.06] bg-[#091411] p-5">
      <div className="mb-2 flex items-end justify-between"><span className="text-[9px] font-black tracking-[0.13em] text-slate-500">AUGUST CASH FLOW</span><strong className="text-2xl font-black text-emerald-300">+£1,042</strong></div>
      {[
        ["Income","+£5,126","text-emerald-300"],
        ["Home & bills","-£1,306",""],
        ["Childcare","-£684",""],
        ["Everyday spending","-£1,094",""],
      ].map(([a,b,c])=>(
        <div key={a} className={`flex justify-between border-b border-white/[0.06] py-3 text-[11px] ${a==="Childcare"?"-mx-2 rounded-lg bg-orange-300/[0.04] px-2":""}`}>
          <span className="text-slate-500">{a}</span><b className={c}>{b}</b>
        </div>
      ))}
      <div className="flex justify-between py-4 text-xs font-black"><span>Available to direct</span><b>£2,042</b></div>
      <div className="rounded-xl border border-emerald-300/10 bg-emerald-300/[0.04] px-3 py-2.5 text-[9px] text-slate-300">
        September · childcare projected to reduce by £326/month
      </div>
    </div>
  );
}

function PensionType({ badge, title, children, blue = false }: { badge: string; title: string; children: React.ReactNode; blue?: boolean }) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-3 rounded-xl border border-white/[0.06] p-3">
      <span className={`grid h-9 w-9 place-items-center rounded-lg text-[9px] font-black ${blue ? "bg-sky-300/[0.07] text-sky-300" : "bg-violet-300/[0.07] text-violet-300"}`}>{badge}</span>
      <div><b className="block text-xs">{title}</b><small className="mt-1 block text-[9px] leading-4 text-slate-500">{children}</small></div>
    </div>
  );
}

function HouseholdMap() {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center">
      <Person initial="D" label="You" detail="Personal + household" primary />
      <div className="h-12 w-px bg-gradient-to-b from-emerald-300 to-white/10" />
      <Person initial="A" label="Partner" detail="Personal + shared" />
      <div className="mt-8 grid grid-cols-2 gap-16">
        <Person initial="O" label="Child" detail="Guardian context" />
        <Person initial="M" label="Child" detail="Guardian context" />
      </div>
    </div>
  );
}

function Person({ initial, label, detail, primary = false }: { initial: string; label: string; detail: string; primary?: boolean }) {
  return (
    <div className="text-center">
      <span className={`mx-auto grid h-14 w-14 place-items-center rounded-full border bg-[#14231f] font-black ${primary ? "border-emerald-300/25 shadow-[0_0_25px_rgba(105,237,198,.08)]" : "border-white/10"}`}>{initial}</span>
      <b className="mt-2 block text-xs">{label}</b><small className="text-[9px] text-slate-500">{detail}</small>
    </div>
  );
}

function ComingCard({ label, status, title, children }: { label: string; status: string; title: string; children: React.ReactNode }) {
  return (
    <article className="min-h-[390px] rounded-3xl border border-[#d5dfda] bg-[#f5f8f6] p-6">
      <div className="flex justify-between text-[9px] font-black tracking-[0.1em]"><span>{label}</span><b className="rounded-full bg-[#e2e9e5] px-2 py-1 text-[#587068]">{status}</b></div>
      <h3 className="mt-7 text-3xl font-black tracking-[-0.045em]">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-[#65756f]">{children}</p>
      <div className="mt-10 grid h-28 grid-cols-4 items-end gap-2 rounded-2xl border border-[#dbe2de] bg-[#edf2ef] p-4">
        {[42,64,82,70].map((h,i)=><span key={i} className="rounded-md bg-gradient-to-b from-[#b9d8cf] to-[#dce8e4]" style={{height:`${h}%`}} />)}
      </div>
    </article>
  );
}

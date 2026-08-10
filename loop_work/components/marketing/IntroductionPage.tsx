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
          <Link href="/login" className="hidden rounded-full px-4 py-2.5 text-sm font-bold text-slate-200 hover:bg-white/5 sm:block">Sign in</Link>
          <Link href="/signup" className="rounded-full bg-gradient-to-br from-emerald-300 to-emerald-100 px-4 py-2.5 text-sm font-black text-[#07100f] shadow-lg shadow-emerald-400/10">Start your Loop</Link>
        </div>
      </header>

      <section className="relative">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-48 top-0 h-[34rem] w-[34rem] rounded-full bg-emerald-400/10 blur-[120px]" />
          <div className="absolute -right-48 top-24 h-[34rem] w-[34rem] rounded-full bg-violet-500/10 blur-[130px]" />
        </div>

        <div className="relative mx-auto grid min-h-[780px] w-[min(1180px,calc(100%-28px))] items-center gap-12 py-16 lg:grid-cols-[0.88fr_1.12fr] lg:py-20">
          <div className="text-center lg:text-left">
            <div className="mb-5 flex items-center justify-center gap-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-300 lg:justify-start">
              <span className="h-px w-7 bg-emerald-300" /> One connected financial picture
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
              <Link href="/signup" className="rounded-full bg-gradient-to-br from-emerald-300 to-emerald-100 px-6 py-3.5 text-sm font-black text-[#07100f]">Start your Loop</Link>
              <a href="#features" className="rounded-full px-6 py-3.5 text-sm font-bold text-slate-200 hover:bg-white/5">See inside Loop ↓</a>
            </div>
            <div className="mt-9 flex items-start justify-center gap-3 text-left text-xs font-semibold text-slate-400 lg:justify-start">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-emerald-300/20 bg-emerald-300/5 text-emerald-300">✓</span>
              <p className="max-w-md"><span className="text-slate-200">Built around households.</span> Personal information can stay personal while shared costs stay shared.</p>
            </div>
          </div>

          <OverviewPreview />
        </div>
      </section>

      <section className="bg-[#f4f7fb] text-slate-950">
        <div className="mx-auto grid w-[min(1180px,calc(100%-28px))] grid-cols-2 border-y border-slate-200/80 py-5 lg:grid-cols-4">
          {[
            ["01", "Financial Flow", "Income, bills, spending & childcare"],
            ["02", "Save & Build", "Savings, goals & allowances"],
            ["03", "Future Wealth", "Pensions & investments"],
            ["04", "Home", "Property & mortgage"],
          ].map(([n, title, detail]) => (
            <div key={title} className="border-slate-200/80 px-3 py-4 lg:border-r lg:px-6 lg:last:border-r-0">
              <span className="text-[9px] font-black text-orange-500">{n}</span>
              <strong className="mt-1 block text-sm font-black">{title}</strong>
              <small className="mt-1 block text-[10px] leading-4 text-slate-500">{detail}</small>
            </div>
          ))}
        </div>

        <div id="features" className="mx-auto w-[min(1180px,calc(100%-28px))] py-24 lg:py-32">
          <div className="grid gap-5 lg:grid-cols-[190px_1fr]">
            <span className="pt-2 text-[10px] font-black uppercase tracking-[0.16em] text-orange-600">What Loop connects today</span>
            <div>
              <h2 className="text-[clamp(2.6rem,5vw,4.5rem)] font-black leading-[1.02] tracking-[-0.055em]">
                What you see here<br /><span className="font-semibold text-slate-500">is what you use inside.</span>
              </h2>
              <p className="mt-5 max-w-2xl text-sm font-medium leading-7 text-slate-500">
                The public page now mirrors Loop’s actual Overview language: navy briefing surfaces, white working cards and the same orange-to-emerald accent system.
              </p>
            </div>
          </div>

          <div className="mt-14 grid gap-5">
            <AppSection id="flow" accent="orange" eyebrow="FINANCIAL FLOW" title="Know what the month really costs." description="Income, spending, bills and childcare shown the same way Loop works with them after you sign in.">
              <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                <div>
                  {FLOW_ITEMS.map(([title, detail]) => (
                    <div key={title} className="grid gap-1 border-t border-slate-200 py-3 sm:grid-cols-[155px_1fr] sm:gap-4">
                      <b className="text-xs">{title}</b><span className="text-[11px] leading-5 text-slate-500">{detail}</span>
                    </div>
                  ))}
                </div>
                <LightCashFlow />
              </div>
            </AppSection>

            <div className="grid gap-5 lg:grid-cols-2">
              <AppSection accent="emerald" eyebrow="SAVINGS & GOALS" title="Give spare money a job." description="Goals, pots, rates and allowance context — presented as operational cards, not marketing graphics.">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Stat title="Emergency fund" value="£7,420" helper="74% of £10,000 goal" />
                  <Stat title="ISA allowance" value="£11,240" helper="Remaining this tax year" />
                </div>
              </AppSection>

              <AppSection id="home" accent="indigo" eyebrow="HOME & MORTGAGE" title="See home and mortgage together." description="Property value, mortgage balance, LTV and renewal timing in the same hierarchy used elsewhere in Loop.">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Stat title="Home value" value="£290k" helper="Tracked property" />
                  <Stat title="Mortgage" value="£104.8k" helper="Current balance" />
                  <Stat title="LTV" value="36%" helper="7 months on fix" />
                </div>
              </AppSection>
            </div>

            <AppSection id="pensions" accent="emerald" eyebrow="PENSIONS & INVESTMENTS" title="Different pension types. One retirement picture." description="Defined Contribution values and Defined Benefit income are treated differently, then brought together in one view.">
              <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                <div className="grid gap-3">
                  <InfoTile badge="DC" title="Defined Contribution" detail="Workplace pensions, SIPPs and personal pensions tracked as balances, contributions and underlying investments." />
                  <InfoTile badge="DB" title="Defined Benefit" detail="NHS and other schemes modelled around service, accrual and expected retirement income." blue />
                </div>
                <div className="rounded-[1.6rem] border border-slate-200 bg-slate-50/80 p-5">
                  <span className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">RETIREMENT POSITION</span>
                  <div className="flex items-end justify-between py-5"><span className="text-xs font-semibold text-slate-500">Tracked pots</span><strong className="text-3xl font-black tracking-tight">£92,148</strong></div>
                  {[
                    ["Defined contribution", "£83,282"],
                    ["Personal pension", "£8,866"],
                    ["NHS defined benefit", "Income model →"],
                    ["Investments alongside pension", "Connected"],
                  ].map(([a,b]) => (
                    <div key={a} className="flex justify-between border-t border-slate-200 py-3 text-[11px]">
                      <span className="text-slate-500">{a}</span><b>{b}</b>
                    </div>
                  ))}
                </div>
              </div>
            </AppSection>

            <AppSection id="household" accent="orange" eyebrow="HOUSEHOLD CONTEXT" title="One person’s numbers rarely tell the whole story." description="Profiles and assignments create the context that makes the financial data useful.">
              <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
                <div className="grid gap-3 sm:grid-cols-2">
                  {HOUSEHOLD_STATUS.map(([title,status,detail]) => (
                    <div key={title} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                      <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">{title}</span>
                      <b className="mt-1 block text-xs">{status}</b>
                      <small className="mt-1 block text-[9px] leading-4 text-slate-500">{detail}</small>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-center rounded-[1.6rem] border border-slate-200 bg-slate-50/70 p-6">
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      ["D","You","Personal + household"],
                      ["A","Partner","Personal + shared"],
                      ["O","Child","Guardian context"],
                      ["M","Child","Guardian context"],
                    ].map(([initial,label,detail]) => (
                      <div key={initial} className="text-center">
                        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-slate-200 bg-white font-black shadow-sm">{initial}</span>
                        <b className="mt-2 block text-xs">{label}</b><small className="text-[9px] text-slate-400">{detail}</small>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </AppSection>
          </div>
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
              These areas are still developing. They can stay aspirational on the public page without suggesting they are as mature as the financial product today.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <ComingCard label="HEALTH" status="COMING SOON" title="Health that makes sense in context.">
              Nutrition, activity, recovery and longer-term trends, designed to become part of the same personal picture.
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
        <Link href="/signup" className="mt-7 inline-block rounded-full bg-gradient-to-br from-emerald-300 to-emerald-100 px-7 py-4 text-sm font-black text-[#07100f]">Start your Loop</Link>
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

function OverviewPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[650px]">
      <div className="overflow-hidden rounded-[28px] border border-white/15 bg-[#f4f7fb] p-3 shadow-[0_40px_120px_rgba(0,0,0,.48)] sm:p-4">
        <div className="mb-3 flex items-center justify-between rounded-2xl bg-white/85 px-4 py-3 text-slate-950 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-950 text-xs font-black text-white">∞</span>
            <div><b className="block text-[11px]">Overview</b><small className="text-[8px] text-slate-400">Your household</small></div>
          </div>
          <div className="flex gap-1.5">{["D","A","O","M"].map(x=><span key={x} className="grid h-6 w-6 place-items-center rounded-full bg-slate-100 text-[8px] font-black text-slate-600">{x}</span>)}</div>
        </div>

        <div className="relative overflow-hidden rounded-[2rem] bg-slate-950 p-5 text-white shadow-xl">
          <div className="absolute -right-20 -top-20 h-48 w-48 rounded-full bg-orange-500/30 blur-3xl" />
          <div className="absolute -bottom-24 left-1/3 h-44 w-44 rounded-full bg-emerald-400/20 blur-3xl" />
          <div className="relative">
            <span className="text-[8px] font-black uppercase tracking-[0.2em] text-orange-200">August 2026</span>
            <h3 className="mt-1 text-xl font-black tracking-tight">Hey Dan, here&apos;s how things are looking</h3>
            <p className="mt-2 max-w-lg text-[9px] leading-4 text-slate-300">Income comfortably covers planned costs this month, with savings capacity and upcoming childcare changes worth watching.</p>
            <div className="mt-3 flex gap-2">
              <span className="rounded-full bg-emerald-400/20 px-2.5 py-1 text-[8px] font-black text-emerald-100">Comfortable</span>
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-[8px] font-black text-slate-200">4 people tracked</span>
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <PreviewStat title="Income" value="£5,126" helper="This month" />
          <PreviewStat title="Outgoings" value="£3,084" helper="Planned" />
          <PreviewStat title="Surplus" value="£2,042" helper="Available" />
          <PreviewStat title="Savings" value="£1,000" helper="Target" />
        </div>

        <div className="mt-3 rounded-[1.6rem] border border-white/70 bg-white/90 p-4 text-slate-950 shadow-sm">
          <div className="mb-3 h-1.5 w-9 rounded-full bg-gradient-to-r from-orange-500 via-amber-400 to-emerald-400" />
          <div className="flex items-end justify-between">
            <div><b className="block text-sm">What changes next</b><small className="text-[9px] text-slate-400">Upcoming household events affecting your plan</small></div>
            <span className="rounded-full bg-orange-50 px-2 py-1 text-[8px] font-black text-orange-600">2 to review</span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-3"><span className="text-[8px] text-slate-400">CHILDCARE</span><b className="mt-1 block text-[10px]">Cost reduces in September</b><small className="text-[8px] text-emerald-600">+£326/month headroom</small></div>
            <div className="rounded-xl bg-slate-50 p-3"><span className="text-[8px] text-slate-400">MORTGAGE</span><b className="mt-1 block text-[10px]">Fix ends in 7 months</b><small className="text-[8px] text-indigo-600">Start reviewing options</small></div>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-5 -right-3 hidden rounded-2xl border border-white/10 bg-[#0d1917]/95 px-4 py-3 shadow-2xl backdrop-blur-xl sm:block">
        <span className="block text-[8px] uppercase tracking-[0.12em] text-slate-500">This is Loop</span>
        <b className="mt-1 block text-xs">Marketing → real interface</b>
      </div>
    </div>
  );
}

function PreviewStat({ title, value, helper }: { title: string; value: string; helper: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/70 bg-white/90 p-3 text-slate-950 shadow-sm">
      <span className="absolute right-2 top-2 h-7 w-7 rounded-lg bg-gradient-to-br from-orange-100 to-emerald-100" />
      <span className="relative text-[8px] font-bold text-slate-400">{title}</span>
      <b className="relative mt-1 block text-base font-black tracking-tight">{value}</b>
      <small className="relative text-[8px] text-slate-400">{helper}</small>
    </div>
  );
}

function AppSection({ id, accent, eyebrow, title, description, children }: { id?: string; accent: "orange"|"emerald"|"indigo"; eyebrow: string; title: string; description: string; children: React.ReactNode }) {
  const accentClass = accent === "orange" ? "from-orange-500 via-amber-400 to-emerald-400" : accent === "emerald" ? "from-emerald-500 via-teal-400 to-indigo-400" : "from-indigo-500 via-violet-400 to-emerald-400";
  return (
    <section id={id} className="relative overflow-hidden rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_28px_90px_-58px_rgba(15,23,42,.75)] backdrop-blur-xl md:p-7">
      <div className="pointer-events-none absolute -right-24 -top-28 h-52 w-52 rounded-full bg-orange-100/50 blur-3xl" />
      <div className="relative mb-6">
        <div className={`mb-3 h-1.5 w-10 rounded-full bg-gradient-to-r ${accentClass}`} />
        <span className="text-[9px] font-black uppercase tracking-[0.13em] text-slate-400">{eyebrow}</span>
        <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-950 md:text-3xl">{title}</h3>
        <p className="mt-2 max-w-3xl text-xs font-medium leading-6 text-slate-500">{description}</p>
      </div>
      <div className="relative">{children}</div>
    </section>
  );
}

function Stat({ title, value, helper }: { title: string; value: string; helper: string }) {
  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-white/70 bg-white/90 p-5 shadow-[0_24px_74px_-52px_rgba(15,23,42,.72)]">
      <div className="absolute right-4 top-4 h-11 w-11 rounded-2xl bg-gradient-to-br from-orange-100 to-emerald-100" />
      <p className="relative text-sm font-bold text-slate-500">{title}</p>
      <p className="relative mt-2 text-3xl font-black tracking-tight text-slate-950">{value}</p>
      <p className="relative mt-1 text-sm font-medium text-slate-500">{helper}</p>
    </div>
  );
}

function LightCashFlow() {
  return (
    <div className="rounded-[1.6rem] border border-slate-200 bg-slate-50/75 p-5">
      <div className="mb-2 flex items-end justify-between"><span className="text-[9px] font-black tracking-[0.13em] text-slate-400">AUGUST CASH FLOW</span><strong className="text-2xl font-black text-emerald-600">+£1,042</strong></div>
      {[
        ["Income","+£5,126","text-emerald-600"],
        ["Home & bills","-£1,306",""],
        ["Childcare","-£684",""],
        ["Everyday spending","-£1,094",""],
      ].map(([a,b,c])=>(
        <div key={a} className={`flex justify-between border-b border-slate-200 py-3 text-[11px] ${a==="Childcare"?"-mx-2 rounded-lg bg-orange-50 px-2":""}`}>
          <span className="text-slate-500">{a}</span><b className={c}>{b}</b>
        </div>
      ))}
      <div className="flex justify-between py-4 text-xs font-black"><span>Available to direct</span><b>£2,042</b></div>
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[9px] text-emerald-800">September · childcare projected to reduce by £326/month</div>
    </div>
  );
}

function InfoTile({ badge, title, detail, blue = false }: { badge: string; title: string; detail: string; blue?: boolean }) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <span className={`grid h-10 w-10 place-items-center rounded-xl text-[9px] font-black ${blue ? "bg-sky-100 text-sky-700" : "bg-violet-100 text-violet-700"}`}>{badge}</span>
      <div><b className="block text-xs">{title}</b><small className="mt-1 block text-[9px] leading-4 text-slate-500">{detail}</small></div>
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

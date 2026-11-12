"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { ArrowLeft, ArrowRight, Check, Home, House, Loader2, PiggyBank, ReceiptText, UserRound, Users, WalletCards } from "lucide-react";
import { completeGuidedSetup } from "@/app/onboarding/setup-actions";
import { EMPLOYER_OPTIONS, HOME_COVERED_BILLS, HOME_OPTIONS, SETUP_BILLS, SETUP_EXTRAS, STUDENT_LOAN_PLAN_OPTIONS, type Employer, type HomeStatus } from "@/lib/onboarding/setup-options";
import { NHS_EMPLOYER_CONTRIBUTION_PERCENT_2026_27, nhsMemberContributionPercent } from "@/lib/calculations/nhs-pension";

export type GuidedSetupDefaults = {
  name: string;
  hasSelfPay: boolean;
  existingBills: string[];
  hasHome: boolean;
};

type YesNo = "yes" | "no" | "";

const inputClass =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-950 outline-none transition focus:border-slate-950 focus:ring-4 focus:ring-slate-950/10";
const labelClass = "block text-sm font-black text-slate-800";
const hintClass = "mt-1 text-xs font-semibold text-slate-500";

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className={labelClass}>{label}</span>
      {children}
      {hint ? <span className={`block ${hintClass}`}>{hint}</span> : null}
    </label>
  );
}

function MoneyInput({ name, placeholder, defaultValue, onValue }: { name: string; placeholder?: string; defaultValue?: string; onValue?: (value: string) => void }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-base font-black text-slate-400">£</span>
      <input name={name} inputMode="decimal" placeholder={placeholder} defaultValue={defaultValue} onChange={onValue ? (e) => onValue(e.target.value) : undefined} className={`${inputClass} pl-8`} />
    </div>
  );
}

function Choice({ name, value, onChange, yes = "Yes", no = "No" }: { name: string; value: YesNo; onChange: (v: YesNo) => void; yes?: string; no?: string }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <input type="hidden" name={name} value={value} />
      {(["yes", "no"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={value === option}
          className={`rounded-2xl border px-4 py-3 text-sm font-black transition ${value === option ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"}`}
        >
          {option === "yes" ? yes : no}
        </button>
      ))}
    </div>
  );
}

function PayFields({ prefix, who }: { prefix: "self" | "partner"; who: string }) {
  const [knowsSalary, setKnowsSalary] = useState<YesNo>("yes");
  const [employer, setEmployer] = useState<Employer>("standard");
  const [salary, setSalary] = useState("");
  const [hasPension, setHasPension] = useState<YesNo>("");
  const salaryNumber = Number(salary.replace(/[£,\s]/g, "")) || 0;
  const nhsRate = nhsMemberContributionPercent(salaryNumber);
  const [hasLoan, setHasLoan] = useState<YesNo>("");
  const [plan, setPlan] = useState("");

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <span className={labelClass}>Who {who === "your" ? "do you" : "do they"} work for?</span>
        <input type="hidden" name={`${prefix}_employer`} value={employer} />
        <div className="grid gap-2">
          {EMPLOYER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setEmployer(option.value)}
              aria-pressed={employer === option.value}
              className={`rounded-2xl border px-4 py-3 text-left transition ${employer === option.value ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white hover:border-slate-400"}`}
            >
              <span className={`block text-sm font-black ${employer === option.value ? "text-white" : "text-slate-900"}`}>{option.label}</span>
              <span className={`block text-xs font-semibold ${employer === option.value ? "text-white/70" : "text-slate-500"}`}>{option.detail}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <span className={labelClass}>Do you know {who} yearly salary before tax?</span>
        <Choice name={`${prefix}_knows_salary`} value={knowsSalary} onChange={setKnowsSalary} yes="Yes" no="I only know take-home" />
      </div>
      {knowsSalary === "no" ? (
        <Field label="Monthly take-home pay" hint="What actually lands in the bank each month.">
          <MoneyInput name={`${prefix}_monthly_take_home`} placeholder="2,400" />
        </Field>
      ) : (
        <Field label="Yearly salary before tax" hint="LOOP works out tax, National Insurance and take-home for you.">
          <MoneyInput name={`${prefix}_gross_annual_salary`} placeholder="35,000" onValue={setSalary} />
        </Field>
      )}
      <Field label="Which day of the month are you paid?" hint="Leave blank if it's the last working day.">
        <input name={`${prefix}_pay_day`} inputMode="numeric" placeholder="e.g. 25" className={inputClass} />
      </Field>

      {employer === "nhs" ? (
        <div className="space-y-3">
          <span className={labelClass}>In the NHS Pension Scheme?</span>
          <Choice name={`${prefix}_has_pension`} value={hasPension} onChange={setHasPension} yes="Yes" no="I've opted out" />
          {hasPension === "yes" ? (
            <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
              <input type="hidden" name={`${prefix}_pension_method`} value="nhs_pension" />
              {knowsSalary === "no" ? (
                <>NHS contributions are set by your salary. Add your yearly salary instead of take-home and LOOP will apply the right rate.</>
              ) : salaryNumber > 0 ? (
                <><span className="font-black">You pay {nhsRate}%</span> — the NHS rate for £{salaryNumber.toLocaleString("en-GB")}. Your employer adds {NHS_EMPLOYER_CONTRIBUTION_PERCENT_2026_27}% on top. It comes out before tax.</>
              ) : (
                <>Enter your salary above and LOOP will use the right NHS rate (5.2% to 12.5% depending on pay).</>
              )}
              <span className="mt-1 block text-xs text-emerald-800/80">Based on actual pay, NHS England &amp; Wales rates from April 2026.</span>
            </div>
          ) : null}
        </div>
      ) : (
      <div className="space-y-3">
        <span className={labelClass}>Pay into a workplace pension?</span>
        <Choice name={`${prefix}_has_pension`} value={hasPension} onChange={setHasPension} />
        {hasPension === "yes" ? (
          <Field label="How much of your salary goes in?" hint={employer === "public" ? "Public sector schemes set this by salary. Check your payslip for the exact %." : "Most workplaces use 5%. Check a payslip if you're not sure."}>
            <div className="relative">
              <input name={`${prefix}_pension_percent`} inputMode="decimal" defaultValue="5" className={`${inputClass} pr-10`} />
              <span className="pointer-events-none absolute right-4 top-1/2 z-10 -translate-y-1/2 font-black text-slate-400">%</span>
            </div>
          </Field>
        ) : null}
      </div>
      )}

      <div className="space-y-3">
        <span className={labelClass}>Have a student loan?</span>
        <Choice name={`${prefix}_has_student_loan`} value={hasLoan} onChange={setHasLoan} />
        {hasLoan === "yes" ? (
          <div className="space-y-3">
            <input type="hidden" name={`${prefix}_student_loan_plan`} value={plan} />
            <div className="grid gap-2">
              {STUDENT_LOAN_PLAN_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPlan(option.value)}
                  aria-pressed={plan === option.value}
                  className={`rounded-2xl border px-4 py-3 text-left transition ${plan === option.value ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white hover:border-slate-400"}`}
                >
                  <span className={`block text-sm font-black ${plan === option.value ? "text-white" : "text-slate-900"}`}>{option.label}</span>
                  <span className={`block text-xs font-semibold ${plan === option.value ? "text-white/70" : "text-slate-500"}`}>{option.detail}</span>
                </button>
              ))}
            </div>
            <Field label="Balance (optional)" hint="From your latest Student Loans Company statement.">
              <MoneyInput name={`${prefix}_student_loan_balance`} placeholder="28,000" />
            </Field>
          </div>
        ) : null}
      </div>
    </div>
  );
}

type CouncilLookup = {
  postcode: string;
  country: string;
  authorityCode?: string | null;
  authorityName?: string | null;
  bands: Array<{ band: string; annual: number; monthly: number; source: string; chargeYear: string | null }>;
  suggested?: { band: string; low: string; high: string; salesCount: number; medianPrice: number } | null;
  source?: string | null;
  chargeYear?: string | null;
  note?: string;
  error?: string;
};

const pounds = (n: number) => `£${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;

function OptionList<T extends string>({ name, value, onChange, options }: { name: string; value: T | ""; onChange: (v: T) => void; options: ReadonlyArray<{ value: T; label: string; detail?: string }> }) {
  return (
    <div className="grid gap-2">
      <input type="hidden" name={name} value={value} />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={`rounded-2xl border px-4 py-3 text-left transition ${value === option.value ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white hover:border-slate-400"}`}
        >
          <span className={`block text-sm font-black ${value === option.value ? "text-white" : "text-slate-900"}`}>{option.label}</span>
          {option.detail ? <span className={`block text-xs font-semibold ${value === option.value ? "text-white/70" : "text-slate-500"}`}>{option.detail}</span> : null}
        </button>
      ))}
    </div>
  );
}

function HomeFields({ status, onStatus, hasPartner, alreadyHasHome }: { status: HomeStatus | ""; onStatus: (s: HomeStatus) => void; hasPartner: boolean; alreadyHasHome: boolean }) {
  const [postcode, setPostcode] = useState("");
  const [lookup, setLookup] = useState<CouncilLookup | null>(null);
  const [loading, setLoading] = useState(false);
  const [band, setBand] = useState("");
  const [livesAlone, setLivesAlone] = useState<YesNo>("");
  const [councilMonthly, setCouncilMonthly] = useState("");
  const [joint, setJoint] = useState<YesNo>(hasPartner ? "yes" : "no");
  const [rateType, setRateType] = useState<"fixed" | "tracker" | "variable">("fixed");
  const owns = status === "mortgage" || status === "outright";

  async function findCouncil() {
    const clean = postcode.trim();
    if (clean.replace(/\s/g, "").length < 5) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/property/council-tax?postcode=${encodeURIComponent(clean)}`);
      const json = (await res.json()) as CouncilLookup;
      setLookup(res.ok ? json : { ...json, bands: [], postcode: clean, country: "" });
      if (res.ok && json.suggested && !band) chooseBand(json.suggested.band, json, livesAlone);
    } catch {
      setLookup({ postcode: clean, country: "", bands: [], error: "Couldn't look that up just now." });
    } finally {
      setLoading(false);
    }
  }

  function chooseBand(next: string, data = lookup, alone = livesAlone) {
    setBand(next);
    const row = data?.bands.find((b) => b.band === next);
    if (row) setCouncilMonthly(String(Math.round(row.monthly * (alone === "yes" ? 0.75 : 1) * 100) / 100));
  }

  function setAlone(next: YesNo) {
    setLivesAlone(next);
    if (band) chooseBand(band, lookup, next);
  }

  return (
    <div className="space-y-6">
      <OptionList name="home_status" value={status} onChange={onStatus} options={HOME_OPTIONS} />

      {status && status !== "family" ? (
        <>
          <div className="space-y-3">
            <span className={labelClass}>Your postcode</span>
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <input
                name="home_postcode"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value.toUpperCase())}
                onBlur={() => { if (!lookup || lookup.postcode.replace(/\s/g, "") !== postcode.replace(/\s/g, "")) void findCouncil(); }}
                autoComplete="postal-code"
                placeholder="e.g. LS1 4AP"
                className={inputClass}
              />
              <button type="button" onClick={() => void findCouncil()} className="rounded-2xl bg-slate-950 px-4 text-sm font-black text-white hover:bg-slate-800">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Find"}
              </button>
            </div>
            {owns ? (
              <input name="home_house_number" placeholder="House number or name (optional)" className={inputClass} />
            ) : null}
            <span className={`block ${hintClass}`}>LOOP uses this to find your council and its council tax for this year.</span>
          </div>

          {lookup ? (
            <div className="space-y-3 rounded-2xl bg-slate-50 p-4">
              <input type="hidden" name="council_tax_authority_code" value={lookup.authorityCode || ""} />
              <input type="hidden" name="council_tax_authority_name" value={lookup.authorityName || ""} />
              <input type="hidden" name="council_tax_country" value={lookup.country || ""} />
              <input type="hidden" name="council_tax_band" value={band} />
              {lookup.error ? (
                <p className="text-sm font-bold text-amber-800">{lookup.error} You can type your council tax below instead.</p>
              ) : lookup.note ? (
                <p className="text-sm font-bold text-slate-700">{lookup.note}</p>
              ) : (
                <>
                  <p className="text-sm font-black text-slate-900">
                    {lookup.authorityName || "Your council"}
                    <span className="ml-1 font-semibold text-slate-500">· {lookup.chargeYear || "this year"} {lookup.source === "council_table" ? "charges" : "(national average until we load this council)"}</span>
                  </p>
                  {lookup.bands.length ? (
                    <>
                      <span className={labelClass}>Which council tax band is your home?</span>
                      <div className="grid grid-cols-4 gap-2">
                        {lookup.bands.map((b) => (
                          <button
                            key={b.band}
                            type="button"
                            onClick={() => chooseBand(b.band)}
                            aria-pressed={band === b.band}
                            className={`rounded-xl border px-2 py-2 text-center transition ${band === b.band ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white hover:border-slate-400"}`}
                          >
                            <span className={`block text-sm font-black ${band === b.band ? "text-white" : "text-slate-900"}`}>{b.band}</span>
                            <span className={`block text-[11px] font-semibold ${band === b.band ? "text-white/70" : "text-slate-500"}`}>{pounds(b.monthly)}/mo</span>
                          </button>
                        ))}
                      </div>
                      <p className={hintClass}>
                        {lookup.suggested ? <>Recent sales on your postcode point to band {lookup.suggested.low === lookup.suggested.high ? lookup.suggested.band : `${lookup.suggested.low}–${lookup.suggested.high}`}. </> : null}
                        Not sure? <a href="https://www.gov.uk/council-tax-bands" target="_blank" rel="noreferrer" className="font-black text-emerald-700 underline">Check your band on GOV.UK</a>.
                      </p>
                      <div className="space-y-2">
                        <span className={labelClass}>Do you live on your own?</span>
                        <Choice name="council_tax_single_person" value={livesAlone} onChange={setAlone} yes="Yes (25% off)" no="No" />
                      </div>
                    </>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          <Field label="Council tax per month" hint="Filled in from your band. Change it if your bill says something different.">
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-base font-black text-slate-400">£</span>
              <input name="council_tax_monthly" inputMode="decimal" value={councilMonthly} onChange={(e) => setCouncilMonthly(e.target.value)} placeholder="0" className={`${inputClass} pl-8`} />
            </div>
          </Field>
        </>
      ) : null}

      {status === "rent" ? (
        <div className="grid grid-cols-[1fr_8rem] gap-3">
          <Field label="Rent per month">
            <MoneyInput name="rent_monthly" placeholder="950" />
          </Field>
          <Field label="Day paid">
            <input name="rent_day" inputMode="numeric" placeholder="1" className={inputClass} />
          </Field>
        </div>
      ) : null}

      {owns && alreadyHasHome ? (
        <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">✓ Your home is already set up. You can change it on the Home &amp; mortgage page.</p>
      ) : null}

      {owns && !alreadyHasHome ? (
        <div className="space-y-5">
          {hasPartner ? (
            <div className="space-y-3">
              <span className={labelClass}>Is it in joint names with your partner?</span>
              <Choice name="home_joint" value={joint} onChange={setJoint} />
            </div>
          ) : null}
          <Field label="Roughly what's it worth? (optional)" hint="Leave blank and LOOP will estimate it from recent sales nearby.">
            <MoneyInput name="home_value" placeholder="250,000" />
          </Field>
        </div>
      ) : null}

      {status === "mortgage" && !alreadyHasHome ? (
        <div className="space-y-5 border-t border-slate-100 pt-5">
          <p className="text-sm font-black text-slate-900">Your mortgage</p>
          <Field label="Lender">
            <input name="mortgage_lender" placeholder="e.g. Nationwide" className={inputClass} />
          </Field>
          <div className="grid grid-cols-[1fr_8rem] gap-3">
            <Field label="Monthly payment">
              <MoneyInput name="mortgage_monthly" placeholder="900" />
            </Field>
            <Field label="Day paid">
              <input name="mortgage_day" inputMode="numeric" placeholder="1" className={inputClass} />
            </Field>
          </div>
          <div className="space-y-3">
            <span className={labelClass}>What kind of rate?</span>
            <OptionList name="mortgage_rate_type" value={rateType} onChange={setRateType} options={[
              { value: "fixed", label: "Fixed" },
              { value: "tracker", label: "Tracker" },
              { value: "variable", label: "Variable or lender's standard rate" },
            ]} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Interest rate">
              <div className="relative">
                <input name="mortgage_rate" inputMode="decimal" placeholder="4.5" className={`${inputClass} pr-10`} />
                <span className="pointer-events-none absolute right-4 top-1/2 z-10 -translate-y-1/2 font-black text-slate-400">%</span>
              </div>
            </Field>
            {rateType !== "variable" ? (
              <Field label="Deal ends">
                <input name="mortgage_deal_end" type="date" className={inputClass} />
              </Field>
            ) : <span />}
          </div>
          <p className={hintClass}>With the end date, LOOP watches for better deals and reminds you before your rate changes.</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount left (optional)">
              <MoneyInput name="mortgage_balance" placeholder="180,000" />
            </Field>
            <Field label="Years left (optional)">
              <input name="mortgage_years_left" inputMode="numeric" placeholder="25" className={inputClass} />
            </Field>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 disabled:opacity-60">
      {pending ? "Setting things up…" : "Finish setup"} <Check className="h-4 w-4" />
    </button>
  );
}

export function GuidedSetup({ defaults }: { defaults: GuidedSetupDefaults }) {
  const [step, setStep] = useState(0);
  const [hasPartner, setHasPartner] = useState<YesNo>("");
  const [hasChildren, setHasChildren] = useState<YesNo>("");
  const [childCount, setChildCount] = useState(1);
  const [partnerPay, setPartnerPay] = useState<YesNo>("");
  const [extras, setExtras] = useState<Record<string, boolean>>({});
  const [homeStatus, setHomeStatus] = useState<HomeStatus | "">("");
  const topRef = useRef<HTMLDivElement>(null);
  const existingBills = useMemo(() => new Set(defaults.existingBills.map((b) => b.toLowerCase())), [defaults.existingBills]);

  const steps = [
    { key: "you", title: "Let's start with you", lead: "Just your name for now. You can add a photo and more later.", icon: UserRound },
    { key: "household", title: "Who's in your household?", lead: "So LOOP can plan for everyone's money, not just yours.", icon: Users },
    { key: "pay", title: "Your pay", lead: defaults.hasSelfPay ? "You've already added your pay — you can change it any time on the Income page." : "This is what makes everything else work: your budget, savings and what you can afford.", icon: WalletCards },
    ...(hasPartner === "yes" ? [{ key: "partner-pay", title: "Your partner's pay", lead: "Optional. Add it now to see your combined household picture.", icon: WalletCards }] : []),
    { key: "home", title: "Your home", lead: "LOOP looks up your council tax and keeps an eye on your mortgage deal for you.", icon: House },
    { key: "bills", title: "Your regular bills", lead: "Fill in the ones you pay. Leave the rest blank — you can add more later.", icon: ReceiptText },
    { key: "extras", title: "Anything else to track?", lead: "Tick what you have. We'll show you where to add each one when you're done.", icon: PiggyBank },
  ];
  const current = steps[Math.min(step, steps.length - 1)];
  const isLast = step >= steps.length - 1;

  function go(delta: number) {
    setStep((s) => Math.max(0, Math.min(steps.length - 1, s + delta)));
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const Icon = current.icon;

  return (
    <div ref={topRef} className="mx-auto w-full max-w-xl scroll-mt-6">
      <div className="mb-6">
        <div className="flex items-center justify-between text-xs font-black uppercase tracking-[0.2em] text-slate-500">
          <span>Step {step + 1} of {steps.length}</span>
          <span>{Math.round(((step + 1) / steps.length) * 100)}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
        </div>
      </div>

      {/* One form across all steps: hidden steps stay mounted so their answers are submitted together. */}
      <form action={completeGuidedSetup} onKeyDown={(e) => { if (e.key === "Enter" && !isLast && (e.target as HTMLElement).tagName === "INPUT") { e.preventDefault(); go(1); } }}>
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_30px_80px_-50px_rgba(15,23,42,.5)] md:p-8">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-950 text-white"><Icon className="h-5 w-5" /></span>
          <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950">{current.title}</h1>
          <p className="mt-2 text-sm font-semibold text-slate-500">{current.lead}</p>

          <div className="mt-7">
            <div hidden={current.key !== "you"} className="space-y-5">
              <Field label="What should we call you?">
                <input name="name" defaultValue={defaults.name} autoComplete="given-name" placeholder="Your first name" className={inputClass} />
              </Field>
            </div>

            <div hidden={current.key !== "household"} className="space-y-6">
              <div className="space-y-3">
                <span className={labelClass}>Do you share money with a partner?</span>
                <Choice name="has_partner" value={hasPartner} onChange={setHasPartner} />
                {hasPartner === "yes" ? (
                  <>
                    <Field label="Their first name">
                      <input name="partner_name" placeholder="e.g. Sam" className={inputClass} />
                    </Field>
                    <Field label="Their email (optional)" hint="We'll invite them to join you in LOOP with their own login. Nothing is shared until they accept.">
                      <input name="partner_email" type="email" placeholder="sam@example.com" className={inputClass} />
                    </Field>
                  </>
                ) : null}
              </div>
              <div className="space-y-3">
                <span className={labelClass}>Any children?</span>
                <Choice name="has_children" value={hasChildren} onChange={setHasChildren} />
                {hasChildren === "yes" ? (
                  <div className="space-y-3">
                    {Array.from({ length: childCount }).map((_, i) => (
                      <div key={i} className="grid grid-cols-[1fr_auto] gap-3">
                        <input name={`child_${i}_name`} placeholder={`Child ${i + 1} first name`} className={inputClass} />
                        <input name={`child_${i}_birth_date`} type="date" aria-label={`Child ${i + 1} date of birth`} className={`${inputClass} w-[11rem]`} />
                      </div>
                    ))}
                    {childCount < 6 ? (
                      <button type="button" onClick={() => setChildCount((c) => c + 1)} className="text-sm font-black text-emerald-700 hover:underline">+ Add another child</button>
                    ) : null}
                    <p className={hintClass}>Date of birth helps with childcare and Child Benefit. Optional.</p>
                  </div>
                ) : null}
              </div>
            </div>

            <div hidden={current.key !== "pay"}>
              {defaults.hasSelfPay ? (
                <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">✓ Your pay is already set up.</p>
              ) : (
                <PayFields prefix="self" who="your" />
              )}
            </div>

            {hasPartner === "yes" ? (
              <div hidden={current.key !== "partner-pay"} className="space-y-6">
                <Choice name="add_partner_pay" value={partnerPay} onChange={setPartnerPay} yes="Add their pay" no="Skip for now" />
                {partnerPay === "yes" ? <PayFields prefix="partner" who="their" /> : null}
              </div>
            ) : null}

            <div hidden={current.key !== "home"}>
              <HomeFields status={homeStatus} onStatus={setHomeStatus} hasPartner={hasPartner === "yes"} alreadyHasHome={defaults.hasHome} />
            </div>

            <div hidden={current.key !== "bills"} className="space-y-3">
              {SETUP_BILLS.filter((bill) => !(homeStatus && (HOME_COVERED_BILLS as readonly string[]).includes(bill.key))).map((bill) => {
                const already = existingBills.has(bill.label.toLowerCase());
                return (
                  <div key={bill.key} className="grid grid-cols-[1fr_8.5rem] items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                    <div>
                      <p className="text-sm font-black text-slate-900">{bill.label}</p>
                      <p className="text-xs font-semibold text-slate-500">{already ? "Already added" : "hint" in bill ? bill.hint : "Per month"}</p>
                    </div>
                    {already ? (
                      <span className="justify-self-end text-emerald-600"><Check className="h-5 w-5" /></span>
                    ) : (
                      <MoneyInput name={`bill_${bill.key}`} placeholder="0" />
                    )}
                  </div>
                );
              })}
              <p className={hintClass}>Monthly amounts. LOOP sorts each one into the right category for you.</p>
            </div>

            <div hidden={current.key !== "extras"} className="space-y-3">
              {SETUP_EXTRAS.filter((extra) => !(extra.key === "home" && homeStatus)).map((extra) => (
                <button
                  key={extra.key}
                  type="button"
                  onClick={() => setExtras((prev) => ({ ...prev, [extra.key]: !prev[extra.key] }))}
                  aria-pressed={Boolean(extras[extra.key])}
                  className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition ${extras[extra.key] ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-white hover:border-slate-400"}`}
                >
                  <input type="hidden" name={`extra_${extra.key}`} value={extras[extra.key] ? "yes" : ""} />
                  <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border ${extras[extra.key] ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300"}`}>
                    {extras[extra.key] ? <Check className="h-3.5 w-3.5" /> : null}
                  </span>
                  <span>
                    <span className="block text-sm font-black text-slate-900">{extra.label}</span>
                    <span className="block text-xs font-semibold text-slate-500">{extra.detail}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8 flex items-center justify-between gap-3 border-t border-slate-100 pt-6">
            {step > 0 ? (
              <button type="button" onClick={() => go(-1)} className="inline-flex items-center gap-2 rounded-full px-4 py-3 text-sm font-black text-slate-600 hover:bg-slate-100">
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
            ) : <span />}
            {isLast ? (
              <SubmitButton />
            ) : (
              <button type="button" onClick={() => go(1)} className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white hover:bg-slate-800">
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </section>
      </form>

      <p className="mt-5 flex items-center justify-center gap-2 text-center text-xs font-semibold text-slate-500">
        <Home className="h-3.5 w-3.5" /> Everything here can be changed later.
      </p>
    </div>
  );
}

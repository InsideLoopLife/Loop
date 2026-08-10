"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CarFront, ChevronDown, Gift, GraduationCap, House, ImagePlus, PiggyBank, Plane, ShieldCheck, Sparkles, Wrench } from "lucide-react";
import { formatMoney } from "@/lib/format/money";
import { SubmitButton } from "@/components/SubmitButton";

type Person = { id: string; name: string; relationship?: string | null };
type Account = { id: string; name: string; provider?: string | null };

type Template = { key: string; label: string; detail: string; icon: typeof PiggyBank; target?: number; months?: number };
const templates: Template[] = [
  { key: "holiday", label: "Holiday", detail: "Flights, hotel and spending money", icon: Plane },
  { key: "emergency", label: "Emergency · 3 months", detail: "Three months of essential outgoings", icon: ShieldCheck, months: 3 },
  { key: "emergency", label: "Emergency · 6 months", detail: "Six months of essential outgoings", icon: ShieldCheck, months: 6 },
  { key: "house", label: "House deposit", detail: "Deposit, fees and moving costs", icon: House },
  { key: "car", label: "Car replacement", detail: "Purchase, deposit or balloon payment", icon: CarFront },
  { key: "repairs", label: "Home repairs", detail: "A buffer for repairs and maintenance", icon: Wrench },
  { key: "christmas", label: "Christmas & gifts", detail: "Build the annual cost gradually", icon: Gift },
  { key: "education", label: "Education", detail: "School, university or training", icon: GraduationCap },
];

function monthsUntil(dateText: string) {
  if (!dateText) return 0;
  const now = new Date();
  const end = new Date(`${dateText}T12:00:00`);
  if (!Number.isFinite(end.getTime())) return 0;
  return Math.max(1, (end.getFullYear() - now.getFullYear()) * 12 + end.getMonth() - now.getMonth());
}

// BUGFIX (too many clicks): this used to be 7 separate full-screen steps
// for what's fundamentally a 3-field form (name, target, date) plus a
// few genuinely optional extras. Naming was its own screen despite
// already being pre-filled by the template choice; target and date were
// split across two screens for no real reason; three optional things
// (image, person, linked account) blocked the main flow as a mandatory
// step. Now 3 steps — same data collected, same hidden fields, same
// server action, just grouped the way someone would actually think
// about creating a pot: pick a starting point, set the essentials,
// review and go. Optional extras are still all here, just collapsed by
// default on the review step instead of forcing their own screen.
export function SavingsPotJourney({
  action,
  people,
  accounts,
  essentialMonthlyOutgoings = 0,
  essentialItemCount = 0,
}: {
  action: (formData: FormData) => void | Promise<void>;
  people: Person[];
  accounts: Account[];
  essentialMonthlyOutgoings?: number;
  essentialItemCount?: number;
}) {
  const [step, setStep] = useState(0);
  const [goalType, setGoalType] = useState("other");
  const [name, setName] = useState("");
  const [target, setTarget] = useState(0);
  const [date, setDate] = useState("");
  const [priorityImportant, setPriorityImportant] = useState(false);
  const [priorityScore, setPriorityScore] = useState(75);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [emergencyMonths, setEmergencyMonths] = useState(3);
  const requiredMonthly = useMemo(() => {
    const months = monthsUntil(date);
    return months > 0 && target > 0 ? target / months : 0;
  }, [date, target]);

  function chooseTemplate(template: Template) {
    setGoalType(template.key);
    setName(template.label.replace(/ · .*/, ""));
    if (template.months) {
      setEmergencyMonths(template.months);
      if (essentialMonthlyOutgoings > 0) setTarget(Math.round(essentialMonthlyOutgoings * template.months));
    }
    setStep(1);
  }

  function startCustom() {
    setGoalType("other");
    setName("");
    setStep(1);
  }

  const steps = ["Pick a starting point", "The essentials", "Review & create"];
  return (
    <section className="rounded-[2.5rem] border border-dashed border-emerald-300 bg-gradient-to-br from-white via-emerald-50/40 to-blue-50/50 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Create a pot</p><h2 className="mt-2 text-2xl font-black text-slate-950">{steps[step]}</h2><p className="mt-1 text-sm font-semibold text-slate-500">Three steps. LOOP calculates the monthly pace as soon as the target and date are both in.</p></div>
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-emerald-700 shadow-sm"><PiggyBank className="h-6 w-6" /></span>
      </div>
      <div className="mt-5 flex gap-1">{steps.map((label, index) => <span key={label} className={`h-1.5 flex-1 rounded-full ${index <= step ? "bg-emerald-500" : "bg-white"}`} />)}</div>

      <form action={action} className="mt-5">
        <input type="hidden" name="goal_type" value={goalType} />
        <input type="hidden" name="name" value={name} />
        <input type="hidden" name="target_amount" value={target || 0} />
        <input type="hidden" name="target_date" value={date} />
        <input type="hidden" name="priority_is_important" value={priorityImportant ? "true" : "false"} />
        <input type="hidden" name="priority_score" value={priorityScore} />
        <input type="hidden" name="priority" value={priorityImportant ? 101 - priorityScore : 80} />
        <input type="hidden" name="monthly_target" value={requiredMonthly || 0} />
        <input type="hidden" name="visibility_scope" value="household" />

        {step === 0 ? (
          <div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {templates.map((template, index) => { const Icon = template.icon; return (
                <button key={`${template.label}-${index}`} type="button" onClick={() => chooseTemplate(template)} className="rounded-3xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md">
                  <Icon className="h-6 w-6 text-emerald-700" />
                  <p className="mt-3 font-black text-slate-950">{template.label}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{template.detail}</p>
                  {template.months && essentialMonthlyOutgoings <= 0 ? <p className="mt-2 text-[11px] font-black text-amber-700">Add spending context to calculate the target automatically.</p> : null}
                </button>
              ); })}
            </div>
            <button type="button" onClick={startCustom} className="mt-3 text-sm font-black text-slate-500 underline underline-offset-4">
              None of these — start with a blank pot
            </button>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="mx-auto max-w-xl space-y-5">
            <label className="block text-sm font-black text-slate-700">
              What should we call it?
              <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Holiday, emergency fund…" className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-lg font-black text-slate-950 outline-none focus:border-emerald-400" />
            </label>
            {goalType === "emergency" && essentialMonthlyOutgoings > 0 ? (
              <div className="rounded-3xl border border-rose-100 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-rose-600">Calculated from Financial Flow</p>
                    <p className="mt-1 text-2xl font-black text-slate-950">{formatMoney(target)}</p>
                    <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{formatMoney(essentialMonthlyOutgoings)} of essential monthly costs × {emergencyMonths} months{essentialItemCount > 0 ? ` · ${essentialItemCount} selected cost${essentialItemCount === 1 ? "" : "s"}` : ""}.</p>
                  </div>
                  <label className="text-xs font-black text-slate-600">Months
                    <select value={emergencyMonths} onChange={(event) => { const months = Number(event.target.value); setEmergencyMonths(months); setTarget(Math.round(essentialMonthlyOutgoings * months)); }} className="mt-1 block rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-950">
                      <option value={3}>3</option>
                      <option value={6}>6</option>
                      <option value={9}>9</option>
                      <option value={12}>12</option>
                    </select>
                  </label>
                </div>
                <details className="mt-3 text-xs font-semibold text-slate-500">
                  <summary className="cursor-pointer font-black text-slate-700">Adjust the suggested amount</summary>
                  <input type="number" min="0" step="0.01" value={target || ""} onChange={(event) => setTarget(Number(event.target.value || 0))} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-black text-slate-950" />
                </details>
              </div>
            ) : (
              <label className="block text-sm font-black text-slate-700">
                Target amount
                <input type="number" min="0" step="0.01" value={target || ""} onChange={(event) => setTarget(Number(event.target.value || 0))} placeholder="£2,500" className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-lg font-black text-slate-950" />
              </label>
            )}
            <label className="block text-sm font-black text-slate-700">
              Date you need it by <span className="font-semibold text-slate-400">(optional — leave blank to save at your own pace)</span>
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-lg font-black text-slate-950" />
            </label>
            {requiredMonthly > 0 ? (
              <div className="rounded-3xl bg-blue-50 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-blue-700">Calculated pace</p>
                <p className="mt-1 text-2xl font-black text-slate-950">{formatMoney(requiredMonthly)}/month</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">This automatically updates when contributions vary.</p>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="mx-auto max-w-2xl">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6">
              <div className="flex items-start gap-4">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><Sparkles className="h-6 w-6" /></span>
                <div>
                  <h3 className="text-xl font-black text-slate-950">{name || "Your savings pot"}</h3>
                  <p className="mt-1 text-sm font-semibold text-slate-500">Target {formatMoney(target)}{date ? ` by ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(`${date}T12:00:00`))}` : ""}.</p>
                  <p className="mt-3 text-2xl font-black text-emerald-700">{requiredMonthly > 0 ? `${formatMoney(requiredMonthly)}/month` : "Set contributions as you go"}</p>
                </div>
              </div>

              <div className="mt-5 flex items-center gap-3">
                <p className="text-sm font-black text-slate-700">Priority:</p>
                <button type="button" onClick={() => setPriorityImportant(true)} className={`rounded-full px-4 py-2 text-xs font-black ${priorityImportant ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}>Important</button>
                <button type="button" onClick={() => setPriorityImportant(false)} className={`rounded-full px-4 py-2 text-xs font-black ${!priorityImportant ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"}`}>Not especially</button>
                {priorityImportant ? (
                  <div className="ml-2 flex-1">
                    <input type="range" min="1" max="100" value={priorityScore} onChange={(event) => setPriorityScore(Number(event.target.value))} className="w-full" />
                  </div>
                ) : null}
              </div>

              <button type="button" onClick={() => setDetailsOpen((value) => !value)} className="mt-5 flex w-full items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm font-black text-slate-700">
                Add an image, owner or linked account <span className="text-xs font-semibold text-slate-400">(optional)</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${detailsOpen ? "rotate-180" : ""}`} />
              </button>
              {detailsOpen ? (
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <label className="rounded-3xl border border-slate-200 bg-white p-4 text-sm font-black text-slate-700"><ImagePlus className="mb-3 h-6 w-6 text-violet-600" />Upload an inspiration image<input type="file" name="reference_image_file" accept="image/*" className="mt-3 block w-full text-xs" /></label>
                  <label className="rounded-3xl border border-slate-200 bg-white p-4 text-sm font-black text-slate-700">Or paste an image URL<input type="url" name="reference_image_url" placeholder="https://…" className="mt-3 w-full rounded-2xl border border-slate-200 px-4 py-3" /></label>
                  <label className="text-sm font-black text-slate-700">For whom?<select name="person_id" className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"><option value="">Whole household</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
                  <label className="text-sm font-black text-slate-700">Link an account now?<select name="financial_account_id" className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"><option value="">Add later</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.provider ? `${account.provider} · ` : ""}{account.name}</option>)}</select></label>
                </div>
              ) : null}

              <textarea name="notes" placeholder="Optional context and notes" className="mt-5 min-h-24 w-full rounded-2xl border border-slate-200 p-4 text-sm" />
              <SubmitButton pendingLabel="Creating pot…" className="mt-4 w-full rounded-2xl bg-orange-500 px-5 py-4 font-black text-white">Create pot</SubmitButton>
            </div>
          </div>
        ) : null}

        {step > 0 ? (
          <div className="mt-6 flex items-center justify-between">
            <button type="button" onClick={() => setStep((value) => Math.max(0, value - 1))} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-slate-700 ring-1 ring-slate-200"><ArrowLeft className="h-4 w-4" /> Back</button>
            {step < 2 ? (
              <button type="button" disabled={!name.trim() || target <= 0} onClick={() => setStep((value) => Math.min(2, value + 1))} className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-40">Continue <ArrowRight className="h-4 w-4" /></button>
            ) : null}
          </div>
        ) : null}
      </form>
    </section>
  );
}

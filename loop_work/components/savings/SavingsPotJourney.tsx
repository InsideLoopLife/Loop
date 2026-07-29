"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, CarFront, Gift, GraduationCap, House, ImagePlus, PiggyBank, Plane, ShieldCheck, Sparkles, Wrench } from "lucide-react";
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

export function SavingsPotJourney({
  action,
  people,
  accounts,
  essentialMonthlyOutgoings = 0,
}: {
  action: (formData: FormData) => void | Promise<void>;
  people: Person[];
  accounts: Account[];
  essentialMonthlyOutgoings?: number;
}) {
  const [step, setStep] = useState(0);
  const [goalType, setGoalType] = useState("other");
  const [name, setName] = useState("");
  const [target, setTarget] = useState(0);
  const [date, setDate] = useState("");
  const [priorityImportant, setPriorityImportant] = useState(false);
  const [priorityScore, setPriorityScore] = useState(75);
  const requiredMonthly = useMemo(() => {
    const months = monthsUntil(date);
    return months > 0 && target > 0 ? target / months : 0;
  }, [date, target]);

  function chooseTemplate(template: Template) {
    setGoalType(template.key);
    setName(template.label.replace(/ · .*/, ""));
    if (template.months && essentialMonthlyOutgoings > 0) setTarget(Math.round(essentialMonthlyOutgoings * template.months));
    setStep(1);
  }

  const steps = ["Pick a starting point", "Name it", "Set a target", "Choose a date", "Personalise", "Priority", "Review"];
  return (
    <section className="rounded-[2.5rem] border border-dashed border-emerald-300 bg-gradient-to-br from-white via-emerald-50/40 to-blue-50/50 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Create a pot</p><h2 className="mt-2 text-2xl font-black text-slate-950">{steps[step]}</h2><p className="mt-1 text-sm font-semibold text-slate-500">A short guided journey. LOOP calculates the monthly pace when the target and date are known.</p></div>
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

        {step === 0 ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{templates.map((template, index) => { const Icon = template.icon; return <button key={`${template.label}-${index}`} type="button" onClick={() => chooseTemplate(template)} className="rounded-3xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"><Icon className="h-6 w-6 text-emerald-700" /><p className="mt-3 font-black text-slate-950">{template.label}</p><p className="mt-1 text-xs font-semibold text-slate-500">{template.detail}</p>{template.months && essentialMonthlyOutgoings <= 0 ? <p className="mt-2 text-[11px] font-black text-amber-700">Add spending context to calculate the target automatically.</p> : null}</button>; })}</div> : null}

        {step === 1 ? <div className="mx-auto max-w-xl"><label className="text-sm font-black text-slate-700">Great — what should we call it?<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Holiday, emergency fund…" className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-lg font-black text-slate-950 outline-none focus:border-emerald-400" /></label></div> : null}
        {step === 2 ? <div className="mx-auto max-w-xl"><label className="text-sm font-black text-slate-700">Have you got a number in mind?<input type="number" min="0" step="0.01" value={target || ""} onChange={(event) => setTarget(Number(event.target.value || 0))} placeholder="£2,500" className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-lg font-black text-slate-950" /></label></div> : null}
        {step === 3 ? <div className="mx-auto max-w-xl"><label className="text-sm font-black text-slate-700">Is there a date you need it by?<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-lg font-black text-slate-950" /></label>{requiredMonthly > 0 ? <div className="mt-4 rounded-3xl bg-blue-50 p-4"><p className="text-xs font-black uppercase tracking-wide text-blue-700">Calculated pace</p><p className="mt-1 text-2xl font-black text-slate-950">{formatMoney(requiredMonthly)}/month</p><p className="mt-1 text-xs font-semibold text-slate-500">This automatically updates when contributions vary.</p></div> : null}</div> : null}
        {step === 4 ? <div className="grid gap-4 md:grid-cols-2"><label className="rounded-3xl border border-slate-200 bg-white p-4 text-sm font-black text-slate-700"><ImagePlus className="mb-3 h-6 w-6 text-violet-600" />Upload an inspiration image<input type="file" name="reference_image_file" accept="image/*" className="mt-3 block w-full text-xs" /></label><label className="rounded-3xl border border-slate-200 bg-white p-4 text-sm font-black text-slate-700">Or paste an image URL<input type="url" name="reference_image_url" placeholder="https://…" className="mt-3 w-full rounded-2xl border border-slate-200 px-4 py-3" /></label><label className="text-sm font-black text-slate-700">For whom?<select name="person_id" className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"><option value="">Whole household</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label className="text-sm font-black text-slate-700">Link an account now?<select name="financial_account_id" className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"><option value="">Add later</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.provider ? `${account.provider} · ` : ""}{account.name}</option>)}</select></label></div> : null}
        {step === 5 ? <div className="mx-auto max-w-xl"><p className="text-sm font-black text-slate-700">Is this a priority?</p><div className="mt-3 grid grid-cols-2 gap-3"><button type="button" onClick={() => setPriorityImportant(true)} className={`rounded-2xl p-4 font-black ${priorityImportant ? "bg-emerald-600 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"}`}>Yes</button><button type="button" onClick={() => setPriorityImportant(false)} className={`rounded-2xl p-4 font-black ${!priorityImportant ? "bg-slate-950 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"}`}>Not especially</button></div>{priorityImportant ? <label className="mt-5 block text-sm font-black text-slate-700">How important? <span className="text-emerald-700">{priorityScore}/100</span><input type="range" min="1" max="100" value={priorityScore} onChange={(event) => setPriorityScore(Number(event.target.value))} className="mt-3 w-full" /></label> : null}</div> : null}
        {step === 6 ? <div className="mx-auto max-w-2xl rounded-[2rem] border border-slate-200 bg-white p-6"><div className="flex items-start gap-4"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><Sparkles className="h-6 w-6" /></span><div><h3 className="text-xl font-black text-slate-950">{name || "Your savings pot"}</h3><p className="mt-1 text-sm font-semibold text-slate-500">Target {formatMoney(target)}{date ? ` by ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(`${date}T12:00:00`))}` : ""}.</p><p className="mt-3 text-2xl font-black text-emerald-700">{requiredMonthly > 0 ? `${formatMoney(requiredMonthly)}/month` : "Set contributions as you go"}</p></div></div><input type="hidden" name="monthly_target" value={requiredMonthly || 0} /><input type="hidden" name="visibility_scope" value="household" /><textarea name="notes" placeholder="Optional context and notes" className="mt-5 min-h-24 w-full rounded-2xl border border-slate-200 p-4 text-sm" /><SubmitButton pendingLabel="Creating pot…" className="mt-4 w-full rounded-2xl bg-orange-500 px-5 py-4 font-black text-white">Create pot</SubmitButton></div> : null}

        {step > 0 && step < 6 ? <div className="mt-6 flex items-center justify-between"><button type="button" onClick={() => setStep((value) => Math.max(0, value - 1))} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-slate-700 ring-1 ring-slate-200"><ArrowLeft className="h-4 w-4" /> Back</button><button type="button" disabled={(step === 1 && !name.trim()) || (step === 2 && target <= 0)} onClick={() => setStep((value) => Math.min(6, value + 1))} className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-40">Continue <ArrowRight className="h-4 w-4" /></button></div> : null}
      </form>
    </section>
  );
}

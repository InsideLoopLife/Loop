"use client";
import { ensureSaved } from "@/lib/actions/friendly";

// "+ Add income": what kind → who → name → amount → (salary) details.
// Salary saves as a pay event, so tax, NI, pension, student loan, Scottish
// rates and NHS tiers all apply exactly as elsewhere. Pension and student
// loan answers default to that person's current pay, so a pay rise doesn't
// silently switch someone from salary sacrifice to a different method.
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addIncomeEntry, addRecurringPayEvent } from "@/app/income/actions";
import { estimateAnnualTakeHome } from "@/lib/calculations/tax";
import { formatMoney } from "@/lib/format/money";
import { ChoiceGrid, MoneyField, quickInputClass, StepModal, todayIso, toNumber, type QuickStep } from "@/components/quick-add/StepModal";

type Person = { id: string; name: string; relationship?: string | null };
type PayEventLike = {
  person_id: string | null;
  pay_kind?: string | null;
  label?: string | null;
  effective_from: string;
  effective_until?: string | null;
  pension_percent?: number | null;
  pension_method?: string | null;
  student_loan_plan?: string | null;
  tax_region?: string | null;
  pay_day_of_month?: number | null;
  pay_timing?: string | null;
};

type Kind = "salary" | "regular" | "one_off";

const LOAN_OPTIONS = [
  { value: "none", label: "No student loan" },
  { value: "plan_1", label: "Plan 1" },
  { value: "plan_2", label: "Plan 2" },
  { value: "plan_4", label: "Plan 4 (Scotland)" },
  { value: "plan_5", label: "Plan 5" },
  { value: "postgraduate", label: "Postgraduate" },
];

export function IncomeQuickAdd({ people, payEvents, defaultPersonId, onClose, onSaved }: { people: Person[]; payEvents: PayEventLike[]; defaultPersonId: string; onClose: () => void; onSaved?: (message: string) => void }) {
  const router = useRouter();
  const adults = useMemo(() => people.filter((p) => p.relationship !== "child"), [people]);
  const [index, setIndex] = useState(0);
  const [kind, setKind] = useState<Kind | "">("");
  const [personId, setPersonId] = useState(defaultPersonId || adults[0]?.id || "");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [basis, setBasis] = useState<"annual_gross" | "monthly_net">("annual_gross");
  const [often, setOften] = useState<"weekly" | "monthly" | "annual">("monthly");
  const [date, setDate] = useState(todayIso());
  const [payDay, setPayDay] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // That person's latest salary: the defaults for pension, loan and tax region.
  const current = useMemo(() => payEvents
    .filter((e) => e.person_id === personId && (e.pay_kind || "salary") === "salary")
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0] || null, [payEvents, personId]);
  const [pensionPercent, setPensionPercent] = useState<string | null>(null);
  const [loan, setLoan] = useState<string | null>(null);
  const pension = pensionPercent ?? String(current?.pension_percent ?? 5);
  const loanPlan = loan ?? String(current?.student_loan_plan || "none");
  const pensionMethod = current?.pension_method || "net_pay";

  const gross = basis === "annual_gross" ? toNumber(amount) : 0;
  const preview = gross > 0
    ? estimateAnnualTakeHome({ grossAnnual: gross, pensionPercent: Number(pension) || 0, pensionMethod: pensionMethod as any, studentLoanPlan: loanPlan as any, taxRegion: current?.tax_region }).monthlyTakeHome
    : null;
  const personName = adults.find((p) => p.id === personId)?.name || "them";

  const steps: QuickStep[] = [
    {
      key: "kind",
      question: "What kind of income?",
      autoAdvance: true,
      content: (
        <ChoiceGrid
          value={kind}
          onPick={(v) => { setKind(v); setName(v === "salary" ? "" : ""); setIndex(1); }}
          options={[
            { value: "salary", label: "Salary or wages", detail: "A job, including a new job or pay rise" },
            { value: "regular", label: "Something regular", detail: "Side income, benefits, rent from a lodger" },
            { value: "one_off", label: "A one-off", detail: "Bonus, gift, refund, something you sold" },
          ]}
        />
      ),
    },
    ...(adults.length > 1 ? [{
      key: "who",
      question: "Whose income is it?",
      autoAdvance: true,
      content: <ChoiceGrid columns={2} value={personId} onPick={(v) => { setPersonId(v); setPensionPercent(null); setLoan(null); setIndex(index + 1); }} options={adults.map((p) => ({ value: p.id, label: p.name }))} />,
    } satisfies QuickStep] : []),
    {
      key: "name",
      question: kind === "salary" ? "Who's the employer?" : "What is it?",
      hint: kind === "salary" ? "Just a name you'll recognise." : undefined,
      canContinue: name.trim().length > 0,
      content: <input value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "salary" ? "e.g. NHS, Tesco" : kind === "one_off" ? "e.g. Bonus, eBay sale" : "e.g. Etsy shop, Child Benefit"} className={quickInputClass} />,
    },
    {
      key: "amount",
      question: kind === "salary" ? "How much do they pay?" : "How much?",
      canContinue: toNumber(amount) > 0,
      content: (
        <div className="space-y-3">
          {kind === "salary" ? (
            <ChoiceGrid columns={2} value={basis} onPick={setBasis} options={[{ value: "annual_gross", label: "Yearly, before tax" }, { value: "monthly_net", label: "Monthly take-home" }]} />
          ) : null}
          <MoneyField value={amount} onChange={setAmount} placeholder={kind === "salary" && basis === "annual_gross" ? "35,000" : "0.00"} />
          {kind === "regular" ? (
            <ChoiceGrid columns={3} value={often} onPick={setOften} options={[{ value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" }, { value: "annual", label: "Yearly" }]} />
          ) : null}
          {kind === "one_off" ? (
            <label className="block"><span className="text-sm font-black text-slate-700">When</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${quickInputClass} mt-2 text-base`} />
            </label>
          ) : null}
          {preview != null ? <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900">About {formatMoney(preview)} a month after tax, NI and pension.</p> : null}
        </div>
      ),
    },
    ...(kind === "salary" ? [{
      key: "details",
      question: "A few details",
      hint: current ? `Filled in from ${personName}'s current pay. Change anything that's different.` : "Leave the defaults if you're not sure.",
      content: (
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="text-sm font-black text-slate-700">Starts</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${quickInputClass} mt-2 text-base`} />
            </label>
            <label className="block"><span className="text-sm font-black text-slate-700">Pay day</span>
              <input inputMode="numeric" value={payDay} onChange={(e) => setPayDay(e.target.value)} placeholder={current?.pay_day_of_month ? String(current.pay_day_of_month) : "Last working day"} className={`${quickInputClass} mt-2 text-base`} />
            </label>
          </div>
          <label className="block"><span className="text-sm font-black text-slate-700">Pension (% of salary)</span>
            <input inputMode="decimal" value={pension} onChange={(e) => setPensionPercent(e.target.value)} className={`${quickInputClass} mt-2 text-base`} />
          </label>
          <label className="block"><span className="text-sm font-black text-slate-700">Student loan</span>
            <select value={loanPlan} onChange={(e) => setLoan(e.target.value)} className={`${quickInputClass} mt-2 text-base`}>
              {LOAN_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          {current ? <p className="text-xs font-semibold text-slate-500">This replaces {current.label || "their current pay"} from the start date. The old pay stays in history.</p> : null}
        </div>
      ),
    } satisfies QuickStep] : []),
  ];

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("person_id", personId);
      fd.set("label", name.trim());
      if (kind === "salary") {
        fd.set("pay_kind", "salary");
        if (basis === "annual_gross") fd.set("gross_annual_salary", String(toNumber(amount)));
        else { fd.set("gross_annual_salary", "0"); fd.set("monthly_take_home_override", String(toNumber(amount))); }
        fd.set("pension_percent", String(Number(pension) || 0));
        fd.set("pension_method", pensionMethod);
        fd.set("student_loan_plan", loanPlan);
        if (current?.tax_region) fd.set("tax_region", current.tax_region);
        fd.set("effective_from", date);
        const day = Number(payDay || current?.pay_day_of_month || 0);
        if (day >= 1 && day <= 31 && (payDay || current?.pay_timing === "fixed_day")) { fd.set("pay_timing", "fixed_day"); fd.set("pay_day_of_month", String(day)); }
        else fd.set("pay_timing", "last_workday");
        if (current) fd.set("replace_previous", "yes");
        ensureSaved(await addRecurringPayEvent(fd));
      } else {
        fd.set("gross_amount", String(toNumber(amount)));
        fd.set("net_amount", String(toNumber(amount)));
        fd.set("frequency", kind === "one_off" ? "one_off" : often);
        fd.set("entry_date", date);
        ensureSaved(await addIncomeEntry(fd));
      }
      router.refresh();
      onSaved?.(`Added ${name.trim()}`);
      onClose();
    } catch (e: any) {
      setError(e?.message || "That didn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return <StepModal title="Add income" steps={steps} index={index} onIndexChange={setIndex} onClose={onClose} onFinish={save} saving={saving} error={error} finishLabel="Add income" />;
}

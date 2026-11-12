"use client";
import { ensureSaved } from "@/lib/actions/friendly";

// "+" on the Spending page: name → amount → once or repeating → when → (who).
// Saves through the existing actions: a spend that already happened becomes a
// spending entry; anything in the future or repeating becomes a planned item,
// which the month plan, calendar and Money in & out all read.
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addPlannedItem, addSpendingEntry } from "@/app/spending/actions";
import { ChoiceGrid, MoneyField, quickInputClass, StepModal, todayIso, toNumber, type QuickStep } from "@/components/quick-add/StepModal";

type Person = { id: string; name: string; relationship?: string | null };

const OFTEN = [
  { value: "weekly", label: "Every week" },
  { value: "fortnightly", label: "Every 2 weeks" },
  { value: "four_weekly", label: "Every 4 weeks" },
  { value: "monthly", label: "Every month" },
  { value: "quarterly", label: "Every 3 months" },
  { value: "annual", label: "Once a year" },
] as const;
type Often = (typeof OFTEN)[number]["value"];

const SUGGESTIONS = ["Food shop", "Coffee", "Takeaway", "Petrol", "Netflix", "Gym", "Phone", "Clothes"];

function shiftDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function SpendingQuickAdd({ people, onClose, onSaved }: { people: Person[]; onClose: () => void; onSaved?: (message: string) => void }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [repeat, setRepeat] = useState<"once" | "repeat" | "">("");
  const [often, setOften] = useState<Often>("monthly");
  const [date, setDate] = useState(todayIso());
  const [personId, setPersonId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const adults = useMemo(() => people.filter((p) => p.relationship !== "child"), [people]);

  const steps: QuickStep[] = [
    {
      key: "name",
      question: "What is it?",
      hint: "LOOP sorts it into the right category for you.",
      canContinue: name.trim().length > 0,
      content: (
        <div className="space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Netflix, Tesco, Gym" className={quickInputClass} />
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => { setName(s); setIndex(1); }} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-200">{s}</button>
            ))}
          </div>
        </div>
      ),
    },
    {
      key: "amount",
      question: `How much is ${name.trim() || "it"}?`,
      canContinue: toNumber(amount) > 0,
      content: <MoneyField value={amount} onChange={setAmount} />,
    },
    {
      key: "repeat",
      question: "Just this once, or does it repeat?",
      autoAdvance: true,
      content: (
        <ChoiceGrid
          columns={2}
          value={repeat}
          onPick={(v) => { setRepeat(v); setIndex(3); }}
          options={[
            { value: "once", label: "Just once", detail: "A one-off spend" },
            { value: "repeat", label: "It repeats", detail: "A bill or subscription" },
          ]}
        />
      ),
    },
    repeat === "repeat"
      ? {
          key: "often",
          question: "How often?",
          hint: "And when's the next payment?",
          content: (
            <div className="space-y-4">
              <ChoiceGrid columns={2} value={often} onPick={setOften} options={OFTEN} />
              <label className="block">
                <span className="text-sm font-black text-slate-700">Next payment</span>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${quickInputClass} mt-2 text-base`} />
              </label>
            </div>
          ),
        }
      : {
          key: "when",
          question: "When?",
          hint: "Pick a future date to plan for it.",
          content: (
            <div className="space-y-3">
              <ChoiceGrid
                columns={2}
                value={date === todayIso() ? "today" : date === shiftDays(-1) ? "yesterday" : ""}
                onPick={(v) => setDate(v === "today" ? todayIso() : shiftDays(-1))}
                options={[{ value: "today", label: "Today" }, { value: "yesterday", label: "Yesterday" }]}
              />
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${quickInputClass} text-base`} />
            </div>
          ),
        },
    ...(adults.length > 1
      ? [{
          key: "who",
          question: "Who's it for?",
          content: (
            <ChoiceGrid
              columns={2}
              value={personId || "__shared"}
              onPick={(v) => setPersonId(v === "__shared" ? "" : v)}
              options={[{ value: "__shared", label: "Shared / household" }, ...adults.map((p) => ({ value: p.id, label: p.name }))]}
            />
          ),
        } satisfies QuickStep]
      : []),
  ];

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("label", name.trim());
      fd.set("amount", String(toNumber(amount)));
      if (personId) fd.set("person_id", personId);
      const today = todayIso();
      if (repeat === "once" && date <= today) {
        fd.set("spent_at", date);
        ensureSaved(await addSpendingEntry(fd));
      } else {
        fd.set("direction", "outgoing");
        fd.set("start_date", date);
        if (repeat === "once") {
          fd.set("recurrence", "one_off");
        } else if (often === "weekly" || often === "fortnightly") {
          fd.set("recurrence", "custom_interval");
          fd.set("recurrence_interval_days", often === "weekly" ? "7" : "14");
        } else {
          fd.set("recurrence", often);
          if (["monthly", "quarterly", "annual"].includes(often)) fd.set("day_of_month", date.slice(8, 10));
        }
        ensureSaved(await addPlannedItem(fd));
      }
      router.refresh();
      const howOften = repeat === "once" ? "" : ` · ${OFTEN.find((o) => o.value === often)?.label.toLowerCase()}`;
      onSaved?.(`Added ${name.trim()} £${toNumber(amount).toLocaleString("en-GB", { maximumFractionDigits: 2 })}${howOften}`);
      onClose();
    } catch (e: any) {
      setError(e?.message || "That didn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <StepModal
      title="Add spending"
      steps={steps}
      index={index}
      onIndexChange={setIndex}
      onClose={onClose}
      onFinish={save}
      saving={saving}
      error={error}
      finishLabel="Add it"
    />
  );
}

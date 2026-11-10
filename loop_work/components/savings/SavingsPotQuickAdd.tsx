"use client";

// "+ New pot": what for → how much → by when → anything put aside already.
// Saves through createSavingsPot, so the monthly pace, goal visual and
// allocation work exactly as the full pot form did.
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { formatMoney } from "@/lib/format/money";
import { ChoiceGrid, MoneyField, quickInputClass, StepModal, toNumber, type QuickStep } from "@/components/quick-add/StepModal";

type Account = { id: string; name: string; provider?: string | null };

const GOALS = [
  { value: "holiday", label: "Holiday", name: "Holiday" },
  { value: "emergency", label: "Emergency fund", name: "Emergency fund" },
  { value: "house", label: "House deposit", name: "House deposit" },
  { value: "car", label: "New car", name: "Car" },
  { value: "repairs", label: "Home repairs", name: "Home repairs" },
  { value: "christmas", label: "Christmas & gifts", name: "Christmas" },
  { value: "education", label: "Education", name: "Education" },
  { value: "other", label: "Something else", name: "" },
] as const;
type Goal = (typeof GOALS)[number]["value"];

function monthsFromNow(months: number) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function monthsUntil(date: string) {
  const end = new Date(`${date}T12:00:00`);
  const now = new Date();
  return Math.max(1, (end.getFullYear() - now.getFullYear()) * 12 + end.getMonth() - now.getMonth());
}

export function SavingsPotQuickAdd({
  action,
  accounts,
  essentialMonthlyOutgoings = 0,
  onClose,
}: {
  action: (formData: FormData) => Promise<void>;
  accounts: Account[];
  essentialMonthlyOutgoings?: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [goal, setGoal] = useState<Goal | "">("");
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [when, setWhen] = useState<"6" | "12" | "24" | "date" | "none" | "">("");
  const [date, setDate] = useState(monthsFromNow(12));
  const [already, setAlready] = useState<"no" | "yes" | "">("");
  const [accountId, setAccountId] = useState(accounts[0]?.id || "");
  const [alreadyAmount, setAlreadyAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetDate = when === "none" || when === "" ? null : when === "date" ? date : monthsFromNow(Number(when));
  const targetAmount = toNumber(target);
  const startAmount = already === "yes" ? toNumber(alreadyAmount) : 0;
  const perMonth = useMemo(() => {
    if (!targetDate || targetAmount <= 0) return null;
    return Math.max(0, targetAmount - startAmount) / monthsUntil(targetDate);
  }, [targetDate, targetAmount, startAmount]);

  const emergencySuggestions = essentialMonthlyOutgoings > 0
    ? [3, 6].map((m) => ({ months: m, amount: Math.round(essentialMonthlyOutgoings * m / 50) * 50 }))
    : [];

  const steps: QuickStep[] = [
    {
      key: "goal",
      question: "What are you saving for?",
      autoAdvance: true,
      content: (
        <ChoiceGrid
          columns={2}
          value={goal}
          onPick={(v) => { setGoal(v); setName(GOALS.find((g) => g.value === v)?.name || ""); setIndex(1); }}
          options={GOALS.map((g) => ({ value: g.value, label: g.label }))}
        />
      ),
    },
    {
      key: "name",
      question: "What shall we call it?",
      hint: "Something you'll recognise, like \"Spain 2027\".",
      canContinue: name.trim().length > 0,
      content: <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Spain 2027" className={quickInputClass} />,
    },
    {
      key: "target",
      question: "How much do you need?",
      hint: goal === "emergency" && emergencySuggestions.length ? "Based on your essential bills each month." : undefined,
      canContinue: targetAmount > 0,
      content: (
        <div className="space-y-3">
          {goal === "emergency" && emergencySuggestions.length ? (
            <ChoiceGrid
              columns={2}
              value={emergencySuggestions.find((s) => String(s.amount) === target.replace(/[£,\s]/g, ""))?.months.toString() || ""}
              onPick={(v) => setTarget(String(emergencySuggestions.find((s) => String(s.months) === v)?.amount || ""))}
              options={emergencySuggestions.map((s) => ({ value: String(s.months), label: `${s.months} months`, detail: formatMoney(s.amount) }))}
            />
          ) : null}
          <MoneyField value={target} onChange={setTarget} placeholder="2,000" />
        </div>
      ),
    },
    {
      key: "when",
      question: "By when?",
      canContinue: when !== "",
      content: (
        <div className="space-y-3">
          <ChoiceGrid
            columns={2}
            value={when}
            onPick={setWhen}
            options={[
              { value: "6", label: "In 6 months" },
              { value: "12", label: "In a year" },
              { value: "24", label: "In 2 years" },
              { value: "date", label: "Pick a date" },
              { value: "none", label: "No deadline" },
            ]}
          />
          {when === "date" ? <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${quickInputClass} text-base`} /> : null}
          {perMonth != null ? <p className="rounded-2xl bg-[var(--pine-wash)] px-4 py-3 text-sm font-semibold text-[var(--pine-strong)]">That's about {formatMoney(perMonth)} a month.</p> : null}
        </div>
      ),
    },
    {
      key: "already",
      question: "Have you put any aside already?",
      canContinue: already === "no" || (already === "yes" && startAmount > 0 && Boolean(accountId)),
      content: (
        <div className="space-y-3">
          <ChoiceGrid columns={2} value={already} onPick={setAlready} options={[{ value: "no", label: "Not yet" }, { value: "yes", label: "Yes, some" }]} />
          {already === "yes" ? (
            <>
              <MoneyField value={alreadyAmount} onChange={setAlreadyAmount} placeholder="500" />
              {accounts.length ? (
                <label className="block"><span className="text-sm font-semibold text-[var(--muted)]">Which account is it in?</span>
                  <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={`${quickInputClass} mt-2 text-base`}>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{[a.provider, a.name].filter(Boolean).join(" · ")}</option>)}
                  </select>
                </label>
              ) : null}
            </>
          ) : null}
        </div>
      ),
    },
  ];

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("name", name.trim());
      fd.set("goal_type", goal === "other" ? "" : goal);
      fd.set("target_amount", String(targetAmount));
      if (targetDate) fd.set("target_date", targetDate);
      if (already === "yes" && startAmount > 0 && accountId) {
        fd.set("financial_account_id", accountId);
        fd.set("allocation_amount", String(startAmount));
      }
      await action(fd);
      router.refresh();
      onClose();
    } catch (e: any) {
      setError(e?.message || "That didn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return <StepModal title="New pot" steps={steps} index={index} onIndexChange={setIndex} onClose={onClose} onFinish={save} saving={saving} error={error} finishLabel="Create pot" />;
}

export function NewPotButton(props: Omit<Parameters<typeof SavingsPotQuickAdd>[0], "onClose"> & { label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const { label = "New pot", className, ...rest } = props;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className || "inline-flex items-center gap-1.5 rounded-full bg-[var(--pine)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--pine-strong)]"}>
        <Plus className="h-4 w-4" /> {label}
      </button>
      {open ? <SavingsPotQuickAdd {...rest} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** "Add money" on a pot: put in or take out, then the amount. */
export function PotMoneyButton({ potId, potName, action }: { potId: string; potName: string; action: (formData: FormData) => Promise<void> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<"allocation" | "deallocation" | "">("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() { setOpen(false); setIndex(0); setDirection(""); setAmount(""); setError(null); }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("savings_pot_id", potId);
      fd.set("movement_type", direction || "allocation");
      fd.set("amount", String(toNumber(amount)));
      await action(fd);
      router.refresh();
      close();
    } catch (e: any) {
      setError(e?.message || "That didn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const steps: QuickStep[] = [
    {
      key: "direction",
      question: `Put money in or take it out of ${potName}?`,
      autoAdvance: true,
      content: <ChoiceGrid columns={2} value={direction} onPick={(v) => { setDirection(v); setIndex(1); }} options={[{ value: "allocation", label: "Put money in" }, { value: "deallocation", label: "Take money out" }]} />,
    },
    {
      key: "amount",
      question: "How much?",
      canContinue: toNumber(amount) > 0,
      content: <MoneyField value={amount} onChange={setAmount} />,
    },
  ];

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-full bg-[var(--paper)] px-3.5 py-2 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--line)]">Add money</button>
      {open ? <StepModal title={potName} steps={steps} index={index} onIndexChange={setIndex} onClose={close} onFinish={save} saving={saving} error={error} finishLabel="Save" /> : null}
    </>
  );
}

"use client";

// "Your September payment should have gone in — confirm it" and "Update a
// fund's value". Both are a couple of questions in the shared step modal; the
// server works out units from each fund's logged daily price.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { confirmPensionPayment, setPensionFundValue } from "@/lib/investments/actions";
import { formatMoney as roundMoney } from "@/lib/format/money";

// Exact pounds and pence: these are figures people check against a statement.
const formatMoney = (value: number) => `£${Number(value || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
void roundMoney;
import { ChoiceGrid, MoneyField, quickInputClass, StepModal, todayIso, toNumber, type QuickStep } from "@/components/quick-add/StepModal";

export type PaymentToConfirm = {
  accountId: string;
  accountLabel: string;
  provider: string;
  month: string; // YYYY-MM (the pay month it came from)
  expectedTotal: number;
  expectedDate: string; // YYYY-MM-DD
  fundCount: number;
};

const monthName = (month: string) => new Date(`${month}-15T12:00:00`).toLocaleDateString("en-GB", { month: "long" });
const longDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function ConfirmPaymentModal({ payment, onClose }: { payment: PaymentToConfirm; onClose: () => void }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [right, setRight] = useState<"yes" | "no" | "">("");
  const [amount, setAmount] = useState("");
  const [dateChoice, setDateChoice] = useState<"expected" | "other" | "">("");
  const [date, setDate] = useState(payment.expectedDate <= todayIso() ? payment.expectedDate : todayIso());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const expectedInPast = payment.expectedDate <= todayIso();

  const steps: QuickStep[] = [
    {
      key: "amount",
      question: `Did ${formatMoney(payment.expectedTotal)} go into ${payment.accountLabel}?`,
      hint: `${monthName(payment.month)}'s pay, split across ${payment.fundCount} fund${payment.fundCount === 1 ? "" : "s"}. Check your ${payment.provider} app or statement.`,
      autoAdvance: true,
      content: (
        <ChoiceGrid
          columns={2}
          value={right}
          onPick={(v) => { setRight(v); setIndex(v === "yes" ? 2 : 1); }}
          options={[{ value: "yes", label: "Yes, that's right" }, { value: "no", label: "A different amount" }]}
        />
      ),
    },
    {
      key: "different",
      question: "How much went in?",
      hint: "The total for this payment. We'll split it across the funds the same way.",
      canContinue: toNumber(amount) > 0,
      content: <MoneyField value={amount} onChange={setAmount} placeholder={payment.expectedTotal.toFixed(2)} />,
    },
    {
      key: "date",
      question: "When was it invested?",
      hint: "We'll work out the units from each fund's price on that day.",
      canContinue: Boolean(date) && date <= todayIso(),
      content: (
        <div className="space-y-3">
          <ChoiceGrid
            columns={2}
            value={dateChoice || (expectedInPast ? "expected" : "")}
            onPick={(v) => { setDateChoice(v); if (v === "expected") setDate(payment.expectedDate); }}
            options={[
              ...(expectedInPast ? [{ value: "expected" as const, label: longDate(payment.expectedDate), detail: "When it was due" }] : []),
              { value: "other" as const, label: "Another date" },
            ]}
          />
          {dateChoice === "other" || !expectedInPast ? (
            <input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} className={`${quickInputClass} text-base`} />
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
      fd.set("pension_account_id", payment.accountId);
      fd.set("contribution_month", payment.month);
      fd.set("invested_on", date);
      if (right === "no") fd.set("amount", String(toNumber(amount)));
      await confirmPensionPayment(fd);
      router.refresh();
      onClose();
    } catch (e: any) {
      setError(e?.message || "That didn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  // Skip the "different amount" step when they said yes.
  const onIndexChange = (next: number) => setIndex(next === 1 && right === "yes" ? (index > 1 ? 0 : 2) : next);
  return <StepModal title="Confirm payment" steps={steps} index={index} onIndexChange={onIndexChange} onClose={onClose} onFinish={save} saving={saving} error={error} finishLabel="Confirm" />;
}

/** One line per payment that's due but not yet confirmed. */
export function PaymentsToConfirm({ payments, compact = false }: { payments: PaymentToConfirm[]; compact?: boolean }) {
  const [open, setOpen] = useState<PaymentToConfirm | null>(null);
  if (!payments.length) return null;
  return (
    <div className={`rounded-[14px] bg-[var(--pine-wash)] ${compact ? "p-4" : "p-5"}`}>
      <p className="text-sm font-semibold text-[var(--pine-strong)]">
        {payments.length === 1 ? "1 payment to confirm" : `${payments.length} payments to confirm`}
      </p>
      <ul className="mt-2 space-y-2">
        {payments.map((payment) => (
          <li key={`${payment.accountId}-${payment.month}`} className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-[var(--ink)]">
              {formatMoney(payment.expectedTotal)} into {payment.accountLabel}
              <span className="text-[var(--muted)]"> · {monthName(payment.month)}&apos;s pay, due {longDate(payment.expectedDate)}</span>
            </span>
            <button type="button" onClick={() => setOpen(payment)} className="rounded-full bg-[var(--pine)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--pine-strong)]">
              Confirm
            </button>
          </li>
        ))}
      </ul>
      {open ? <ConfirmPaymentModal payment={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

/** "Update value" on a fund: what it's worth, and on what date. */
export function FundValueButton({ fundId, fundName, currentValue }: { fundId: string; fundName: string; currentValue: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState("");
  const [when, setWhen] = useState<"today" | "other" | "">("today");
  const [date, setDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() { setOpen(false); setIndex(0); setValue(""); setWhen("today"); setDate(todayIso()); setError(null); }

  const steps: QuickStep[] = [
    {
      key: "value",
      question: `What's ${fundName} worth?`,
      hint: `LOOP has ${formatMoney(currentValue)}. Use the figure from your provider.`,
      canContinue: toNumber(value) > 0,
      content: <MoneyField value={value} onChange={setValue} placeholder={currentValue.toFixed(2)} />,
    },
    {
      key: "date",
      question: "On what date?",
      hint: "This becomes the starting point. Payments after it are added on top.",
      canContinue: Boolean(date) && date <= todayIso(),
      content: (
        <div className="space-y-3">
          <ChoiceGrid columns={2} value={when} onPick={(v) => { setWhen(v); if (v === "today") setDate(todayIso()); }} options={[{ value: "today", label: "Today" }, { value: "other", label: "Another date" }]} />
          {when === "other" ? <input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} className={`${quickInputClass} text-base`} /> : null}
        </div>
      ),
    },
  ];

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("pension_fund_id", fundId);
      fd.set("value", String(toNumber(value)));
      fd.set("as_of", date);
      await setPensionFundValue(fd);
      router.refresh();
      close();
    } catch (e: any) {
      setError(e?.message || "That didn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-full px-3 py-2 text-xs text-[var(--muted)] hover:bg-[var(--paper)] hover:text-[var(--ink)]">
        Update value
      </button>
      {open ? <StepModal title={fundName} steps={steps} index={index} onIndexChange={setIndex} onClose={close} onFinish={save} saving={saving} error={error} finishLabel="Save" /> : null}
    </>
  );
}

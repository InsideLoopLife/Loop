"use client";

// "Your September payment should have gone in — confirm it" and "Update a
// fund's value". Both are a couple of questions in the shared step modal; the
// server works out units from each fund's logged daily price.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { confirmPensionPayment, previewPensionPayment, setPensionFundValue, type PensionPaymentPreview } from "@/lib/investments/actions";
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

/** The last step before saving: the date, the amount per fund, and the price each fund's units come from. */
function PaymentReview({ payment, date, amount }: { payment: PaymentToConfirm; date: string; amount: number | null }) {
  const [state, setState] = useState<{ loading: boolean; data: PensionPaymentPreview | null }>({ loading: true, data: null });
  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, data: null });
    previewPensionPayment({ accountId: payment.accountId, month: payment.month, investedOn: date, amount })
      .then((data) => { if (!cancelled) setState({ loading: false, data }); })
      .catch(() => { if (!cancelled) setState({ loading: false, data: { ok: false, error: "Couldn't run the check. You can still confirm." } }); });
    return () => { cancelled = true; };
  }, [payment.accountId, payment.month, date, amount]);

  if (state.loading) return <p className="text-sm text-[var(--muted)]">Checking the date and prices…</p>;
  const data = state.data;
  if (!data || !data.ok) return <p className="text-sm text-red-700">{data && !data.ok ? data.error : "Couldn't run the check."}</p>;
  const estimated = data.funds.some((fund) => fund.price !== null);
  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--ink)]">
        <strong>{formatMoney(data.total)}</strong> into {payment.accountLabel}, invested <strong>{longDate(date)}</strong>
        {data.total !== data.expectedTotal ? <span className="text-[var(--muted)]"> (expected {formatMoney(data.expectedTotal)})</span> : null}
      </p>
      {data.dateWarning ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{data.dateWarning}</p> : null}
      <ul className="space-y-2">
        {data.funds.map((fund) => (
          <li key={fund.fundId} className="rounded-xl bg-[var(--paper)] px-3 py-2 text-xs">
            <div className="flex items-start justify-between gap-3">
              <span className="font-semibold text-[var(--ink)]">{fund.fundName}</span>
              <span className="shrink-0 font-semibold text-[var(--ink)]">{formatMoney(fund.amount)}</span>
            </div>
            <p className="mt-0.5 text-[var(--muted)]">
              {fund.price === null
                ? "No price on record, so no units will be added."
                : `${fund.units !== null ? `${fund.units.toFixed(4)} units` : "Units"} at £${fund.price.toFixed(4)}${fund.priceDate ? ` (price logged ${longDate(fund.priceDate)}${fund.priceDaysOld && fund.priceDaysOld > 1 ? `, ${fund.priceDaysOld} days before the payment` : ""})` : " (latest price)"}`}
            </p>
          </li>
        ))}
      </ul>
      {estimated ? <p className="text-[11px] leading-snug text-[var(--muted)]">Units are estimates from the fund&apos;s last logged price, not the exact price your provider used. Use &ldquo;Update value&rdquo; on a fund with the figure from your provider app to replace them.</p> : null}
    </div>
  );
}

export function ConfirmPaymentModal({ payment, onClose }: { payment: PaymentToConfirm; onClose: () => void }) {
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
    {
      key: "check",
      question: "Check this looks right",
      hint: "Nothing is saved until you press Confirm.",
      content: <PaymentReview payment={payment} date={date} amount={right === "no" ? toNumber(amount) || null : null} />,
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

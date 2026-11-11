type MortgageTermInput = {
  start_date?: string | null;
  term_years?: number | null;
  first_payment_date?: string | null;
  balance_as_of_date?: string | null;
  initial_period_end?: string | null;
  product_name?: string | null;
};

const validDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/**
 * When the term actually began. People often add a mortgage to LOOP years
 * after taking it out, and the start date then defaults to the day they added
 * it, which makes the mortgage look brand new: too long left to run, too
 * little paid off. In order of trust:
 *  1. the first payment date, if recorded;
 *  2. otherwise the earliest of the start date, the balance date and the
 *     start of the current deal (its end date minus its length, e.g. a
 *     "5 Year Fixed" ending April 2027 began April 2022).
 */
export function effectiveMortgageStart(deal?: MortgageTermInput | null): { date: string | null; estimated: boolean; note: string } {
  const firstPayment = validDate(deal?.first_payment_date);
  if (firstPayment) return { date: iso(firstPayment), estimated: false, note: "" };

  const start = validDate(deal?.start_date);
  const candidates: Array<{ date: Date; why: string }> = [];
  if (start) candidates.push({ date: start, why: "start date" });
  const balanceDate = validDate(deal?.balance_as_of_date);
  if (balanceDate) candidates.push({ date: balanceDate, why: "balance date" });
  const dealEnd = validDate(deal?.initial_period_end);
  const dealYears = Number(String(deal?.product_name || "").match(/(\d+)\s*-?\s*y(?:ea)?r/i)?.[1] || 0);
  if (dealEnd && dealYears > 0 && dealYears <= 15) {
    const dealStart = new Date(dealEnd);
    dealStart.setFullYear(dealStart.getFullYear() - dealYears);
    candidates.push({ date: dealStart, why: "start of the current deal" });
  }
  if (!candidates.length) return { date: null, estimated: true, note: "" };
  candidates.sort((a, b) => a.date.getTime() - b.date.getTime());
  const earliest = candidates[0];
  if (start && earliest.date.getTime() < start.getTime()) {
    return {
      date: iso(earliest.date),
      estimated: true,
      note: `Counting the term from ${earliest.date.toLocaleDateString("en-GB", { month: "long", year: "numeric" })} (the ${earliest.why}), not the recorded start date, which looks like when the mortgage was added to LOOP. Add the first payment date to make this exact.`,
    };
  }
  return { date: iso(earliest.date), estimated: !start, note: "" };
}

/** Months between two dates, whole months. */
export function wholeMonthsBetween(from: string, to: Date = new Date()) {
  const a = validDate(from);
  if (!a) return 0;
  let months = (to.getFullYear() - a.getFullYear()) * 12 + (to.getMonth() - a.getMonth());
  if (to.getDate() < a.getDate()) months -= 1;
  return Math.max(0, months);
}

export type MortgageTermPosition = {
  remainingMonths: number;
  estimated: boolean;
  note: string;
};

export function getMortgageTermPosition(
  deal?: MortgageTermInput | null,
): MortgageTermPosition {
  const termYears = Number(deal?.term_years || 0);
  const fallbackMonths = Math.max(0, Math.round(termYears * 12));

  if (!termYears) {
    return {
      remainingMonths: 0,
      estimated: true,
      note: "The mortgage term has not been recorded, so LOOP cannot calculate an exact remaining term.",
    };
  }

  const effective = effectiveMortgageStart(deal);
  if (!effective.date) {
    return {
      remainingMonths: fallbackMonths,
      estimated: true,
      note: "The mortgage start date is missing, so LOOP is using the full recorded mortgage term.",
    };
  }

  const start = new Date(`${effective.date}T00:00:00`);

  if (Number.isNaN(start.getTime())) {
    return {
      remainingMonths: fallbackMonths,
      estimated: true,
      note: "The recorded mortgage start date could not be read, so LOOP is using the full recorded mortgage term.",
    };
  }

  const maturity = new Date(start);
  maturity.setMonth(maturity.getMonth() + Math.round(termYears * 12));

  const now = new Date();
  let months =
    (maturity.getFullYear() - now.getFullYear()) * 12 +
    (maturity.getMonth() - now.getMonth());

  if (maturity.getDate() < now.getDate()) {
    months -= 1;
  }

  return {
    remainingMonths: Math.max(0, months),
    estimated: effective.estimated,
    note: effective.note,
  };
}

type MortgageTermInput = {
  start_date?: string | null;
  term_years?: number | null;
};

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

  if (!deal?.start_date) {
    return {
      remainingMonths: fallbackMonths,
      estimated: true,
      note: "The mortgage start date is missing, so LOOP is using the full recorded mortgage term.",
    };
  }

  const start = new Date(`${deal.start_date}T00:00:00`);

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
    estimated: false,
    note: "",
  };
}

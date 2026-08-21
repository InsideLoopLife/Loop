// Restores logic that used to live as a local `remainingMortgageMonths`
// function directly inside HouseWorkspaceOverview.tsx (see
// HouseWorkspaceOverview.tsx.housev3.bak for the original). A refactor
// moved the import to this shared path but the module itself was never
// created, breaking the build. Logic below is unchanged from the backup —
// only the export shape changed, to `{ remainingMonths }` so call sites can
// pick up further term-position fields later without a breaking change.

type MortgageTermInput = {
  start_date?: string | null;
  term_years?: number | null;
};

export function getMortgageTermPosition(deal?: MortgageTermInput | null): { remainingMonths: number } {
  const fallbackMonths = Math.max(0, Math.round(Number(deal?.term_years || 0) * 12));

  if (!deal?.start_date || !Number(deal.term_years)) {
    return { remainingMonths: fallbackMonths };
  }

  const start = new Date(`${deal.start_date}T00:00:00`);
  if (Number.isNaN(start.getTime())) {
    return { remainingMonths: fallbackMonths };
  }

  const maturity = new Date(start);
  maturity.setMonth(maturity.getMonth() + Math.round(Number(deal.term_years) * 12));

  const now = new Date();
  let months = (maturity.getFullYear() - now.getFullYear()) * 12 + (maturity.getMonth() - now.getMonth());
  if (maturity.getDate() < now.getDate()) months -= 1;

  return { remainingMonths: Math.max(0, months) };
}
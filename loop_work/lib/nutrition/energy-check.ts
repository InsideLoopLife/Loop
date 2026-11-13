// Does the calorie figure add up? Energy from protein, carbs, fat (and alcohol, fibre)
// should roughly match the stated kcal. Big gaps usually mean a typo or a per-100g/per-serving mix-up.

export type EnergyCheck = { ok: boolean; stated: number; expected: number; gapPct: number; reason: string | null };

export function checkEnergy(values: { calories?: number | null; protein_g?: number | null; carbs_g?: number | null; fat_g?: number | null; fibre_g?: number | null; alcohol_g?: number | null }): EnergyCheck {
  const stated = Number(values.calories || 0);
  const protein = Number(values.protein_g || 0);
  const carbs = Number(values.carbs_g || 0);
  const fat = Number(values.fat_g || 0);
  const fibre = Number(values.fibre_g || 0);
  const alcohol = Number(values.alcohol_g || 0);
  const expected = protein * 4 + carbs * 4 + fat * 9 + fibre * 2 + alcohol * 7;
  const macrosMissing = protein + carbs + fat + alcohol === 0;
  if (macrosMissing) {
    return { ok: stated <= 5, stated, expected: 0, gapPct: 0, reason: stated > 5 ? "No protein, carbs or fat listed, so the calories can't be checked." : null };
  }
  const gap = Math.abs(stated - expected);
  const gapPct = expected > 0 ? gap / expected : 1;
  // UK labels round and use slightly different factors, so allow 20% or 25 kcal, whichever is bigger.
  const ok = gap <= Math.max(25, expected * 0.2);
  const reason = ok
    ? null
    : stated === 0
      ? `Calories are missing, but the protein, carbs and fat add up to about ${Math.round(expected)} kcal.`
      : `Calories say ${Math.round(stated)} kcal but the protein, carbs and fat add up to about ${Math.round(expected)} kcal.`;
  return { ok, stated, expected: Math.round(expected), gapPct: Math.round(gapPct * 100) / 100, reason };
}

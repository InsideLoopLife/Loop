/**
 * Salary end dates are usually "when I expect a pay change" (an April uplift),
 * not "when I stop being paid". So a salary record with an end date carries on
 * at the same pay until a later pay record for that person takes over.
 *
 * A salary only stops on its end date when a later record exists for that person.
 * Maternity and other kinds keep their dates, because those genuinely end.
 *
 * Apply this to pay_events rows as soon as they're read, before any month logic.
 * Rows read without `pay_kind` are left as they are.
 */
type PayRow = {
  pay_kind?: string | null;
  person_id?: string | null;
  user_id?: string | null;
  effective_from?: string | null;
  effective_until?: string | null;
};

export function carrySalaryForward<T extends PayRow>(rows: readonly T[] | null | undefined): T[] {
  const list = [...(rows || [])];
  return list.map((row) => {
    if (!row.effective_until || String(row.pay_kind || "") !== "salary") return row;
    const owner = row.person_id || row.user_id || "";
    const from = String(row.effective_from || "");
    const hasLater = list.some((other) => other !== row
      && (other.person_id || other.user_id || "") === owner
      && String(other.effective_from || "") > from);
    return hasLater ? row : { ...row, effective_until: null };
  });
}

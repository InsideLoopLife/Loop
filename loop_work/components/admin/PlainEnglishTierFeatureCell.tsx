import { saveUserFacingPlanFeature } from "@/app/admin/tiers/actions";

type PlanFeatureCellProps = {
  planSlug: string;
  featureKey: string;
  featureName: string;
  cell?: {
    enabled?: boolean;
    limit_value?: number | null;
    limit_period?: string | null;
    enforcement_mode?: string | null;
    health_status?: string | null;
    message?: string | null;
    user_message?: string | null;
  } | null;
};

function value(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

function summary(cell?: PlanFeatureCellProps["cell"]) {
  if (!cell?.enabled) return "Not included";
  if (cell.limit_value === null || cell.limit_value === undefined) {
    return "Included · unlimited";
  }
  if (cell.limit_period === "month") {
    return `Included · ${Number(cell.limit_value).toLocaleString("en-GB")}/month`;
  }
  if (cell.limit_period && cell.limit_period !== "none") {
    return `Included · ${Number(cell.limit_value).toLocaleString("en-GB")}/${cell.limit_period}`;
  }
  return `Included · up to ${Number(cell.limit_value).toLocaleString("en-GB")}`;
}

/**
 * Drop-in replacement for the technical plan-feature editor.
 *
 * The everyday controls are intentionally simple:
 * - included?
 * - allowance
 * - reset cadence
 *
 * Enforcement / health / custom messaging live under Advanced.
 */
export function PlainEnglishTierFeatureCell({
  planSlug,
  featureKey,
  featureName,
  cell,
}: PlanFeatureCellProps) {
  const enabled = cell?.enabled ?? false;
  const limitPeriod = cell?.limit_period || "none";
  const enforcement = cell?.enforcement_mode || "block";
  const health = cell?.health_status || "active";

  return (
    <details className="group">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span
          className={[
            "inline-flex rounded-full px-3 py-1 text-xs font-black",
            enabled
              ? "bg-emerald-100 text-emerald-800"
              : "bg-slate-100 text-slate-500",
          ].join(" ")}
        >
          {summary(cell)}
        </span>
      </summary>

      <form
        action={saveUserFacingPlanFeature}
        className="mt-3 grid min-w-80 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl"
      >
        <input type="hidden" name="plan_slug" value={planSlug} />
        <input type="hidden" name="feature_key" value={featureKey} />

        <div>
          <p className="text-sm font-black text-slate-950">{featureName}</p>
          <p className="mt-1 text-xs font-bold text-slate-500">
            What should this tier actually get?
          </p>
        </div>

        <label className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm font-black">
          Include this feature
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={enabled}
            className="h-4 w-4"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-black text-slate-600">
            Allowance
          </span>
          <input
            name="limit_value"
            type="number"
            min="0"
            step="1"
            defaultValue={value(cell?.limit_value)}
            placeholder="Leave blank for unlimited"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
          />
          <span className="text-[11px] font-bold text-slate-400">
            Blank = unlimited. For a simple on/off feature, leave this blank.
          </span>
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-black text-slate-600">
            Allowance resets
          </span>
          <select
            name="limit_period"
            defaultValue={limitPeriod}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
          >
            <option value="none">It does not reset</option>
            <option value="day">Every day</option>
            <option value="week">Every week</option>
            <option value="month">Every month</option>
            <option value="year">Every year</option>
          </select>
        </label>

        <details className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <summary className="cursor-pointer text-xs font-black text-slate-600">
            Advanced
          </summary>

          <div className="mt-3 grid gap-3">
            <label className="grid gap-1">
              <span className="text-xs font-black text-slate-600">
                What happens at the limit?
              </span>
              <select
                name="enforcement_mode"
                defaultValue={enforcement}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold"
              >
                <option value="block">Stop the action</option>
                <option value="upgrade">Ask the user to upgrade</option>
                <option value="warn">Allow it, but warn</option>
                <option value="audit">Allow it, log only</option>
              </select>
            </label>

            <label className="grid gap-1">
              <span className="text-xs font-black text-slate-600">
                Feature health
              </span>
              <select
                name="health_status"
                defaultValue={health}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold"
              >
                <option value="active">Active</option>
                <option value="degraded">Degraded</option>
                <option value="disabled">Disabled</option>
                <option value="hidden">Hidden from user</option>
              </select>
            </label>

            <label className="grid gap-1">
              <span className="text-xs font-black text-slate-600">
                Message shown when unavailable
              </span>
              <textarea
                name="user_message"
                defaultValue={cell?.user_message || cell?.message || ""}
                placeholder="Optional"
                className="min-h-16 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold"
              />
            </label>
          </div>
        </details>

        <button className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white">
          Save allowance
        </button>
      </form>
    </details>
  );
}

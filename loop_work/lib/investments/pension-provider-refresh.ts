import { createAdminClient } from "@/lib/supabase/admin";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

type PensionAccountRow = {
  id: string;
  user_id: string;
  provider: string | null;
  label: string | null;
  valuation_mode?: string | null;
  current_value?: number | null;
  value_as_of_date?: string | null;
  provider_stale_after_days?: number | null;
};

type PensionFundRow = {
  id: string;
  pension_account_id: string;
  current_value?: number | null;
  units?: number | null;
  unit_price?: number | null;
  price_as_of_date?: string | null;
};

function providerKey(value?: string | null) {
  return String(value || "").toLowerCase();
}

function isPensionBee(provider?: string | null) {
  const key = providerKey(provider);
  return key.includes("pensionbee") || key.includes("pension bee");
}

function isLegalGeneral(provider?: string | null) {
  const key = providerKey(provider);
  return key.includes("legal") || key.includes("l&g") || key.includes("lgim");
}

function asNumber(value: unknown, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function daysOld(iso?: string | null, now = new Date()) {
  const parsed = iso ? Date.parse(`${iso}T00:00:00.000Z`) : NaN;
  if (!Number.isFinite(parsed)) return Infinity;
  return Math.floor((now.getTime() - parsed) / 86400000);
}

function fundValue(fund: PensionFundRow) {
  const explicit = asNumber(fund.current_value, 0);
  if (explicit > 0) return explicit;
  const units = asNumber(fund.units, 0);
  const price = asNumber(fund.unit_price, 0);
  return units > 0 && price > 0 ? units * price : 0;
}

function accountStatus(account: PensionAccountRow, funds: PensionFundRow[], now: Date) {
  const provider = account.provider || "Provider";
  const mode = String(account.valuation_mode || "fund_units");
  const staleAfter = Math.max(7, asNumber(account.provider_stale_after_days, 30));
  const stale = daysOld(account.value_as_of_date, now) > staleAfter;
  const total = funds.reduce((sum, fund) => sum + fundValue(fund), 0);

  if (isPensionBee(provider)) {
    return {
      status: stale ? "needs_provider_statement" : "manual_provider_value",
      notes: stale
        ? "PensionBee does not have an active automatic value feed in Loop. Upload a recent statement/screenshot through LoopWatch or manually confirm the pot value."
        : "PensionBee is held as a confirmed provider-value pot. LoopWatch documents can update the value after review.",
      computedValue: null as number | null,
    };
  }

  if (isLegalGeneral(provider)) {
    if (mode === "provider_value" || !funds.length) {
      return {
        status: stale ? "needs_provider_statement" : "manual_provider_value",
        notes: stale
          ? "L&G workplace values are plan-specific and are not automatically pulled unless a provider feed supplies them. Upload a statement or update the confirmed value."
          : "L&G is held as a confirmed provider-value pot. Fund/unit rows can be added where you want a breakdown.",
        computedValue: null as number | null,
      };
    }
    return {
      status: total > 0 ? "fund_values_review" : "needs_fund_values",
      notes: total > 0
        ? "L&G fund rows have confirmed values/unit prices. The workplace portal remains the source of truth for scheme charges and exact unit prices."
        : "L&G fund rows need confirmed current values or units and unit prices before Loop can roll them into a pot value.",
      computedValue: total > 0 ? total : null,
    };
  }

  if (mode === "provider_value" || !funds.length) {
    return {
      status: stale ? "needs_provider_statement" : "manual_provider_value",
      notes: stale ? "Provider value is stale. Upload a statement through LoopWatch or edit the confirmed pot value." : "Latest confirmed provider value is stored. No automatic provider API feed is assumed.",
      computedValue: null as number | null,
    };
  }

  return {
    status: total > 0 ? "fund_values_review" : "needs_fund_values",
    notes: total > 0 ? "Fund rows have values that can be rolled into the pension pot." : "Add current fund values or units and unit prices to update this pot.",
    computedValue: total > 0 ? total : null,
  };
}

export async function runPensionProviderRefresh(
  supabase: SupabaseAdmin = createAdminClient(),
  options: { now?: Date; logger?: Pick<Console, "log" | "warn" | "error"> } = {},
) {
  const logger = options.logger || console;
  const now = options.now || new Date();
  const nowIso = now.toISOString();
  const today = nowIso.slice(0, 10);
  const result = { ok: true, checked: 0, updated: 0, failed: 0, notes: [] as string[] };

  const { data: accounts, error: accountError } = await supabase
    .from("pension_accounts")
    .select("id,user_id,label,provider,valuation_mode,current_value,value_as_of_date,provider_stale_after_days")
    .returns<PensionAccountRow[]>();
  if (accountError) throw accountError;

  const accountIds = (accounts || []).map((account) => account.id);
  const { data: funds, error: fundError } = accountIds.length
    ? await supabase
        .from("pension_funds")
        .select("id,pension_account_id,current_value,units,unit_price,price_as_of_date")
        .in("pension_account_id", accountIds)
        .returns<PensionFundRow[]>()
    : { data: [] as PensionFundRow[], error: null as any };
  if (fundError) throw fundError;

  const fundsByAccount = new Map<string, PensionFundRow[]>();
  for (const fund of funds || []) {
    if (!fundsByAccount.has(fund.pension_account_id)) fundsByAccount.set(fund.pension_account_id, []);
    fundsByAccount.get(fund.pension_account_id)!.push(fund);
  }

  for (const account of accounts || []) {
    result.checked += 1;
    const rows = fundsByAccount.get(account.id) || [];
    const status = accountStatus(account, rows, now);
    const payload: Record<string, any> = {
      provider_refresh_enabled: true,
      provider_refresh_status: status.status,
      provider_refresh_notes: status.notes,
      last_provider_refresh_at: nowIso,
      updated_at: nowIso,
    };
    if (status.computedValue !== null && status.computedValue > 0) {
      payload.current_value = Math.round(status.computedValue * 100) / 100;
      payload.value_as_of_date = today;
    }

    const { error } = await supabase.from("pension_accounts").update(payload).eq("id", account.id).eq("user_id", account.user_id);
    if (error) {
      result.failed += 1;
      result.ok = false;
      result.notes.push(`${account.label || account.id}: ${error.message}`);
      logger.warn(`[pension-provider-refresh] failed ${account.id}: ${error.message}`);
    } else {
      result.updated += 1;
    }
  }

  logger.log(`[pension-provider-refresh] checked=${result.checked} updated=${result.updated} failed=${result.failed}`);
  return result;
}

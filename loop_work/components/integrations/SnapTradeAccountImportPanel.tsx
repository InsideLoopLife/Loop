"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, RefreshCw, ShieldCheck } from "lucide-react";

type SnapTradeManualMatch = {
  id: string;
  label: string;
  provider: string;
  accountType: string;
  wrapperLabel: string;
  score: number;
  matchStrength: "strong" | "medium" | "weak";
  defaultArchive: boolean;
  reason: string;
  recommendedAction: string;
  holdingsCount: number;
  estimatedValue: number;
};

type SnapTradeAccountPreview = {
  externalAccountId: string;
  externalConnectionId: string | null;
  name: string;
  providerName: string;
  accountType: string;
  wrapperLabel: string;
  rawType: string | null;
  currency: string | null;
  balanceValue: number;
  holdingsValue: number;
  holdingsCount: number;
  syncStatus: string | null;
  alreadyImported: boolean;
  importGuidance: string;
  defaultArchiveManualAccountIds: string[];
  manualMatches?: SnapTradeManualMatch[];
};

type SnapTradeConnectionSummary = {
  connected: boolean;
  status?: string | null;
  externalConnectionId?: string | null;
  lastSyncedAt?: string | null;
};

function formatMoney(value: number | null | undefined, currency = "GBP") {
  const numeric = Number(value || 0);
  const safeCurrency = String(currency || "GBP").toUpperCase() === "GBX" ? "GBP" : String(currency || "GBP").toUpperCase();
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: safeCurrency,
    maximumFractionDigits: numeric > 100 ? 0 : 2,
  }).format(numeric);
}

function wrapperBadge(account: SnapTradeAccountPreview) {
  const text = account.wrapperLabel || account.accountType || "Account";
  if (/isa/i.test(text)) return "ISA";
  if (/sipp|pension/i.test(text)) return "SIPP";
  if (/gia|invest/i.test(text)) return "GIA";
  return text.toUpperCase();
}

export function SnapTradeAccountImportPanel({
  enabled,
  connection,
}: {
  enabled: boolean;
  connection: SnapTradeConnectionSummary;
}) {
  const [accounts, setAccounts] = useState<SnapTradeAccountPreview[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [archiveMap, setArchiveMap] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");

  const selectedAccounts = useMemo(
    () => accounts.filter((account) => selectedIds.includes(account.externalAccountId)),
    [accounts, selectedIds],
  );

  async function openPortal() {
    setError("");
    setStatus("Creating broker connection portal…");
    try {
      const response = await fetch("/api/snaptrade/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionType: "read" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.redirectURI) throw new Error(payload.error || "Could not create broker connection link.");
      window.location.href = payload.redirectURI;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create broker connection link.");
      setStatus("");
    }
  }

  async function refreshAccounts() {
    setLoading(true);
    setError("");
    setStatus("Checking connected brokerage accounts…");
    try {
      const response = await fetch("/api/snaptrade/accounts", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not load brokerage accounts.");
      const nextAccounts = Array.isArray(payload.accounts) ? payload.accounts : [];
      setAccounts(nextAccounts);
      const nextSelected = nextAccounts
        .filter((account: SnapTradeAccountPreview) => !account.alreadyImported)
        .map((account: SnapTradeAccountPreview) => account.externalAccountId);
      setSelectedIds(nextSelected);
      const nextArchiveMap = Object.fromEntries(
        nextAccounts.map((account: SnapTradeAccountPreview) => [account.externalAccountId, account.defaultArchiveManualAccountIds || []]),
      );
      setArchiveMap(nextArchiveMap);
      setStatus(nextAccounts.length ? `Found ${nextAccounts.length} account(s). Import ISA/GIA/SIPP separately, or import all shown.` : "No accounts returned yet. Add or refresh the broker connection.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load brokerage accounts.");
      setStatus("");
    } finally {
      setLoading(false);
    }
  }

  async function importAccounts(ids?: string[]) {
    const accountIds = ids?.length ? ids : selectedIds;
    if (!accountIds.length) {
      setError("Choose at least one account to import.");
      return;
    }
    setSyncing(true);
    setError("");
    setStatus("Importing selected brokerage account(s)…");
    try {
      const response = await fetch("/api/snaptrade/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountIds, archiveManualAccountIds: archiveMap }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not import brokerage accounts.");
      setStatus(`Imported ${payload.imported?.length || accountIds.length} account(s). Investments will now display them as separate pots.`);
      await refreshAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not import brokerage accounts.");
      setStatus("");
    } finally {
      setSyncing(false);
    }
  }

  function toggleAccount(id: string) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleManualArchive(accountId: string, manualId: string) {
    setArchiveMap((current) => {
      const selected = current[accountId] || [];
      return {
        ...current,
        [accountId]: selected.includes(manualId) ? selected.filter((id) => id !== manualId) : [...selected, manualId],
      };
    });
  }

  if (!enabled) {
    return (
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        Broker imports are a premium investment-data feature. Upgrade or apply a manual tier override before connecting SnapTrade/Trading 212 accounts.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-emerald-700">Broker imports</p>
            <h3 className="mt-1 text-2xl font-black text-slate-950">Trading 212 / SnapTrade accounts</h3>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              A single Trading 212 connection can return more than one account, such as ISA and GIA. Refresh the list, then import each account you want LOOP to show as a separate investment pot.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={openPortal} className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2 text-sm font-black text-white">
              <ExternalLink size={16} /> Connect / manage broker
            </button>
            <button onClick={refreshAccounts} disabled={loading} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-800 disabled:opacity-60">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Refresh accounts
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Connection</p>
            <p className="mt-1 font-black text-slate-950">{connection.connected ? "Connected" : "Not connected"}</p>
            <p className="text-xs text-slate-500">{connection.status || "No status yet"}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Accounts found</p>
            <p className="mt-1 font-black text-slate-950">{accounts.length}</p>
            <p className="text-xs text-slate-500">ISA/GIA/SIPP are imported separately when the broker exposes them.</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Last sync</p>
            <p className="mt-1 font-black text-slate-950">{connection.lastSyncedAt ? connection.lastSyncedAt.slice(0, 10) : "Not yet"}</p>
            <p className="text-xs text-slate-500">Provider values are used as the safe account total.</p>
          </div>
        </div>
        {status ? <p className="mt-4 rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{status}</p> : null}
        {error ? <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}
      </div>

      {accounts.length ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-lg font-black text-slate-950">Choose accounts to import</h4>
              <p className="text-sm text-slate-500">Import all shown, or tick just the ISA/GIA/SIPP you want in LOOP.</p>
            </div>
            <button onClick={() => importAccounts()} disabled={syncing || !selectedAccounts.length} className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-2 text-sm font-black text-white disabled:opacity-60">
              {syncing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Import selected ({selectedAccounts.length})
            </button>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {accounts.map((account) => {
              const selected = selectedIds.includes(account.externalAccountId);
              const currency = account.currency || "GBP";
              const value = Number(account.holdingsValue || account.balanceValue || 0);
              return (
                <div key={account.externalAccountId} className={`rounded-3xl border p-5 ${selected ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-700">{account.providerName || "Broker"}</p>
                      <h5 className="mt-1 text-lg font-black text-slate-950">{account.name || account.wrapperLabel}</h5>
                      <p className="mt-1 text-sm text-slate-500">{wrapperBadge(account)} · {currency} · {account.holdingsCount} holding(s)</p>
                    </div>
                    <button onClick={() => toggleAccount(account.externalAccountId)} className={`rounded-full px-3 py-1 text-xs font-black ${selected ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"}`}>
                      {selected ? "Selected" : "Select"}
                    </button>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-white/80 p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Provider value</p>
                      <p className="text-2xl font-black text-slate-950">{formatMoney(value, currency)}</p>
                    </div>
                    <div className="rounded-2xl bg-white/80 p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Status</p>
                      <p className="font-black text-slate-950">{account.alreadyImported ? "Already imported" : "Ready to import"}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-slate-600">{account.importGuidance}</p>
                  {(account.manualMatches || []).length ? (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                      <p className="text-xs font-black uppercase tracking-wide text-amber-900">Possible manual duplicate</p>
                      <div className="mt-2 space-y-2">
                        {(account.manualMatches || []).map((match) => (
                          <label key={match.id} className="flex items-start gap-2 text-sm text-amber-950">
                            <input type="checkbox" checked={(archiveMap[account.externalAccountId] || []).includes(match.id)} onChange={() => toggleManualArchive(account.externalAccountId, match.id)} className="mt-1" />
                            <span><strong>{match.label}</strong> — archive this manual pot so totals are not double-counted.</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <button onClick={() => importAccounts([account.externalAccountId])} disabled={syncing} className="mt-4 w-full rounded-2xl bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:opacity-60">
                    Import this account only
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 text-emerald-600" size={20} />
          <div>
            <p className="font-black text-slate-950">Why the import now lives here</p>
            <p className="mt-1 text-sm text-slate-600">
              Investments should show clean portfolio pots. Integrations is where users connect brokers, refresh account lists, select ISA/GIA/SIPP accounts and manage provider access.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

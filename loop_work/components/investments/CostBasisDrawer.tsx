"use client";

import { useTransition, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Check, Loader2, RefreshCw, Upload, AlertTriangle } from "lucide-react";
import { saveInvestmentCostBasisBatch } from "@/lib/investments/actions";

// Import types and formatting helpers formally from your main dashboard component
import {
  type InvestmentHolding,
  AssetBadge,
  primaryHoldingLabel,
  nativeCostInputMeta,
  nativeCostSuggestion,
} from "./AmplifiedInvestmentsDashboard";

type Props = {
  holdings: InvestmentHolding[];
  dark: boolean;
  onClose: () => void;
  onRetrySync?: () => void;
};

export function CostBasisDrawer({ holdings, dark, onClose, onRetrySync }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Filter missing cost basis holdings
  const missing = holdings
    .filter((holding) => {
      const units = Number(holding.units || 0);
      if (units <= 0) return false;
      const cost = Number(holding.imported_invested_value || 0) > 0 ? Number(holding.imported_invested_value) : (units * Number(holding.average_buy_price || 0));
      const status = String(holding.cost_basis_status || "").trim().toLowerCase();
      if (["known", "provider_verified", "manual_confirmed", "verified"].includes(status) && cost > 0) return false;
      return cost <= 0 || ["", "missing", "unknown", "unverified", "provider_unverified", "estimated"].includes(status);
    })
    .sort((a, b) => {
      const valA = Number(a.units || 0) * Number(a.latest_price || 0);
      const valB = Number(b.units || 0) * Number(b.latest_price || 0);
      return valB - valA;
    });

  const importFromBroker = () => {
    if (!formRef.current) return;
    const inputs = formRef.current.querySelectorAll<HTMLInputElement>("input[name^='average_buy_price:']");
    let count = 0;
    inputs.forEach((input) => {
      const holdingId = input.name.split(":")[1];
      const holding = missing.find((h) => h.id === holdingId);
      if (holding) {
        const suggestion = nativeCostSuggestion(holding);
        if (suggestion > 0) {
          input.value = suggestion.toFixed(2);
          count++;
        }
      }
    });
    setError(count > 0 ? null : "No additional broker cost estimates were found for these items.");
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      {/* Strict Modal Boundaries with flex-col for sticky footer */}
      <div className={`flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border shadow-2xl ${dark ? "border-white/10 bg-[#06080c] text-white" : "border-slate-200 bg-white text-slate-950"}`}>
        
        {/* Header - Fixed at Top */}
        <div className={`shrink-0 flex items-start justify-between gap-4 border-b p-5 ${dark ? "border-white/10" : "border-slate-200"}`}>
          <div>
            <p className={`text-[10px] font-bold uppercase tracking-widest ${dark ? "text-emerald-400" : "text-emerald-600"}`}>Portfolio accuracy</p>
            <h3 className="mt-1 text-xl font-bold tracking-tight">Missing cost basis</h3>
            <p className={`mt-0.5 text-xs ${dark ? "text-white/50" : "text-slate-500"}`}>
              Enter the average purchase price to enable accurate gain/loss calculations.
            </p>
          </div>
          <button type="button" onClick={onClose} className={`grid h-8 w-8 place-items-center rounded-full transition ${dark ? "bg-white/10 text-white hover:bg-white/20" : "bg-slate-100 hover:bg-slate-200"}`}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Sync Actions */}
        <div className="shrink-0 flex items-center gap-3 p-5 pb-0">
           <button type="button" onClick={importFromBroker} className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold transition ${dark ? "border-white/10 bg-white/5 text-white hover:bg-white/10" : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"}`}>
             <Upload className="h-3.5 w-3.5" /> Auto-fill from broker
           </button>
           {onRetrySync && (
             <button type="button" onClick={onRetrySync} className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold transition ${dark ? "border-white/10 bg-white/5 text-white hover:bg-white/10" : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"}`}>
               <RefreshCw className="h-3.5 w-3.5" /> Retry Broker Sync
             </button>
           )}
        </div>

        <form
          ref={formRef}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            setError(null);
            startTransition(async () => {
              try {
                const result = await saveInvestmentCostBasisBatch(data);
                if (!result?.updated) throw new Error(result?.message || "Add at least one valid purchase price.");
                router.refresh();
                onClose();
              } catch (caught: any) {
                setError(caught?.message || "The cost basis could not be saved.");
              }
            });
          }}
        >
          {/* Scrollable List Area */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {error ? <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs font-bold text-rose-400"><AlertTriangle className="h-4 w-4"/> {error}</div> : null}
            
            {missing.length === 0 ? (
               <div className="py-12 text-center text-sm font-semibold text-white/40">All cost bases are complete.</div>
            ) : (
              missing.map((holding) => {
                const meta = nativeCostInputMeta(holding);
                const suggested = nativeCostSuggestion(holding);
                const native = Number(holding.native_latest_price || 0);
                const latestGbp = Number(holding.latest_price || 0);
                const fx = native > 0 && latestGbp > 0 ? latestGbp / native : 1;
                
                return (
                  <div key={`cost-basis-${holding.id}`} className={`group flex items-center justify-between gap-4 rounded-2xl border p-3.5 transition-all ${dark ? "border-white/10 bg-white/5 focus-within:border-emerald-500 focus-within:bg-white/10" : "border-slate-200 bg-slate-50 focus-within:border-emerald-500 focus-within:bg-white"}`}>
                    
                    <input type="hidden" name="holding_id" value={holding.id} />
                    <input type="hidden" name={`purchase_date:${holding.id}`} value={new Date().toISOString().slice(0, 10)} />
                    <input type="hidden" name={`cost_currency:${holding.id}`} value={meta.currency} />
                    <input type="hidden" name={`cost_quote_unit:${holding.id}`} value={meta.quoteUnit} />
                    <input type="hidden" name={`cost_fx_rate:${holding.id}`} value={fx} />

                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <AssetBadge holding={holding} dark={dark} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold transition-colors">{primaryHoldingLabel(holding)}</p>
                        <p className={`truncate text-xs ${dark ? "text-white/40" : "text-slate-500"}`}>{Number(holding.units || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })} units</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold ${dark ? "text-white/40" : "text-slate-400"}`}>{meta.prefix}</span>
                      <input
                        name={`average_buy_price:${holding.id}`}
                        type="number"
                        min="0.000001"
                        step="any"
                        defaultValue={suggested > 0 ? suggested.toFixed(2) : undefined}
                        placeholder="0.00"
                        /* Strict bg-transparent to prevent white box browser default */
                        className={`w-24 !bg-transparent focus:!bg-transparent active:!bg-transparent border-0 shadow-none focus:ring-0 text-right text-sm font-bold outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${dark ? "text-white placeholder:text-white/20" : "text-slate-900 placeholder:text-slate-300"}`}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
          
          {/* Footer - Fixed at Bottom */}
          <div className={`shrink-0 flex items-center justify-between border-t p-5 ${dark ? "border-white/10 bg-[#0c1017]" : "border-slate-200 bg-slate-50"}`}>
            <button type="button" onClick={onClose} className={`rounded-xl px-5 py-2.5 text-xs font-semibold transition-colors ${dark ? "text-white/70 hover:bg-white/10" : "text-slate-600 hover:bg-slate-200"}`}>
              Cancel
            </button>
            <button type="submit" disabled={pending || missing.length === 0} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-2.5 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 disabled:opacity-50 transition-colors">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4"/>} Save cost prices
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
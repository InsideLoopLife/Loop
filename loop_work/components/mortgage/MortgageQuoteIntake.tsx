"use client";

import { useEffect, useState } from "react";
import { ModalFrame } from "@/components/ui/ModalFrame";
import type {
  Home,
  HomeMortgageDeal,
} from "@/components/mortgage/MortgagePlannerClient";

type Mode = "url" | "image" | "manual" | null;
type SourceMethod = "url" | "image" | "manual";

export type UserMortgageQuote = {
  id: string;
  home_id: string | null;
  lender_name: string;
  product_name: string | null;
  rate_percent: number;
  rate_type: string | null;
  ltv_max_percent: number | null;
  initial_term_months: number | null;
  fee_amount: number | null;
  source_method: SourceMethod;
  source_url: string | null;
  evidence_status: string;
  created_at?: string | null;
};

type QuoteDraft = {
  lender_name: string;
  product_name: string;
  rate_percent: number;
  rate_type: string;
  ltv_max_percent: number | null;
  initial_term_months: number | null;
  fee_amount: number | null;
};

const EMPTY: QuoteDraft = {
  lender_name: "",
  product_name: "",
  rate_percent: 0,
  rate_type: "fixed",
  ltv_max_percent: null,
  initial_term_months: 24,
  fee_amount: null,
};

type Props = {
  currentHome?: Home;
  currentDeal?: HomeMortgageDeal;
  existingQuote?: UserMortgageQuote | null;
  onQuoteSaved?: (quote: UserMortgageQuote) => void;
  onQuoteRemoved?: () => void;
};

export function MortgageQuoteIntake({
  currentHome,
  currentDeal: _currentDeal,
  existingQuote,
  onQuoteSaved,
  onQuoteRemoved,
}: Props) {
  const [mode, setMode] = useState<Mode>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [quote, setQuote] = useState<QuoteDraft>(EMPTY);
  const [fileName, setFileName] = useState("");
  const [sourceMethod, setSourceMethod] = useState<SourceMethod>("manual");

  useEffect(() => {
    if (!existingQuote) return;
    setQuote({
      lender_name: existingQuote.lender_name || "",
      product_name: existingQuote.product_name || "",
      rate_percent: Number(existingQuote.rate_percent || 0),
      rate_type: existingQuote.rate_type || "fixed",
      ltv_max_percent:
        existingQuote.ltv_max_percent == null
          ? null
          : Number(existingQuote.ltv_max_percent),
      initial_term_months:
        existingQuote.initial_term_months == null
          ? null
          : Number(existingQuote.initial_term_months),
      fee_amount:
        existingQuote.fee_amount == null ? null : Number(existingQuote.fee_amount),
    });
  }, [existingQuote]);

  function merge(product: any) {
    setQuote({
      lender_name: String(product?.lender_name || ""),
      product_name: String(product?.product_name || ""),
      rate_percent: Number(product?.rate_percent || 0),
      rate_type: String(product?.rate_type || "fixed"),
      ltv_max_percent:
        product?.ltv_max_percent == null ? null : Number(product.ltv_max_percent),
      initial_term_months:
        product?.initial_term_months == null
          ? null
          : Number(product.initial_term_months),
      fee_amount:
        product?.fee_amount == null ? null : Number(product.fee_amount),
    });
  }

  function openManual() {
    if (existingQuote) {
      setQuote({
        lender_name: existingQuote.lender_name || "",
        product_name: existingQuote.product_name || "",
        rate_percent: Number(existingQuote.rate_percent || 0),
        rate_type: existingQuote.rate_type || "fixed",
        ltv_max_percent:
          existingQuote.ltv_max_percent == null
            ? null
            : Number(existingQuote.ltv_max_percent),
        initial_term_months:
          existingQuote.initial_term_months == null
            ? null
            : Number(existingQuote.initial_term_months),
        fee_amount:
          existingQuote.fee_amount == null ? null : Number(existingQuote.fee_amount),
      });
    } else {
      setQuote(EMPTY);
    }
    setSourceMethod("manual");
    setMessage(null);
    setMode("manual");
  }

  async function fromUrl() {
    if (!url.trim() || !currentHome) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/house/mortgage/import-product-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceUrl: url.trim(),
          homeId: currentHome.id,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Could not read quote");
      merge(data.product);
      setSourceMethod("url");
      setMessage(
        "Quote extracted. Check every field below, then choose Use this quote.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not read quote");
    } finally {
      setBusy(false);
    }
  }

  async function fromImage(file?: File) {
    if (!file) return;
    setFileName(file.name);
    setBusy(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("image", file);
      const response = await fetch("/api/house/mortgage/import-product-image", {
        method: "POST",
        body: form,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Could not read image");
      merge(data.product);
      setSourceMethod("image");
      setMessage(
        "Image read. Check every extracted field below before adding it to the comparison.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not read image");
    } finally {
      setBusy(false);
    }
  }

  async function saveQuote() {
    if (!currentHome) {
      setMessage("Add or select a property before saving a lender quote.");
      return;
    }
    if (!quote.rate_percent || quote.rate_percent <= 0) {
      setMessage("Add a valid mortgage rate before using this quote.");
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/house/mortgage/user-quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homeId: currentHome.id,
          lenderName: quote.lender_name.trim() || "User supplied lender",
          productName: quote.product_name.trim() || null,
          ratePercent: quote.rate_percent,
          rateType: quote.rate_type || null,
          ltvMaxPercent: quote.ltv_max_percent,
          initialTermMonths: quote.initial_term_months,
          feeAmount: quote.fee_amount,
          sourceMethod,
          sourceUrl: sourceMethod === "url" ? url.trim() || null : null,
          evidenceStatus:
            sourceMethod === "manual" ? "user_supplied" : "extracted_reviewed",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Could not save quote");
      onQuoteSaved?.(data.quote as UserMortgageQuote);
      setMessage("Added to your mortgage comparison.");
      setMode(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save quote");
    } finally {
      setSaving(false);
    }
  }

  async function removeQuote() {
    if (!existingQuote?.id) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/house/mortgage/user-quotes?id=${encodeURIComponent(existingQuote.id)}`,
        { method: "DELETE" },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Could not remove quote");
      onQuoteRemoved?.();
      setQuote(EMPTY);
      setMessage("Saved lender quote removed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not remove quote");
    } finally {
      setSaving(false);
    }
  }

  const fields = (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block">
        <span className="text-xs font-bold text-slate-600">Lender</span>
        <input
          value={quote.lender_name}
          onChange={(event) =>
            setQuote({ ...quote, lender_name: event.target.value })
          }
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-300"
        />
      </label>

      <label className="block">
        <span className="text-xs font-bold text-slate-600">Product name</span>
        <input
          value={quote.product_name}
          onChange={(event) =>
            setQuote({ ...quote, product_name: event.target.value })
          }
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-300"
        />
      </label>

      <label className="block">
        <span className="text-xs font-bold text-slate-600">Rate %</span>
        <input
          type="number"
          min="0.01"
          max="99"
          step="0.01"
          value={quote.rate_percent || ""}
          onChange={(event) =>
            setQuote({
              ...quote,
              rate_percent: Number(event.target.value || 0),
            })
          }
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-300"
        />
      </label>

      <label className="block">
        <span className="text-xs font-bold text-slate-600">Rate type</span>
        <select
          value={quote.rate_type}
          onChange={(event) =>
            setQuote({ ...quote, rate_type: event.target.value })
          }
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-300"
        >
          <option value="fixed">Fixed</option>
          <option value="tracker">Tracker</option>
          <option value="variable">Variable</option>
        </select>
      </label>

      <label className="block">
        <span className="text-xs font-bold text-slate-600">
          Initial period months
        </span>
        <input
          type="number"
          min="1"
          step="1"
          value={quote.initial_term_months ?? ""}
          onChange={(event) =>
            setQuote({
              ...quote,
              initial_term_months: event.target.value
                ? Number(event.target.value)
                : null,
            })
          }
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-300"
        />
      </label>

      <label className="block">
        <span className="text-xs font-bold text-slate-600">Product fee £</span>
        <input
          type="number"
          min="0"
          step="1"
          value={quote.fee_amount ?? ""}
          onChange={(event) =>
            setQuote({
              ...quote,
              fee_amount: event.target.value ? Number(event.target.value) : null,
            })
          }
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-300"
        />
      </label>

      <label className="block sm:col-span-2">
        <span className="text-xs font-bold text-slate-600">
          Maximum LTV % <span className="font-normal text-slate-400">(optional)</span>
        </span>
        <input
          type="number"
          min="0"
          max="100"
          step="1"
          placeholder="Leave blank if unknown"
          value={quote.ltv_max_percent ?? ""}
          onChange={(event) =>
            setQuote({
              ...quote,
              ltv_max_percent: event.target.value
                ? Number(event.target.value)
                : null,
            })
          }
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-300"
        />
      </label>
    </div>
  );

  return (
    <>
      <section className="rounded-2xl border border-dashed border-violet-300 bg-violet-50/40 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-bold text-violet-800">Input a lender quote</p>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
              Use a product URL, screenshot/image or enter the quote manually.
              Imported details always require your review before they are added.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => {
                setMode("url");
                setSourceMethod("url");
                setMessage(null);
              }}
              className="rounded-xl border border-violet-200 bg-white px-4 py-3 text-xs font-bold text-violet-700"
            >
              🔗 URL
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("image");
                setSourceMethod("image");
                setMessage(null);
              }}
              className="rounded-xl border border-violet-200 bg-white px-4 py-3 text-xs font-bold text-violet-700"
            >
              🖼 Image
            </button>
            <button
              type="button"
              onClick={openManual}
              className="rounded-xl border border-violet-200 bg-white px-4 py-3 text-xs font-bold text-violet-700"
            >
              ✎ Manual
            </button>
          </div>
        </div>

        {existingQuote ? (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-violet-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-violet-700">
                Your saved quote · User supplied / indicative
              </p>
              <p className="mt-1 text-sm font-bold text-slate-950">
                {existingQuote.lender_name}
                {existingQuote.product_name ? ` · ${existingQuote.product_name}` : ""}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {Number(existingQuote.rate_percent).toFixed(2)}%
                {existingQuote.fee_amount != null
                  ? ` · £${Number(existingQuote.fee_amount).toLocaleString("en-GB")} fee`
                  : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={openManual}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-violet-700"
              >
                Edit
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void removeQuote()}
                className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-600 disabled:opacity-40"
              >
                Remove
              </button>
            </div>
          </div>
        ) : null}

        {message && !mode ? (
          <p className="mt-3 rounded-xl bg-white p-3 text-xs font-bold text-slate-600">
            {message}
          </p>
        ) : null}
      </section>

      {mode ? (
        <ModalFrame
          title={
            mode === "url"
              ? "Import lender quote from URL"
              : mode === "image"
                ? "Import lender quote from image"
                : "Enter lender quote manually"
          }
          onClose={() => setMode(null)}
        >
          <div className="space-y-5">
            {mode === "url" ? (
              <div>
                <p className="text-sm text-slate-600">
                  Paste the lender&apos;s specific product page. LOOP only keeps
                  fields it can evidence, then asks you to confirm them.
                </p>
                <div className="mt-3 flex gap-2">
                  <input
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="https://..."
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => void fromUrl()}
                    disabled={busy || !url.trim()}
                    className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-40"
                  >
                    {busy ? "Checking…" : "Read quote"}
                  </button>
                </div>
              </div>
            ) : null}

            {mode === "image" ? (
              <div>
                <p className="text-sm leading-6 text-slate-600">
                  Upload a screenshot or photo. LOOP reads visible mortgage
                  details but does not guess missing values.
                </p>
                <label className="mt-3 flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                  <span className="text-2xl">🖼</span>
                  <span className="mt-2 text-sm font-bold">
                    {fileName || "Choose screenshot or photo"}
                  </span>
                  <span className="text-xs text-slate-400">
                    PNG, JPG, WEBP · max 8MB
                  </span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    disabled={busy}
                    onChange={(event) =>
                      void fromImage(event.target.files?.[0])
                    }
                  />
                </label>
                {busy ? (
                  <p className="mt-2 text-xs font-bold text-violet-700">
                    Reading image…
                  </p>
                ) : null}
              </div>
            ) : null}

            {mode === "manual" ? (
              <p className="text-sm leading-6 text-slate-600">
                Enter the lender quote below. The quote stays household-specific
                and is never added to LOOP&apos;s central mortgage catalogue.
              </p>
            ) : null}

            {message ? (
              <p className="rounded-xl bg-slate-50 p-3 text-xs font-bold text-slate-600">
                {message}
              </p>
            ) : null}

            {mode === "manual" || quote.rate_percent > 0 ? fields : null}

            {mode === "manual" || quote.rate_percent > 0 ? (
              <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[11px] leading-5 text-slate-400">
                  Indicative quote only. Eligibility, ERCs, fees and lender
                  affordability still need checking.
                </p>
                <button
                  type="button"
                  disabled={saving || quote.rate_percent <= 0}
                  onClick={() => void saveQuote()}
                  className="shrink-0 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-40"
                >
                  {saving ? "Adding…" : "Use this quote"}
                </button>
              </div>
            ) : null}
          </div>
        </ModalFrame>
      ) : null}
    </>
  );
}

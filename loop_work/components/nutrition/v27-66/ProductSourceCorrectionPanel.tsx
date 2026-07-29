"use client";

import * as React from "react";

type ProductSourceCorrectionPanelProps = {
  cardId: string;
  action: (formData: FormData) => void | Promise<void>;
};

export function ProductSourceCorrectionPanel({ cardId, action }: ProductSourceCorrectionPanelProps) {
  const [url, setUrl] = React.useState("");

  return (
    <form action={action} className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5">
      <input type="hidden" name="card_id" value={cardId} />
      <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-700">Product correction</p>
      <h3 className="mt-1 text-xl font-black">Submit better product/source data</h3>
      <p className="mt-1 text-sm font-bold text-emerald-900">
        LOOP will pull the main image, formal product name, ingredients, allergen text, price and the site that price came from.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
        <input
          name="source_url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          required
          type="url"
          placeholder="https://brand-or-retailer.com/product"
          className="rounded-2xl border border-emerald-200 bg-white px-4 py-3 font-bold"
        />
        <button className="rounded-2xl bg-slate-950 px-5 py-3 font-black text-white">
          Queue source refresh
        </button>
      </div>
    </form>
  );
}

"use client";

import * as React from "react";

export type IngredientTreeItem = {
  id: string;
  name: string;
  quantityText?: string | null;
  rawText?: string | null;
  children?: IngredientTreeItem[];
  infoMode?: "expand" | "link_to_product" | "raw_only";
  productHref?: string | null;
};

function IngredientRow({ item }: { item: IngredientTreeItem }) {
  const hasChildren = Boolean(item.children?.length);
  const [open, setOpen] = React.useState(false);

  if (item.infoMode === "link_to_product" && item.productHref) {
    return (
      <a href={item.productHref} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 font-bold hover:bg-emerald-50">
        <span>
          {item.quantityText ? <span className="mr-2 text-emerald-700">{item.quantityText}</span> : null}
          {item.name}
        </span>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-emerald-700">More info</span>
      </a>
    );
  }

  return (
    <div className="rounded-2xl bg-slate-50">
      <button
        type="button"
        onClick={() => hasChildren && setOpen((current) => !current)}
        className="flex w-full items-center justify-between px-4 py-3 text-left font-bold"
      >
        <span>
          {item.quantityText ? <span className="mr-2 text-emerald-700">{item.quantityText}</span> : null}
          {item.name}
        </span>
        {hasChildren ? <span className="rounded-full bg-white px-3 py-1 text-xs font-black">{open ? "Hide" : "Expand"}</span> : null}
      </button>

      {open && hasChildren ? (
        <div className="space-y-2 border-t border-white p-3">
          {item.children!.map((child) => (
            <IngredientRow key={child.id} item={child} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function IngredientTree({ items }: { items: IngredientTreeItem[] }) {
  if (!items.length) return null;

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-600">Ingredients</p>
      <h2 className="mt-1 text-2xl font-black">Everything we know</h2>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <IngredientRow key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

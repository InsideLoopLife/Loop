"use client";

import * as React from "react";

type DateIconInputProps = {
  name?: string;
  defaultValue?: string | null;
  label?: string;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function DateIconInput({ name = "entry_date", defaultValue, label = "Date" }: DateIconInputProps) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState(defaultValue || today());

  return (
    <div className="space-y-2">
      <label className="text-sm font-black text-slate-700">{label}</label>
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black shadow-sm"
      >
        <span aria-hidden>📅</span>
        <span>{new Date(value + "T12:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</span>
      </button>
      {open ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
          <input
            type="date"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2"
          />
        </div>
      ) : null}
    </div>
  );
}

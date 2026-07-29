"use client";

import * as React from "react";

type TimeWheelInputProps = {
  name?: string;
  defaultValue?: string | null; // HH:mm
  label?: string;
};

const hours12 = Array.from({ length: 12 }, (_, i) => i + 1);
const minutes = Array.from({ length: 60 }, (_, i) => i);

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function parseTime(value?: string | null) {
  const fallback = new Date();
  const [hRaw, mRaw] = String(value || `${fallback.getHours()}:${fallback.getMinutes()}`).split(":");
  let h24 = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h24)) h24 = fallback.getHours();
  const period = h24 >= 12 ? "pm" : "am";
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return {
    hour12: h12,
    minute: Number.isFinite(m) ? Math.max(0, Math.min(59, m)) : fallback.getMinutes(),
    period,
  };
}

function to24(hour12: number, minute: number, period: string) {
  let h = hour12 % 12;
  if (period === "pm") h += 12;
  return `${pad(h)}:${pad(minute)}`;
}

export function TimeWheelInput({ name = "time_eaten", defaultValue, label = "Time eaten / drunk" }: TimeWheelInputProps) {
  const parsed = parseTime(defaultValue);
  const [hour12, setHour12] = React.useState(parsed.hour12);
  const [minute, setMinute] = React.useState(parsed.minute);
  const [period, setPeriod] = React.useState(parsed.period);
  const [manual, setManual] = React.useState(to24(parsed.hour12, parsed.minute, parsed.period));

  const value = to24(hour12, minute, period);

  React.useEffect(() => {
    setManual(value);
  }, [value]);

  function updateManual(next: string) {
    setManual(next);
    if (!/^\d{1,2}:\d{2}$/.test(next)) return;
    const [h, m] = next.split(":").map(Number);
    if (h < 0 || h > 23 || m < 0 || m > 59) return;
    const parsedNext = parseTime(`${pad(h)}:${pad(m)}`);
    setHour12(parsedNext.hour12);
    setMinute(parsedNext.minute);
    setPeriod(parsedNext.period);
  }

  function now() {
    const n = new Date();
    const parsedNow = parseTime(`${pad(n.getHours())}:${pad(n.getMinutes())}`);
    setHour12(parsedNow.hour12);
    setMinute(parsedNow.minute);
    setPeriod(parsedNow.period);
  }

  return (
    <div className="space-y-2">
      <label className="flex items-center justify-between text-sm font-black text-slate-700">
        <span>{label}</span>
        <button
          type="button"
          onClick={now}
          className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700"
        >
          Now
        </button>
      </label>

      <div className="rounded-3xl border border-slate-200 bg-slate-950 p-3 text-white shadow-lg">
        <input type="hidden" name={name} value={value} />

        <div className="grid grid-cols-[1fr_1fr_1fr] gap-2">
          <select
            aria-label="Hour"
            value={hour12}
            onChange={(event) => setHour12(Number(event.target.value))}
            className="h-28 rounded-2xl bg-white/10 text-center text-4xl font-black text-white outline-none"
            size={3}
          >
            {hours12.map((hour) => (
              <option key={hour} value={hour} className="text-slate-950">
                {hour}
              </option>
            ))}
          </select>

          <select
            aria-label="Minute"
            value={minute}
            onChange={(event) => setMinute(Number(event.target.value))}
            className="h-28 rounded-2xl bg-white/10 text-center text-4xl font-black text-white outline-none"
            size={3}
          >
            {minutes.map((m) => (
              <option key={m} value={m} className="text-slate-950">
                {pad(m)}
              </option>
            ))}
          </select>

          <select
            aria-label="AM or PM"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
            className="h-28 rounded-2xl bg-white/10 text-center text-4xl font-black text-white outline-none"
            size={2}
          >
            <option value="am" className="text-slate-950">am</option>
            <option value="pm" className="text-slate-950">pm</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-slate-500">Type exact time:</span>
        <input
          value={manual}
          onChange={(event) => updateManual(event.target.value)}
          inputMode="numeric"
          pattern="[0-9]{1,2}:[0-9]{2}"
          className="w-28 rounded-xl border border-slate-200 px-3 py-2 text-sm font-black"
          placeholder="14:10"
        />
      </div>
    </div>
  );
}

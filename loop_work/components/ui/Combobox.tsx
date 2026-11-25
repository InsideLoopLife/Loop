"use client";

import { useId, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * A text box that suggests as you type: a dropdown of matching options you can click or pick
 * with the arrow keys and Enter. Anything typed is still allowed, so a missing option never
 * blocks anyone.
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  className = "",
  emptyHint,
  maxResults = 12,
  minChars = 0,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
  emptyHint?: string;
  maxResults?: number;
  /** Only suggest once this many characters are typed (for free-text boxes). */
  minChars?: number;
  ariaLabel?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const blurTimer = useRef<number | null>(null);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const nq = norm(q);
    if (!q) return options.slice(0, maxResults);
    const starts = options.filter((o) => o.toLowerCase().startsWith(q) || norm(o).startsWith(nq));
    const words = options.filter((o) => !starts.includes(o) && o.toLowerCase().split(/[\s-]+/).some((w) => w.startsWith(q)));
    const contains = options.filter((o) => !starts.includes(o) && !words.includes(o) && (o.toLowerCase().includes(q) || (nq && norm(o).includes(nq))));
    return [...starts, ...words, ...contains].slice(0, maxResults);
  }, [value, options, maxResults]);

  const exact = matches.length === 1 && matches[0].toLowerCase() === value.trim().toLowerCase();
  const showList = open && value.trim().length >= minChars && (matches.length > 0 || Boolean(emptyHint && value.trim())) && !exact;

  const pick = (option: string) => {
    onChange(option);
    setOpen(false);
  };

  return (
    <div className="relative">
      <input
        role="combobox"
        aria-expanded={showList}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        aria-activedescendant={showList && matches[active] ? `${id}-opt-${active}` : undefined}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => { setOpen(true); setActive(0); }}
        onBlur={() => { blurTimer.current = window.setTimeout(() => setOpen(false), 120); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, Math.max(matches.length - 1, 0))); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
          else if (e.key === "Enter" && showList && matches[active]) { e.preventDefault(); pick(matches[active]); }
          else if (e.key === "Escape" && showList) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
        }}
        className={`${className} pr-8`}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Show options"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        className="absolute right-2 top-1/2 mt-0.5 -translate-y-1/2 text-slate-400 hover:text-slate-700"
      >
        <ChevronDown className="h-4 w-4" aria-hidden />
      </button>
      {showList ? (
        <ul id={`${id}-list`} role="listbox" className="absolute left-0 right-0 z-50 mt-1 max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {matches.map((option, i) => (
            <li
              key={option}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(option)}
              className={`cursor-pointer px-3 py-2 text-sm font-bold ${i === active ? "bg-indigo-50 text-indigo-900" : "text-slate-800"}`}
            >
              {option}
            </li>
          ))}
          {!matches.length && emptyHint ? <li className="px-3 py-2 text-xs font-semibold text-slate-500">{emptyHint}</li> : null}
        </ul>
      ) : null}
    </div>
  );
}

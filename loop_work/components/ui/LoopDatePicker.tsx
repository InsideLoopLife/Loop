"use client";

/**
 * LOOP's calendar for every <input type="date"> in the app.
 *
 * Mounted once in the root layout. On a computer, clicking a date field opens
 * this calendar instead of the browser's own. On phones and tablets the
 * system date wheel stays, because it's already the easiest thing to use there.
 *
 * It writes the value back through the input itself (and fires input/change),
 * so controlled React inputs, plain forms and server actions all keep working.
 * Typing a date into the field still works too.
 *
 * Optional, per input:
 *   data-loop-quick="today,tomorrow,first-next-month,end-of-month,in-a-week"
 *   data-loop-native="true"   keep the browser's picker for this field
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Quick = { id: string; label: string; date: () => Date };

const QUICKS: Record<string, Quick> = {
  today: { id: "today", label: "Today", date: () => startOfDay(new Date()) },
  tomorrow: { id: "tomorrow", label: "Tomorrow", date: () => addDays(startOfDay(new Date()), 1) },
  "in-a-week": { id: "in-a-week", label: "In a week", date: () => addDays(startOfDay(new Date()), 7) },
  "first-next-month": { id: "first-next-month", label: "1st of next month", date: () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 1); } },
  "end-of-month": { id: "end-of-month", label: "End of this month", date: () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0); } },
};
const DEFAULT_QUICKS = ["today", "first-next-month"];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function addDays(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function toIso(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function fromIso(value: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
function sameDay(a: Date | null, b: Date | null) { return !!a && !!b && toIso(a) === toIso(b); }

/** Set an input's value the way a person typing would, so React and forms see it. */
function writeValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter ? setter.call(input, value) : (input.value = value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function usesFinePointer() {
  try { return window.matchMedia("(pointer: fine)").matches; } catch { return true; }
}

function isEnhanceable(target: EventTarget | null): target is HTMLInputElement {
  return target instanceof HTMLInputElement
    && target.type === "date"
    && !target.disabled
    && !target.readOnly
    && target.dataset.loopNative !== "true";
}

export function LoopDatePicker() {
  const [input, setInput] = useState<HTMLInputElement | null>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!isEnhanceable(event.target) || !usesFinePointer()) return;
      // Stops the browser's own picker opening.
      event.preventDefault();
      setInput(event.target);
    };
    const onKey = (event: KeyboardEvent) => {
      // Alt+Down / F4 is the usual "open the calendar" key.
      if (!isEnhanceable(event.target) || !usesFinePointer()) return;
      if ((event.altKey && event.key === "ArrowDown") || event.key === "F4") {
        event.preventDefault();
        setInput(event.target);
      }
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, []);

  if (!input) return null;
  return <CalendarPopover key={input.name + input.id + input.value} input={input} onClose={() => { setInput(null); input.focus(); }} />;
}

function CalendarPopover({ input, onClose }: { input: HTMLInputElement; onClose: () => void }) {
  const selected = fromIso(input.value);
  const min = fromIso(input.min);
  const max = fromIso(input.max);
  const today = startOfDay(new Date());
  const [view, setView] = useState(() => { const base = selected || (max && max < today ? max : min && min > today ? min : today); return new Date(base.getFullYear(), base.getMonth(), 1); });
  const [focusDay, setFocusDay] = useState<Date>(() => selected || (min && min > today ? min : today));
  const [picking, setPicking] = useState<"days" | "months">("days");
  const [position, setPosition] = useState<{ top: number; left: number; above: boolean } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const outOfRange = useCallback((d: Date) => (min && d < min) || (max && d > max), [min, max]);

  // Place under the field, or above it if there's no room; keep it on screen.
  const place = useCallback(() => {
    const rect = input.getBoundingClientRect();
    const width = 320;
    const height = panelRef.current?.offsetHeight || 400;
    const spaceBelow = window.innerHeight - rect.bottom;
    const above = spaceBelow < height + 12 && rect.top > height + 12;
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
    setPosition({ top: above ? rect.top - height - 6 : rect.bottom + 6, left, above });
  }, [input]);
  useLayoutEffect(() => { place(); }, [place, picking]);
  useEffect(() => {
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [place]);

  // Close on a click outside, or on Escape.
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || target === input) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("mousedown", onDown, true); document.removeEventListener("keydown", onKey, true); };
  }, [input, onClose]);

  // Move keyboard focus to the focused day whenever it changes.
  useEffect(() => {
    if (picking !== "days") return;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${toIso(focusDay)}"]`)?.focus({ preventScroll: true });
  }, [focusDay, picking, view]);

  const choose = (d: Date) => {
    if (outOfRange(d)) return;
    writeValue(input, toIso(d));
    onClose();
  };

  const moveFocus = (d: Date) => {
    setFocusDay(d);
    if (d.getMonth() !== view.getMonth() || d.getFullYear() !== view.getFullYear()) setView(new Date(d.getFullYear(), d.getMonth(), 1));
  };

  const onGridKey = (event: React.KeyboardEvent) => {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (moves[event.key] !== undefined) { event.preventDefault(); moveFocus(addDays(focusDay, moves[event.key])); }
    else if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      const delta = (event.key === "PageUp" ? -1 : 1) * (event.shiftKey ? 12 : 1);
      moveFocus(new Date(focusDay.getFullYear(), focusDay.getMonth() + delta, Math.min(focusDay.getDate(), 28)));
    } else if (event.key === "Home") { event.preventDefault(); moveFocus(addDays(focusDay, -((focusDay.getDay() + 6) % 7))); }
    else if (event.key === "End") { event.preventDefault(); moveFocus(addDays(focusDay, 6 - ((focusDay.getDay() + 6) % 7))); }
    else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(focusDay); }
  };

  const days = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const start = addDays(first, -((first.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [view]);
  // Trim a trailing week that's all next month.
  const visibleDays = days[35].getMonth() !== view.getMonth() ? days.slice(0, 35) : days;

  const quicks = (input.dataset.loopQuick ? input.dataset.loopQuick.split(",") : DEFAULT_QUICKS)
    .map((id) => QUICKS[id.trim()]).filter(Boolean)
    .filter((quick) => !outOfRange(quick.date()));

  const monthLabel = view.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const shift = (months: number) => setView(new Date(view.getFullYear(), view.getMonth() + months, 1));

  const panel = (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Choose a date"
      className="loop-datepicker"
      style={{ top: position?.top ?? -9999, left: position?.left ?? -9999 }}
    >
      <div className="loop-datepicker__head">
        <button type="button" className="loop-datepicker__title" onClick={() => setPicking(picking === "days" ? "months" : "days")} aria-label={picking === "days" ? "Choose a month" : "Back to days"}>
          {picking === "days" ? monthLabel : view.getFullYear()}
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <div className="loop-datepicker__arrows">
          <button type="button" onClick={() => shift(picking === "days" ? -1 : -12)} aria-label={picking === "days" ? "Previous month" : "Previous year"}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3.5 5.5 8 10 12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <button type="button" onClick={() => shift(picking === "days" ? 1 : 12)} aria-label={picking === "days" ? "Next month" : "Next year"}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
      </div>

      {picking === "days" ? (
        <>
          <div className="loop-datepicker__weekdays" aria-hidden="true">
            {WEEKDAYS.map((day, i) => <span key={day} className={i > 4 ? "is-weekend" : ""}>{day}</span>)}
          </div>
          <div ref={gridRef} className="loop-datepicker__grid" role="grid" onKeyDown={onGridKey}>
            {visibleDays.map((day) => {
              const outside = day.getMonth() !== view.getMonth();
              const disabled = outOfRange(day);
              const classes = [
                "loop-datepicker__day",
                outside ? "is-outside" : "",
                sameDay(day, today) ? "is-today" : "",
                sameDay(day, selected) ? "is-selected" : "",
                day.getDay() === 0 || day.getDay() === 6 ? "is-weekend" : "",
              ].filter(Boolean).join(" ");
              return (
                <button
                  key={toIso(day)}
                  type="button"
                  data-day={toIso(day)}
                  className={classes}
                  disabled={!!disabled}
                  tabIndex={sameDay(day, focusDay) ? 0 : -1}
                  aria-selected={sameDay(day, selected)}
                  aria-current={sameDay(day, today) ? "date" : undefined}
                  aria-label={day.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                  onClick={() => choose(day)}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="loop-datepicker__months">
          {MONTHS.map((label, index) => {
            const isView = index === view.getMonth();
            return (
              <button key={label} type="button" className={isView ? "is-selected" : ""}
                onClick={() => { setView(new Date(view.getFullYear(), index, 1)); setFocusDay(new Date(view.getFullYear(), index, Math.min(focusDay.getDate(), 28))); setPicking("days"); }}>
                {label}
              </button>
            );
          })}
        </div>
      )}

      <div className="loop-datepicker__foot">
        <div className="loop-datepicker__quicks">
          {quicks.map((quick) => (
            <button key={quick.id} type="button" onClick={() => choose(quick.date())}>{quick.label}</button>
          ))}
        </div>
        {!input.required && input.value ? (
          <button type="button" className="loop-datepicker__clear" onClick={() => { writeValue(input, ""); onClose(); }}>Clear</button>
        ) : null}
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}

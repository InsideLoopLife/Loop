"use client";

import Link from "next/link";
import type { CalendarMonthWidgetData, WidgetProps } from "@/lib/dashboard/types";

const MONTH_ACCENTS = [
  "calendar-month--sky", "calendar-month--rose", "calendar-month--mint",
  "calendar-month--lime", "calendar-month--pink", "calendar-month--amber",
  "calendar-month--orange", "calendar-month--sun", "calendar-month--gold",
  "calendar-month--peach", "calendar-month--violet", "calendar-month--festive",
];

function money(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function MonthCard({ month, selected }: { month: CalendarMonthWidgetData; selected: boolean }) {
  const monthIndex = Math.max(0, Number(month.month.slice(5, 7)) - 1);
  const committed = month.income > 0
    ? Math.min(100, Math.round((month.outgoings / month.income) * 100))
    : 0;

  return (
    <Link
      href={`/dashboard?year=${month.month.slice(0, 4)}&month=${month.month}`}
      className={`calendar-month ${MONTH_ACCENTS[monthIndex]} ${selected ? "is-selected" : ""}`}
    >
      <div className="calendar-month__topline">
        <strong>{month.label}</strong>
        <span className={month.surplus >= 0 ? "is-positive" : "is-negative"}>
          {money(month.surplus)}
        </span>
      </div>
      <p>In {money(month.income)} · Out {money(month.outgoings)}</p>
      <div className="calendar-month__track" aria-hidden="true">
        <span
          className={committed >= 90 ? "is-danger" : committed >= 70 ? "is-warning" : ""}
          style={{ width: `${committed}%` }}
        />
      </div>
      <small>{committed}% committed</small>
    </Link>
  );
}

export function CalendarWidget({ dashboardContext, size }: WidgetProps) {
  const calendar = dashboardContext?.calendar;
  if (!calendar) return <div className="widget-empty">Calendar data is unavailable.</div>;

  const selected = calendar.months.find((month) => month.month === calendar.selectedMonth);
  const visibleMonths = size.tier === "compact"
    ? (selected ? [selected] : calendar.months.slice(0, 1))
    : size.tier === "default"
      ? calendar.months.slice(0, 6)
      : calendar.months;

  return (
    <div className={`calendar-widget calendar-widget--${size.tier}`}>
      <div className="calendar-widget__nav">
        <p>{size.tier === "compact" ? "Selected month" : `${calendar.selectedYear} outlook`}</p>
        <div>
          <Link href={`/dashboard?year=${calendar.selectedYear - 1}&month=${calendar.selectedYear - 1}-${calendar.selectedMonth.slice(5, 7)}`} aria-label={`View ${calendar.selectedYear - 1}`}>←</Link>
          <Link href={`/dashboard?year=${calendar.selectedYear + 1}&month=${calendar.selectedYear + 1}-${calendar.selectedMonth.slice(5, 7)}`} aria-label={`View ${calendar.selectedYear + 1}`}>→</Link>
        </div>
      </div>
      <div className="calendar-widget__grid">
        {visibleMonths.map((month) => (
          <MonthCard key={month.month} month={month} selected={month.month === calendar.selectedMonth} />
        ))}
      </div>
    </div>
  );
}

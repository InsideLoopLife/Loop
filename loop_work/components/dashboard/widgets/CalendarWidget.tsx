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

function MonthCard({ month, selected, metric }: { month: CalendarMonthWidgetData; selected: boolean; metric: "surplus" | "commitment" | "income" }) {
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
        <span className={(metric === "commitment" ? committed < 70 : month.surplus >= 0) ? "is-positive" : "is-negative"}>
          {metric === "income" ? money(month.income) : metric === "commitment" ? `${committed}%` : money(month.surplus)}
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

export function CalendarWidget({ dashboardContext, viewport, config }: WidgetProps) {
  const calendar = dashboardContext?.calendar;
  if (!calendar) return <div className="widget-empty">Calendar data is unavailable.</div>;

  const selectedIndex = Math.max(0, calendar.months.findIndex((month) => month.month === calendar.selectedMonth));
  const count = viewport.mode === "summary" ? 1 : viewport.isMobile ? 3 : viewport.mode === "standard" ? 3 : viewport.mode === "detailed" ? 6 : 12;
  const start = Math.max(0, Math.min(calendar.months.length - count, selectedIndex - Math.floor(count / 2)));
  const visibleMonths = calendar.months.slice(start, start + count);
  const style = config.preferences?.calendarStyle ?? "seasonal";
  const metric = config.preferences?.calendarMetric ?? "surplus";

  return (
    <div className={`calendar-widget calendar-widget--${viewport.mode} calendar-widget--${style}`}>
      <div className="calendar-widget__nav">
        <p>{viewport.mode === "summary" ? "Selected month" : `${calendar.selectedYear} outlook`}</p>
        <div>
          <Link href={`/dashboard?year=${calendar.selectedYear - 1}&month=${calendar.selectedYear - 1}-${calendar.selectedMonth.slice(5, 7)}`} aria-label={`View ${calendar.selectedYear - 1}`}>←</Link>
          <Link href={`/dashboard?year=${calendar.selectedYear + 1}&month=${calendar.selectedYear + 1}-${calendar.selectedMonth.slice(5, 7)}`} aria-label={`View ${calendar.selectedYear + 1}`}>→</Link>
        </div>
      </div>
      <div className="calendar-widget__grid">
        {visibleMonths.map((month) => (
          <MonthCard key={month.month} month={month} selected={month.month === calendar.selectedMonth} metric={metric} />
        ))}
      </div>
    </div>
  );
}

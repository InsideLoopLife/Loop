"use client";

import {
  ArrowDownUp,
  CalendarDays,
  ChartNoAxesCombined,
  CircleDollarSign,
  Landmark,
  Plus,
  ShoppingBag,
  WalletCards,
  X,
} from "lucide-react";
import { listWidgetDefinitions } from "@/lib/dashboard/widget-registry";

interface AddWidgetPanelProps {
  onSelect: (widgetType: string) => void;
  onClose: () => void;
  activeWidgetTypes?: string[];
}

const ICONS = {
  calendar: CalendarDays,
  net_worth: Landmark,
  pension_summary: WalletCards,
  investment_summary: ChartNoAxesCombined,
  spending_summary: ShoppingBag,
  income_summary: CircleDollarSign,
  cashflow: ArrowDownUp,
} as const;

function WidgetPreview({ type }: { type: string }) {
  if (type === "calendar") {
    return (
      <div className="widget-preview widget-preview--calendar">
        {["JAN", "FEB", "MAR", "APR", "MAY", "JUN"].map((month, index) => (
          <span key={month} className={index === 3 ? "is-current" : ""}>
            <b>{month}</b><i style={{ width: `${32 + index * 9}%` }} />
          </span>
        ))}
      </div>
    );
  }
  if (type === "cashflow") {
    return <div className="widget-preview widget-preview--cashflow"><span /><span /><span /><span /></div>;
  }
  if (type === "investment_summary") {
    return (
      <div className="widget-preview widget-preview--investment">
        <strong>£42,680</strong>
        <svg viewBox="0 0 180 44" role="presentation"><path d="M2 38 C28 34 35 13 58 24 S91 35 109 17 S144 26 178 4" /></svg>
      </div>
    );
  }
  if (type === "spending_summary") {
    return <div className="widget-preview widget-preview--spending"><span className="is-orange" /><span className="is-violet" /><span className="is-mint" /></div>;
  }
  return (
    <div className="widget-preview widget-preview--metric">
      <strong>{type === "income_summary" ? "£4,531" : type === "pension_summary" ? "£83,282" : "£161,679"}</strong>
      <span><i /><i /><i /><i /></span>
      <small>{type === "income_summary" ? "Income this month" : type === "pension_summary" ? "Pension value" : "Net position"}</small>
    </div>
  );
}

export function AddWidgetPanel({ onSelect, onClose, activeWidgetTypes = [] }: AddWidgetPanelProps) {
  const definitions = listWidgetDefinitions();

  return (
    <div className="add-widget-overlay" onClick={onClose} role="presentation">
      <section className="add-widget-panel" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="add-widget-title">
        <div className="add-widget-panel__header">
          <div>
            <span className="add-widget-panel__eyebrow">Make Overview yours</span>
            <h2 id="add-widget-title">Add a widget</h2>
            <p>Preview the information and shape before it is added. You can resize it afterwards.</p>
          </div>
          <button className="add-widget-panel__close" onClick={onClose} aria-label="Close widget picker"><X aria-hidden="true" /></button>
        </div>

        <div className="add-widget-panel__grid">
          {definitions.map((definition) => {
            const Icon = ICONS[definition.type as keyof typeof ICONS] ?? WalletCards;
            const alreadyAdded = activeWidgetTypes.includes(definition.type);
            return (
              <article key={definition.type} className="add-widget-panel__item">
                <div className="add-widget-panel__preview"><WidgetPreview type={definition.type} /></div>
                <div className="add-widget-panel__copy">
                  <span className="add-widget-panel__icon"><Icon aria-hidden="true" /></span>
                  <div><h3>{definition.label}</h3><p>{definition.description}</p></div>
                </div>
                <button className="add-widget-panel__add" onClick={() => onSelect(definition.type)}>
                  <Plus aria-hidden="true" /> {alreadyAdded ? "Add another" : "Add widget"}
                </button>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

"use client";

import { useState } from "react";
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

function WidgetPreview({ type, category }: { type: string; category?: string }) {
  if (type === "calendar") {
    return (
      <div className="widget-preview widget-preview--calendar">
        {[["JAN", "❄️"], ["FEB", "💗"], ["MAR", "🌱"], ["APR", "🌷"], ["MAY", "🌸"], ["JUN", "☀️"]].map(([month, icon], index) => (
          <span key={month} className={index === 3 ? "is-current" : ""}>
            <b>{month}<em aria-hidden="true">{icon}</em></b><i style={{ width: `${32 + index * 9}%` }} />
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
  if (["income_changes", "family_costs", "goal_progress", "interest_earned", "portfolio_movement", "pension_journey", "fees_drag", "dividends_reinvestment", "what_changed"].includes(type)) {
    return <div className="widget-preview widget-preview--investment"><strong>{type === "pension_journey" ? "£95,770" : type === "goal_progress" ? "72%" : "Live trend"}</strong><svg viewBox="0 0 180 44" role="presentation"><path d="M2 38 C28 34 35 13 58 24 S91 35 109 17 S144 26 178 4" /></svg></div>;
  }
  if (["spending_pressure", "emergency_runway", "isa_allowance", "mortgage_countdown", "retirement_readiness", "data_freshness"].includes(type)) {
    return <div className="widget-preview widget-preview--progress"><strong>{type === "emergency_runway" ? "3.8 months" : "74%"}</strong><span><i /></span><small>Live progress</small></div>;
  }
  if (["available_money", "savings_pots", "home_equity", "portfolio_allocation", "household_contribution"].includes(type)) {
    return <div className="widget-preview widget-preview--segments"><strong>{type === "available_money" ? "£1,767" : "Live breakdown"}</strong><span><i /><i /><i /></span><small>{category === "home" ? "Value and mortgage" : "Traceable totals"}</small></div>;
  }
  if (["upcoming_payments", "bills_renewals", "next_best_action"].includes(type)) {
    return <div className="widget-preview widget-preview--attention"><strong>{type === "next_best_action" ? "Next best action" : "Coming up"}</strong><span>Evidence-led prompt</span></div>;
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
  const [category, setCategory] = useState("all");
  const filteredDefinitions = definitions.filter((definition) => category === "all" || definition.category === category || (category === "core" && !definition.category));

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

        <div className="add-widget-panel__filters" aria-label="Filter widget catalogue">
          {[["all", "All"], ["core", "Core"], ["flow", "Money flow"], ["saving", "Savings"], ["home", "Home"], ["investing", "Investing & pensions"], ["household", "Household"]].map(([value, label]) => (
            <button key={value} type="button" aria-pressed={category === value} onClick={() => setCategory(value)}>{label}</button>
          ))}
          <span>{filteredDefinitions.length} widgets</span>
        </div>

        <div className="add-widget-panel__grid">
          {filteredDefinitions.map((definition) => {
            const Icon = ICONS[definition.type as keyof typeof ICONS] ?? WalletCards;
            const alreadyAdded = activeWidgetTypes.includes(definition.type);
            return (
              <article key={definition.type} className="add-widget-panel__item">
                <div className="add-widget-panel__preview"><WidgetPreview type={definition.type} category={definition.category} /></div>
                <div className="add-widget-panel__copy">
                  <span className="add-widget-panel__icon"><Icon aria-hidden="true" /></span>
                  <div><h3>{definition.label}</h3><p>{definition.description}</p>{definition.readiness ? <small className={`add-widget-panel__readiness add-widget-panel__readiness--${definition.readiness}`}>{definition.readiness === "ready" ? "Ready from current data" : definition.readiness === "history" ? "Improves as history builds" : "Calculated by LOOP"}</small> : null}</div>
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

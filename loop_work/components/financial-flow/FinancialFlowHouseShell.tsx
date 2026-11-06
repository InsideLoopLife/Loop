"use client";

import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  section: "flow" | "income" | "spending" | "savings";
};

/**
 * LOOP Financial Flow visual shell.
 *
 * PRESENTATION ONLY:
 * - no data transformation
 * - no financial calculations
 * - no server actions
 * - no database calls
 * - no chart configuration changes
 * - no recurrence / household / tax / savings logic changes
 */
export function FinancialFlowHouseShell({ children, section }: Props) {
  return (
    <div className="loop-financial-house-shell" data-flow-section={section}>
      {children}

      <style jsx global>{`
        /* Money in & out: one tab row above the content (no second side menu).
           Cards, type and colour come from the global calm system. */
        .loop-financial-workspace-nav {
          width: min(100%, 1240px);
          margin: 1.25rem auto 0;
          padding-inline: 1rem;
        }
        .loop-flow-nav-card {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          border-bottom: 1px solid var(--line);
        }
        .loop-flow-nav-heading { display: none; }
        .loop-flow-nav-card nav {
          display: flex;
          gap: 0.25rem;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .loop-flow-nav-card nav::-webkit-scrollbar { display: none; }
        .loop-flow-nav-card nav a {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          flex: 0 0 auto;
          margin-bottom: -1px;
          border-bottom: 2px solid transparent;
          padding: 0.7rem 0.85rem;
          color: var(--muted);
          font-size: 14.5px;
          font-weight: 500;
          white-space: nowrap;
        }
        .loop-flow-nav-card nav a:hover { color: var(--ink); }
        .loop-flow-nav-card nav a.is-active { color: var(--ink); border-bottom-color: var(--pine); }
        .loop-flow-nav-icon { display: inline-grid; place-items: center; color: inherit; }
        .loop-flow-nav-card nav small { display: none; }
        .loop-flow-nav-card nav strong { font-weight: inherit; }
        .loop-flow-nav-actions { display: flex; gap: 0.4rem; padding-bottom: 0.4rem; }
        .loop-flow-nav-actions button,
        .loop-flow-nav-actions a {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          border-radius: 999px;
          padding: 0.45rem 0.85rem;
          font-size: 13px;
          font-weight: 550;
        }
        .loop-flow-nav-actions button { background: var(--pine); color: #fff; }
        .loop-flow-nav-actions button:hover { background: var(--pine-strong); }
        .loop-flow-nav-actions a { color: var(--muted); border: 1px solid var(--line); background: #fff; }
        .loop-financial-house-shell main nav[aria-label="Financial Flow sections"] { display: none !important; }
        /* Income and Spending have their own + button on the page. */
        .loop-financial-house-shell[data-flow-section="spending"] .loop-flow-nav-actions,
        .loop-financial-house-shell[data-flow-section="income"] .loop-flow-nav-actions { display: none; }
        .loop-financial-house-shell main { padding-top: 1.25rem !important; }
        .loop-financial-house-shell main > * + * { margin-top: 1rem !important; }
      `}</style>
    </div>
  );
}

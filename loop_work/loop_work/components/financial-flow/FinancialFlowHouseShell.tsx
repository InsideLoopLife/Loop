"use client";

import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  section: "flow" | "income" | "spending";
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
        .loop-financial-house-shell {
          --loop-flow-bg: #f8fafc;
          --loop-flow-card: rgba(255, 255, 255, 0.97);
          --loop-flow-border: #e7edf3;
          --loop-flow-border-strong: #dbe4ec;
          --loop-flow-ink: #0f172a;
          --loop-flow-muted: #64748b;
          --loop-flow-green: #15803d;
          --loop-flow-green-soft: #f3fbf5;
          --loop-flow-orange: #ea580c;
          --loop-flow-orange-soft: #fff7ed;
          --loop-flow-blue-soft: #f1f9fb;
          --loop-flow-shadow: 0 14px 36px -30px rgba(15, 23, 42, 0.48);

          min-height: 100%;
          background:
            radial-gradient(circle at 8% 0%, rgba(34, 197, 94, 0.035), transparent 26rem),
            radial-gradient(circle at 92% 2%, rgba(14, 116, 144, 0.025), transparent 28rem),
            var(--loop-flow-bg);
        }

        /* House-style wide workspace. */
        .loop-financial-house-shell main {
          width: 95vw !important;
          max-width: 2000px !important;
          margin-inline: auto !important;
          padding-inline: clamp(0.9rem, 2vw, 2rem) !important;
          padding-top: 1rem !important;
        }

        /* Calm the existing card system without removing content. */
        .loop-financial-house-shell main article[class*="border"],
        .loop-financial-house-shell main section[class*="border"],
        .loop-financial-house-shell main div[class*="border"][class*="shadow"] {
          border-color: var(--loop-flow-border) !important;
          box-shadow: var(--loop-flow-shadow) !important;
        }

        .loop-financial-house-shell main [class*="rounded-[2.5rem]"],
        .loop-financial-house-shell main [class*="rounded-[2.25rem]"],
        .loop-financial-house-shell main [class*="rounded-[2rem]"],
        .loop-financial-house-shell main .rounded-3xl {
          border-radius: 1.35rem !important;
        }

        .loop-financial-house-shell main h1,
        .loop-financial-house-shell main h2,
        .loop-financial-house-shell main h3 {
          letter-spacing: -0.025em;
        }

        /* ==========================================================
           FINANCIAL FLOW ROUTE
           ========================================================== */

        /*
         * The first section in FinancialFlowPage is either the dark Flow hero
         * or the compact detail header. Make both House-like.
         */
        .loop-financial-house-shell[data-flow-section="flow"] main > section:first-child {
          min-height: 0 !important;
          overflow: visible !important;
          border: 1px solid var(--loop-flow-border) !important;
          border-radius: 1.4rem !important;
          background: var(--loop-flow-card) !important;
          color: var(--loop-flow-ink) !important;
          padding: 1.15rem 1.25rem !important;
          box-shadow: var(--loop-flow-shadow) !important;
        }

        /* Hide only the two decorative glow blobs from the old dark hero. */
        .loop-financial-house-shell[data-flow-section="flow"] main > section:first-child > .absolute.blur-3xl {
          display: none !important;
        }

        .loop-financial-house-shell[data-flow-section="flow"] main > section:first-child h1 {
          margin-top: 0.2rem !important;
          color: var(--loop-flow-ink) !important;
          font-size: clamp(1.75rem, 2.2vw, 2.45rem) !important;
          line-height: 1.08 !important;
          font-weight: 800 !important;
        }

        .loop-financial-house-shell[data-flow-section="flow"] main > section:first-child p {
          color: var(--loop-flow-muted) !important;
        }

        .loop-financial-house-shell[data-flow-section="flow"] main > section:first-child p[class*="uppercase"] {
          color: var(--loop-flow-green) !important;
        }

        /* Existing month control: convert the outer black capsule to a white control. */
        .loop-financial-house-shell[data-flow-section="flow"] main > section:first-child div[class*="bg-slate-950"][class*="rounded"] {
          border: 1px solid var(--loop-flow-border) !important;
          background: #ffffff !important;
          color: var(--loop-flow-ink) !important;
          box-shadow: none !important;
        }

        .loop-financial-house-shell[data-flow-section="flow"] main > section:first-child div[class*="bg-slate-950"][class*="rounded"] > a {
          background: #f8fafc !important;
          color: var(--loop-flow-muted) !important;
        }

        /*
         * Main Flow / Income / Spending / Savings switcher:
         * retain all four existing destinations but make it a quiet tab rail.
         */
        .loop-financial-house-shell main nav[aria-label="Financial Flow sections"] {
          position: sticky;
          top: 0.5rem;
          z-index: 30;
          display: grid !important;
          grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
          overflow: hidden;
          border: 0 !important;
          border-bottom: 1px solid var(--loop-flow-border-strong) !important;
          border-radius: 0 !important;
          background: rgba(248, 250, 252, 0.94) !important;
          padding: 0 !important;
          box-shadow: none !important;
          backdrop-filter: blur(14px);
        }

        .loop-financial-house-shell main nav[aria-label="Financial Flow sections"] a {
          min-height: 3.25rem;
          justify-content: flex-start !important;
          border-radius: 0 !important;
          border-bottom: 2px solid transparent;
          padding-inline: 1rem !important;
          background: transparent !important;
          box-shadow: none !important;
        }

        .loop-financial-house-shell main nav[aria-label="Financial Flow sections"] a[class*="text-slate-950"] {
          border-bottom-color: var(--loop-flow-green);
          color: var(--loop-flow-ink) !important;
        }

        .loop-financial-house-shell main nav[aria-label="Financial Flow sections"] a span[class*="bg-gradient-to-r"] {
          display: none !important;
        }

        /* Household/person selector remains visible but visually secondary. */
        .loop-financial-house-shell main div[aria-label="Choose household scope"] {
          margin-top: -0.2rem !important;
          padding: 0.15rem 0 0.35rem !important;
        }

        /*
         * The current FinancialFlowPage KPI row is the first direct grid section.
         * Keep every existing metric; tune density and semantic surfaces.
         */
        .loop-financial-house-shell[data-flow-section="flow"] main > section.grid {
          gap: 0.65rem !important;
        }

        .loop-financial-house-shell[data-flow-section="flow"] main > section.grid > article {
          border: 1px solid var(--loop-flow-border) !important;
          border-radius: 1.15rem !important;
          background: #ffffff !important;
          box-shadow: none !important;
        }

        .loop-financial-house-shell[data-flow-section="flow"] main > section.grid > article:first-child {
          background: var(--loop-flow-green-soft) !important;
        }

        .loop-financial-house-shell[data-flow-section="flow"] main > section.grid > article:nth-child(2) {
          background: var(--loop-flow-orange-soft) !important;
        }

        .loop-financial-house-shell[data-flow-section="flow"] main > section.grid > article:nth-child(4) {
          background: var(--loop-flow-blue-soft) !important;
        }

        /* ==========================================================
           CHART PROTECTION
           No SVG/Recharts geometry is changed or hidden.
           ========================================================== */

        .loop-financial-house-shell .recharts-wrapper,
        .loop-financial-house-shell .recharts-surface,
        .loop-financial-house-shell canvas,
        .loop-financial-house-shell svg {
          max-width: 100%;
        }

        .loop-financial-house-shell .recharts-legend-wrapper,
        .loop-financial-house-shell .recharts-tooltip-wrapper {
          opacity: 1 !important;
          visibility: visible !important;
        }

        /* Existing chart-height utilities remain intact. */
        .loop-financial-house-shell main .h-56 {
          min-height: 14rem;
        }

        .loop-financial-house-shell main .h-64 {
          min-height: 16rem;
        }

        /* ==========================================================
           INCOME / SPENDING / CATEGORY PAGES
           Presentation only; existing component logic remains unchanged.
           ========================================================== */

        .loop-financial-house-shell[data-flow-section="income"] main,
        .loop-financial-house-shell[data-flow-section="spending"] main {
          background: transparent !important;
        }

        .loop-financial-house-shell[data-flow-section="income"] main section,
        .loop-financial-house-shell[data-flow-section="spending"] main section {
          scroll-margin-top: 5.5rem;
        }

        /* Tables stay tables; preserve all columns and functionality. */
        .loop-financial-house-shell main table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
        }

        .loop-financial-house-shell main thead th {
          padding-top: 0.7rem;
          padding-bottom: 0.7rem;
          color: #64748b !important;
          font-size: 0.68rem !important;
          font-weight: 800 !important;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .loop-financial-house-shell main tbody td {
          border-color: #eef2f7 !important;
        }

        .loop-financial-house-shell main tbody tr:hover {
          background: #f8fafc;
        }

        /* Forms keep their existing server actions / validation. */
        .loop-financial-house-shell main input:not([type="checkbox"]):not([type="radio"]),
        .loop-financial-house-shell main select,
        .loop-financial-house-shell main textarea {
          border-radius: 0.9rem !important;
          border-color: #dce4ec !important;
        }

        .loop-financial-house-shell main a[class*="px-5"][class*="py-3"],
        .loop-financial-house-shell main button[class*="px-5"][class*="py-3"] {
          border-radius: 0.85rem !important;
        }

        /* ==========================================================
           13-INCH LAPTOP FIRST, THEN SCALE UP
           ========================================================== */

        @media (min-width: 1024px) and (max-width: 1500px) {
          .loop-financial-house-shell main {
            width: 96vw !important;
            padding-inline: 1rem !important;
          }

          .loop-financial-house-shell main > * + * {
            margin-top: 0.9rem !important;
          }

          .loop-financial-house-shell main article[class*="p-5"] {
            padding: 1rem !important;
          }

          .loop-financial-house-shell main article p[class*="text-3xl"] {
            font-size: 1.65rem !important;
          }
        }

        @media (min-width: 1800px) {
          .loop-financial-house-shell main {
            width: 94vw !important;
          }

          .loop-financial-house-shell main p {
            max-width: 82ch;
          }
        }

        @media (max-width: 767px) {
          .loop-financial-house-shell main {
            width: 100% !important;
            padding-inline: 0.75rem !important;
          }

          .loop-financial-house-shell main nav[aria-label="Financial Flow sections"] {
            grid-template-columns: repeat(4, minmax(8rem, 1fr)) !important;
            overflow-x: auto;
            scrollbar-width: none;
          }

          .loop-financial-house-shell main nav[aria-label="Financial Flow sections"]::-webkit-scrollbar {
            display: none;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .loop-financial-house-shell *,
          .loop-financial-house-shell *::before,
          .loop-financial-house-shell *::after {
            transition-duration: 0.01ms !important;
            animation-duration: 0.01ms !important;
          }
        }
      `}</style>
    </div>
  );
}

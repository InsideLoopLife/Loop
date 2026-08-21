"use client";

import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  section: "flow" | "income" | "spending";
};

/**
 * Presentation-only shell for the Financial Flow family.
 *
 * Important:
 * - No calculations live here.
 * - No data is transformed here.
 * - No Recharts/SVG/canvas elements are restyled.
 * - Existing forms, modals, links, drag/drop and server actions remain untouched.
 *
 * This intentionally applies the House visual language from the outside so the
 * underlying Financial Flow, Income and Spending components can keep evolving
 * independently.
 */
export function FinancialFlowHouseShell({ children, section }: Props) {
  return (
    <div className="loop-financial-house-shell" data-flow-section={section}>
      {children}

      <style jsx global>{`
        .loop-financial-house-shell {
          --flow-page: #f8fafc;
          --flow-surface: rgba(255, 255, 255, 0.96);
          --flow-border: #e5e7eb;
          --flow-border-soft: #eef2f7;
          --flow-ink: #0f172a;
          --flow-muted: #64748b;
          --flow-green: #15803d;
          --flow-green-soft: #f0fdf4;
          --flow-orange: #ea580c;
          --flow-orange-soft: #fff7ed;
          --flow-blue: #0369a1;
          --flow-blue-soft: #f0f9ff;
          --flow-shadow: 0 12px 34px -28px rgba(15, 23, 42, 0.42);
          --flow-shadow-raised: 0 18px 42px -30px rgba(15, 23, 42, 0.50);

          min-height: 100%;
          background:
            radial-gradient(circle at 10% 0%, rgba(22, 163, 74, 0.035), transparent 28rem),
            radial-gradient(circle at 92% 8%, rgba(234, 88, 12, 0.025), transparent 30rem),
            var(--flow-page);
        }

        /* Keep the same generous desktop canvas used by the current House workspace. */
        .loop-financial-house-shell main {
          width: 95vw !important;
          max-width: 2000px !important;
          margin-inline: auto !important;
        }

        /*
         * Normalize the most visually-heavy existing containers.
         * We deliberately target presentation classes only; no component
         * structure or chart markup is changed.
         */
        .loop-financial-house-shell main [class*="rounded-[2.5rem]"],
        .loop-financial-house-shell main [class*="rounded-[2rem]"],
        .loop-financial-house-shell main .rounded-3xl {
          border-radius: 1.35rem !important;
        }

        .loop-financial-house-shell main article[class*="border"],
        .loop-financial-house-shell main section[class*="border"],
        .loop-financial-house-shell main div[class*="border"][class*="shadow"] {
          border-color: var(--flow-border-soft) !important;
          box-shadow: var(--flow-shadow) !important;
        }

        .loop-financial-house-shell main article[class*="bg-white"],
        .loop-financial-house-shell main section[class*="bg-white"] {
          background: var(--flow-surface) !important;
        }

        /* Stronger hierarchy: answer first, evidence second. */
        .loop-financial-house-shell main h1,
        .loop-financial-house-shell main h2,
        .loop-financial-house-shell main h3 {
          color: var(--flow-ink);
          letter-spacing: -0.025em;
        }

        .loop-financial-house-shell main h1 {
          font-weight: 800 !important;
        }

        .loop-financial-house-shell main p[class*="text-slate-500"],
        .loop-financial-house-shell main p[class*="text-slate-600"] {
          color: var(--flow-muted) !important;
        }

        /*
         * Financial Flow's section switcher becomes calmer and more workspace-like.
         * Deliberately does not remove or rename any existing navigation item.
         */
        .loop-financial-house-shell main nav[aria-label="Financial Flow sections"] {
          position: sticky;
          top: 0.75rem;
          z-index: 20;
          border-radius: 1.15rem !important;
          border-color: rgba(226, 232, 240, 0.9) !important;
          background: rgba(255, 255, 255, 0.88) !important;
          padding: 0.35rem !important;
          box-shadow: 0 12px 36px -30px rgba(15, 23, 42, 0.55) !important;
          backdrop-filter: blur(16px);
        }

        .loop-financial-house-shell main nav[aria-label="Financial Flow sections"] a {
          min-height: 3rem;
          border-radius: 0.9rem !important;
        }

        /*
         * Keep intentional pills/chips, but avoid every action feeling like a pill.
         * Applies only to large CTA buttons, not filters/tags.
         */
        .loop-financial-house-shell main a[class*="px-5"][class*="py-3"],
        .loop-financial-house-shell main button[class*="px-5"][class*="py-3"] {
          border-radius: 0.9rem !important;
        }

        /*
         * Existing score/insight banners stay prominent without dominating
         * the page. This preserves Savings Health and other intelligence.
         */
        .loop-financial-house-shell main section[class*="bg-gradient-to-r"] {
          box-shadow: var(--flow-shadow-raised) !important;
        }

        /* Improve table readability on 13-inch laptops without removing columns. */
        .loop-financial-house-shell main table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
        }

        .loop-financial-house-shell main thead th {
          color: #64748b;
          font-size: 0.7rem;
          font-weight: 800;
          letter-spacing: 0.035em;
          text-transform: uppercase;
        }

        .loop-financial-house-shell main tbody tr {
          transition: background-color 140ms ease;
        }

        .loop-financial-house-shell main tbody tr:hover {
          background: rgba(248, 250, 252, 0.85);
        }

        /* Preserve all current chart types and geometry. */
        .loop-financial-house-shell .recharts-wrapper,
        .loop-financial-house-shell .recharts-surface,
        .loop-financial-house-shell svg,
        .loop-financial-house-shell canvas {
          max-width: 100%;
        }

        /* Do not hide legends, dots, slices, axes or tooltips. */
        .loop-financial-house-shell .recharts-legend-wrapper,
        .loop-financial-house-shell .recharts-tooltip-wrapper {
          opacity: 1 !important;
          visibility: visible !important;
        }

        /*
         * Give visualisations breathing room rather than replacing them.
         * Works for current donut/pie, line and calendar cards.
         */
        .loop-financial-house-shell main [class*="h-56"],
        .loop-financial-house-shell main [class*="h-64"] {
          min-height: 14rem;
        }

        /* Inputs/forms retain current logic; only visual consistency changes. */
        .loop-financial-house-shell main input:not([type="checkbox"]):not([type="radio"]),
        .loop-financial-house-shell main select,
        .loop-financial-house-shell main textarea {
          border-radius: 0.9rem !important;
          border-color: #dbe3ec !important;
          background-color: rgba(255, 255, 255, 0.98);
        }

        .loop-financial-house-shell main input:focus,
        .loop-financial-house-shell main select:focus,
        .loop-financial-house-shell main textarea:focus {
          outline: none;
          box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.10);
        }

        /*
         * Spending is allowed to retain orange as semantic emphasis,
         * Income/Savings remain green. We tint rather than repaint.
         */
        .loop-financial-house-shell[data-flow-section="income"] main {
          --flow-accent: var(--flow-green);
          --flow-accent-soft: var(--flow-green-soft);
        }

        .loop-financial-house-shell[data-flow-section="spending"] main {
          --flow-accent: var(--flow-orange);
          --flow-accent-soft: var(--flow-orange-soft);
        }

        .loop-financial-house-shell[data-flow-section="flow"] main {
          --flow-accent: var(--flow-green);
          --flow-accent-soft: var(--flow-green-soft);
        }

        /*
         * Laptop-first density. A 13-inch screen should show useful evidence
         * above the fold; larger screens naturally gain more whitespace.
         */
        @media (min-width: 1024px) {
          .loop-financial-house-shell main {
            padding-top: 1.1rem !important;
            padding-bottom: 4.5rem !important;
          }

          .loop-financial-house-shell main > * + * {
            margin-top: 1.15rem;
          }
        }

        /*
         * Ultra-wide screens: do not let cards become comically stretched.
         * The route remains 95vw but reading areas keep sensible line lengths.
         */
        @media (min-width: 1800px) {
          .loop-financial-house-shell main p {
            max-width: 78ch;
          }
        }

        /*
         * Tablet/mobile: existing component-specific card layouts continue to
         * handle content. We only reduce outside padding and keep tab navigation
         * horizontally usable.
         */
        @media (max-width: 767px) {
          .loop-financial-house-shell main {
            width: 100% !important;
            padding-inline: 0.85rem !important;
          }

          .loop-financial-house-shell main nav[aria-label="Financial Flow sections"] {
            top: 0.4rem;
            overflow-x: auto;
            grid-auto-flow: column;
            grid-auto-columns: minmax(8rem, 1fr);
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
            scroll-behavior: auto !important;
            transition-duration: 0.01ms !important;
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
          }
        }
      `}</style>
    </div>
  );
}

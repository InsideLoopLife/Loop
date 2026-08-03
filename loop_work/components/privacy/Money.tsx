"use client";

import { usePrivacyMode } from "./PrivacyModeProvider";

function formatGbp(amount: number) {
  const sign = amount < 0 ? "-" : "";
  return `${sign}£${Math.abs(amount).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatFakeCurrency(amount: number, seed: number, name: string) {
  const fake = amount * seed;
  const sign = fake < 0 ? "-" : "";
  return `${sign}${Math.abs(fake).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ${name}`;
}

/**
 * Wraps any real money amount. Renders normally when privacy mode is off.
 * In "blur" mode, hides the real figure behind a CSS blur (tap-to-reveal
 * still works via the shared toggle). In "fake_currency" mode, shows a
 * per-user-consistent transformed amount in a made-up currency instead —
 * relative proportions between different Money values stay meaningful,
 * the absolute figure doesn't.
 *
 * Only ever wrap actual currency amounts in this — percentages, ratios,
 * and other non-money numbers should be rendered directly by the caller,
 * completely unaffected by privacy mode, exactly as the feature intends
 * ("see percentages, not the pound figures behind them").
 */
export function Money({ amount, className }: { amount: number; className?: string }) {
  const { mode, fakeCurrencySeed, fakeCurrencyName, revealed } = usePrivacyMode();

  if (mode === "off" || revealed) {
    return <span className={className}>{formatGbp(amount)}</span>;
  }

  if (mode === "fake_currency") {
    return <span className={className}>{formatFakeCurrency(amount, fakeCurrencySeed, fakeCurrencyName)}</span>;
  }

  // blur mode: real markup stays in the DOM (so page structure/width
  // doesn't jump when revealed), just visually obscured.
  return (
    <span className={`${className || ""} select-none blur-sm`.trim()} aria-label="Hidden by privacy mode">
      {formatGbp(amount)}
    </span>
  );
}

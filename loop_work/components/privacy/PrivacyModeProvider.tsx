"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { PrivacyMode } from "@/lib/privacy/get-privacy-settings";

type PrivacyContextValue = {
  mode: PrivacyMode;
  fakeCurrencySeed: number;
  fakeCurrencyName: string;
  // Tap-to-reveal: lets someone briefly see real numbers themselves
  // (e.g. to double-check something) without turning privacy mode off
  // entirely. Resets back to hidden on next page load — deliberately not
  // persisted, so it can't accidentally stay revealed.
  revealed: boolean;
  toggleRevealed: () => void;
};

const PrivacyContext = createContext<PrivacyContextValue>({
  mode: "off",
  fakeCurrencySeed: 1,
  fakeCurrencyName: "Credits",
  revealed: false,
  toggleRevealed: () => {},
});

export function PrivacyModeProvider({
  mode,
  fakeCurrencySeed,
  fakeCurrencyName,
  children,
}: {
  mode: PrivacyMode;
  fakeCurrencySeed: number;
  fakeCurrencyName: string;
  children: ReactNode;
}) {
  const [revealed, setRevealed] = useState(false);
  return (
    <PrivacyContext.Provider
      value={{ mode, fakeCurrencySeed, fakeCurrencyName, revealed, toggleRevealed: () => setRevealed((v) => !v) }}
    >
      {children}
    </PrivacyContext.Provider>
  );
}

export function usePrivacyMode() {
  return useContext(PrivacyContext);
}

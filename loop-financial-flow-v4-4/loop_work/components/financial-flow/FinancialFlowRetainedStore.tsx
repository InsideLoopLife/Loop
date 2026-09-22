"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type RetainedFlowSection = "flow" | "income" | "spending" | "savings";

export type RetainedFlowSummary = {
  month: string;
  income: number;
  spending: number;
  savings: number;
  available: number;
  savingsRate: number;
  scopeLabel?: string;
};

type RetainedEnvelope<T> = {
  value: T;
  writtenAt: number;
};

type FinancialFlowMemory = {
  intendedSection: RetainedFlowSection | null;
  intendedMonth: string | null;
  summary: RetainedEnvelope<RetainedFlowSummary> | null;
  spending: RetainedEnvelope<Record<string, unknown>> | null;
  savings: RetainedEnvelope<Record<string, unknown>> | null;
};

const TTL_MS = 10 * 60 * 1000;

const memory: FinancialFlowMemory = {
  intendedSection: null,
  intendedMonth: null,
  summary: null,
  spending: null,
  savings: null,
};

function fresh<T>(envelope: RetainedEnvelope<T> | null): T | null {
  if (!envelope) return null;
  if (Date.now() - envelope.writtenAt > TTL_MS) return null;
  return envelope.value;
}

type ContextValue = {
  intendedSection: RetainedFlowSection | null;
  intendedMonth: string | null;
  summary: RetainedFlowSummary | null;
  spending: Record<string, unknown> | null;
  savings: Record<string, unknown> | null;
  beginTransition: (section: RetainedFlowSection, month?: string | null) => void;
  rememberSummary: (summary: RetainedFlowSummary) => void;
  rememberSpending: (props: Record<string, unknown>) => void;
  rememberSavings: (props: Record<string, unknown>) => void;
};

const Context = createContext<ContextValue | null>(null);

export function FinancialFlowRetainedProvider({ children }: { children: ReactNode }) {
  const [, render] = useState(0);
  const refresh = useCallback(() => render((value) => value + 1), []);

  const beginTransition = useCallback((section: RetainedFlowSection, month?: string | null) => {
    memory.intendedSection = section;
    memory.intendedMonth = month || memory.intendedMonth;
    refresh();
  }, [refresh]);

  const rememberSummary = useCallback((summary: RetainedFlowSummary) => {
    memory.summary = { value: summary, writtenAt: Date.now() };
    memory.intendedMonth = summary.month;
    refresh();
  }, [refresh]);

  const rememberSpending = useCallback((props: Record<string, unknown>) => {
    memory.spending = { value: props, writtenAt: Date.now() };
    refresh();
  }, [refresh]);

  const rememberSavings = useCallback((props: Record<string, unknown>) => {
    memory.savings = { value: props, writtenAt: Date.now() };
    refresh();
  }, [refresh]);

  const value = useMemo<ContextValue>(() => ({
    intendedSection: memory.intendedSection,
    intendedMonth: memory.intendedMonth,
    summary: fresh(memory.summary),
    spending: fresh(memory.spending),
    savings: fresh(memory.savings),
    beginTransition,
    rememberSummary,
    rememberSpending,
    rememberSavings,
  }), [
    beginTransition,
    rememberSavings,
    rememberSpending,
    rememberSummary,
    memory.intendedMonth,
    memory.intendedSection,
    memory.savings?.writtenAt,
    memory.spending?.writtenAt,
    memory.summary?.writtenAt,
  ]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useFinancialFlowRetained() {
  const context = useContext(Context);
  if (!context) {
    throw new Error("useFinancialFlowRetained must be used inside FinancialFlowRetainedProvider");
  }
  return context;
}

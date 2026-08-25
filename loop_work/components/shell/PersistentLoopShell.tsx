"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Nav } from "@/components/Nav";
import { PersistentNavProvider } from "@/components/shell/PersistentNavContext";
import { FinancialFlowRetainedProvider } from "@/components/financial-flow/FinancialFlowRetainedStore";

const APP_ROUTE_PREFIXES = [
  "/briefing", "/dashboard", "/financial-flow", "/income", "/spending",
  "/accounts", "/savings", "/pots", "/investments", "/pensions",
  "/mortgage", "/house", "/affordability", "/net-worth", "/retirement",
  "/nutrition", "/lifestyle", "/account", "/notifications", "/help",
  "/admin", "/loopwatch",
] as const;

function usesPersistentShell(pathname: string) {
  return APP_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function PersistentLoopShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (!usesPersistentShell(pathname)) return children;

  return (
    <>
      <Nav persistent />
      <FinancialFlowRetainedProvider>
        <PersistentNavProvider>{children}</PersistentNavProvider>
      </FinancialFlowRetainedProvider>
    </>
  );
}

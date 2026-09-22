"use client";

import { createContext, useContext, type ReactNode } from "react";

const PersistentNavContext = createContext(false);

export function PersistentNavProvider({ children }: { children: ReactNode }) {
  return <PersistentNavContext.Provider value>{children}</PersistentNavContext.Provider>;
}

export function usePersistentNavMounted() {
  return useContext(PersistentNavContext);
}

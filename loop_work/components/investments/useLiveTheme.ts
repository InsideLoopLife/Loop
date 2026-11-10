"use client";

// Light or dark for the live investments page. One choice for the whole page:
// the component that owns the page (applyToPage) puts `loop-live-dark` on
// <html>, which re-points the calm tokens and the top navigation at dark
// colours. Every caller stays in step through a window event.
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "loop:investments-theme";
const EVENT = "loop:live-theme";
type Theme = "dark" | "light";

export function useLiveTheme(applyToPage = false) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    let saved: string | null = null;
    try { saved = window.localStorage.getItem(STORAGE_KEY); } catch { /* private mode */ }
    setTheme(saved === "dark" || saved === "light"
      ? saved
      : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const onChange = (event: Event) => {
      const next = (event as CustomEvent<Theme>).detail;
      if (next === "dark" || next === "light") setTheme(next);
    };
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);

  useEffect(() => {
    if (!applyToPage) return;
    const root = document.documentElement;
    root.classList.toggle("loop-live-dark", theme === "dark");
    return () => root.classList.remove("loop-live-dark");
  }, [theme, applyToPage]);

  const toggle = useCallback(() => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* private mode */ }
    window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
  }, [theme]);

  return { dark: theme === "dark", toggle };
}

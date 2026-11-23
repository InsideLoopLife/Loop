"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Keeps the notification centre fresh without a visible banner.
export function NotificationAutoRefresh({ intervalMs = 30000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => router.refresh();
    window.addEventListener("loop:notifications-updated", refresh);
    // Skip while the tab is hidden so an open-for-days tab doesn't keep re-rendering the page on the server.
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") refresh(); }, intervalMs);
    return () => {
      window.removeEventListener("loop:notifications-updated", refresh);
      window.clearInterval(timer);
    };
  }, [router, intervalMs]);
  return null;
}

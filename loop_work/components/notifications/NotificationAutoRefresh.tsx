"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Keeps the notification centre fresh without a visible banner.
export function NotificationAutoRefresh({ intervalMs = 30000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => router.refresh();
    window.addEventListener("loop:notifications-updated", refresh);
    const timer = window.setInterval(refresh, intervalMs);
    return () => {
      window.removeEventListener("loop:notifications-updated", refresh);
      window.clearInterval(timer);
    };
  }, [router, intervalMs]);
  return null;
}

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { WidgetSize, WidgetViewport } from "@/lib/dashboard/types";

function deriveViewport(width: number, height: number, isMobile: boolean): WidgetViewport {
  const mode = width < 360 || height < 150
    ? "summary"
    : width >= 760 && height >= 260
      ? "immersive"
      : width >= 480 || height >= 230
        ? "detailed"
        : "standard";
  const horizon = mode === "immersive" ? (isMobile ? 1 : 6) : mode === "detailed" ? (isMobile ? 1 : 3) : 1;
  return { width, height, mode, isMobile, historyMonths: horizon, forecastMonths: horizon };
}

export function ResponsiveWidgetContent({ size, children }: { size: WidgetSize; children: (viewport: WidgetViewport) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<WidgetViewport>(() => deriveViewport(size.w * 280, size.h * 140, false));

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => {
      const rect = node.getBoundingClientRect();
      const next = deriveViewport(rect.width, rect.height, window.matchMedia("(max-width: 767px)").matches);
      setViewport((current) => Math.abs(current.width - next.width) < 2 && Math.abs(current.height - next.height) < 2 && current.isMobile === next.isMobile ? current : next);
    };
    const observer = new ResizeObserver(update);
    observer.observe(node);
    update();
    window.addEventListener("orientationchange", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return <div ref={ref} className="widget-responsive-content">{children(viewport)}</div>;
}

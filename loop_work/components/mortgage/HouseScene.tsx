"use client";

// The home in 3D. The vector drawing shows straight away (and on devices
// without WebGL); the 3D renderer loads in the background and replaces it.
import { useEffect, useRef, useState } from "react";
import { H, HouseIllustration, Hotspots, W, type HouseHotspot, type HouseStyle } from "@/components/mortgage/HouseIllustration";
import type { HouseRenderer } from "@/components/mortgage/house3d";

function Sky({ night }: { night: boolean }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="house3d-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={night ? "#0b1322" : "#9fc7e6"} />
          <stop offset="1" stopColor={night ? "#1f2c44" : "#e6f0f6"} />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill="url(#house3d-sky)" />
      {night ? (
        <g>
          <circle cx={322} cy={28} r={9} fill="#f3ecd6" opacity={0.92} />
          {[[24, 20], [70, 44], [118, 16], [160, 34], [212, 14], [252, 40], [292, 22], [40, 76], [190, 58], [96, 96], [338, 70]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i % 3 ? 0.7 : 1.1} fill="#e8eefb" opacity={0.8} />)}
        </g>
      ) : (
        <g fill="#ffffff" opacity={0.75}>
          <ellipse cx={62} cy={36} rx={26} ry={8} />
          <ellipse cx={80} cy={30} rx={16} ry={8} />
          <ellipse cx={290} cy={52} rx={30} ry={8} />
          <ellipse cx={306} cy={46} rx={14} ry={7} />
        </g>
      )}
    </svg>
  );
}

export function HouseScene({ style, className, hotspots }: { style: HouseStyle; className?: string; hotspots?: HouseHotspot[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<HouseRenderer | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [anchors, setAnchors] = useState<Record<string, [number, number]>>({});
  const [hour, setHour] = useState<number | null>(null);
  useEffect(() => setHour(new Date().getHours()), []);
  const night = style.scene === "night" || (style.scene !== "day" && hour != null && (hour >= 18 || hour < 7));
  const key = JSON.stringify(style) + night;

  useEffect(() => {
    let cancelled = false;
    const draw = () => {
      const el = wrap.current;
      if (!el || !renderer.current) return;
      const width = el.clientWidth;
      const height = Math.round((width * H) / W);
      if (!width) return;
      setAnchors(renderer.current.render(style, night, width, height));
      setReady(true);
    };
    (async () => {
      try {
        if (!renderer.current) {
          const mod = await import("@/components/mortgage/house3d");
          if (cancelled || !canvas.current) return;
          renderer.current = mod.createHouseRenderer(canvas.current, W, H);
        }
        draw();
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    const ro = new ResizeObserver(() => { try { draw(); } catch { setFailed(true); } });
    if (wrap.current) ro.observe(wrap.current);
    return () => { cancelled = true; ro.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => () => { renderer.current?.dispose(); renderer.current = null; }, []);

  if (failed) return <HouseIllustration style={style} className={className} hotspots={hotspots} />;
  return (
    <div ref={wrap} className={`relative ${className ?? ""}`} style={{ aspectRatio: `${W} / ${H}` }}>
      {!ready ? <HouseIllustration style={style} className="absolute inset-0 h-full w-full" /> : <Sky night={night} />}
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" style={{ opacity: ready ? 1 : 0, transition: "opacity .3s" }} role="img" aria-label={`3D drawing of a ${style.type.replace("_", " ")}`} />
      {ready && hotspots?.length ? (
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full">
          <Hotspots items={hotspots} anchors={anchors as any} />
        </svg>
      ) : null}
    </div>
  );
}

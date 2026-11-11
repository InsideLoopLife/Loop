"use client";

// A small 3D-style model of the person's home: the front and one side of the
// house on a patch of ground, seen from above at an angle, with its drive,
// garage, cars and garden. Attached homes are drawn on their own; being
// attached only decides the layout (which side shows, where the chimney is).
// Day or night follows the clock unless chosen.
import { useEffect, useId, useState, type ReactElement } from "react";

export type Vehicle = {
  /** Body style; "suv" is the older name for "crossover". */
  body?: "hatch" | "saloon" | "fastback" | "crossover" | "coupe_suv" | "large_suv" | "suv";
  ev?: boolean;
  colour?: string;
};

export type HouseStyle = {
  type: "flat" | "terraced" | "end_terrace" | "semi" | "detached" | "bungalow";
  storeys?: number;
  garage?: "none" | "integral" | "single" | "double";
  garageSide?: "left" | "right";
  /** A single or double garage joined to the house, or a separate one down the side. */
  garageAttached?: boolean;
  garageColour?: string;
  /** Which side the neighbour is on, for a semi or end terrace. */
  attachedSide?: "left" | "right";
  /** Where the front door is, seen from the street. */
  doorSide?: "left" | "centre" | "right";
  door?: string;
  brick?: string;
  render?: "none" | "upper" | "lower" | "full";
  renderColour?: string;
  roof?: string;
  /** How the loft room's window looks: flat in the roof, or a dormer that sticks out. */
  loftWindow?: "skylight" | "dormer" | "flat_dormer";
  grass?: boolean;
  shrubs?: boolean;
  driveway?: "none" | "garage" | "house" | "full";
  /** Cars parked on the drive. */
  cars?: 0 | 1 | 2;
  vehicles?: Vehicle[];
  /** Day, night, or follow the clock. */
  scene?: "auto" | "day" | "night";
  solar?: boolean;
  charger?: boolean;
  chargerSide?: "front" | "side";
};

/** Something to point at on the drawing, for an infographic: a cost, a reading. */
export type HouseHotspot = {
  id: "electricity" | "gas" | "water" | "solar" | "charger" | "home" | "car";
  label: string;
  value: string;
  onClick?: () => void;
};

export const DOOR_COLOURS = ["#1f4f3d", "#24324a", "#7a2626", "#2f2f2f", "#5d6d7a", "#ffffff"];
export const BRICK_COLOURS: Array<[string, string]> = [["#a8513a", "Red"], ["#b86a45", "Orange"], ["#8a4a36", "Brown"], ["#c9a46e", "Buff"], ["#9c8f84", "Grey"]];
export const RENDER_COLOURS: Array<[string, string]> = [["#f3f1ea", "White"], ["#ece2c9", "Cream"], ["#d3d5d1", "Grey"], ["#c3cdb6", "Sage"]];
export const ROOF_COLOURS: Array<[string, string]> = [["#4a505a", "Slate grey"], ["#8a4632", "Red tile"], ["#5e4537", "Brown tile"], ["#33373d", "Charcoal"]];
export const GARAGE_COLOURS: Array<[string, string]> = [["#ecebe7", "White"], ["#3c4148", "Anthracite"], ["#1f2329", "Black"], ["#7a5a3c", "Oak"], ["#2f4f3f", "Green"]];
export const CAR_COLOURS: Array<[string, string]> = [["#34404f", "Midnight"], ["#eceeef", "White"], ["#9aa3ad", "Silver"], ["#1d1f22", "Black"], ["#8c2b2b", "Red"], ["#2f5a7a", "Blue"]];
export const DEFAULT_VEHICLES: Vehicle[] = [{ body: "fastback", ev: true, colour: CAR_COLOURS[0][0] }, { body: "crossover", ev: true, colour: CAR_COLOURS[1][0] }];

/** A sensible starting drawing from the property type LOOP already has. */
export function defaultHouseStyle(propertyType?: string | null): HouseStyle {
  const t = String(propertyType || "").toLowerCase();
  const base = { grass: true, shrubs: true, brick: BRICK_COLOURS[0][0], roof: ROOF_COLOURS[0][0], render: "none" as const };
  if (/flat|apartment|maisonette/.test(t)) return { ...base, type: "flat", storeys: 4 };
  if (/bungalow/.test(t)) return { ...base, type: "bungalow", storeys: 1, garage: "none", driveway: "house" };
  if (/end/.test(t) && /terrace/.test(t)) return { ...base, type: "end_terrace", storeys: 2, attachedSide: "left" };
  if (/terrace/.test(t)) return { ...base, type: "terraced", storeys: 2 };
  if (/semi/.test(t)) return { ...base, type: "semi", storeys: 2, attachedSide: "left", garage: "none", driveway: "house" };
  if (/detached/.test(t)) return { ...base, type: "detached", storeys: 2, garage: "single", garageSide: "right", driveway: "garage" };
  return { ...base, type: "semi", storeys: 2, attachedSide: "left", garage: "none", driveway: "house" };
}

const W = 360;
const H = 250;
/** World units are tenths of a metre. x runs along the front, y is up, z goes back from the front wall. */
const FH = 27; // storey height
const PLOT = -58; // front of the plot
const PAVE = 10; // pavement in front of it

/* ---------- colour helpers ---------- */

const hex = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = (c: number[]) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
/** Darken (positive) or lighten (negative) a colour. */
const shade = (h: string, amount: number) => toHex(hex(h).map((v) => (amount >= 0 ? v * (1 - amount) : v + (255 - v) * -amount)));
const mix = (a: string, b: string, t: number) => { const x = hex(a); const y = hex(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };

/* ---------- the view: a fixed angle from above, front-right ---------- */

type V = {
  k: number;
  P: (x: number, y: number, z: number) => [number, number];
  pts: (list: Array<[number, number, number]>) => string;
  /** Drawing on the plane z = const, local (x, -height). */
  front: (z: number) => string;
  /** Drawing on the plane x = const, local (z, -height). */
  side: (x: number) => string;
  /** Drawing on the plane y = const, local (x, z). */
  flat: (y: number) => string;
  /** Drawing on a roof slope from (za, ya) to (zb, yb), local (x, 0..1). */
  slope: (za: number, ya: number, zb: number, yb: number) => string;
};

const EX = [0.97, 0.21];
const EZ = [0.6, -0.34];

function makeView(k: number, ox: number, oy: number): V {
  const ex = [EX[0] * k, EX[1] * k];
  const ez = [EZ[0] * k, EZ[1] * k];
  const P = (x: number, y: number, z: number): [number, number] => [ox + x * ex[0] + z * ez[0], oy + x * ex[1] + z * ez[1] - y * k];
  const m = (...n: number[]) => `matrix(${n.map((v) => +v.toFixed(4)).join(" ")})`;
  return {
    k,
    P,
    pts: (list) => list.map(([x, y, z]) => P(x, y, z).map((n) => n.toFixed(2)).join(",")).join(" "),
    front: (z) => m(ex[0], ex[1], 0, k, ox + z * ez[0], oy + z * ez[1]),
    side: (x) => m(ez[0], ez[1], 0, k, ox + x * ex[0], oy + x * ex[1]),
    flat: (y) => m(ex[0], ex[1], ez[0], ez[1], ox, oy - y * k),
    slope: (za, ya, zb, yb) => m(ex[0], ex[1], (zb - za) * ez[0], (zb - za) * ez[1] - (yb - ya) * k, ox + za * ez[0], oy + za * ez[1] - ya * k),
  };
}

/* ---------- palette ---------- */

type Pal = ReturnType<typeof palette>;
function palette(night: boolean) {
  const dim = (c: string) => (night ? mix(shade(c, 0.5), "#1c2740", 0.25) : c);
  return {
    night,
    dim,
    skyTop: night ? "#0b1322" : "#9fc7e6",
    skyBottom: night ? "#1f2c44" : "#e6f0f6",
    lawn: dim("#8fb86e"),
    paving: dim("#cfc8bd"),
    tarmac: dim("#5f636a"),
    pavement: dim("#d6d4cf"),
    kerb: dim("#bdbab3"),
    soil: dim("#9a7454"),
    soilSide: dim("#7d5c42"),
    bed: dim("#7a5a40"),
    frame: night ? "#9aa0a8" : "#f7f7f4",
    sill: night ? "#8c9198" : "#e4e1da",
    fascia: night ? "#a3a8af" : "#f7f7f4",
    pipe: night ? "#2a2e35" : "#4a4f57",
    shadow: night ? "rgba(0,0,0,0.28)" : "rgba(40,45,60,0.16)",
    leaf: dim("#6f9a55"),
    leafLight: dim("#8db86b"),
    leafDark: dim("#55803f"),
    trunk: dim("#7b5a43"),
    darkGlass: "#273142",
  };
}

type Ids = { sky: string; glass: string; lit: string; brick: string; glow: string; sheen: string };

/* ---------- small parts ---------- */

type Win = { x: number; h1: number; w: number; h: number };

function Window({ win, pal, ids, lit, lintel = true }: { win: Win; pal: Pal; ids: Ids; lit: boolean; lintel?: boolean }) {
  const { x, h1, w, h } = win;
  const top = -(h1 + h);
  return (
    <g>
      {lintel ? <rect x={x - 1.8} y={top - 4} width={w + 3.6} height={2.6} fill="#000" opacity={0.14} /> : null}
      <rect x={x - 1.2} y={top - 1.2} width={w + 2.4} height={h + 2.4} fill={pal.frame} />
      <rect x={x} y={top} width={w} height={h} fill={pal.night ? (lit ? `url(#${ids.lit})` : pal.darkGlass) : `url(#${ids.glass})`} />
      {!pal.night ? <polygon points={`${x + w * 0.15},${top + h} ${x + w * 0.45},${top} ${x + w * 0.62},${top} ${x + w * 0.32},${top + h}`} fill="#ffffff" opacity={0.22} /> : null}
      <rect x={x} y={top} width={1.1} height={h} fill="#000" opacity={0.16} />
      <rect x={x} y={top} width={w} height={1.1} fill="#000" opacity={0.16} />
      {w > 13 ? <rect x={x + w / 2 - 0.5} y={top} width={1} height={h} fill={pal.frame} /> : null}
      <rect x={x} y={top + h * 0.3} width={w} height={0.9} fill={pal.frame} />
      <rect x={x - 2} y={-h1} width={w + 4} height={1.8} fill={pal.sill} />
    </g>
  );
}

function Door({ x, w, colour, pal }: { x: number; w: number; colour: string; pal: Pal }) {
  const c = pal.dim(colour);
  return (
    <g>
      <rect x={x - 1.2} y={-21.2} width={w + 2.4} height={21.2} fill={pal.frame} />
      <rect x={x} y={-20} width={w} height={20} fill={c} />
      <rect x={x + 2} y={-18} width={w - 4} height={5} fill={pal.night ? "#f3cf86" : "#c9d8e2"} opacity={0.85} />
      <rect x={x + 2} y={-11} width={w - 4} height={9} fill={shade(c, 0.12)} />
      <rect x={x + w - 2.6} y={-10.5} width={1} height={2.2} fill="#d8c58a" />
    </g>
  );
}

function GarageDoor({ x, w, h, colour, pal }: { x: number; w: number; h: number; colour: string; pal: Pal }) {
  const c = pal.dim(colour);
  return (
    <g>
      <rect x={x - 1.2} y={-(h + 1.2)} width={w + 2.4} height={h + 1.2} fill={pal.frame} />
      <rect x={x} y={-h} width={w} height={h} fill={c} />
      {Array.from({ length: Math.floor(h / 3.8) }, (_, i) => <rect key={i} x={x} y={-h + (i + 1) * 3.8} width={w} height={0.6} fill="#000" opacity={0.12} />)}
      <rect x={x} y={-h} width={w} height={1.2} fill="#000" opacity={0.12} />
    </g>
  );
}

function Canopy({ v, x, w, h, pal, roof }: { v: V; x: number; w: number; h: number; pal: Pal; roof: string }) {
  const d = 7;
  return (
    <g>
      <polygon points={v.pts([[x, h, 0], [x + w, h, 0], [x + w, h, -d], [x, h, -d]])} fill={pal.dim(shade(roof, -0.15))} />
      <polygon points={v.pts([[x, h, -d], [x + w, h, -d], [x + w, h - 1.6, -d], [x, h - 1.6, -d]])} fill={pal.fascia} />
      <polygon points={v.pts([[x + w, h, -d], [x + w, h, 0], [x + w, h - 1.6, 0], [x + w, h - 1.6, -d]])} fill={shade(pal.fascia, 0.15)} />
    </g>
  );
}

/* ---------- the house ---------- */

type Walls = { ground: string; upper: string; groundBrick: boolean; upperBrick: boolean };

type HouseSpec = {
  w: number;
  d: number;
  floors: number;
  loft: boolean;
  loftWindow: "skylight" | "dormer" | "flat_dormer";
  /** The side wall we see is shared with a neighbour (a mid terrace): keep it plain. */
  partyRight: boolean;
  chimney: "left" | "right";
  wins: Win[];
  door: { x: number; w: number } | null;
  integralDoor: { x: number; w: number } | null;
  solar: boolean;
  meters: boolean;
  sideCharger: boolean;
};

function roofGeometry(spec: HouseSpec) {
  const wallH = spec.floors * FH;
  const rise = (spec.d / 2) * (spec.floors === 1 ? 0.62 : 0.72);
  const ov = 3;
  const eave = wallH - 1.5;
  const ridge = wallH + rise;
  const halfZ = spec.d / 2;
  const slopeY = (z: number) => eave + (ridge - eave) * ((z + ov) / (halfZ + ov));
  const slopeZ = (y: number) => -ov + ((y - eave) / (ridge - eave)) * (halfZ + ov);
  return { wallH, rise, ov, eave, ridge, halfZ, xl: -ov, xr: spec.w + ov, slopeY, slopeZ };
}

function dormerGeometry(spec: HouseSpec) {
  const g = roofGeometry(spec);
  const dw = Math.min(22, spec.w * 0.3);
  const dx = spec.w / 2 - dw / 2;
  const yb = g.wallH + 1.5;
  const yt = yb + 14;
  const yr = yt + 5.5;
  return { dw, dx, yb, yt, yr, zf: g.slopeZ(yb), zt: g.slopeZ(yt), ze: g.slopeZ(yt - 0.6), zr: g.slopeZ(yr) };
}

/** Meter boxes on the side wall, near the front. */
const SIDE_METER_Z = 7;
const SIDE_CHARGER_Z = 16;

function House({ v, spec, pal, ids, s, walls, roof }: { v: V; spec: HouseSpec; pal: Pal; ids: Ids; s: HouseStyle; walls: Walls; roof: string }) {
  const { w, d } = spec;
  const g = roofGeometry(spec);
  const { wallH, ov, eave, ridge, halfZ, xl, xr } = g;
  const ground = pal.dim(walls.ground);
  const upper = pal.dim(spec.floors > 1 ? walls.upper : walls.ground);
  const upperBrick = spec.floors > 1 ? walls.upperBrick : walls.groundBrick;
  const sideG = shade(ground, 0.2);
  const sideU = shade(upper, 0.2);
  const roofC = pal.dim(roof);
  const dormer = spec.loft && spec.loftWindow !== "skylight" ? dormerGeometry(spec) : null;
  const glassFill = (lit = true) => (pal.night ? (lit ? `url(#${ids.lit})` : pal.darkGlass) : `url(#${ids.glass})`);

  const chim = (() => {
    const cw = 9;
    const cx = spec.chimney === "left" ? 4 : w - 4 - cw;
    const zf = halfZ - 4;
    return { cx, cw, zf, zb: zf + 8, yb: g.slopeY(zf), top: ridge + 11 };
  })();
  const lowBand = Math.min(FH, wallH);
  const sideUpperPts = spec.floors > 1 ? `0,${-FH} ${d},${-FH} ${d},${-wallH} ${halfZ},${-ridge} 0,${-wallH}` : `0,${-wallH} ${halfZ},${-ridge} ${d},${-wallH}`;

  return (
    <g>
      {/* Right side wall with its gable */}
      <g transform={v.side(w)}>
        <rect x={0} y={-lowBand} width={d} height={lowBand} fill={sideG} />
        {walls.groundBrick ? <rect x={0} y={-lowBand} width={d} height={lowBand} fill={`url(#${ids.brick})`} /> : null}
        <polygon points={sideUpperPts} fill={sideU} />
        {upperBrick ? <polygon points={sideUpperPts} fill={`url(#${ids.brick})`} /> : null}
        {spec.floors > 1 && walls.ground !== walls.upper ? <rect x={0} y={-FH - 0.7} width={d} height={1.4} fill="#000" opacity={0.08} /> : null}
        {!spec.partyRight ? (
          <g>
            {spec.floors > 1 ? <Window win={{ x: d * 0.55 - 4, h1: FH + 8, w: 8, h: 10 }} pal={pal} ids={ids} lit /> : null}
            {spec.loft ? <Window win={{ x: halfZ - 5, h1: wallH + 6, w: 10, h: 9 }} pal={pal} ids={ids} lit lintel={false} /> : null}
            {spec.meters ? (
              <g>
                <rect x={SIDE_METER_Z} y={-12.6} width={5.4} height={5.6} rx={0.6} fill={pal.night ? "#9aa0a8" : "#f2f1ec"} />
                <rect x={SIDE_METER_Z} y={-6.4} width={5.4} height={5.6} rx={0.6} fill={pal.night ? "#8b9198" : "#e6e4dd"} />
                <rect x={SIDE_METER_Z + 1} y={-11} width={3.4} height={0.7} fill="#000" opacity={0.2} />
                <rect x={SIDE_METER_Z + 1} y={-4.8} width={3.4} height={0.7} fill="#000" opacity={0.2} />
              </g>
            ) : null}
            {spec.sideCharger ? (
              <g>
                <rect x={SIDE_CHARGER_Z} y={-16.6} width={3.6} height={5.6} rx={0.9} fill={pal.night ? "#c9ced4" : "#f6f7f8"} />
                <rect x={SIDE_CHARGER_Z + 0.7} y={-15.8} width={2.2} height={1.9} rx={0.3} fill="#20262e" />
                <circle cx={SIDE_CHARGER_Z + 1.8} cy={-12.5} r={0.5} fill="#34d399" />
              </g>
            ) : null}
          </g>
        ) : null}
        <rect x={0} y={-wallH} width={d} height={1.6} fill="#000" opacity={0.12} />
      </g>

      {/* Front wall */}
      <g transform={v.front(0)}>
        <rect x={0} y={-lowBand} width={w} height={lowBand} fill={ground} />
        {walls.groundBrick ? <rect x={0} y={-lowBand} width={w} height={lowBand} fill={`url(#${ids.brick})`} /> : null}
        {spec.floors > 1 ? <rect x={0} y={-wallH} width={w} height={wallH - FH} fill={upper} /> : null}
        {spec.floors > 1 && upperBrick ? <rect x={0} y={-wallH} width={w} height={wallH - FH} fill={`url(#${ids.brick})`} /> : null}
        {spec.floors > 1 && walls.ground !== walls.upper ? <rect x={0} y={-FH - 0.7} width={w} height={1.4} fill="#000" opacity={0.08} /> : null}
        {spec.wins.map((win, i) => <Window key={i} win={win} pal={pal} ids={ids} lit={i % 4 !== 1} />)}
        {spec.integralDoor ? <GarageDoor x={spec.integralDoor.x} w={spec.integralDoor.w} h={20} colour={s.garageColour || GARAGE_COLOURS[0][0]} pal={pal} /> : null}
        {spec.door ? <Door x={spec.door.x} w={spec.door.w} colour={s.door || DOOR_COLOURS[0]} pal={pal} /> : null}
        <rect x={0} y={-wallH} width={w} height={2} fill="#000" opacity={0.12} />
      </g>
      {spec.door ? <Canopy v={v} x={spec.door.x - 3} w={spec.door.w + 6} h={23.5} pal={pal} roof={roof} /> : null}
      {spec.door && pal.night ? (() => { const [cx, cy] = v.P(spec.door.x + spec.door.w / 2, 16, -2); return <circle cx={cx} cy={cy} r={v.k * 14} fill={`url(#${ids.glow})`} />; })() : null}

      {/* Front roof slope */}
      <polygon points={v.pts([[xl, eave, -ov], [xr, eave, -ov], [xr, ridge, halfZ], [xl, ridge, halfZ]])} fill={roofC} />
      <g transform={v.slope(-ov, eave, halfZ, ridge)}>
        {Array.from({ length: 9 }, (_, i) => <line key={i} x1={xl} x2={xr} y1={(i + 1) / 10} y2={(i + 1) / 10} stroke="#000" strokeOpacity={0.14} strokeWidth={0.7} vectorEffect="non-scaling-stroke" />)}
        {spec.solar ? (() => {
          const rows = [[0.12, 0.43], [0.46, 0.77]];
          const n = Math.max(2, Math.floor((xr - xl - 14) / 11));
          const start = (xl + xr) / 2 - (n * 11 - 1) / 2;
          // Leave room for the loft windows.
          const blocked: Array<[number, number, number]> = dormer
            ? [[dormer.dx - 2, dormer.dx + dormer.dw + 2, (dormer.zr + ov) / (halfZ + ov)]]
            : spec.loft ? [[w * 0.3 - 8, w * 0.3 + 8, 0.55], [w * 0.7 - 8, w * 0.7 + 8, 0.55]] : [];
          return rows.flatMap(([t0, t1], r) => Array.from({ length: n }, (_, i) => {
            const px = start + i * 11;
            if (blocked.some(([a, b, t]) => t0 < t && px + 10 > a && px < b)) return null;
            return (
              <g key={`${r}-${i}`}>
                <rect x={px} y={t0} width={10} height={t1 - t0} fill={pal.night ? "#121a2b" : "#1e2c48"} stroke={pal.night ? "#59636f" : "#cdd5de"} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
                <line x1={px + 5} x2={px + 5} y1={t0} y2={t1} stroke="#3c5178" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
                <line x1={px} x2={px + 10} y1={(t0 + t1) / 2} y2={(t0 + t1) / 2} stroke="#3c5178" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
                {!pal.night ? <polygon points={`${px + 1},${t1} ${px + 4},${t0} ${px + 5.5},${t0} ${px + 2.5},${t1}`} fill="#ffffff" opacity={0.12} /> : null}
              </g>
            );
          }));
        })() : null}
        {spec.loft && spec.loftWindow === "skylight" ? [0.3, 0.7].map((f) => (
          <rect key={f} x={w * f - 6} y={0.2} width={12} height={0.3} fill={glassFill()} stroke={shade(roofC, 0.35)} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
        )) : null}
      </g>

      {/* A dormer that sticks out of the roof */}
      {dormer ? (() => {
        const { dw, dx, yb, yt, yr, zf, zt, ze, zr } = dormer;
        const cheek = sideU;
        const face = upper;
        return (
          <g>
            <polygon points={v.pts([[dx + dw, yb, zf], [dx + dw, yt, zf], [dx + dw, yt, zt]])} fill={cheek} />
            {spec.loftWindow === "dormer" ? (
              <g>
                <polygon points={v.pts([[dx - 1.4, yt - 0.6, zf - 1.4], [dx + dw / 2, yr, zf - 1.4], [dx + dw / 2, yr, zr], [dx - 1.4, yt - 0.6, ze]])} fill={roofC} />
                <polygon points={v.pts([[dx + dw + 1.4, yt - 0.6, zf - 1.4], [dx + dw / 2, yr, zf - 1.4], [dx + dw / 2, yr, zr], [dx + dw + 1.4, yt - 0.6, ze]])} fill={shade(roofC, -0.1)} />
                {(() => { const [p1, p2] = [v.P(dx + dw / 2, yr, zf - 1.4), v.P(dx + dw / 2, yr, zr)]; return <line x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]} stroke={shade(roofC, 0.25)} strokeWidth={v.k * 1.2} strokeLinecap="round" />; })()}
              </g>
            ) : (
              <g>
                <polygon points={v.pts([[dx - 1.2, yt, zf - 1.2], [dx + dw + 1.2, yt, zf - 1.2], [dx + dw + 1.2, yt, zt], [dx - 1.2, yt, zt]])} fill={pal.dim("#6b7078")} />
              </g>
            )}
            <g transform={v.front(zf)}>
              <rect x={dx} y={-yt} width={dw} height={yt - yb} fill={face} />
              {upperBrick ? <rect x={dx} y={-yt} width={dw} height={yt - yb} fill={`url(#${ids.brick})`} /> : null}
              {spec.loftWindow === "dormer" ? <polygon points={`${dx},${-yt} ${dx + dw / 2},${-yr} ${dx + dw},${-yt}`} fill={face} /> : null}
              <Window win={{ x: dx + 3.5, h1: yb + 2.5, w: dw - 7, h: yt - yb - 5.5 }} pal={pal} ids={ids} lit lintel={false} />
              {spec.loftWindow === "flat_dormer" ? <rect x={dx - 1.2} y={-yt - 0.2} width={dw + 2.4} height={2} fill={pal.fascia} /> : null}
            </g>
            {spec.loftWindow === "dormer" ? (
              <g transform={v.front(zf - 1.4)}>
                <polyline points={`${dx - 1.4},${-(yt - 0.6)} ${dx + dw / 2},${-(yr + 0.2)} ${dx + dw + 1.4},${-(yt - 0.6)}`} fill="none" stroke={pal.fascia} strokeWidth={1.6} strokeLinejoin="round" />
              </g>
            ) : null}
          </g>
        );
      })() : null}

      {/* Fascia, gutter and downpipe */}
      <polygon points={v.pts([[xl, eave, -ov], [xr, eave, -ov], [xr, eave - 2.2, -ov], [xl, eave - 2.2, -ov]])} fill={pal.fascia} />
      <polygon points={v.pts([[xl, eave - 2.2, -ov - 1.4], [xr, eave - 2.2, -ov - 1.4], [xr, eave - 3.8, -ov - 1.4], [xl, eave - 3.8, -ov - 1.4]])} fill={pal.pipe} />
      <g transform={v.front(-1)}>
        <rect x={w - 3} y={-(eave - 3.8)} width={1.5} height={eave - 3.8} fill={pal.pipe} />
      </g>
      {/* Gable verge */}
      <g transform={v.side(xr)}>
        <polyline points={`${-ov},${-(eave - 2.6)} ${halfZ},${-(ridge - 2.6)} ${d + ov},${-(eave - 2.6)}`} fill="none" stroke={pal.fascia} strokeWidth={2} strokeLinejoin="round" />
        <polyline points={`${-ov},${-eave} ${halfZ},${-ridge} ${d + ov},${-eave}`} fill="none" stroke={shade(roofC, 0.22)} strokeWidth={2.6} strokeLinejoin="round" />
      </g>
      {/* Ridge */}
      <line x1={v.P(xl, ridge, halfZ)[0]} y1={v.P(xl, ridge, halfZ)[1]} x2={v.P(xr, ridge, halfZ)[0]} y2={v.P(xr, ridge, halfZ)[1]} stroke={shade(roofC, 0.25)} strokeWidth={v.k * 2.2} strokeLinecap="round" />
      {/* Chimney */}
      <g>
        <polygon points={v.pts([[chim.cx, chim.yb, chim.zf], [chim.cx + chim.cw, chim.yb, chim.zf], [chim.cx + chim.cw, chim.top, chim.zf], [chim.cx, chim.top, chim.zf]])} fill={upper} />
        <polygon points={v.pts([[chim.cx + chim.cw, chim.yb, chim.zf], [chim.cx + chim.cw, ridge, chim.zb], [chim.cx + chim.cw, chim.top, chim.zb], [chim.cx + chim.cw, chim.top, chim.zf]])} fill={sideU} />
        <polygon points={v.pts([[chim.cx - 0.8, chim.top, chim.zf - 0.8], [chim.cx + chim.cw + 0.8, chim.top, chim.zf - 0.8], [chim.cx + chim.cw + 0.8, chim.top, chim.zb + 0.8], [chim.cx - 0.8, chim.top, chim.zb + 0.8]])} fill={pal.dim("#b9b4ab")} />
        {[0.3, 0.7].map((f) => {
          const [px, py] = v.P(chim.cx + chim.cw * f, chim.top, chim.zf + 4);
          return <rect key={f} x={px - v.k * 1.3} y={py - v.k * 4} width={v.k * 2.6} height={v.k * 4} rx={v.k * 0.6} fill={pal.dim("#b4643f")} />;
        })}
      </g>
    </g>
  );
}

/** A garage beside the house: flat-roofed when joined on, pitched when it stands on its own. */
function Garage({ v, x0, z0, w, d, pitched, pal, ids, walls, colour }: { v: V; x0: number; z0: number; w: number; d: number; pitched: boolean; pal: Pal; ids: Ids; walls: Walls; colour: string }) {
  const h = 25;
  const c = pal.dim(walls.ground);
  const rise = w * 0.32;
  const xr = x0 + w;
  const doorW = w - 10;
  return (
    <g>
      {pitched ? <polygon points={v.pts([[x0 - 1.5, h - 0.5, z0 - 1.5], [x0 + w / 2, h + rise, z0 - 1.5], [x0 + w / 2, h + rise, z0 + d + 1.5], [x0 - 1.5, h - 0.5, z0 + d + 1.5]])} fill={shade(pal.dim("#5c626b"), 0.12)} /> : null}
      <g transform={v.side(xr)}>
        <rect x={z0} y={-h} width={d} height={h} fill={shade(c, 0.2)} />
        {walls.groundBrick ? <rect x={z0} y={-h} width={d} height={h} fill={`url(#${ids.brick})`} /> : null}
      </g>
      <g transform={v.front(z0)}>
        <rect x={x0} y={-h} width={w} height={h} fill={c} />
        {pitched ? <polygon points={`${x0},${-h} ${x0 + w / 2},${-(h + rise)} ${xr},${-h}`} fill={c} /> : null}
        {walls.groundBrick ? <rect x={x0} y={-(h + (pitched ? rise : 0))} width={w} height={h + (pitched ? rise : 0)} fill={`url(#${ids.brick})`} /> : null}
        <GarageDoor x={x0 + 5} w={doorW} h={19.5} colour={colour} pal={pal} />
        {!pitched ? <rect x={x0} y={-h} width={w} height={2.4} fill={pal.fascia} /> : null}
      </g>
      {pitched ? (
        <g>
          <polygon points={v.pts([[xr + 1.5, h - 0.5, z0 - 1.5], [x0 + w / 2, h + rise, z0 - 1.5], [x0 + w / 2, h + rise, z0 + d + 1.5], [xr + 1.5, h - 0.5, z0 + d + 1.5]])} fill={pal.dim("#5c626b")} />
          <g transform={v.front(z0 - 1.5)}>
            <polyline points={`${x0 - 1.5},${-(h - 0.5)} ${x0 + w / 2},${-(h + rise + 0.3)} ${xr + 1.5},${-(h - 0.5)}`} fill="none" stroke={pal.fascia} strokeWidth={1.6} strokeLinejoin="round" />
          </g>
        </g>
      ) : (
        <g>
          <polygon points={v.pts([[x0, h, z0], [xr, h, z0], [xr, h, z0 + d], [x0, h, z0 + d]])} fill={pal.dim("#7d828a")} />
          <polygon points={v.pts([[x0 + 1.5, h, z0 + 1.5], [xr - 1.5, h, z0 + 1.5], [xr - 1.5, h, z0 + d - 1.5], [x0 + 1.5, h, z0 + d - 1.5]])} fill={pal.dim("#6b7078")} />
        </g>
      )}
    </g>
  );
}

/* ---------- cars ---------- */

type BodyKey = "hatch" | "saloon" | "fastback" | "crossover" | "coupe_suv" | "large_suv";

type BodySpec = {
  L: number;
  cw: number;
  /** Side profile from the bottom of the back bumper, over the roof, to the front: (z, height). */
  pts: Array<[number, number]>;
  /** Stretches of the top that are glass (rear screen, windscreen). */
  glass: Array<[number, number]>;
  roof: [number, number];
  win: Array<[number, number]>;
  wheels: number[];
  r: number;
  lights: [number, number];
  plate: [number, number];
  port: [number, number];
  rails?: boolean;
  /** A three-box saloon's separate boot, for twin tail-pipes and a boot lip. */
  boot?: boolean;
};

export const CAR_BODIES: Array<[BodyKey, string]> = [
  ["hatch", "Hatchback"], ["saloon", "Saloon"], ["fastback", "Sleek saloon"], ["crossover", "SUV"], ["coupe_suv", "Coupé SUV"], ["large_suv", "Large SUV"],
];

const BODIES: Record<BodyKey, BodySpec> = {
  // Golf, Polo, 1 Series
  hatch: {
    L: 42, cw: 18.5,
    pts: [[0, 4.4], [0, 9.6], [1.2, 11.4], [4.6, 14.6], [11, 15.6], [24, 15.7], [31, 12.4], [36.5, 10.8], [41.6, 9.6], [42.4, 7], [42, 4.4]],
    glass: [[1.6, 10.6], [24.6, 31.2]], roof: [11.2, 24.2],
    win: [[3.2, 11.6], [6.6, 14.3], [11.6, 14.9], [23.6, 15], [29.8, 12]],
    wheels: [8, 34], r: 4.6, lights: [8.1, 9.0], plate: [5.6, 7.4], port: [36, 9.4],
  },
  // 3 Series, A4
  saloon: {
    L: 47, cw: 18.8,
    pts: [[0, 4.4], [0, 9.4], [1.2, 10.7], [6.6, 11.2], [13, 14.6], [19.5, 15.3], [29, 15.2], [36, 11.6], [41.5, 10.5], [46.4, 9.5], [47.3, 7], [47, 4.4]],
    glass: [[7, 13.3], [29.2, 36]], roof: [13.4, 29],
    win: [[8.2, 11.6], [13.6, 14.4], [19.5, 15], [28.6, 14.9], [34.6, 11.8]],
    wheels: [9, 38.5], r: 4.6, lights: [7.9, 8.8], plate: [5.4, 7.2], port: [41, 9.6], boot: true,
  },
  // A low fastback: Model 3, Polestar 2
  fastback: {
    L: 47, cw: 19,
    pts: [[0, 4.4], [0, 9.4], [0.9, 10.6], [4.2, 11.4], [12, 14.2], [19, 14.9], [28, 14.8], [35, 11.3], [41, 10.1], [46.3, 9.2], [47.3, 6.8], [46.9, 4.4]],
    glass: [[4.4, 13.4], [28.2, 35.2]], roof: [13.6, 28],
    win: [[5.8, 11.3], [12.4, 14], [19.2, 14.5], [27.6, 14.4], [33.6, 11.5]],
    wheels: [8.5, 38.5], r: 4.8, lights: [8.2, 9.0], plate: [5.4, 7.2], port: [3.4, 9.2],
  },
  // Mid-size SUV: Model Y, XC60, Tiguan, Kuga
  crossover: {
    L: 46, cw: 19.6,
    pts: [[0, 5], [0, 11.4], [1, 13], [3.6, 16.2], [9.5, 17.2], [28, 17.3], [35.2, 13.6], [40.5, 12.4], [45.4, 11.6], [46.4, 8.6], [46, 5]],
    glass: [[1.2, 9.2], [28.4, 35.4]], roof: [9.6, 28],
    win: [[3.2, 13.1], [6, 16], [10, 16.5], [27.6, 16.6], [33.6, 13.4]],
    wheels: [9, 36.5], r: 5.1, lights: [9.6, 10.5], plate: [6.6, 8.4], port: [3, 10.6], rails: true,
  },
  // Sloping-roof SUV: Q8, Q6 Sportback
  coupe_suv: {
    L: 48, cw: 20,
    pts: [[0, 5], [0, 11], [1.4, 12.4], [6, 15.4], [14, 17.1], [28, 17.2], [35.6, 13.4], [41, 12.4], [47.3, 11.4], [48.4, 8.4], [48, 5]],
    glass: [[1.6, 13.6], [28.4, 35.8]], roof: [14, 28],
    win: [[6.6, 12.8], [13.4, 16.1], [20, 16.5], [27.6, 16.4], [34, 13.2]],
    wheels: [9.5, 38.5], r: 5.4, lights: [9.4, 10.3], plate: [6.4, 8.2], port: [40, 12],
  },
  // Big seven-seat SUV: XC90, G9
  large_suv: {
    L: 50, cw: 20.4,
    pts: [[0, 5.4], [0, 12.6], [0.8, 14.6], [2.2, 18], [7, 19], [32, 19], [38.4, 15], [43.6, 13.8], [49.4, 13], [50.4, 9.4], [50, 5.4]],
    glass: [[0.9, 6.8], [32.3, 38.3]], roof: [7.4, 32],
    win: [[2.6, 14.6], [3.8, 17.9], [7.4, 18.3], [31.6, 18.3], [37.4, 14.8]],
    wheels: [10, 40], r: 5.6, lights: [10.4, 11.4], plate: [7.4, 9.2], port: [44, 13.4], rails: true,
  },
};
const bodyOf = (vehicle: Vehicle): BodySpec => BODIES[(vehicle.body === "suv" ? "crossover" : vehicle.body) as BodyKey] ?? BODIES.hatch;
const CAR_SLOT = 21.5;

/** A smooth curve through the points (Catmull-Rom), sampled. */
function smooth(pts: Array<[number, number]>, per = 5, closed = false): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const n = pts.length;
  const at = (i: number) => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let j = 0; j < per; j++) {
      const t = j / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}


/* A small 3D renderer for the cars: each car is a mesh of lit faces, sorted
   back to front and projected with the same view as the house. */

type Vec = [number, number, number];
const vsub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vdot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vcross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vnorm = (a: Vec): Vec => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
// The direction towards the viewer: the one direction the view flattens away.
const VIEW = vnorm(vcross([EX[0], 0, EZ[0]], [EX[1], -1, EZ[1]]));
const LIGHT = vnorm([-0.35, 0.9, -0.45]);
const HALF = vnorm([LIGHT[0] + VIEW[0], LIGHT[1] + VIEW[1], LIGHT[2] + VIEW[2]]);

type Item = { pts: Vec[]; fill: string; depth: number; opacity?: number; line?: number };

function Car({ v, x, z, vehicle, pal }: { v: V; x: number; z: number; vehicle: Vehicle; pal: Pal }) {
  const b = bodyOf(vehicle);
  const ev = vehicle.ev !== false;
  const { L, cw } = b;
  const cx = x + cw / 2;
  const night = pal.night;
  const paint = pal.dim(vehicle.colour || CAR_COLOURS[0][0]);
  const glassC = night ? "#10151c" : "#222a34";
  const trimC = night ? "#121418" : "#1e2126";
  const tyreC = night ? "#0f1113" : "#1b1d21";
  const centre: Vec = [cx, 8, z + L / 2];
  const items: Item[] = [];

  const shadeFace = (base: string, n: Vec, gloss: number) => {
    const d = Math.max(0, vdot(n, LIGHT));
    const s = gloss * Math.pow(Math.max(0, vdot(n, HALF)), 28) * (night ? 0.35 : 1);
    const f = (night ? 0.7 : 0.58) + 0.48 * d;
    return toHex(hex(base).map((c) => c * f + 255 * s));
  };
  const faceNormal = (pts: Vec[]) => {
    const n = vnorm(pts.length >= 4 ? vcross(vsub(pts[2], pts[0]), vsub(pts[3], pts[1])) : vcross(vsub(pts[1], pts[0]), vsub(pts[2], pts[0])));
    const c = pts.reduce<Vec>((acc, p) => [acc[0] + p[0] / pts.length, acc[1] + p[1] / pts.length, acc[2] + p[2] / pts.length], [0, 0, 0]);
    return { n: vdot(n, vsub(c, centre)) < 0 ? ([-n[0], -n[1], -n[2]] as Vec) : n, c };
  };
  const add = (pts: Vec[], base: string, gloss: number, opts: { bias?: number; normal?: Vec; cull?: boolean; flat?: boolean; opacity?: number } = {}) => {
    const fn = faceNormal(pts);
    const n = opts.normal ?? fn.n;
    if (opts.cull !== false && vdot(n, VIEW) <= 0.001) return;
    items.push({ pts, fill: opts.flat ? base : shadeFace(base, n, gloss), depth: vdot(fn.c, VIEW) + (opts.bias ?? 0), opacity: opts.opacity });
  };

  /* --- body: a loft of cross-sections along the car --- */
  const prof = smooth(b.pts, 8);
  const topAt = (zz: number) => {
    let best = -Infinity;
    for (let i = 0; i < prof.length - 1; i++) {
      const [z0, h0] = prof[i];
      const [z1, h1] = prof[i + 1];
      if (z0 !== z1 && (zz - z0) * (zz - z1) <= 0) best = Math.max(best, h0 + ((h1 - h0) * (zz - z0)) / (z1 - z0));
    }
    return best === -Infinity ? b.pts[1][1] : best;
  };
  const rearB = b.pts[0][1];
  const frontB = b.pts[b.pts.length - 1][1];
  const R = b.r + 0.9;
  const bottomAt = (zz: number) => {
    let bot = 3.4 + Math.max(0, rearB - 3.4) * clamp01(1 - zz / 4) + Math.max(0, frontB - 3.4) * clamp01(1 - (L - zz) / 4);
    for (const wz of b.wheels) { const d = Math.abs(zz - wz); if (d < R) bot = Math.max(bot, b.r + Math.sqrt(R * R - d * d)); }
    return bot;
  };
  const beltBase = b.win[0][1] - 0.2;
  const winZ = b.win.map((p) => p[0]);
  const winMin = Math.min(...winZ);
  const winMax = Math.max(...winZ);
  const bPillar = (b.win[2][0] + b.win[3][0]) / 2;
  const ring = (zz: number) => {
    const top = topAt(zz);
    const belt = Math.min(beltBase, top - 0.4);
    const endD = Math.min(zz, L - zz);
    const hw = (cw / 2) * (1 - 0.08 * Math.max(0, 1 - endD / 3.5));
    const g = clamp01((top - belt - 0.6) / 3);
    const rw = hw * 0.78;
    const bot = Math.min(bottomAt(zz), belt - 2.2);
    const lowTop = Math.min(belt + 0.35, top);
    const half: Array<[number, number]> = [
      [hw * 0.86, bot],
      [hw * 0.98, Math.min(bot + 1.3, belt - 1.8)],
      [hw, belt - 1.6],
      [hw * 0.985, belt],
      [hw * (0.95 - 0.05 * (1 - g)), lowTop],
      [lerp(hw * 0.86, rw + (hw * 0.95 - rw) * 0.2, g), Math.max(lowTop, top - 0.9 - 0.3 * g)],
      [lerp(hw * 0.66, rw * 0.9, g), top],
    ];
    return { g, pts: [...half.map(([w, h]) => [cx + w, h, z + zz] as Vec), ...half.slice().reverse().map(([w, h]) => [cx - w, h, z + zz] as Vec)] };
  };
  const stations: number[] = [];
  for (let s = 0; s < L; s += 0.8) stations.push(s);
  stations.push(L);
  const rings = stations.map(ring);
  const inRange = (zm: number, [a, c]: [number, number]) => zm > a && zm < c;
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i].pts;
    const B = rings[i + 1].pts;
    const zm = (stations[i] + stations[i + 1]) / 2;
    const g = (rings[i].g + rings[i + 1].g) / 2;
    for (let j = 0; j < A.length - 1; j++) {
      const quad = [A[j], A[j + 1], B[j + 1], B[j]];
      let base = paint;
      let gloss = 0.32;
      if ((j === 4 || j === 8) && g > 0.5 && zm > winMin + 0.5 && zm < winMax - 0.5 && Math.abs(zm - bPillar) > 0.55) { base = glassC; gloss = 0.55; }
      else if (j === 6 && (b.glass.some((r) => inRange(zm, r)) || (ev && inRange(zm, [b.roof[0] + 0.6, b.roof[1] - 0.6])))) { base = glassC; gloss = 0.55; }
      else if ((j === 0 || j === 12) && b.rails) { base = trimC; gloss = 0.05; }
      add(quad, base, gloss);
    }
  }
  // The back of the car.
  const back = rings[0].pts;
  add(back, paint, 0.32, { normal: [0, 0, -1] });

  /* --- details on the back --- */
  const z0 = z - 0.04;
  const bandAt = (h0: number, h1: number, x0: number, x1: number): Vec[] => [[x0, h0, z0], [x1, h0, z0], [x1, h1, z0], [x0, h1, z0]];
  const hwBack = (cw / 2) * 0.92;
  const backBot = bottomAt(0);
  const red = night ? "#ff4d45" : "#b8232a";
  if (ev) {
    add(bandAt(b.lights[0], b.lights[1], cx - hwBack * 0.97, cx + hwBack * 0.97), red, 0.4, { normal: [0, 0, -1], bias: 3, flat: night });
    if (night) add(bandAt(b.lights[0] - 0.4, b.lights[1] + 0.4, cx - hwBack, cx + hwBack), "#ff4d45", 0, { normal: [0, 0, -1], bias: 2.9, flat: true, opacity: 0.35 });
  } else {
    for (const sx of [-1, 1]) {
      const xa = cx + sx * hwBack * 0.97;
      const xb = cx + sx * (hwBack * 0.97 - 4.6);
      add(bandAt(b.lights[0] - 0.7, b.lights[1] + 0.7, Math.min(xa, xb), Math.max(xa, xb)), red, 0.4, { normal: [0, 0, -1], bias: 3, flat: night });
    }
  }
  add(bandAt(b.plate[0], b.plate[1], cx - 3.6, cx + 3.6), "#f2d23c", 0.1, { normal: [0, 0, -1], bias: 3 });
  add(bandAt(backBot, backBot + 1.5, cx - hwBack * 0.82, cx + hwBack * 0.82), trimC, 0.05, { normal: [0, 0, -1], bias: 3 });
  if (!ev) {
    const pipes = b.boot || vehicle.body === "coupe_suv" || vehicle.body === "large_suv" ? [-1, 1] : [-1];
    for (const sx of pipes) {
      const px = cx + sx * hwBack * 0.6;
      const py = backBot + 0.75;
      const ring2 = (rx: number, ry: number) => Array.from({ length: 12 }, (_, k) => [px + Math.cos((k / 12) * Math.PI * 2) * rx, py + Math.sin((k / 12) * Math.PI * 2) * ry, z0 - 0.02] as Vec);
      add(ring2(1.3, 0.7), night ? "#5b6169" : "#a7adb4", 0.5, { normal: [0, 0, -1], bias: 3.1 });
      add(ring2(0.95, 0.45), "#0c0d0f", 0, { normal: [0, 0, -1], bias: 3.2, flat: true });
    }
  }

  /* --- mirror, handles, charge or fuel flap on the right side --- */
  const ws = b.glass[b.glass.length - 1][0];
  const sideAt = (zz: number) => cx + (cw / 2) * (1 - 0.08 * Math.max(0, 1 - Math.min(zz, L - zz) / 3.5)) + 0.04;
  const belt = beltBase;
  const mx0 = sideAt(ws);
  const mz = z + ws - 0.2;
  add([[mx0, belt + 0.6, mz], [mx0 + 1.6, belt + 0.8, mz + 0.4], [mx0 + 1.6, belt + 2.2, mz + 0.4], [mx0, belt + 2.2, mz]], paint, 0.3, { normal: [0, 0, -1], bias: 0.06 });
  add([[mx0 + 1.6, belt + 0.8, mz + 0.4], [mx0 + 1.6, belt + 0.8, mz + 2], [mx0 + 1.6, belt + 2.2, mz + 2], [mx0 + 1.6, belt + 2.2, mz + 0.4]], paint, 0.3, { normal: [1, 0, 0], bias: 0.06 });
  add([[mx0, belt + 2.2, mz], [mx0 + 1.6, belt + 2.2, mz + 0.4], [mx0 + 1.6, belt + 2.2, mz + 2], [mx0, belt + 2.2, mz + 2]], paint, 0.3, { normal: [0, 1, 0], bias: 0.06 });
  const sideDecal = (zz: number, h: number, dz: number, dh: number, fill: string, gloss = 0.3) => {
    const sx = sideAt(zz);
    add([[sx, h - dh, z + zz - dz], [sx, h - dh, z + zz + dz], [sx, h + dh, z + zz + dz], [sx, h + dh, z + zz - dz]], fill, gloss, { normal: [1, 0, 0], bias: 0.6 });
  };
  for (const f of [0.34, 0.6]) sideDecal(L * f, belt - 1.1, 1.4, 0.3, ev ? shade(paint, 0.35) : shade(paint, -0.4), 0.5);
  if (ev) sideDecal(b.port[0] + 1.2, b.port[1], 1.1, 0.7, shade(paint, 0.12));
  else sideDecal(5.5, belt - 2.8, 1, 1, shade(paint, 0.1));

  /* --- roof rails or an aerial --- */
  const roofTop = Math.max(...b.pts.map((p) => p[1]));
  if (b.rails && !ev) {
    for (const sx of [-1, 1]) {
      const rx = cx + sx * (cw / 2) * 0.62;
      add([[rx - 0.4, roofTop + 0.1, z + b.roof[0] + 1], [rx + 0.4, roofTop + 0.1, z + b.roof[0] + 1], [rx + 0.4, roofTop + 0.9, z + b.roof[1] - 1], [rx - 0.4, roofTop + 0.9, z + b.roof[1] - 1]], night ? "#5b6169" : "#a2a9b1", 0.4, { normal: [0, 1, 0], bias: 0.5 });
    }
  } else {
    const fz = z + b.roof[0] + 0.4;
    add([[cx - 0.5, roofTop, fz], [cx + 0.5, roofTop, fz], [cx, roofTop + 1.3, fz + 2]], trimC, 0.2, { normal: vnorm([0, 0.6, -0.8]), bias: 0.5 });
  }

  /* --- wheels: round tyres with rims, in dark wheel arches --- */
  const segs = 24;
  for (const wz of b.wheels) {
    for (const right of [false, true]) {
      const xo = right ? x + cw - 0.35 : x + 0.35;
      const xi = right ? xo - 3 : xo + 3;
      const sgn = right ? 1 : -1;
      const pt = (xx: number, k: number, rad: number): Vec => [xx, b.r + Math.sin((k / segs) * Math.PI * 2) * rad, z + wz + Math.cos((k / segs) * Math.PI * 2) * rad];
      if (right) {
        const well: Vec[] = Array.from({ length: segs + 1 }, (_, k) => pt(x + cw - 0.6, k, R)).filter((p) => p[1] >= 0.05);
        add(well, "#0d0e10", 0, { normal: [1, 0, 0], bias: -3, flat: true });
      }
      for (let k = 0; k < segs; k++) {
        const ang = ((k + 0.5) / segs) * Math.PI * 2;
        add([pt(xo, k, b.r), pt(xi, k, b.r), pt(xi, k + 1, b.r), pt(xo, k + 1, b.r)], tyreC, 0.04, { normal: [0, Math.sin(ang), Math.cos(ang)] });
      }
      add(Array.from({ length: segs }, (_, k) => pt(xo, k, b.r)), tyreC, 0.05, { normal: [sgn, 0, 0] });
      if (!right) continue;
      const rimX = xo + 0.03;
      const rim = night ? "#5e656d" : "#c3c9cf";
      const dark = night ? "#2a2e33" : "#3b4148";
      add(Array.from({ length: segs }, (_, k) => pt(rimX, k, b.r * 0.74)), ev ? dark : rim, 0.5, { normal: [1, 0, 0], bias: 0.02 });
      if (ev) {
        add(Array.from({ length: segs }, (_, k) => pt(rimX + 0.01, k, b.r * 0.68)), night ? "#363b42" : "#4c535c", 0.6, { normal: [1, 0, 0], bias: 0.03 });
        for (let s = 0; s < 5; s++) {
          const a0 = (s / 5) * Math.PI * 2;
          const p = (a: number, rad: number): Vec => [rimX + 0.02, b.r + Math.sin(a) * rad, z + wz + Math.cos(a) * rad];
          add([p(a0 - 0.12, 0.9), p(a0 + 0.12, 0.9), p(a0 + 0.3, b.r * 0.66), p(a0 - 0.3, b.r * 0.66)], night ? "#2a2e33" : "#30353b", 0.2, { normal: [1, 0, 0], bias: 0.04 });
        }
      } else {
        add(Array.from({ length: segs }, (_, k) => pt(rimX + 0.01, k, b.r * 0.62)), dark, 0.1, { normal: [1, 0, 0], bias: 0.03 });
        for (let s = 0; s < 5; s++) {
          const a0 = (s / 5) * Math.PI * 2;
          const p = (a: number, rad: number): Vec => [rimX + 0.02, b.r + Math.sin(a) * rad, z + wz + Math.cos(a) * rad];
          add([p(a0 - 0.22, 0.8), p(a0 + 0.22, 0.8), p(a0 + 0.12, b.r * 0.64), p(a0 - 0.12, b.r * 0.64)], rim, 0.5, { normal: [1, 0, 0], bias: 0.04 });
        }
      }
      add(Array.from({ length: 10 }, (_, k) => [rimX + 0.03, b.r + Math.sin((k / 10) * Math.PI * 2) * 0.9, z + wz + Math.cos((k / 10) * Math.PI * 2) * 0.9] as Vec), rim, 0.6, { normal: [1, 0, 0], bias: 0.05 });
    }
  }

  items.sort((a, c) => a.depth - c.depth);
  const P2 = (p: Vec) => v.P(p[0], p[1], p[2]).map((n) => n.toFixed(2)).join(",");
  return (
    <g>
      <polygon points={v.pts([[x - 1.5, 0, z - 1], [x + cw + 4.5, 0, z - 1], [x + cw + 4.5, 0, z + L + 1], [x - 1.5, 0, z + L + 1]])} fill={pal.shadow} />
      <polygon points={v.pts([[x + 1.5, 0, z + 1], [x + cw - 1, 0, z + 1], [x + cw - 1, 0, z + L - 1], [x + 1.5, 0, z + L - 1]])} fill="#000" opacity={0.25} />
      {items.map((it, i) => (
        <polygon key={i} points={it.pts.map(P2).join(" ")} fill={it.fill} stroke={it.opacity ? "none" : it.fill} strokeWidth={0.15} strokeLinejoin="round" opacity={it.opacity} />
      ))}
      {night ? <ellipse cx={v.P(cx, 0, z)[0]} cy={v.P(cx, b.lights[1], z)[1]} rx={v.k * 14} ry={v.k * 4} fill="#ff4d45" opacity={0.12} /> : null}
    </g>
  );
}

/* ---------- garden ---------- */

function Tree({ v, x, z, r, pal }: { v: V; x: number; z: number; r: number; pal: Pal }) {
  const [bx, by] = v.P(x, 0, z);
  const k = v.k;
  return (
    <g>
      <ellipse cx={bx + k * r * 0.5} cy={by} rx={k * r * 0.9} ry={k * r * 0.35} fill={pal.shadow} />
      <rect x={bx - k * 1.5} y={by - k * r * 1.3} width={k * 3} height={k * r * 1.3} fill={pal.trunk} />
      <circle cx={bx} cy={by - k * r * 1.9} r={k * r} fill={pal.leaf} />
      <circle cx={bx + k * r * 0.35} cy={by - k * r * 1.75} r={k * r * 0.7} fill={pal.leafDark} />
      <circle cx={bx - k * r * 0.3} cy={by - k * r * 2.2} r={k * r * 0.55} fill={pal.leafLight} />
    </g>
  );
}

function Shrub({ v, x0, x1, pal }: { v: V; x0: number; x1: number; pal: Pal }) {
  const n = Math.max(2, Math.round((x1 - x0) / 7));
  return (
    <g>
      <polygon points={v.pts([[x0 - 1, 0.05, -6.5], [x1 + 1, 0.05, -6.5], [x1 + 1, 0.05, 0], [x0 - 1, 0.05, 0]])} fill={pal.bed} />
      {Array.from({ length: n }, (_, i) => {
        const [cx, cy] = v.P(x0 + ((i + 0.5) / n) * (x1 - x0), 3.2, -3.4);
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r={v.k * 4.2} fill={i % 2 ? pal.leafDark : pal.leaf} />
            <circle cx={cx - v.k * 1.2} cy={cy - v.k * 1.4} r={v.k * 2} fill={pal.leafLight} opacity={0.8} />
          </g>
        );
      })}
    </g>
  );
}

/* ---------- infographic markers ---------- */

const HOTSPOT_COLOURS: Record<HouseHotspot["id"], string> = {
  electricity: "#f2a900", gas: "#f26b1d", water: "#1597d6", solar: "#d9a400", charger: "#16a34a", home: "#7c5cff", car: "#475569",
};

function HotspotIcon({ id, x, y, size }: { id: HouseHotspot["id"]; x: number; y: number; size: number }) {
  const sc = size / 24;
  const stroke = { fill: "none", stroke: "#fff", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const icon: Record<HouseHotspot["id"], ReactElement> = {
    electricity: <path d="M13 2 5 13.5h5.5L10 22l8-11.5h-5.5L13 2z" fill="#fff" />,
    gas: <path d="M12 2.5c.8 3.6 5 5.6 5 10.5a5 5 0 0 1-10 0c0-2 .9-3.4 2-4.4.1 1.9 1 2.8 2 2.9-.2-3.1-.6-6 1-9z" fill="#fff" />,
    water: <path d="M12 3c-3 4-6 7.4-6 11a6 6 0 0 0 12 0c0-3.6-3-7-6-11z" fill="#fff" />,
    solar: <g><circle cx="12" cy="12" r="4.2" fill="#fff" /><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" {...stroke} /></g>,
    charger: <path d="M9 3v4.5M15 3v4.5M6.5 7.5h11v3.5a5.5 5.5 0 0 1-11 0zM12 16.5V21" {...stroke} />,
    home: <path d="M3.5 11 12 4l8.5 7v9h-5.5v-5.5h-6V20H3.5z" fill="#fff" />,
    car: <path d="M5 16.5V12l2-4.5h10l2 4.5v4.5M4.5 12h15M7.5 19v-2.5M16.5 19v-2.5" {...stroke} />,
  };
  return <g transform={`translate(${x - size / 2} ${y - size / 2}) scale(${sc})`}>{icon[id]}</g>;
}

function Hotspots({ items, anchors }: { items: HouseHotspot[]; anchors: Partial<Record<HouseHotspot["id"], [number, number]>> }) {
  const bw = 88;
  const bh = 27;
  const placed = items
    .map((item) => ({ item, a: anchors[item.id] ?? anchors.home }))
    .filter((p): p is { item: HouseHotspot; a: [number, number] } => Boolean(p.a));
  const sides: Record<"left" | "right", typeof placed> = { left: [], right: [] };
  placed.forEach((p) => sides[p.a[0] < W / 2 ? "left" : "right"].push(p));
  while (Math.abs(sides.left.length - sides.right.length) > 1) {
    const [from, to] = sides.left.length > sides.right.length ? (["left", "right"] as const) : (["right", "left"] as const);
    sides[from].sort((a, b) => (from === "left" ? b.a[0] - a.a[0] : a.a[0] - b.a[0]));
    sides[to].push(sides[from].shift()!);
  }
  const out: Array<{ item: HouseHotspot; a: [number, number]; bx: number; by: number; side: "left" | "right" }> = [];
  (["left", "right"] as const).forEach((side) => {
    const list = sides[side].sort((a, b) => a.a[1] - b.a[1]);
    let y = 6;
    const ys = list.map((p) => { const want = Math.max(y, Math.min(H - bh - 6, p.a[1] - bh / 2)); y = want + bh + 5; return want; });
    for (let i = ys.length - 1, limit = H - 6; i >= 0; i--) { if (ys[i] + bh > limit) ys[i] = limit - bh; limit = ys[i] - 5; }
    list.forEach((p, i) => out.push({ ...p, bx: side === "left" ? 6 : W - 6 - bw, by: ys[i], side }));
  });
  return (
    <g fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif">
      {out.map(({ item, a, bx, by, side }) => {
        const colour = HOTSPOT_COLOURS[item.id];
        const ex = side === "left" ? bx + bw : bx;
        const clickable = Boolean(item.onClick);
        return (
          <g key={item.id + item.label}
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
            aria-label={`${item.label}: ${item.value}`}
            onClick={item.onClick}
            onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); item.onClick!(); } } : undefined}
            style={clickable ? { cursor: "pointer" } : undefined}>
            <path d={`M${a[0]} ${a[1]} L${ex} ${by + bh / 2}`} stroke="#ffffff" strokeWidth={1.6} opacity={0.9} />
            <path d={`M${a[0]} ${a[1]} L${ex} ${by + bh / 2}`} stroke={colour} strokeWidth={0.8} />
            <circle cx={a[0]} cy={a[1]} r={3.6} fill="#ffffff" />
            <circle cx={a[0]} cy={a[1]} r={2.2} fill={colour} />
            <rect x={bx} y={by + 1} width={bw} height={bh} rx={9} fill="#0f172a" opacity={0.18} />
            <rect x={bx} y={by} width={bw} height={bh} rx={9} fill="#ffffff" />
            <circle cx={bx + 13} cy={by + bh / 2} r={9} fill={colour} />
            <HotspotIcon id={item.id} x={bx + 13} y={by + bh / 2} size={11} />
            <text x={bx + 26} y={by + 10.5} fontSize={6.6} fill="#64748b">{item.label}</text>
            <text x={bx + 26} y={by + 21} fontSize={9.6} fontWeight={700} fill="#0f172a">{item.value}</text>
          </g>
        );
      })}
    </g>
  );
}

/* ---------- layout ---------- */

function frontLayout(w: number, floors: number, doorSide: "left" | "right" | "centre", integral: "left" | "right" | null) {
  const wins: Win[] = [];
  let door: { x: number; w: number } | null = null;
  let integralDoor: { x: number; w: number } | null = null;
  const dw = 10;
  const groundWin = (from: number, to: number) => {
    const ww = Math.min(20, to - from - 6);
    if (ww >= 10) wins.push({ x: (from + to) / 2 - ww / 2, h1: 7, w: ww, h: 13 });
  };
  if (integral) {
    const gw = Math.min(28, w * 0.4);
    integralDoor = { x: integral === "right" ? w - gw - 5 : 5, w: gw };
    door = { x: integral === "right" ? integralDoor.x - dw - 6 : integralDoor.x + gw + 6, w: dw };
    if (integral === "right") groundWin(0, door.x); else groundWin(door.x + dw, w);
  } else if (doorSide === "centre") {
    door = { x: w / 2 - dw / 2, w: dw };
    groundWin(0, door.x);
    groundWin(door.x + dw, w);
  } else {
    door = { x: doorSide === "right" ? w - dw - 9 : 9, w: dw };
    if (doorSide === "right") groundWin(0, door.x); else groundWin(door.x + dw, w);
  }
  const n = w > 85 ? 3 : 2;
  for (let f = 1; f < floors; f++) {
    for (let i = 0; i < n; i++) wins.push({ x: (w * (i + 0.5)) / n - 6, h1: f * FH + 8, w: 12, h: 11 });
  }
  return { wins, door, integralDoor };
}

function Flats({ v, s, pal, ids, walls, roof }: { v: V; s: HouseStyle; pal: Pal; ids: Ids; walls: Walls; roof: string }) {
  const floors = Math.max(3, Math.min(6, Math.round(Number(s.storeys) || 4)));
  const fh = 24;
  const w = 110;
  const d = 70;
  const h = floors * fh;
  const c = pal.dim(walls.ground);
  const mine = 1;
  return (
    <g>
      <g transform={v.side(w)}>
        <rect x={0} y={-h} width={d} height={h} fill={shade(c, 0.2)} />
        {walls.groundBrick ? <rect x={0} y={-h} width={d} height={h} fill={`url(#${ids.brick})`} /> : null}
        {Array.from({ length: floors }, (_, f) => [0.3, 0.7].map((t, j) => (
          <Window key={`${f}${t}`} win={{ x: d * t - 5, h1: f * fh + 8, w: 10, h: 10 }} pal={pal} ids={ids} lit={(f + j) % 3 !== 0} lintel={false} />
        )))}
      </g>
      <g transform={v.front(0)}>
        <rect x={0} y={-h} width={w} height={h} fill={c} />
        {walls.groundBrick ? <rect x={0} y={-h} width={w} height={h} fill={`url(#${ids.brick})`} /> : null}
        {Array.from({ length: floors }, (_, f) => [0, 1, 2, 3].map((i) => {
          if (f === 0 && (i === 1 || i === 2)) return null;
          return <Window key={`${f}${i}`} win={{ x: 10 + i * 25.5, h1: f * fh + 8, w: 13, h: 11 }} pal={pal} ids={ids} lit={f === mine || (f + i) % 3 === 0} />;
        }))}
        <rect x={0} y={-h} width={w} height={3} fill={pal.fascia} />
        <rect x={w / 2 - 9} y={-21.2} width={18} height={21.2} fill={pal.frame} />
        <rect x={w / 2 - 8} y={-20} width={16} height={20} fill={pal.night ? "#f0cb84" : "#b7c9d6"} />
        <rect x={w / 2 - 0.5} y={-20} width={1} height={20} fill={pal.frame} />
      </g>
      <Canopy v={v} x={w / 2 - 12} w={24} h={23.5} pal={pal} roof={roof} />
      <polygon points={v.pts([[0, h, 0], [w, h, 0], [w, h, d], [0, h, d]])} fill={pal.dim("#8a8f96")} />
      <polygon points={v.pts([[2, h, 2], [w - 2, h, 2], [w - 2, h, d - 2], [2, h, d - 2]])} fill={pal.dim("#757a82")} />
    </g>
  );
}

/* ---------- the drawing ---------- */

export function HouseIllustration({ style, className, hotspots }: { style: HouseStyle; className?: string; hotspots?: HouseHotspot[] }) {
  const uid = useId().replace(/[^a-z0-9]/gi, "");
  const ids: Ids = { sky: `s${uid}`, glass: `g${uid}`, lit: `l${uid}`, brick: `b${uid}`, glow: `w${uid}`, sheen: `h${uid}` };
  const s: HouseStyle = { storeys: 2, garage: "none", garageSide: "right", attachedSide: "left", grass: true, shrubs: true, driveway: "none", render: "none", cars: 0, scene: "auto", loftWindow: "skylight", garageAttached: true, chargerSide: "front", ...style };
  const [hour, setHour] = useState<number | null>(null);
  useEffect(() => setHour(new Date().getHours()), []);
  const night = s.scene === "night" || (s.scene !== "day" && hour != null && (hour >= 18 || hour < 7));
  const pal = palette(night);

  const brick = s.brick || BRICK_COLOURS[0][0];
  const render = s.renderColour || RENDER_COLOURS[0][0];
  const walls: Walls = {
    ground: s.render === "full" || s.render === "lower" ? render : brick,
    upper: s.render === "full" || s.render === "upper" ? render : brick,
    groundBrick: !(s.render === "full" || s.render === "lower"),
    upperBrick: !(s.render === "full" || s.render === "upper"),
  };
  const roof = s.roof || ROOF_COLOURS[0][0];
  const garageColour = s.garageColour || GARAGE_COLOURS[0][0];
  const isFlat = s.type === "flat";

  /* We always look at the house from the front-right. If the open side of the
     home is on the left, the whole drawing is mirrored so it shows. */
  const outsideGarage = !isFlat && (s.type === "detached" || s.type === "semi" || s.type === "bungalow") && (s.garage === "single" || s.garage === "double");
  const flip = isFlat ? false
    : s.type === "semi" || s.type === "end_terrace" ? (s.attachedSide || "left") === "right"
    : s.type === "detached" || s.type === "bungalow" ? outsideGarage && s.garageSide === "left"
    : false;
  const toView = <T extends string>(side: T): T => (flip ? (side === "left" ? "right" : side === "right" ? "left" : side) as T : side);

  const dims = { semi: [76, 78], detached: [92, 84], terraced: [62, 74], end_terrace: [64, 74], bungalow: [104, 88], flat: [110, 70] }[s.type];
  const [w, d] = dims;
  const storeys = Number(s.storeys) || 2;
  const floors = s.type === "bungalow" ? 1 : Math.max(1, Math.floor(storeys));
  const loft = s.type !== "bungalow" && !isFlat && storeys > floors;
  const gw = s.garage === "double" ? 56 : 31;
  const garageAttached = s.garageAttached !== false;
  const garageX = garageAttached ? w : w + 6;
  const garageZ = garageAttached ? 6 : Math.round(d * 0.55);
  const garageD = garageAttached ? d - 18 : 56;

  const defaultDoor = s.type === "detached" || s.type === "bungalow" ? "centre" : "left";
  const doorSide = toView((s.doorSide || defaultDoor) as "left" | "centre" | "right");
  const integral: "left" | "right" | null = !isFlat && s.garage === "integral"
    ? doorSide === "centre" ? toView(s.garageSide || "right") : doorSide === "left" ? "right" : "left"
    : null;
  const layout = frontLayout(w, floors, doorSide, integral);
  const partyRight = s.type === "terraced";
  const spec: HouseSpec = {
    w, d, floors, loft,
    loftWindow: s.loftWindow || "skylight",
    partyRight,
    chimney: "left",
    ...layout,
    solar: Boolean(s.solar),
    meters: !partyRight,
    sideCharger: Boolean(s.charger) && s.chargerSide === "side" && !partyRight,
  };
  const geo = roofGeometry(spec);

  /* The extent of the plot. */
  const groupL = 0;
  const groupR = outsideGarage ? garageX + gw : w;
  const slabL = groupL - 16;
  const slabR = groupR + 16;
  const slabB = Math.max(d + 22, outsideGarage ? garageZ + garageD + 14 : 0);
  const slabF = PLOT - PAVE;

  /* Fit the plot to the picture. */
  const top = isFlat ? Math.max(3, Math.min(6, Math.round(storeys || 4))) * 24 : geo.ridge + 12;
  const fitPts: Array<[number, number, number]> = [
    [slabL, 0, slabF], [slabR, 0, slabF], [slabR, -6, slabF], [slabR, 0, slabB], [slabL, 0, slabB],
    [0, top, d / 2], [w, top, d / 2], [0, top, isFlat ? d : d / 2], [slabL + 10, 34, slabB - 10],
  ];
  const unit = makeView(1, 0, 0);
  const pr = fitPts.map(([x, y, z]) => unit.P(x, y, z));
  const minX = Math.min(...pr.map((p) => p[0])); const maxX = Math.max(...pr.map((p) => p[0]));
  const minY = Math.min(...pr.map((p) => p[1])); const maxY = Math.max(...pr.map((p) => p[1]));
  const k = Math.min((W - 20) / (maxX - minX), (H - 22) / (maxY - minY), 2.1);
  const v = makeView(k, W / 2 - k * (minX + maxX) / 2, H / 2 - k * (minY + maxY) / 2 + 4);

  /* Driveway and cars. */
  const cars = Math.min(2, Number(s.cars || 0));
  let drive: [number, number] | null = null;
  let driveBack = 0;
  if (!isFlat) {
    if (s.driveway === "garage" && outsideGarage) { drive = [garageX + 2, garageX + gw - 2]; driveBack = garageZ; }
    else if (s.driveway === "garage" && layout.integralDoor) drive = [layout.integralDoor.x - 3, layout.integralDoor.x + layout.integralDoor.w + 3];
    else if (s.driveway === "full") { drive = [groupL, groupR]; driveBack = outsideGarage ? garageZ : 0; }
    else if (s.driveway === "house" || s.driveway === "garage") {
      const doorMid = layout.door ? layout.door.x + layout.door.w / 2 : w / 2;
      drive = doorMid > w / 2 ? [0, doorMid - 9] : [doorMid + 9, w];
    }
  }
  const span = drive ? drive[1] - drive[0] : 0;
  const vehicles = Array.from({ length: cars }, (_, i) => ({ ...DEFAULT_VEHICLES[i], ...(s.vehicles?.[i] || {}) }));
  const carZ = PLOT + 5;
  const carSpots: Array<{ x: number; z: number; vehicle: Vehicle }> = [];
  if (drive && cars) {
    if (cars === 2 && span >= CAR_SLOT * 2 + 4) {
      carSpots.push({ x: drive[0] + span * 0.27 - CAR_SLOT / 2, z: carZ, vehicle: vehicles[0] }, { x: drive[0] + span * 0.73 - CAR_SLOT / 2, z: carZ, vehicle: vehicles[1] });
    } else if (span >= CAR_SLOT) {
      carSpots.push({ x: drive[0] + span / 2 - CAR_SLOT / 2, z: carZ, vehicle: vehicles[0] });
      if (cars === 2 && driveBack > carZ + 50 + 48) carSpots.push({ x: drive[0] + span / 2 - CAR_SLOT / 2, z: carZ + 52, vehicle: vehicles[1] });
    }
  }
  // Nearer cars (to the front and right) are drawn last.
  carSpots.sort((a, b) => b.z - a.z || a.x - b.x);

  /* Path to the door when there's a lawn and the drive doesn't reach it. */
  const doorX = layout.door ? layout.door.x : null;
  const path = isFlat ? [w / 2 - 10, w / 2 + 10] : s.grass !== false && doorX != null && !(drive && doorX >= drive[0] - 2 && doorX + 10 <= drive[1] + 2) ? [doorX - 2, doorX + 12] : null;

  /* Outside tap and a charger on the front wall. */
  const groundWin = layout.wins.find((win) => win.h1 < FH);
  const tapX = groundWin ? (groundWin.x > (layout.door?.x ?? 0) ? groundWin.x + groundWin.w + 3 : groundWin.x - 4.5) : 4;
  const frontMeterX = layout.door ? (layout.door.x > w / 2 ? layout.door.x - 7.6 : layout.door.x + layout.door.w + 2.4) : w / 2;
  let charger: { x: number; y: number; z: number; front: boolean } | null = null;
  if (s.charger && !isFlat) {
    if (spec.sideCharger) charger = { x: w + 0.4, y: 14, z: SIDE_CHARGER_Z + 1.8, front: false };
    else if (outsideGarage && drive && drive[0] >= garageX - 1) charger = { x: garageX + gw - 3.6, y: 14, z: garageZ - 0.6, front: true };
    else if (drive && drive[0] <= 2) charger = { x: 2.2, y: 14, z: -0.6, front: true };
    else charger = { x: w - 6, y: 14, z: -0.6, front: true };
  }
  const chargedCar = charger && carSpots.length
    ? carSpots.reduce((best, c) => (Math.hypot(c.x + bodyOf(c.vehicle).cw - charger!.x, c.z - charger!.z) < Math.hypot(best.x + bodyOf(best.vehicle).cw - charger!.x, best.z - charger!.z) ? c : best))
    : null;

  const ground = s.grass !== false ? pal.lawn : pal.paving;

  /* Where each infographic marker points (before mirroring). */
  const roofZ = -geo.ov + 0.45 * (geo.halfZ + geo.ov);
  const roofY = geo.slopeY(roofZ);
  const solarX = loft ? w * 0.86 : w / 2;
  const meterAt = (y: number): [number, number] => (spec.meters ? v.P(w + 0.3, y, SIDE_METER_Z + 2.7) : v.P(frontMeterX + 2.5, y, -0.4));
  const rawAnchors: Partial<Record<HouseHotspot["id"], [number, number]>> = isFlat
    ? { home: v.P(w / 2, top, d / 2), electricity: v.P(w / 2 - 14, 12, 0), gas: v.P(w / 2 - 14, 6, 0), water: v.P(w / 2 + 14, 6, 0) }
    : {
        home: v.P(w / 2, geo.ridge, d / 2),
        solar: v.P(solarX, roofY, roofZ),
        electricity: meterAt(9.8),
        gas: meterAt(3.6),
        water: v.P(tapX + 0.8, 6, -0.4),
        ...(charger ? { charger: charger.front ? v.P(charger.x + 1.6, charger.y, charger.z) : v.P(w + 0.3, charger.y, charger.z) } : {}),
        ...(carSpots.length ? { car: v.P(carSpots[carSpots.length - 1].x + 10, 15, carSpots[carSpots.length - 1].z + 20) } : {}),
      };
  const anchors = Object.fromEntries(Object.entries(rawAnchors).map(([key, p]) => [key, flip ? [W - p![0], p![1]] : p])) as typeof rawAnchors;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={`Drawing of a ${s.type.replace("_", " ")} ${isFlat ? "" : "house"}`}>
      <defs>
        <linearGradient id={ids.sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={pal.skyTop} />
          <stop offset="1" stopColor={pal.skyBottom} />
        </linearGradient>
        <linearGradient id={ids.glass} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#d9e7ef" />
          <stop offset="0.55" stopColor="#9fb6c6" />
          <stop offset="1" stopColor="#7f97a9" />
        </linearGradient>
        <linearGradient id={ids.lit} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe3a3" />
          <stop offset="1" stopColor="#e9a95c" />
        </linearGradient>
        <radialGradient id={ids.glow}>
          <stop offset="0" stopColor="#ffd98f" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ffd98f" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={ids.sheen} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity={night ? 0.06 : 0.28} />
          <stop offset="0.45" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.18" />
        </linearGradient>
        <pattern id={ids.brick} width={8} height={4} patternUnits="userSpaceOnUse">
          <path d="M0 2H8M0 4H8M2 0V2M6 2V4" stroke="#000" strokeOpacity={0.13} strokeWidth={0.45} fill="none" />
        </pattern>
      </defs>

      {/* Sky */}
      <rect width={W} height={H} fill={`url(#${ids.sky})`} />
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

      <g transform={flip ? `translate(${W} 0) scale(-1 1)` : undefined}>
        {/* The patch of ground: a slab with soil edges */}
        <ellipse cx={v.P((slabL + slabR) / 2, 0, (slabF + slabB) / 2)[0] + 10} cy={v.P((slabL + slabR) / 2, 0, (slabF + slabB) / 2)[1] + 16} rx={(slabR - slabL) * k * 0.62} ry={(slabB - slabF) * k * 0.26} fill="#000" opacity={night ? 0.25 : 0.07} />
        <polygon points={v.pts([[slabL, 0, slabF], [slabR, 0, slabF], [slabR, -6, slabF], [slabL, -6, slabF]])} fill={pal.soil} />
        <polygon points={v.pts([[slabR, 0, slabF], [slabR, 0, slabB], [slabR, -6, slabB], [slabR, -6, slabF]])} fill={pal.soilSide} />
        <polygon points={v.pts([[slabL, 0, slabF], [slabR, 0, slabF], [slabR, 0, slabB], [slabL, 0, slabB]])} fill={pal.lawn} />
        <polygon points={v.pts([[slabL, 0, PLOT], [slabR, 0, PLOT], [slabR, 0, 0], [slabL, 0, 0]])} fill={isFlat ? pal.lawn : ground} />
        {!isFlat && s.grass !== false ? (
          <g transform={v.flat(0)}>
            {Array.from({ length: Math.ceil((slabR - slabL) / 16) }, (_, i) => (
              <rect key={i} x={slabL + i * 16} y={PLOT} width={8} height={-PLOT} fill="#ffffff" opacity={0.06} />
            ))}
          </g>
        ) : null}
        {!isFlat && s.grass === false ? (
          <g transform={v.flat(0)}>
            {Array.from({ length: 12 }, (_, i) => <line key={i} x1={slabL} x2={slabR} y1={PLOT + i * 5} y2={PLOT + i * 5} stroke="#000" strokeOpacity={0.05} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />)}
          </g>
        ) : null}
        {/* Pavement and kerb */}
        <polygon points={v.pts([[slabL, 0, slabF], [slabR, 0, slabF], [slabR, 0, PLOT], [slabL, 0, PLOT]])} fill={pal.pavement} />
        <polygon points={v.pts([[slabL, 0, PLOT], [slabR, 0, PLOT], [slabR, 0, PLOT + 1.6], [slabL, 0, PLOT + 1.6]])} fill={pal.kerb} />
        {drive ? <polygon points={v.pts([[drive[0], 0, slabF], [drive[1], 0, slabF], [drive[1], 0, driveBack], [drive[0], 0, driveBack]])} fill={pal.tarmac} /> : null}
        {s.driveway === "full" && outsideGarage && !garageAttached ? <polygon points={v.pts([[0, 0, slabF], [w, 0, slabF], [w, 0, 0], [0, 0, 0]])} fill={pal.tarmac} /> : null}
        {path ? <polygon points={v.pts([[path[0], 0, PLOT], [path[1], 0, PLOT], [path[1], 0, 0], [path[0], 0, 0]])} fill={pal.paving} /> : null}

        {/* Trees at the back */}
        <Tree v={v} x={slabL + 10} z={slabB - 10} r={12} pal={pal} />
        <Tree v={v} x={slabR - 14} z={slabB - 6} r={14} pal={pal} />

        {/* Shadows on the ground */}
        <polygon points={v.pts([[w, 0, 0], [w + 14, 0, 6], [w + 14, 0, d + 4], [w, 0, d]])} fill={pal.shadow} />
        <polygon points={v.pts([[0, 0, -3], [isFlat ? w : groupR, 0, -3], [isFlat ? w : groupR, 0, 0], [0, 0, 0]])} fill={pal.shadow} />

        {isFlat ? (
          <Flats v={v} s={s} pal={pal} ids={ids} walls={walls} roof={roof} />
        ) : (
          <g>
            <House v={v} spec={spec} pal={pal} ids={ids} s={s} walls={walls} roof={roof} />
            {outsideGarage ? <Garage v={v} x0={garageX} z0={garageZ} w={gw} d={garageD} pitched={!garageAttached} pal={pal} ids={ids} walls={walls} colour={garageColour} /> : null}
          </g>
        )}

        {/* Outside tap, front meter box (mid terraces) and a front charger */}
        {!isFlat ? (
          <g transform={v.front(-0.4)}>
            <rect x={tapX} y={-7} width={1.6} height={2.6} fill="#9aa3ad" />
            <rect x={tapX - 0.6} y={-7.4} width={2.8} height={1} rx={0.4} fill="#3f6fb5" />
            {!spec.meters ? (
              <g>
                <rect x={frontMeterX} y={-12.6} width={5.2} height={5.6} rx={0.6} fill={pal.night ? "#9aa0a8" : "#f2f1ec"} />
                <rect x={frontMeterX} y={-6.4} width={5.2} height={5.6} rx={0.6} fill={pal.night ? "#8b9198" : "#e6e4dd"} />
              </g>
            ) : null}
          </g>
        ) : null}
        {charger && charger.front ? (
          <g transform={v.front(charger.z)}>
            <rect x={charger.x} y={-17} width={3.2} height={5.2} rx={0.8} fill={pal.night ? "#c9ced4" : "#f6f7f8"} />
            <rect x={charger.x + 0.6} y={-16.2} width={2} height={1.8} rx={0.3} fill="#20262e" />
            <circle cx={charger.x + 1.6} cy={-13} r={0.45} fill="#34d399" />
          </g>
        ) : null}

        {/* Shrubs under the ground-floor windows */}
        {s.shrubs !== false && !isFlat ? layout.wins.filter((win) => win.h1 < FH).map((win, i) => <Shrub key={i} v={v} x0={win.x - 1} x1={win.x + win.w + 1} pal={pal} />) : null}
        {s.shrubs !== false && isFlat ? <Shrub v={v} x0={8} x1={34} pal={pal} /> : null}

        {carSpots.map((c, i) => <Car key={i} v={v} x={c.x} z={c.z} vehicle={c.vehicle} pal={pal} />)}
        {charger ? (() => {
          const [ax, ay] = charger.front ? v.P(charger.x + 1.6, 11.8, charger.z) : v.P(w + 0.3, 11.4, charger.z);
          if (!chargedCar) {
            const [hx, hy] = charger.front ? v.P(charger.x + 1.6, 9.5, charger.z - 0.2) : v.P(w + 0.5, 9.5, charger.z);
            return <path d={`M${ax} ${ay} Q${ax + v.k * 2} ${hy + v.k * 2} ${hx} ${hy}`} fill="none" stroke="#1f242b" strokeWidth={v.k * 0.8} />;
          }
          const b = bodyOf(chargedCar.vehicle);
          const portX = chargedCar.x + b.cw;
          const [px, py] = v.P(portX, b.port[1], chargedCar.z + b.port[0] + 1.2);
          const [cx, cy] = v.P((charger.x + portX) / 2 + 4, 0.4, (charger.z + chargedCar.z + b.port[0]) / 2);
          return <path d={`M${ax} ${ay} Q${cx} ${cy} ${px} ${py}`} fill="none" stroke="#1f242b" strokeWidth={v.k * 0.8} strokeLinecap="round" />;
        })() : null}
      </g>

      {hotspots?.length ? <Hotspots items={hotspots} anchors={anchors} /> : null}
    </svg>
  );
}

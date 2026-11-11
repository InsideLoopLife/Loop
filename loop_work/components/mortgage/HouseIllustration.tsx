"use client";

// A small 3D-style model of the person's home: the front and one side of the
// house on a patch of ground, seen from above at an angle, with its drive,
// garage, cars and garden. Attached homes are drawn on their own; being
// attached only decides the layout (which side shows, where the chimney is).
// Day or night follows the clock unless chosen.
import { useEffect, useId, useState, type ReactElement } from "react";

export type Vehicle = {
  body?: "hatch" | "saloon" | "suv";
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
export const DEFAULT_VEHICLES: Vehicle[] = [{ body: "hatch", ev: true, colour: CAR_COLOURS[0][0] }, { body: "suv", ev: true, colour: CAR_COLOURS[1][0] }];

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

type Ids = { sky: string; glass: string; lit: string; brick: string; glow: string };

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
                <polygon points={v.pts([[dx + dw + 1.4, yt - 0.6, zf - 1.4], [dx + dw / 2, yr, zf - 1.4], [dx + dw / 2, yr, zr], [dx + dw + 1.4, yt - 0.6, ze]])} fill={shade(roofC, -0.06)} />
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

type BodySpec = {
  L: number;
  cw: number;
  pts: Array<[number, number]>;
  glass: Array<[number, number]>;
  roof: [number, number];
  win: Array<[number, number]>;
  wheels: number[];
  r: number;
  lights: [number, number];
  plate: [number, number];
  port: [number, number];
};

const BODIES: Record<NonNullable<Vehicle["body"]>, BodySpec> = {
  hatch: {
    L: 42, cw: 18.5,
    pts: [[0, 4.4], [0, 9.6], [1.2, 11.4], [4.6, 14.6], [11, 15.6], [24, 15.7], [31, 12.4], [36.5, 10.8], [41.6, 9.6], [42.4, 7], [42, 4.4]],
    glass: [[1.6, 10.6], [24.6, 31.2]], roof: [11.2, 24.2],
    win: [[3.2, 11.6], [6.6, 14.3], [11.6, 14.9], [23.6, 15], [29.8, 12]],
    wheels: [8, 34], r: 4.6, lights: [8.1, 9.0], plate: [5.6, 7.4], port: [36, 9.4],
  },
  saloon: {
    L: 47, cw: 18.8,
    pts: [[0, 4.4], [0, 9.4], [1.2, 10.7], [6.6, 11.2], [13, 14.6], [19.5, 15.3], [29, 15.2], [36, 11.6], [41.5, 10.5], [46.4, 9.5], [47.3, 7], [47, 4.4]],
    glass: [[7, 13.3], [29.2, 36]], roof: [13.4, 29],
    win: [[8.2, 11.6], [13.6, 14.4], [19.5, 15], [28.6, 14.9], [34.6, 11.8]],
    wheels: [9, 38.5], r: 4.6, lights: [7.9, 8.8], plate: [5.4, 7.2], port: [41, 9.6],
  },
  suv: {
    L: 46, cw: 20,
    pts: [[0, 5.2], [0, 12], [1, 13.8], [3.2, 17.6], [9, 18.7], [29, 18.8], [35.5, 14.8], [40.5, 13.3], [45.4, 12.4], [46.4, 9], [46, 5.2]],
    glass: [[1.2, 8.8], [29.4, 35.6]], roof: [8.9, 29.3],
    win: [[3.4, 13.9], [5.4, 17.3], [9.2, 17.9], [28.6, 18], [34.4, 14.3]],
    wheels: [9, 36.5], r: 5.4, lights: [10.1, 11.0], plate: [7.0, 8.8], port: [39, 12.2],
  },
};
const CAR_SLOT = 20.5;

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

function Car({ v, x, z, vehicle, pal }: { v: V; x: number; z: number; vehicle: Vehicle; pal: Pal }) {
  const b = BODIES[vehicle.body || "hatch"];
  const ev = vehicle.ev !== false;
  const { L, cw } = b;
  const body = pal.dim(vehicle.colour || CAR_COLOURS[0][0]);
  const glass = pal.night ? "#141a23" : "#2a333f";
  const side = shade(body, 0.12);
  const xr = x + cw;
  const curve = smooth(b.pts, 6);
  const inGlass = (zm: number) => b.glass.some(([a, c]) => zm > a && zm < c);
  const strips = curve.slice(0, -1).map((p, i) => {
    const q = curve[i + 1];
    const dz = q[0] - p[0];
    const dh = q[1] - p[1];
    const len = Math.hypot(dz, dh) || 1;
    const vertical = Math.abs(dz) / len < 0.5 ? 1 - Math.abs(dz) / len : 0;
    const zm = (p[0] + q[0]) / 2;
    return { p, q, zm, vertical, facingBack: dh > 0 };
  }).sort((a, b2) => b2.zm - a.zm);
  const sidePath = curve.map(([pz, ph], i) => `${i ? "L" : "M"}${(z + pz).toFixed(2)} ${(-ph).toFixed(2)}`).join(" ") + " Z";
  const winPath = smooth(b.win, 4, true).map(([pz, ph], i) => `${i ? "L" : "M"}${(z + pz).toFixed(2)} ${(-ph).toFixed(2)}`).join(" ") + " Z";
  const wheelH = b.r - 0.2;
  return (
    <g>
      <polygon points={v.pts([[x - 1.5, 0, z - 1.5], [xr + 4, 0, z - 1.5], [xr + 4, 0, z + L + 1], [x - 1.5, 0, z + L + 1]])} fill={pal.shadow} />
      {/* Rear tyres peeking under the bumper */}
      <g transform={v.front(z + 1.5)}>
        <rect x={x + 1} y={-wheelH} width={3.4} height={wheelH} rx={0.8} fill="#15181c" />
        <rect x={xr - 4.4} y={-wheelH} width={3.4} height={wheelH} rx={0.8} fill="#15181c" />
      </g>
      {/* The body, front to back, as thin strips so it curves */}
      {strips.map(({ p, q, zm, vertical, facingBack }, i) => {
        const glassy = inGlass(zm);
        const panoramic = ev && zm > b.roof[0] && zm < b.roof[1];
        const base = glassy ? glass : body;
        const tone = glassy ? base : shade(base, facingBack || vertical > 0.5 ? (vertical > 0.5 ? 0.02 : -0.08) : -0.16);
        return (
          <g key={i}>
            <polygon points={v.pts([[x + 0.4, p[1], z + p[0]], [xr, p[1], z + p[0]], [xr, q[1], z + q[0]], [x + 0.4, q[1], z + q[0]]])} fill={tone} stroke={tone} strokeWidth={0.25} />
            {panoramic ? <polygon points={v.pts([[x + 2.4, p[1] + 0.02, z + p[0]], [xr - 2, p[1] + 0.02, z + p[0]], [xr - 2, q[1] + 0.02, z + q[0]], [x + 2.4, q[1] + 0.02, z + q[0]]])} fill={pal.night ? "#1a212c" : "#3a4757"} stroke={pal.night ? "#1a212c" : "#3a4757"} strokeWidth={0.2} /> : null}
          </g>
        );
      })}
      {/* Right side */}
      <g transform={v.side(xr)}>
        <path d={sidePath} fill={side} />
        <path d={winPath} fill={glass} />
        <line x1={z + (b.win[2][0] + b.win[3][0]) / 2} x2={z + (b.win[2][0] + b.win[3][0]) / 2} y1={-b.win[3][1]} y2={-b.win[0][1]} stroke={side} strokeWidth={1.1} />
        <path d={`M${z + 1.5} ${-(b.win[0][1] - 1.6)} L${z + L - 4} ${-(b.win[0][1] - 2.2)}`} stroke={shade(side, -0.18)} strokeWidth={0.4} fill="none" />
        <rect x={z + 1} y={-(b.r + 1.6)} width={L - 2} height={1.6} rx={0.8} fill={pal.night ? "#14171b" : "#23272d"} opacity={vehicle.body === "suv" ? 1 : 0.7} />
        {[0.32, 0.62].map((f) => <rect key={f} x={z + L * f} y={-(b.win[0][1] - 1.2)} width={3} height={0.7} rx={0.35} fill={shade(side, -0.3)} />)}
        {ev ? <rect x={z + b.port[0]} y={-b.port[1]} width={2.4} height={1.6} rx={0.4} fill={shade(side, 0.25)} /> : <circle cx={z + 5} cy={-(b.win[0][1] - 2.8)} r={1.1} fill={shade(side, 0.2)} />}
        {b.wheels.map((wz) => (
          <g key={wz}>
            <circle cx={z + wz} cy={-wheelH} r={b.r + 0.8} fill={shade(side, 0.45)} />
            <circle cx={z + wz} cy={-wheelH} r={b.r} fill="#15181c" />
            {ev ? (
              <g>
                <circle cx={z + wz} cy={-wheelH} r={b.r * 0.74} fill={pal.night ? "#3a4048" : "#3f464f"} />
                <circle cx={z + wz} cy={-wheelH} r={b.r * 0.55} fill="none" stroke={pal.night ? "#6b727b" : "#a9b0b8"} strokeWidth={0.5} />
                <circle cx={z + wz} cy={-wheelH} r={0.9} fill={pal.night ? "#6b727b" : "#a9b0b8"} />
              </g>
            ) : (
              <g>
                <circle cx={z + wz} cy={-wheelH} r={b.r * 0.72} fill={pal.night ? "#6b727b" : "#c3c8ce"} />
                <circle cx={z + wz} cy={-wheelH} r={b.r * 0.6} fill="#2b3036" />
                {[0, 72, 144, 216, 288].map((a) => (
                  <line key={a} x1={z + wz} y1={-wheelH} x2={z + wz + Math.cos((a * Math.PI) / 180) * b.r * 0.62} y2={-wheelH + Math.sin((a * Math.PI) / 180) * b.r * 0.62} stroke={pal.night ? "#6b727b" : "#c3c8ce"} strokeWidth={0.9} />
                ))}
                <circle cx={z + wz} cy={-wheelH} r={0.8} fill={pal.night ? "#6b727b" : "#c3c8ce"} />
              </g>
            )}
          </g>
        ))}
      </g>
      {/* Back: lights, plate, and an exhaust if it isn't electric */}
      <g transform={v.front(z - 0.05)}>
        {ev ? (
          <rect x={x + 0.6} y={-b.lights[1]} width={cw - 1.2} height={b.lights[1] - b.lights[0]} rx={0.45} fill={pal.night ? "#ff4d45" : "#c0262c"} />
        ) : (
          <g>
            <rect x={x + 0.6} y={-(b.lights[1] + 0.6)} width={4.2} height={b.lights[1] - b.lights[0] + 1.2} rx={0.6} fill={pal.night ? "#ff4d45" : "#b3262a"} />
            <rect x={xr - 4.8} y={-(b.lights[1] + 0.6)} width={4.2} height={b.lights[1] - b.lights[0] + 1.2} rx={0.6} fill={pal.night ? "#ff4d45" : "#b3262a"} />
            <ellipse cx={x + 3.6} cy={-3.6} rx={1.2} ry={0.7} fill="#15181c" />
          </g>
        )}
        <rect x={x + cw / 2 - 3.5} y={-b.plate[1]} width={7} height={b.plate[1] - b.plate[0]} rx={0.3} fill="#f2d23c" />
        <rect x={x + 0.8} y={-(b.plate[0] - 0.4)} width={cw - 1.6} height={0.9} fill={pal.night ? "#14171b" : "#23272d"} opacity={0.8} />
      </g>
      {pal.night ? <ellipse cx={v.P(x + cw / 2, 0, z)[0]} cy={v.P(x + cw / 2, b.lights[1], z)[1]} rx={v.k * 14} ry={v.k * 4} fill="#ff4d45" opacity={0.14} /> : null}
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
  const ids: Ids = { sky: `s${uid}`, glass: `g${uid}`, lit: `l${uid}`, brick: `b${uid}`, glow: `w${uid}` };
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
    ? carSpots.reduce((best, c) => (Math.hypot(c.x + BODIES[c.vehicle.body || "hatch"].cw - charger!.x, c.z - charger!.z) < Math.hypot(best.x + BODIES[best.vehicle.body || "hatch"].cw - charger!.x, best.z - charger!.z) ? c : best))
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
          const b = BODIES[chargedCar.vehicle.body || "hatch"];
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

"use client";

// A small 3D-style model of the person's home: the front and one side of the
// house on a patch of ground, seen from above at an angle, with its drive,
// cars and garden. Neighbours show as plain white blocks so a semi or terrace
// reads as one building. Day or night follows the clock unless chosen.
import { useEffect, useId, useState, type ReactElement } from "react";

export type HouseStyle = {
  type: "flat" | "terraced" | "end_terrace" | "semi" | "detached" | "bungalow";
  storeys?: number;
  garage?: "none" | "integral" | "single" | "double";
  garageSide?: "left" | "right";
  /** Which side the neighbour is on, for a semi or end terrace. */
  attachedSide?: "left" | "right";
  door?: string;
  brick?: string;
  render?: "none" | "upper" | "full";
  renderColour?: string;
  roof?: string;
  grass?: boolean;
  shrubs?: boolean;
  driveway?: "none" | "garage" | "house" | "full";
  /** Cars parked on the drive. */
  cars?: 0 | 1 | 2;
  /** Day, night, or follow the clock. */
  scene?: "auto" | "day" | "night";
  solar?: boolean;
  /** An EV charger on the front wall. */
  charger?: boolean;
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
    pts: (list) => list.map(([x, y, z]) => P(x, y, z).map((n) => n.toFixed(1)).join(",")).join(" "),
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
    lawnEdge: dim("#7aa65b"),
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
    clay: night ? "#3a4254" : "#efede8",
    claySide: night ? "#2f3647" : "#d9d6cf",
    clayRoof: night ? "#2a3040" : "#d2cec6",
    garageDoor: night ? "#8d939b" : "#ecebe7",
    shadow: night ? "rgba(0,0,0,0.28)" : "rgba(40,45,60,0.16)",
    leaf: dim("#6f9a55"),
    leafLight: dim("#8db86b"),
    leafDark: dim("#55803f"),
    trunk: dim("#7b5a43"),
    darkGlass: "#273142",
  };
}

type Ids = { sky: string; glass: string; lit: string; brick: string; glow: string };

/* ---------- house parts ---------- */

type Win = { x: number; h1: number; w: number; h: number };

function Window({ win, pal, ids, lit }: { win: Win; pal: Pal; ids: Ids; lit: boolean }) {
  const { x, h1, w, h } = win;
  const top = -(h1 + h);
  return (
    <g>
      <rect x={x - 1.8} y={top - 4} width={w + 3.6} height={2.6} fill="#000" opacity={0.14} />
      <rect x={x - 1.2} y={top - 1.2} width={w + 2.4} height={h + 2.4} fill={pal.frame} />
      <rect x={x} y={top} width={w} height={h} fill={pal.night ? (lit ? `url(#${ids.lit})` : pal.darkGlass) : `url(#${ids.glass})`} />
      {!pal.night ? <polygon points={`${x + w * 0.15},${top + h} ${x + w * 0.45},${top} ${x + w * 0.62},${top} ${x + w * 0.32},${top + h}`} fill="#ffffff" opacity={0.22} /> : null}
      <rect x={x} y={top} width={1.1} height={h} fill="#000" opacity={0.16} />
      <rect x={x} y={top} width={w} height={1.1} fill="#000" opacity={0.16} />
      <rect x={x + w / 2 - 0.5} y={top} width={1} height={h} fill={pal.frame} />
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

type HouseSpec = {
  x0: number;
  w: number;
  d: number;
  floors: number;
  loft: boolean;
  openLeft: boolean;
  openRight: boolean;
  chimney: "left" | "right" | null;
  wins: Win[];
  door: { x: number; w: number } | null;
  integralDoor: { x: number; w: number } | null;
  solar?: boolean;
};

function roofGeometry(spec: HouseSpec) {
  const wallH = spec.floors * FH;
  const rise = (spec.d / 2) * (spec.floors === 1 ? 0.62 : 0.72);
  const ov = 3;
  const eave = wallH - 1.5;
  const ridge = wallH + rise;
  const xl = spec.openLeft ? spec.x0 - ov : spec.x0;
  const xr = spec.openRight ? spec.x0 + spec.w + ov : spec.x0 + spec.w;
  return { wallH, rise, ov, eave, ridge, xl, xr };
}

/** The roof and walls of one house. `clay` draws it as a plain white block (a neighbour). */
function House({ v, spec, pal, ids, s, clay, ext, upperExt, roof, seed = 0 }: { v: V; spec: HouseSpec; pal: Pal; ids: Ids; s: HouseStyle; clay?: boolean; ext: string; upperExt: string; roof: string; seed?: number }) {
  const { x0, w, d } = spec;
  const { wallH, ov, eave, ridge, xl, xr } = roofGeometry(spec);
  const front = clay ? pal.clay : pal.dim(ext);
  const frontUpper = clay ? pal.clay : pal.dim(upperExt);
  const sideC = clay ? pal.claySide : shade(front, 0.2);
  const sideUpper = clay ? pal.claySide : shade(frontUpper, 0.2);
  const roofC = clay ? pal.clayRoof : pal.dim(roof);
  const isBrick = (c: string) => !clay && BRICK_COLOURS.some(([b]) => b === c);
  const xR = x0 + w;
  const halfZ = d / 2;
  const showUpper = !clay && spec.floors > 1 && upperExt !== ext;

  // Chimney on the ridge, at the party wall or one end.
  const chim = spec.chimney ? (() => {
    const cw = 9;
    const cx = spec.chimney === "left" ? x0 + 4 : xR - 4 - cw;
    const zf = halfZ - 4;
    const yb = eave + (ridge - eave) * ((zf + ov) / (halfZ + ov));
    const top = ridge + 11;
    return { cx, cw, zf, zb: zf + 8, yb, top };
  })() : null;

  return (
    <g>
      {/* Right side wall with its gable */}
      {spec.openRight ? (
        <g transform={v.side(xR)}>
          <polygon points={`0,0 ${d},0 ${d},${-wallH} ${halfZ},${-ridge} 0,${-wallH}`} fill={sideC} />
          {showUpper ? <polygon points={`0,${-FH} ${d},${-FH} ${d},${-wallH} ${halfZ},${-ridge} 0,${-wallH}`} fill={sideUpper} /> : null}
          {isBrick(ext) ? <polygon points={`0,0 ${d},0 ${d},${showUpper ? -FH : -wallH} ${showUpper ? `${d},${-FH} 0,${-FH}` : `${halfZ},${-ridge} 0,${-wallH}`}`} fill={`url(#${ids.brick})`} /> : null}
          {!clay && spec.loft ? <rect x={halfZ - 5} y={-(wallH + 15)} width={10} height={9} fill={pal.night ? `url(#${ids.lit})` : `url(#${ids.glass})`} stroke={pal.frame} strokeWidth={1.2} /> : null}
        </g>
      ) : null}

      {/* Front wall */}
      <g transform={v.front(0)}>
        <rect x={x0} y={-wallH} width={w} height={wallH} fill={front} />
        {showUpper ? <rect x={x0} y={-wallH} width={w} height={wallH - FH} fill={frontUpper} /> : null}
        {isBrick(ext) ? <rect x={x0} y={showUpper ? -FH : -wallH} width={w} height={showUpper ? FH : wallH} fill={`url(#${ids.brick})`} /> : null}
        {showUpper ? <rect x={x0} y={-FH - 1} width={w} height={1.4} fill="#000" opacity={0.08} /> : null}
        {!clay ? (
          <g>
            {spec.wins.map((win, i) => <Window key={i} win={{ ...win, x: x0 + win.x }} pal={pal} ids={ids} lit={(i + seed) % 4 !== 1} />)}
            {spec.integralDoor ? (
              <g>
                <rect x={x0 + spec.integralDoor.x - 1.2} y={-21.2} width={spec.integralDoor.w + 2.4} height={21.2} fill={pal.frame} />
                <rect x={x0 + spec.integralDoor.x} y={-20} width={spec.integralDoor.w} height={20} fill={pal.garageDoor} />
                {[1, 2, 3, 4].map((i) => <rect key={i} x={x0 + spec.integralDoor!.x} y={-20 + i * 4} width={spec.integralDoor!.w} height={0.6} fill="#000" opacity={0.1} />)}
              </g>
            ) : null}
            {spec.door ? <Door x={x0 + spec.door.x} w={spec.door.w} colour={s.door || DOOR_COLOURS[0]} pal={pal} /> : null}
          </g>
        ) : null}
        <rect x={x0} y={-wallH} width={w} height={2} fill="#000" opacity={0.12} />
      </g>
      {!clay && spec.door ? <Canopy v={v} x={x0 + spec.door.x - 3} w={spec.door.w + 6} h={23.5} pal={pal} roof={roof} /> : null}
      {!clay && spec.door && pal.night ? <circle cx={v.P(x0 + spec.door.x + spec.door.w / 2, 18, -1)[0]} cy={v.P(0, 18, -1)[1] + v.P(x0 + spec.door.x + spec.door.w / 2, 0, 0)[1] - v.P(0, 0, 0)[1]} r={v.k * 14} fill={`url(#${ids.glow})`} /> : null}

      {/* Front roof slope */}
      <polygon points={v.pts([[xl, eave, -ov], [xr, eave, -ov], [xr, ridge, halfZ], [xl, ridge, halfZ]])} fill={roofC} />
      {!clay ? (
        <g transform={v.slope(-ov, eave, halfZ, ridge)}>
          {Array.from({ length: 9 }, (_, i) => <line key={i} x1={xl} x2={xr} y1={(i + 1) / 10} y2={(i + 1) / 10} stroke="#000" strokeOpacity={0.14} strokeWidth={0.7} vectorEffect="non-scaling-stroke" />)}
          <rect x={xl} y={0} width={xr - xl} height={0.5} fill="#000" opacity={0.06} />
          {spec.solar ? (() => {
            const rows = spec.loft ? [[0.08, 0.36]] : [[0.12, 0.43], [0.46, 0.77]];
            const n = Math.max(2, Math.floor((xr - xl - 14) / 11));
            const start = (xl + xr) / 2 - (n * 11 - 1) / 2;
            return rows.flatMap(([t0, t1], r) => Array.from({ length: n }, (_, i) => (
              <g key={`${r}-${i}`}>
                <rect x={start + i * 11} y={t0} width={10} height={t1 - t0} fill={pal.night ? "#121a2b" : "#1e2c48"} stroke={pal.night ? "#59636f" : "#cdd5de"} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
                <line x1={start + i * 11 + 5} x2={start + i * 11 + 5} y1={t0} y2={t1} stroke="#3c5178" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
                <line x1={start + i * 11} x2={start + i * 11 + 10} y1={(t0 + t1) / 2} y2={(t0 + t1) / 2} stroke="#3c5178" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
                {!pal.night ? <polygon points={`${start + i * 11 + 1},${t1} ${start + i * 11 + 4},${t0} ${start + i * 11 + 5.5},${t0} ${start + i * 11 + 2.5},${t1}`} fill="#ffffff" opacity={0.12} /> : null}
              </g>
            )));
          })() : null}
          {spec.loft ? [0.3, 0.7].map((f) => (
            <rect key={f} x={x0 + w * f - 6} y={0.42} width={12} height={0.3} fill={pal.night ? `url(#${ids.lit})` : `url(#${ids.glass})`} stroke={shade(roofC, 0.35)} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
          )) : null}
        </g>
      ) : null}
      {/* Fascia under the eaves */}
      {!clay ? (
        <g>
          <polygon points={v.pts([[xl, eave, -ov], [xr, eave, -ov], [xr, eave - 2.2, -ov], [xl, eave - 2.2, -ov]])} fill={pal.fascia} />
          <polygon points={v.pts([[xl, eave - 2.2, -ov - 1.4], [xr, eave - 2.2, -ov - 1.4], [xr, eave - 3.8, -ov - 1.4], [xl, eave - 3.8, -ov - 1.4]])} fill={pal.night ? "#2a2e35" : "#4a4f57"} />
          <g transform={v.front(-1)}>
            <rect x={spec.openRight ? xR - 3 : x0 + 1.5} y={-(eave - 3.8)} width={1.5} height={eave - 3.8} fill={pal.night ? "#2a2e35" : "#4a4f57"} />
          </g>
        </g>
      ) : null}
      {/* Gable verge on the open end */}
      {spec.openRight ? (
        <g transform={v.side(xr)}>
          {!clay ? <polyline points={`${-ov},${-(eave - 2.6)} ${halfZ},${-(ridge - 2.6)} ${d + ov},${-(eave - 2.6)}`} fill="none" stroke={pal.fascia} strokeWidth={2} strokeLinejoin="round" /> : null}
          <polyline points={`${-ov},${-eave} ${halfZ},${-ridge} ${d + ov},${-eave}`} fill="none" stroke={shade(roofC, 0.22)} strokeWidth={2.6} strokeLinejoin="round" />
        </g>
      ) : null}
      {/* Ridge */}
      <line x1={v.P(xl, ridge, halfZ)[0]} y1={v.P(xl, ridge, halfZ)[1]} x2={v.P(xr, ridge, halfZ)[0]} y2={v.P(xr, ridge, halfZ)[1]} stroke={shade(roofC, 0.25)} strokeWidth={v.k * 2.2} strokeLinecap="round" />
      {chim && !clay ? (
        <g>
          <polygon points={v.pts([[chim.cx, chim.yb, chim.zf], [chim.cx + chim.cw, chim.yb, chim.zf], [chim.cx + chim.cw, chim.top, chim.zf], [chim.cx, chim.top, chim.zf]])} fill={front} />
          <polygon points={v.pts([[chim.cx + chim.cw, chim.yb, chim.zf], [chim.cx + chim.cw, ridge, chim.zb], [chim.cx + chim.cw, chim.top, chim.zb], [chim.cx + chim.cw, chim.top, chim.zf]])} fill={sideC} />
          <polygon points={v.pts([[chim.cx - 0.8, chim.top, chim.zf - 0.8], [chim.cx + chim.cw + 0.8, chim.top, chim.zf - 0.8], [chim.cx + chim.cw + 0.8, chim.top, chim.zb + 0.8], [chim.cx - 0.8, chim.top, chim.zb + 0.8]])} fill={pal.dim("#b9b4ab")} />
          {[0.3, 0.7].map((f) => {
            const [px, py] = v.P(chim.cx + chim.cw * f, chim.top, chim.zf + 4);
            return <rect key={f} x={px - v.k * 1.3} y={py - v.k * 4} width={v.k * 2.6} height={v.k * 4} rx={v.k * 0.6} fill={pal.dim("#b4643f")} />;
          })}
        </g>
      ) : null}
    </g>
  );
}

function Garage({ v, x0, w, d, setback, openRight, pal, ids, ext }: { v: V; x0: number; w: number; d: number; setback: number; openRight: boolean; pal: Pal; ids: Ids; ext: string }) {
  const h = 26;
  const c = pal.dim(ext);
  const brick = BRICK_COLOURS.some(([b]) => b === ext);
  const z0 = setback;
  return (
    <g>
      {openRight ? (
        <g transform={v.side(x0 + w)}>
          <rect x={z0} y={-h} width={d} height={h} fill={shade(c, 0.2)} />
          {brick ? <rect x={z0} y={-h} width={d} height={h} fill={`url(#${ids.brick})`} /> : null}
        </g>
      ) : null}
      <g transform={v.front(z0)}>
        <rect x={x0} y={-h} width={w} height={h} fill={c} />
        {brick ? <rect x={x0} y={-h} width={w} height={h} fill={`url(#${ids.brick})`} /> : null}
        <rect x={x0 + 3.8} y={-20.2} width={w - 7.6} height={20.2} fill={pal.frame} />
        <rect x={x0 + 5} y={-19} width={w - 10} height={19} fill={pal.garageDoor} />
        {[1, 2, 3, 4].map((i) => <rect key={i} x={x0 + 5} y={-19 + i * 3.8} width={w - 10} height={0.6} fill="#000" opacity={0.1} />)}
        <rect x={x0} y={-h} width={w} height={2.4} fill={pal.fascia} />
      </g>
      <polygon points={v.pts([[x0, h, z0], [x0 + w, h, z0], [x0 + w, h, z0 + d], [x0, h, z0 + d]])} fill={pal.dim("#7d828a")} />
      <polygon points={v.pts([[x0 + 1.5, h + 0.01, z0 + 1.5], [x0 + w - 1.5, h, z0 + 1.5], [x0 + w - 1.5, h, z0 + d - 1.5], [x0 + 1.5, h, z0 + d - 1.5]])} fill={pal.dim("#6b7078")} />
    </g>
  );
}

/** A sleek electric car, parked nose-in, seen from behind and to the right. */
function Car({ v, x, z, colour, pal }: { v: V; x: number; z: number; colour: string; pal: Pal }) {
  const cw = 18.5;
  const L = 44;
  const body = pal.dim(colour);
  const top = shade(body, -0.14);
  const side = shade(body, 0.14);
  const glass = pal.night ? "#141a23" : "#28313d";
  const glassTop = pal.night ? "#1a212c" : "#3a4757";
  const xr = x + cw;
  // Side profile (z from the back, height): a low fastback.
  const profile: Array<[number, number]> = [[0, 4.6], [0, 10.2], [2, 11.6], [14, 15.1], [27, 15.3], [35, 11.6], [43, 9.6], [44, 8.4], [44, 4.6]];
  return (
    <g>
      <polygon points={v.pts([[x - 1.5, 0, z - 1.5], [xr + 4, 0, z - 1.5], [xr + 4, 0, z + L + 1], [x - 1.5, 0, z + L + 1]])} fill={pal.shadow} />
      {/* Bonnet, then one sweep of glass from windscreen to tailgate */}
      <polygon points={v.pts([[x + 0.8, 11.6, z + 35], [xr - 0.2, 11.6, z + 35], [xr, 9.6, z + 43], [x + 0.6, 9.6, z + 43]])} fill={top} />
      <polygon points={v.pts([[x + 1.4, 15.3, z + 27], [xr - 0.8, 15.3, z + 27], [xr - 0.2, 11.6, z + 35], [x + 0.8, 11.6, z + 35]])} fill={glassTop} />
      <polygon points={v.pts([[x + 1.4, 15.1, z + 14], [xr - 0.8, 15.1, z + 14], [xr - 0.8, 15.3, z + 27], [x + 1.4, 15.3, z + 27]])} fill={top} />
      <polygon points={v.pts([[x + 2.6, 15.15, z + 14.5], [xr - 2, 15.15, z + 14.5], [xr - 2, 15.3, z + 26.5], [x + 2.6, 15.3, z + 26.5]])} fill={glassTop} />
      <polygon points={v.pts([[x + 0.6, 11.6, z + 2], [xr - 0.2, 11.6, z + 2], [xr - 0.8, 15.1, z + 14], [x + 1.4, 15.1, z + 14]])} fill={glass} />
      <polygon points={v.pts([[x, 10.2, z], [xr, 10.2, z], [xr - 0.2, 11.6, z + 2], [x + 0.6, 11.6, z + 2]])} fill={top} />
      {/* Right side */}
      <g transform={v.side(xr)}>
        <polygon points={profile.map(([pz, ph]) => `${z + pz},${-ph}`).join(" ")} fill={side} />
        <polygon points={`${z + 4},${-11.4} ${z + 14.5},${-14.5} ${z + 27},${-14.7} ${z + 33.6},${-11.6}`} fill={glass} />
        <rect x={z + 4} y={-11.6} width={29.6} height={0.6} fill={shade(side, 0.25)} />
        <rect x={z} y={-6.2} width={L} height={1.6} fill={pal.night ? "#14171b" : "#23272d"} />
        <rect x={z + 12} y={-10.3} width={3} height={0.7} rx={0.3} fill={shade(side, -0.3)} />
        <rect x={z + 24} y={-10.3} width={3} height={0.7} rx={0.3} fill={shade(side, -0.3)} />
        <line x1={z + 20.5} x2={z + 20.5} y1={-14.7} y2={-5} stroke={shade(side, 0.2)} strokeWidth={0.35} />
        <rect x={z + 38} y={-9.6} width={2.4} height={1.6} rx={0.4} fill={shade(side, 0.25)} />
        {[8.5, 35].map((wz) => (
          <g key={wz}>
            <circle cx={z + wz} cy={-4.2} r={4.7} fill="#15181c" />
            <circle cx={z + wz} cy={-4.2} r={3.5} fill={pal.night ? "#3a4048" : "#3f464f"} />
            <circle cx={z + wz} cy={-4.2} r={2.6} fill="none" stroke={pal.night ? "#6b727b" : "#a9b0b8"} strokeWidth={0.5} />
            <circle cx={z + wz} cy={-4.2} r={0.9} fill={pal.night ? "#6b727b" : "#a9b0b8"} />
          </g>
        ))}
      </g>
      {/* Back: a full-width light bar */}
      <g transform={v.front(z)}>
        <rect x={x + 1} y={-4.6} width={3.4} height={4.6} fill="#15181c" />
        <rect x={xr - 4.4} y={-4.6} width={3.4} height={4.6} fill="#15181c" />
        <rect x={x} y={-10.2} width={cw} height={5.6} rx={1.4} fill={body} />
        <rect x={x + 0.4} y={-9.3} width={cw - 0.8} height={0.9} rx={0.45} fill={pal.night ? "#ff4d45" : "#c0262c"} />
        {pal.night ? <rect x={x + 0.4} y={-9.5} width={cw - 0.8} height={1.3} rx={0.6} fill="#ff4d45" opacity={0.35} /> : null}
        <rect x={x + cw / 2 - 3.5} y={-7.6} width={7} height={1.8} rx={0.3} fill="#f2d23c" />
        <rect x={x + 0.6} y={-5.4} width={cw - 1.2} height={0.9} fill={pal.night ? "#14171b" : "#23272d"} />
      </g>
      {pal.night ? <ellipse cx={v.P(x + cw / 2, 0, z)[0]} cy={v.P(x + cw / 2, 9, z)[1]} rx={v.k * 14} ry={v.k * 4} fill="#ff4d45" opacity={0.14} /> : null}
    </g>
  );
}

const CAR_W = 18.5;
const CAR_L = 44;

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
  // Even the columns out if one side is crowded.
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

/* ---------- layout ---------- */

function frontLayout(w: number, floors: number, doorSide: "left" | "right" | "centre", integral: "left" | "right" | null) {
  const wins: Win[] = [];
  let door: { x: number; w: number } | null = null;
  let integralDoor: { x: number; w: number } | null = null;
  const dw = 10;
  if (integral) {
    const gw = Math.min(30, w * 0.42);
    integralDoor = { x: integral === "right" ? w - gw - 5 : 5, w: gw };
    door = { x: integral === "right" ? integralDoor.x - dw - 6 : integralDoor.x + gw + 6, w: dw };
    const free = integral === "right" ? [5, door.x - 5] : [door.x + dw + 5, w - 5];
    if (free[1] - free[0] >= 12) wins.push({ x: free[0] + 1, h1: 7, w: Math.min(26, free[1] - free[0] - 2), h: 13 });
  } else if (doorSide === "centre") {
    door = { x: w / 2 - dw / 2, w: dw };
    const ww = Math.min(26, w / 2 - dw / 2 - 18);
    wins.push({ x: (w / 2 - dw / 2 - ww) / 2, h1: 7, w: ww, h: 13 });
    wins.push({ x: w / 2 + dw / 2 + (w / 2 - dw / 2 - ww) / 2, h1: 7, w: ww, h: 13 });
  } else {
    door = { x: doorSide === "right" ? w - dw - 8 : 8, w: dw };
    const ww = Math.min(30, w - dw - 30);
    wins.push({ x: doorSide === "right" ? (door.x - ww) / 2 : door.x + dw + (w - door.x - dw - ww) / 2, h1: 7, w: ww, h: 13 });
  }
  const n = w > 85 ? 3 : 2;
  for (let f = 1; f < floors; f++) {
    for (let i = 0; i < n; i++) wins.push({ x: (w * (i + 0.5)) / n - 7, h1: f * FH + 8, w: 14, h: 11 });
  }
  return { wins, door, integralDoor };
}

function Flats({ v, s, pal, ids, ext, roof }: { v: V; s: HouseStyle; pal: Pal; ids: Ids; ext: string; roof: string }) {
  const floors = Math.max(3, Math.min(6, Math.round(Number(s.storeys) || 4)));
  const fh = 24;
  const w = 110;
  const d = 70;
  const h = floors * fh;
  const c = pal.dim(ext);
  const brick = BRICK_COLOURS.some(([b]) => b === ext);
  const mine = 1;
  return (
    <g>
      <g transform={v.side(w)}>
        <rect x={0} y={-h} width={d} height={h} fill={shade(c, 0.2)} />
        {brick ? <rect x={0} y={-h} width={d} height={h} fill={`url(#${ids.brick})`} /> : null}
        {Array.from({ length: floors }, (_, f) => [0.3, 0.7].map((t) => (
          <rect key={`${f}${t}`} x={d * t - 6} y={-(f * fh + 18)} width={12} height={10} fill={pal.night ? ((f + t * 10) % 3 ? `url(#${ids.lit})` : pal.darkGlass) : `url(#${ids.glass})`} stroke={pal.frame} strokeWidth={1.2} />
        )))}
      </g>
      <g transform={v.front(0)}>
        <rect x={0} y={-h} width={w} height={h} fill={c} />
        {brick ? <rect x={0} y={-h} width={w} height={h} fill={`url(#${ids.brick})`} /> : null}
        {Array.from({ length: floors }, (_, f) => [0, 1, 2, 3].map((i) => {
          if (f === 0 && (i === 1 || i === 2)) return null;
          return <Window key={`${f}${i}`} win={{ x: 8 + i * 25.5, h1: f * fh + 8, w: 16, h: 11 }} pal={pal} ids={ids} lit={f === mine || (f + i) % 3 === 0} />;
        }))}
        <rect x={0} y={-h} width={w} height={3} fill={pal.fascia} />
      </g>
      <g transform={v.front(0)}>
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
  const s: HouseStyle = { storeys: 2, garage: "none", garageSide: "right", attachedSide: "left", grass: true, shrubs: true, driveway: "none", render: "none", cars: 0, scene: "auto", ...style };
  const [hour, setHour] = useState<number | null>(null);
  useEffect(() => setHour(new Date().getHours()), []);
  const night = s.scene === "night" || (s.scene !== "day" && hour != null && (hour >= 18 || hour < 7));
  const pal = palette(night);

  const brick = s.brick || BRICK_COLOURS[0][0];
  const render = s.renderColour || RENDER_COLOURS[0][0];
  const ext = s.render === "full" ? render : brick;
  const upperExt = s.render === "upper" ? render : ext;
  const roof = s.roof || ROOF_COLOURS[0][0];
  const isFlat = s.type === "flat";

  /* Geometry of everything on the plot. */
  const dims = { semi: [76, 78], detached: [92, 84], terraced: [58, 74], end_terrace: [60, 74], bungalow: [104, 88], flat: [110, 70] }[s.type];
  const [w, d] = dims;
  const floors = s.type === "bungalow" ? 1 : Math.max(1, Math.floor(Number(s.storeys) || 2));
  const loft = s.type !== "bungalow" && !isFlat && Number(s.storeys) > floors;
  const attachedGarage = !isFlat && (s.type === "detached" || s.type === "semi" || s.type === "bungalow") && (s.garage === "single" || s.garage === "double");
  const gw = s.garage === "double" ? 56 : 31;
  const garageSide: "left" | "right" = s.type === "semi" ? ((s.attachedSide || "left") === "left" ? "right" : "left") : s.garageSide || "right";
  const neighbours: Array<"left" | "right"> = isFlat ? [] : s.type === "terraced" ? ["left", "right"] : s.type === "semi" || s.type === "end_terrace" ? [s.attachedSide || "left"] : [];
  const mainX = attachedGarage && garageSide === "left" ? gw : 0;
  const garageX = garageSide === "left" ? 0 : mainX + w;
  const nW = Math.round(w * 0.62);
  const groupL = Math.min(mainX, attachedGarage ? garageX : mainX);
  const groupR = Math.max(mainX + w, attachedGarage ? garageX + gw : 0);
  const slabL = neighbours.includes("left") ? mainX - nW : groupL - 16;
  const slabR = neighbours.includes("right") ? mainX + w + nW : groupR + 16;
  const slabB = d + 22;
  const slabF = PLOT - PAVE;

  const doorSide: "left" | "right" | "centre" =
    s.type === "detached" || s.type === "bungalow" ? "centre" : s.type === "terraced" ? "right" : (s.attachedSide || "left") === "left" ? "right" : "left";
  const integral = !isFlat && s.garage === "integral" ? (s.type === "semi" ? (doorSide === "right" ? "right" : "left") : s.garageSide || "right") : null;
  const layout = frontLayout(w, floors, doorSide, integral);
  const spec: HouseSpec = {
    x0: mainX, w, d, floors, loft,
    openLeft: !neighbours.includes("left"),
    openRight: !neighbours.includes("right"),
    chimney: s.type === "detached" || s.type === "bungalow" ? "left" : neighbours.includes("left") ? "left" : "right",
    ...layout,
    solar: Boolean(s.solar),
  };
  const geo = roofGeometry(spec);

  /* Fit the plot to the picture. */
  const fitPts: Array<[number, number, number]> = [
    [slabL, 0, slabF], [slabR, 0, slabF], [slabR, -6, slabF], [slabR, 0, slabB], [slabL, 0, slabB],
    [mainX, isFlat ? floors * 24 : geo.ridge + 12, d / 2], [mainX + w, isFlat ? floors * 24 : geo.ridge, d / 2],
    [isFlat ? 0 : mainX, isFlat ? floors * 24 : geo.ridge, isFlat ? d : d / 2],
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
  if (!isFlat) {
    if (s.driveway === "garage" && attachedGarage) drive = [garageX + 2, garageX + gw - 2];
    else if (s.driveway === "garage" && integral && layout.integralDoor) drive = [mainX + layout.integralDoor.x - 3, mainX + layout.integralDoor.x + layout.integralDoor.w + 3];
    else if (s.driveway === "full") drive = [groupL, groupR];
    else if (s.driveway === "house" || s.driveway === "garage") {
      const doorMid = mainX + (layout.door ? layout.door.x + layout.door.w / 2 : w / 2);
      drive = doorMid > mainX + w / 2 ? [mainX, doorMid - 9] : [doorMid + 9, mainX + w];
      if (attachedGarage) drive = [garageX + 2, garageX + gw - 2];
    }
  }
  const span = drive ? drive[1] - drive[0] : 0;
  const carXs = drive && cars ? (cars === 2 && span >= 45 ? [drive[0] + span * 0.27 - CAR_W / 2, drive[0] + span * 0.73 - CAR_W / 2] : span >= 21 ? [drive[0] + span / 2 - CAR_W / 2] : []) : [];
  const carColours = ["#34404f", "#eceeef"];
  const carZ = PLOT + 5;

  /* Things on the front wall: meter box, outside tap, EV charger. */
  const door = layout.door;
  const meterX = door ? mainX + (doorSide === "right" || (integral === "left") ? door.x + door.w + 2.4 : door.x - 7.4) : mainX + w / 2;
  const groundWin = layout.wins.find((win) => win.h1 < FH);
  const tapX = groundWin ? mainX + (groundWin.x > (door?.x ?? 0) ? groundWin.x + groundWin.w + 2.5 : groundWin.x - 4) : mainX + 4;
  let charger: { x: number; onGarage: boolean } | null = null;
  if (s.charger && !isFlat) {
    if (attachedGarage && drive && drive[0] >= garageX - 1 && drive[1] <= garageX + gw + 1) charger = { x: garageSide === "right" ? garageX + gw - 3.4 : garageX + 0.4, onGarage: true };
    else if (drive && drive[0] <= mainX + 2) charger = { x: mainX + 2.2, onGarage: false };
    else charger = { x: mainX + w - 5.4, onGarage: false };
  }
  const chargedCar = charger && carXs.length ? carXs.reduce((best, cx) => (Math.abs(cx + CAR_W - charger!.x) < Math.abs(best + CAR_W - charger!.x) ? cx : best)) : null;

  /* Path to the door when there's a lawn and the drive doesn't reach it. */
  const doorX = layout.door ? mainX + layout.door.x : null;
  const path = !isFlat && s.grass !== false && doorX != null && !(drive && doorX >= drive[0] - 2 && doorX + 10 <= drive[1] + 2) ? [doorX - 2, doorX + 12] : isFlat ? [w / 2 - 10, w / 2 + 10] : null;

  const ground = s.grass !== false ? pal.lawn : pal.paving;

  /* Where each infographic marker points. */
  const slopeAt = (t: number) => [geo.eave + (geo.ridge - geo.eave) * t, -geo.ov + (d / 2 + geo.ov) * t] as const;
  const [roofY, roofZ] = slopeAt(0.4);
  const anchors: Partial<Record<HouseHotspot["id"], [number, number]>> = isFlat
    ? { home: v.P(w / 2, Math.max(3, Math.min(6, Math.round(Number(s.storeys) || 4))) * 24, d / 2), electricity: v.P(w / 2 - 14, 12, 0), gas: v.P(w / 2 - 14, 6, 0), water: v.P(w / 2 + 14, 6, 0) }
    : {
        home: v.P(mainX + w / 2, geo.ridge, d / 2),
        solar: v.P(mainX + w / 2, roofY, roofZ),
        electricity: v.P(meterX + 2.5, 9.4, -0.4),
        gas: v.P(meterX + 2.5, 3.4, -0.4),
        water: v.P(tapX + 0.8, 6, -0.4),
        ...(charger ? { charger: v.P(charger.x + 1.6, 14.4, -0.6) } : {}),
        ...(carXs.length ? { car: v.P(carXs[0] + CAR_W / 2, 15.3, carZ + 20) } : {}),
      };

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

      {/* The patch of ground: a slab with soil edges */}
      <ellipse cx={v.P((slabL + slabR) / 2, 0, (slabF + slabB) / 2)[0] + 10} cy={v.P((slabL + slabR) / 2, 0, (slabF + slabB) / 2)[1] + 16} rx={(slabR - slabL) * k * 0.62} ry={(slabB - slabF) * k * 0.26} fill="#000" opacity={night ? 0.25 : 0.07} />
      <polygon points={v.pts([[slabL, 0, slabF], [slabR, 0, slabF], [slabR, -6, slabF], [slabL, -6, slabF]])} fill={pal.soil} />
      <polygon points={v.pts([[slabR, 0, slabF], [slabR, 0, slabB], [slabR, -6, slabB], [slabR, -6, slabF]])} fill={pal.soilSide} />
      <polygon points={v.pts([[slabL, 0, slabF], [slabR, 0, slabF], [slabR, 0, slabB], [slabL, 0, slabB]])} fill={pal.lawn} />
      {/* Our plot */}
      <polygon points={v.pts([[groupL - (neighbours.includes("left") ? 0 : 16), 0, PLOT], [groupR + (neighbours.includes("right") ? 0 : 16), 0, PLOT], [groupR + (neighbours.includes("right") ? 0 : 16), 0, 0], [groupL - (neighbours.includes("left") ? 0 : 16), 0, 0]])} fill={isFlat ? pal.lawn : ground} />
      {!isFlat && s.grass !== false ? (
        <g transform={v.flat(0)}>
          {Array.from({ length: Math.ceil((groupR - groupL + 32) / 16) }, (_, i) => (
            <rect key={i} x={groupL - 16 + i * 16} y={PLOT} width={8} height={-PLOT} fill="#ffffff" opacity={0.06} />
          ))}
        </g>
      ) : null}
      {!isFlat && s.grass === false ? (
        <g transform={v.flat(0)}>
          {Array.from({ length: 12 }, (_, i) => <line key={i} x1={groupL - 16} x2={groupR + 16} y1={PLOT + i * 5} y2={PLOT + i * 5} stroke="#000" strokeOpacity={0.05} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />)}
        </g>
      ) : null}
      {/* Pavement and kerb */}
      <polygon points={v.pts([[slabL, 0, slabF], [slabR, 0, slabF], [slabR, 0, PLOT], [slabL, 0, PLOT]])} fill={pal.pavement} />
      <polygon points={v.pts([[slabL, 0, PLOT], [slabR, 0, PLOT], [slabR, 0, PLOT + 1.6], [slabL, 0, PLOT + 1.6]])} fill={pal.kerb} />
      {drive ? <polygon points={v.pts([[drive[0], 0, slabF], [drive[1], 0, slabF], [drive[1], 0, 0], [drive[0], 0, 0]])} fill={pal.tarmac} /> : null}
      {path ? <polygon points={v.pts([[path[0], 0, PLOT], [path[1], 0, PLOT], [path[1], 0, 0], [path[0], 0, 0]])} fill={pal.paving} /> : null}

      {/* Trees at the back */}
      <Tree v={v} x={slabL + 10} z={slabB - 10} r={12} pal={pal} />
      <Tree v={v} x={slabR - 14} z={slabB - 6} r={14} pal={pal} />

      {/* House shadow on the ground */}
      {!isFlat ? <polygon points={v.pts([[groupR, 0, 0], [groupR + 14, 0, 6], [groupR + 14, 0, d + 4], [groupR, 0, d]])} fill={pal.shadow} /> : null}
      <polygon points={v.pts([[isFlat ? 0 : groupL, 0, -3], [isFlat ? w : groupR, 0, -3], [isFlat ? w : groupR, 0, 0], [isFlat ? 0 : groupL, 0, 0]])} fill={pal.shadow} />

      {isFlat ? (
        <Flats v={v} s={s} pal={pal} ids={ids} ext={ext} roof={roof} />
      ) : (
        <g>
          {neighbours.includes("left") ? (
            <House v={v} pal={pal} ids={ids} s={s} clay ext={ext} upperExt={ext} roof={roof}
              spec={{ x0: mainX - nW, w: nW, d, floors, loft: false, openLeft: true, openRight: false, chimney: null, wins: [], door: null, integralDoor: null }} />
          ) : null}
          {attachedGarage && garageSide === "left" ? <Garage v={v} x0={garageX} w={gw} d={d - 18} setback={6} openRight={false} pal={pal} ids={ids} ext={ext} /> : null}
          <House v={v} spec={spec} pal={pal} ids={ids} s={s} ext={ext} upperExt={upperExt} roof={roof} />
          {attachedGarage && garageSide === "right" ? <Garage v={v} x0={garageX} w={gw} d={d - 18} setback={6} openRight pal={pal} ids={ids} ext={ext} /> : null}
          {neighbours.includes("right") ? (
            <House v={v} pal={pal} ids={ids} s={s} clay ext={ext} upperExt={ext} roof={roof}
              spec={{ x0: mainX + w, w: nW, d, floors, loft: false, openLeft: false, openRight: true, chimney: null, wins: [], door: null, integralDoor: null }} />
          ) : null}
        </g>
      )}

      {/* Shrubs under the ground-floor windows */}
      {s.shrubs !== false && !isFlat
        ? layout.wins.filter((win) => win.h1 < FH).map((win, i) => <Shrub key={i} v={v} x0={mainX + win.x - 1} x1={mainX + win.x + win.w + 1} pal={pal} />)
        : null}
      {s.shrubs !== false && isFlat ? <Shrub v={v} x0={8} x1={34} pal={pal} /> : null}

      {/* Meter box, outside tap and charger */}
      {!isFlat ? (
        <g transform={v.front(-0.4)}>
          <rect x={meterX} y={-12} width={5} height={5.2} rx={0.6} fill={pal.night ? "#9aa0a8" : "#f2f1ec"} />
          <rect x={meterX} y={-6} width={5} height={5.2} rx={0.6} fill={pal.night ? "#8b9198" : "#e6e4dd"} />
          <rect x={tapX} y={-7} width={1.6} height={2.6} fill="#9aa3ad" />
          <rect x={tapX - 0.6} y={-7.4} width={2.8} height={1} rx={0.4} fill="#3f6fb5" />
        </g>
      ) : null}
      {charger ? (
        <g transform={v.front(-0.6)}>
          <rect x={charger.x} y={-17} width={3.2} height={5.2} rx={0.8} fill={pal.night ? "#c9ced4" : "#f6f7f8"} />
          <rect x={charger.x + 0.6} y={-16.2} width={2} height={1.8} rx={0.3} fill="#20262e" />
          <circle cx={charger.x + 1.6} cy={-13} r={0.45} fill="#34d399" />
        </g>
      ) : null}

      {carXs.map((cx, i) => <Car key={i} v={v} x={cx} z={carZ} colour={carColours[i]} pal={pal} />)}
      {charger ? (() => {
        const [ax, ay] = v.P(charger.x + 1.6, 11.8, -0.6);
        if (chargedCar == null) {
          const [hx, hy] = v.P(charger.x + 1.6, 9.5, -0.8);
          return <path d={`M${ax} ${ay} Q${ax + v.k * 2} ${hy + v.k * 2} ${hx} ${hy}`} fill="none" stroke="#1f242b" strokeWidth={v.k * 0.8} />;
        }
        const [px, py] = v.P(chargedCar + CAR_W, 8.8, carZ + 39);
        const [cx, cy] = v.P((charger.x + chargedCar + CAR_W) / 2 + 4, 0.4, (carZ + 39) / 2);
        return <path d={`M${ax} ${ay} Q${cx} ${cy} ${px} ${py}`} fill="none" stroke="#1f242b" strokeWidth={v.k * 0.8} strokeLinecap="round" />;
      })() : null}

      {hotspots?.length ? <Hotspots items={hotspots} anchors={anchors} /> : null}
    </svg>
  );
}

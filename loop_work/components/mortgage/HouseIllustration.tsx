// A cut-away drawing of the person's home at night: the front taken off so
// the warm, lit rooms show inside, under a dark sky. Built from a few choices:
// the kind of house, floors (a loft room shows in the roof), the garage, the
// outside colour and roof, and the front: lawn, driveway and cars.
import { useId } from "react";

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
};

export const DOOR_COLOURS = ["#1f4f3d", "#24324a", "#7a2626", "#2f2f2f", "#5d6d7a", "#ffffff"];
export const BRICK_COLOURS: Array<[string, string]> = [["#a8513a", "Red"], ["#b86a45", "Orange"], ["#8a4a36", "Brown"], ["#c9a46e", "Buff"], ["#9c8f84", "Grey"]];
export const RENDER_COLOURS: Array<[string, string]> = [["#f3f1ea", "White"], ["#ece2c9", "Cream"], ["#d3d5d1", "Grey"], ["#c3cdb6", "Sage"]];
export const ROOF_COLOURS: Array<[string, string]> = [["#2b313b", "Slate grey"], ["#5a2f27", "Red tile"], ["#3e2f27", "Brown tile"], ["#1f2329", "Charcoal"]];

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
const H = 230;
const G = 186; // ground line
const FLOOR = 42;
const WALL = 6;
const SLAB = 4;

const C = {
  skyTop: "#0b1322",
  skyBottom: "#1a2638",
  star: "#e8eefb",
  trees: "#132028",
  treesLight: "#18282f",
  lawn: "#2e4a30",
  lawnLight: "#36573a",
  paving: "#30343a",
  drive: "#43474e",
  driveEdge: "#55595f",
  slab: "#6f7680",
  section: "#8d949d",
  roomTop: "#f1e0bf",
  roomBottom: "#dcc39a",
  attic: "#3a414d",
  furniture: "#b9b3a8",
  furnitureDark: "#8f897f",
  wood: "#b08a62",
  bedding: "#e9e5dd",
  glow: "#ffe7b0",
  litWindow: "#f2cf86",
  darkWindow: "#2a3442",
  garageLight: "#e3d8c2",
  shrub: "#24402a",
};

const shade = (hex: string, amount: number) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 - amount))));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, "0")).join("")}`;
};

const roofHeight = (w: number, floors: number, wallTop: number) => Math.min(w * 0.42, floors === 1 ? 56 : 70, wallTop - 14);

/* ---------- furniture: simple flat shapes standing on a floor at y ---------- */

function Sofa({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y - 12} width={34} height={8} rx={2} fill={C.furniture} />
      <rect x={x - 3} y={y - 9} width={5} height={9} rx={2} fill={C.furnitureDark} />
      <rect x={x + 32} y={y - 9} width={5} height={9} rx={2} fill={C.furnitureDark} />
      <rect x={x + 1} y={y - 6} width={32} height={6} rx={1.5} fill={shade(C.furniture, -0.08)} />
    </g>
  );
}

function Tv({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y - 26} width={24} height={14} rx={1} fill="#1d2229" />
      <rect x={x - 4} y={y - 8} width={32} height={8} rx={1} fill={C.wood} />
    </g>
  );
}

function Bed({ x, y, w = 38 }: { x: number; y: number; w?: number }) {
  return (
    <g>
      <rect x={x} y={y - 16} width={5} height={16} rx={1} fill={C.wood} />
      <rect x={x + 2} y={y - 9} width={w} height={7} rx={2} fill={C.bedding} />
      <rect x={x + 6} y={y - 13} width={10} height={5} rx={2} fill="#ffffff" />
      <rect x={x + 2} y={y - 3} width={w} height={3} fill={C.furnitureDark} />
    </g>
  );
}

function BedsideLamp({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y - 8} width={8} height={8} rx={1} fill={C.wood} />
      <circle cx={x + 4} cy={y - 12} r={3.2} fill={C.glow} />
    </g>
  );
}

function Table({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y - 12} width={24} height={2.5} fill={C.wood} />
      <rect x={x + 2} y={y - 10} width={2} height={10} fill={C.wood} />
      <rect x={x + 20} y={y - 10} width={2} height={10} fill={C.wood} />
      <rect x={x - 6} y={y - 16} width={5} height={16} rx={1} fill={C.furniture} />
      <rect x={x + 25} y={y - 16} width={5} height={16} rx={1} fill={C.furniture} />
    </g>
  );
}

function Stairs({ x, y, rise, dir }: { x: number; y: number; rise: number; dir: 1 | -1 }) {
  const steps = 7;
  const run = 3.5;
  const h = rise / steps;
  let d = `M${x} ${y}`;
  for (let i = 0; i < steps; i++) d += ` v${-h} h${dir * run}`;
  d += ` V${y} Z`;
  return <path d={d} fill={shade(C.wood, 0.05)} opacity={0.9} />;
}

function Plant({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x - 3} y={y - 6} width={6} height={6} fill={C.furnitureDark} />
      <ellipse cx={x} cy={y - 12} rx={5} ry={7} fill="#5f7f55" />
    </g>
  );
}

function Pendant({ cx, y }: { cx: number; y: number }) {
  return (
    <g>
      <line x1={cx} y1={y} x2={cx} y2={y + 6} stroke="#7a7368" strokeWidth={0.8} />
      <path d={`M${cx - 4} ${y + 9} L${cx - 2} ${y + 6} H${cx + 2} L${cx + 4} ${y + 9} Z`} fill="#f6f0e2" />
    </g>
  );
}

function Car({ cx, y, colour }: { cx: number; y: number; colour: string }) {
  // Front view, about 44 wide and 28 tall from y.
  return (
    <g>
      <path d={`M${cx - 17} ${y + 12} L${cx - 12} ${y + 1} H${cx + 12} L${cx + 17} ${y + 12} Z`} fill={colour} />
      <path d={`M${cx - 13} ${y + 11} L${cx - 9} ${y + 4} H${cx + 9} L${cx + 13} ${y + 11} Z`} fill="#2a313a" />
      <rect x={cx - 22} y={y + 11} width={44} height={12} rx={4} fill={colour} />
      <rect x={cx - 19} y={y + 15} width={7} height={3} rx={1.5} fill="#fff6dc" />
      <rect x={cx + 12} y={y + 15} width={7} height={3} rx={1.5} fill="#fff6dc" />
      <rect x={cx - 6} y={y + 17} width={12} height={3} rx={1} fill={shade(colour, 0.35)} />
      <rect x={cx - 20} y={y + 23} width={8} height={5} rx={1.5} fill="#15181c" />
      <rect x={cx + 12} y={y + 23} width={8} height={5} rx={1.5} fill="#15181c" />
    </g>
  );
}

/* ---------- the cut-away house ---------- */

type Ids = { sky: string; room: string; glow: string };

function CutawayHouse({ x, w, storeys, ext, upperExt, roof, ids }: { x: number; w: number; storeys: number; ext: string; upperExt: string; roof: string; ids: Ids }) {
  const floors = Math.max(1, Math.floor(storeys));
  const loftRoom = storeys > floors;
  const wallTop = G - floors * FLOOR;
  const roofH = roofHeight(w, floors, wallTop);
  const apexX = x + w / 2;
  const apexY = wallTop - roofH;
  const mid = x + w / 2;
  const t = 7; // roof thickness

  const rooms = Array.from({ length: floors }, (_, f) => {
    const floorY = G - f * FLOOR;
    return { floorY, top: floorY - FLOOR + SLAB, f };
  });
  const loftFloor = wallTop - SLAB / 2;

  return (
    <g>
      {/* Roof: a thick dark outline with the loft (lit room or dark attic) inside. */}
      <polygon points={`${x - 10},${wallTop + 2} ${apexX},${apexY - 5} ${x + w + 10},${wallTop + 2}`} fill={roof} />
      <polygon points={`${x + t + 2},${wallTop} ${apexX},${apexY + t * 1.6} ${x + w - t - 2},${wallTop}`} fill={loftRoom ? `url(#${ids.room})` : C.attic} />
      {loftRoom ? <ellipse cx={apexX} cy={wallTop - 8} rx={w * 0.25} ry={roofH * 0.45} fill={`url(#${ids.glow})`} /> : null}

      {/* Walls, seen as the cut edge in the outside colour */}
      <rect x={x} y={wallTop} width={w} height={G - wallTop} fill={ext} />
      {floors > 1 && upperExt !== ext ? <rect x={x} y={wallTop} width={w} height={G - FLOOR - wallTop} fill={upperExt} /> : null}
      {rooms.map(({ top, floorY, f }) => (
        <g key={f}>
          <rect x={x + WALL} y={top} width={w - WALL * 2} height={floorY - top} fill={`url(#${ids.room})`} />
          <ellipse cx={x + w * 0.27} cy={top + FLOOR * 0.42} rx={w * 0.2} ry={FLOOR * 0.42} fill={`url(#${ids.glow})`} />
          <ellipse cx={x + w * 0.73} cy={top + FLOOR * 0.42} rx={w * 0.2} ry={FLOOR * 0.42} fill={`url(#${ids.glow})`} />
          <rect x={x + WALL} y={floorY - 1.5} width={w - WALL * 2} height={1.5} fill={shade(C.wood, 0.1)} opacity={0.7} />
          <rect x={x} y={top - SLAB} width={w} height={SLAB} fill={C.section} />
        </g>
      ))}
      <rect x={x - 2} y={loftFloor - SLAB / 2} width={w + 4} height={SLAB} fill={C.section} />
      {/* The partition between front rooms, stopping short on the ground floor so the stairs show. */}
      {rooms.map(({ top, floorY, f }) =>
        f === 0 && floors > 1 ? null : <rect key={`p${f}`} x={mid - 2} y={top} width={4} height={floorY - top} fill={C.section} />,
      )}
      <rect x={x} y={G} width={w} height={3} fill={C.slab} />

      {/* Furniture */}
      {rooms.map(({ floorY, top, f }) => {
        const leftX = x + WALL + 10;
        const rightX = mid + 10;
        const half = w / 2 - WALL - 12;
        if (f === 0) {
          return (
            <g key={`fur${f}`}>
              <Pendant cx={x + w * 0.27} y={top} />
              <Pendant cx={x + w * 0.73} y={top} />
              {floors > 1 ? <Stairs x={mid + 4} y={floorY} rise={FLOOR - SLAB} dir={-1} /> : null}
              {half > 46 ? <Table x={leftX + 4} y={floorY} /> : <Plant x={leftX + 6} y={floorY} />}
              <Sofa x={rightX + (half > 50 ? 8 : 2)} y={floorY} />
              <Plant x={x + w - WALL - 7} y={floorY} />
            </g>
          );
        }
        return (
          <g key={`fur${f}`}>
            <Pendant cx={x + w * 0.27} y={top} />
            <Pendant cx={x + w * 0.73} y={top} />
            {f === floors - 1 || floors < 3 ? <Bed x={leftX} y={floorY} w={Math.min(34, half - 14)} /> : <Tv x={leftX + 6} y={floorY} />}
            <BedsideLamp x={leftX + Math.min(34, half - 14) + 6} y={floorY} />
            <Bed x={rightX} y={floorY} w={Math.min(36, half - 14)} />
            <BedsideLamp x={rightX + Math.min(36, half - 14) + 6} y={floorY} />
          </g>
        );
      })}
      {loftRoom ? (
        <g>
          <Bed x={apexX - 22} y={loftFloor - SLAB / 2} w={30} />
          <circle cx={apexX} cy={apexY + 18} r={2.5} fill={C.glow} />
        </g>
      ) : null}
    </g>
  );
}

/** A neighbour's house: not cut away, just the dark front with lit windows. */
function Neighbour({ x, w, storeys, ext, roof, seed }: { x: number; w: number; storeys: number; ext: string; roof: string; seed: number }) {
  const floors = Math.max(1, Math.floor(storeys));
  const wallTop = G - floors * FLOOR;
  const roofH = roofHeight(w / 0.62, floors, wallTop);
  return (
    <g>
      <polygon points={`${x - 6},${wallTop + 2} ${x + w / 2},${wallTop - roofH * 0.8} ${x + w + 6},${wallTop + 2}`} fill={shade(roof, 0.25)} />
      <rect x={x} y={wallTop} width={w} height={G - wallTop} fill={shade(ext, 0.6)} />
      {Array.from({ length: floors }, (_, f) =>
        [0, 1].map((i) => {
          const lit = (f + i + seed) % 3 !== 0;
          return <rect key={`${f}-${i}`} x={x + w * (0.3 + i * 0.4) - 8} y={G - (f + 1) * FLOOR + 12} width={16} height={16} rx={1} fill={lit ? C.litWindow : C.darkWindow} opacity={lit ? 0.8 : 1} />;
        }),
      )}
    </g>
  );
}

function Garage({ x, w, ext, roof, carInside }: { x: number; w: number; ext: string; roof: string; carInside: boolean }) {
  const h = 48;
  return (
    <g>
      <polygon points={`${x - 4},${G - h + 2} ${x + 8},${G - h - 12} ${x + w - 8},${G - h - 12} ${x + w + 4},${G - h + 2}`} fill={roof} />
      <rect x={x} y={G - h} width={w} height={h} fill={ext} />
      <rect x={x + WALL} y={G - h + WALL} width={w - WALL * 2} height={h - WALL} fill={C.garageLight} />
      <rect x={x + WALL} y={G - h + WALL} width={w - WALL * 2} height={8} fill="#c8ccd1" />
      <line x1={x + WALL} x2={x + w - WALL} y1={G - h + WALL + 8} y2={G - h + WALL + 8} stroke="#aeb3b9" strokeWidth={0.8} />
      {carInside ? <Car cx={x + w / 2} y={G - 29} colour="#8b96a1" /> : null}
      <rect x={x} y={G} width={w} height={3} fill={C.slab} />
    </g>
  );
}

function Sky({ ids }: { ids: Ids }) {
  const stars = [[22, 18], [64, 40], [110, 14], [150, 30], [205, 12], [248, 36], [292, 20], [334, 44], [40, 70], [318, 82], [180, 50], [86, 92]];
  return (
    <g>
      <rect width={W} height={H} fill={`url(#${ids.sky})`} />
      <circle cx={322} cy={26} r={9} fill="#f3ecd6" opacity={0.9} />
      {stars.map(([sx, sy], i) => <circle key={i} cx={sx} cy={sy} r={i % 4 === 0 ? 1.1 : 0.7} fill={C.star} opacity={0.8} />)}
      <ellipse cx={14} cy={G - 40} rx={34} ry={52} fill={C.trees} />
      <ellipse cx={348} cy={G - 34} rx={32} ry={46} fill={C.trees} />
      <ellipse cx={306} cy={G - 20} rx={24} ry={28} fill={C.treesLight} />
      <ellipse cx={52} cy={G - 18} rx={24} ry={26} fill={C.treesLight} />
    </g>
  );
}

function Front({ s, driveFrom, driveTo, cars }: { s: HouseStyle; driveFrom: number | null; driveTo: number | null; cars: number[] }) {
  const grass = s.grass !== false;
  return (
    <g>
      <rect y={G} width={W} height={H - G} fill={grass ? C.lawn : C.paving} />
      {grass ? <rect y={G} width={W} height={2.5} fill={C.lawnLight} /> : null}
      {driveFrom != null && driveTo != null ? (
        <g>
          <polygon points={`${driveFrom},${G} ${driveTo},${G} ${driveTo + 12},${H} ${driveFrom - 12},${H}`} fill={C.drive} />
          <line x1={driveTo} y1={G} x2={driveTo + 12} y2={H} stroke={C.driveEdge} strokeWidth={1.5} />
          <line x1={driveFrom} y1={G} x2={driveFrom - 12} y2={H} stroke={C.driveEdge} strokeWidth={1.5} />
        </g>
      ) : null}
      {cars.map((cx, i) => <Car key={i} cx={cx} y={G + 8} colour={i ? "#e4e5e2" : "#8b96a1"} />)}
      {s.shrubs !== false ? (
        <g>
          <ellipse cx={10} cy={G + 3} rx={18} ry={9} fill={C.shrub} />
          <ellipse cx={350} cy={G + 3} rx={18} ry={9} fill={C.shrub} />
        </g>
      ) : null}
    </g>
  );
}

export function HouseIllustration({ style, className }: { style: HouseStyle; className?: string }) {
  const uid = useId().replace(/[^a-z0-9]/gi, "");
  const ids: Ids = { sky: `s${uid}`, room: `r${uid}`, glow: `g${uid}` };
  const s: HouseStyle = { storeys: 2, garage: "none", garageSide: "right", attachedSide: "left", grass: true, shrubs: true, driveway: "none", render: "none", cars: 0, ...style };
  // The outside colour shows as the cut edge of the walls.
  const ext = s.render === "full" ? s.renderColour || RENDER_COLOURS[0][0] : s.brick || BRICK_COLOURS[0][0];
  // Half-rendered houses show the render on the upper floors.
  const upperExt = s.render === "upper" ? s.renderColour || RENDER_COLOURS[0][0] : ext;
  const roof = s.roof || ROOF_COLOURS[0][0];

  const defs = (
    <defs>
      <linearGradient id={ids.sky} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={C.skyTop} />
        <stop offset="1" stopColor={C.skyBottom} />
      </linearGradient>
      <linearGradient id={ids.room} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={C.roomTop} />
        <stop offset="1" stopColor={C.roomBottom} />
      </linearGradient>
      <radialGradient id={ids.glow}>
        <stop offset="0" stopColor={C.glow} stopOpacity="0.55" />
        <stop offset="1" stopColor={C.glow} stopOpacity="0" />
      </radialGradient>
    </defs>
  );

  if (s.type === "flat") {
    const floors = Math.max(3, Math.min(6, Math.round(Number(s.storeys) || 4)));
    const fh = 32;
    const x = 110;
    const w = 140;
    const top = G - floors * fh;
    const mine = Math.min(1, floors - 1);
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label="Cut-away drawing of a block of flats at night">
        {defs}
        <Sky ids={ids} />
        <Front s={s} driveFrom={null} driveTo={null} cars={[]} />
        <rect x={x - 4} y={top - 7} width={w + 8} height={8} fill={roof} />
        <rect x={x} y={top} width={w} height={G - top} fill={ext} />
        {Array.from({ length: floors }, (_, f) => {
          const floorY = G - f * fh;
          const roomTop = floorY - fh + SLAB;
          const isMine = f === mine;
          return (
            <g key={f}>
              <rect x={x + WALL} y={roomTop} width={w - WALL * 2} height={fh - SLAB} fill={isMine ? `url(#${ids.room})` : shade(C.roomBottom, 0.62)} />
              {isMine ? (
                <g>
                  <ellipse cx={x + w / 2} cy={roomTop + 4} rx={w * 0.35} ry={fh * 0.6} fill={`url(#${ids.glow})`} />
                  <Sofa x={x + 18} y={floorY} />
                  <rect x={x + w / 2 - 1.5} y={roomTop} width={3} height={fh - SLAB} fill={C.section} />
                  <Bed x={x + w / 2 + 10} y={floorY} w={34} />
                  <BedsideLamp x={x + w / 2 + 50} y={floorY} />
                </g>
              ) : (
                [0, 1].map((i) => <rect key={i} x={x + 22 + i * 66} y={roomTop + 7} width={30} height={13} rx={1} fill={(f + i) % 3 ? C.litWindow : C.darkWindow} opacity={0.7} />)
              )}
              <rect x={x} y={roomTop - SLAB} width={w} height={SLAB} fill={C.section} />
            </g>
          );
        })}
        <rect x={x} y={G} width={w} height={3} fill={C.slab} />
      </svg>
    );
  }

  const storeys = s.type === "bungalow" ? 1 : Number(s.storeys) || 2;
  const mainW = s.type === "bungalow" ? 170 : s.type === "detached" ? 160 : s.type === "semi" ? 144 : 124;
  const attachedGarage = (s.type === "detached" || s.type === "semi" || s.type === "bungalow") && (s.garage === "single" || s.garage === "double");
  const garageW = s.garage === "double" ? 92 : 60;
  const neighbours: Array<"left" | "right"> =
    s.type === "terraced" ? ["left", "right"] : s.type === "semi" || s.type === "end_terrace" ? [s.attachedSide || "left"] : [];
  const garageSide = s.type === "semi" ? ((s.attachedSide || "left") === "left" ? "right" : "left") : s.garageSide || "right";

  const groupW = mainW + (attachedGarage ? garageW : 0);
  let x = W / 2 - groupW / 2;
  if (neighbours.length === 1) x += neighbours[0] === "left" ? 28 : -28;
  const mainX = attachedGarage && garageSide === "left" ? x + garageW : x;
  const garageX = garageSide === "left" ? x : mainX + mainW;
  const nW = Math.round(mainW * 0.62);

  // Driveway and cars.
  const cars = Math.min(2, Number(s.cars || 0));
  let driveFrom: number | null = null;
  let driveTo: number | null = null;
  if (s.driveway === "garage" && attachedGarage) {
    driveFrom = garageX + 4;
    driveTo = garageX + garageW - 4;
  } else if (s.driveway === "full") {
    driveFrom = attachedGarage ? Math.min(mainX, garageX) : mainX;
    driveTo = attachedGarage ? Math.max(mainX + mainW, garageX + garageW) : mainX + mainW;
  } else if (s.driveway === "house" || s.driveway === "garage") {
    const openRight = neighbours.length !== 1 || neighbours[0] === "left";
    driveFrom = openRight ? mainX + mainW * 0.5 : mainX;
    driveTo = openRight ? mainX + mainW : mainX + mainW * 0.5;
  }
  const span = driveFrom != null && driveTo != null ? driveTo - driveFrom : 0;
  const integral = s.garage === "integral";
  const carInGarage = (attachedGarage || integral) && cars > 0 && s.driveway !== "full";
  const onDrive = Math.max(0, cars - (carInGarage ? 1 : 0));
  const carSpots = onDrive && span >= 44 ? (onDrive === 2 && span >= 96 ? [driveFrom! + span * 0.27, driveFrom! + span * 0.73] : [driveFrom! + span / 2]) : [];
  const integralLeft = (s.garageSide || "right") === "left";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={`Cut-away drawing of a ${s.type.replace("_", " ")} house at night`}>
      {defs}
      <Sky ids={ids} />
      {neighbours.map((side, i) => (
        <Neighbour key={side} x={side === "left" ? mainX - nW : mainX + mainW} w={nW} storeys={storeys} ext={ext} roof={roof} seed={i} />
      ))}
      <Front s={s} driveFrom={driveFrom} driveTo={driveTo} cars={carSpots} />
      {attachedGarage ? <Garage x={garageX} w={garageW} ext={ext} roof={roof} carInside={carInGarage} /> : null}
      <CutawayHouse x={mainX} w={mainW} storeys={storeys} ext={ext} upperExt={upperExt} roof={roof} ids={ids} />
      {integral ? (
        <g>
          <rect x={integralLeft ? mainX + WALL : mainX + mainW / 2 + 2} y={G - FLOOR + SLAB} width={mainW / 2 - WALL - 2} height={FLOOR - SLAB} fill={C.garageLight} />
          <rect x={integralLeft ? mainX + WALL : mainX + mainW / 2 + 2} y={G - FLOOR + SLAB} width={mainW / 2 - WALL - 2} height={7} fill="#c8ccd1" />
          {carInGarage ? <Car cx={integralLeft ? mainX + mainW / 4 + 2 : mainX + mainW * 0.75 - 2} y={G - 29} colour="#8b96a1" /> : null}
        </g>
      ) : null}
    </svg>
  );
}

// A drawing of the person's home in the style of a British house: brick or
// part-rendered walls, a tiled roof (with dormers for a loft room), white
// windows with sills, a porch canopy, and the front: lawn, shrubs, a path and
// a driveway. Neighbours are drawn faintly so a semi or terrace reads as one.
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
export const ROOF_COLOURS: Array<[string, string]> = [["#4b5260", "Slate grey"], ["#7c4334", "Red tile"], ["#5a4236", "Brown tile"], ["#2f343b", "Charcoal"]];

/** A sensible starting drawing from the property type LOOP already has. */
export function defaultHouseStyle(propertyType?: string | null): HouseStyle {
  const t = String(propertyType || "").toLowerCase();
  const front = { grass: true, shrubs: true, brick: BRICK_COLOURS[0][0], roof: ROOF_COLOURS[0][0], render: "none" as const };
  if (/flat|apartment|maisonette/.test(t)) return { ...front, type: "flat", storeys: 4 };
  if (/bungalow/.test(t)) return { ...front, type: "bungalow", storeys: 1, garage: "none", driveway: "house" };
  if (/end/.test(t) && /terrace/.test(t)) return { ...front, type: "end_terrace", storeys: 2, attachedSide: "left" };
  if (/terrace/.test(t)) return { ...front, type: "terraced", storeys: 2 };
  if (/semi/.test(t)) return { ...front, type: "semi", storeys: 2, attachedSide: "left", garage: "none", garageSide: "right", driveway: "house" };
  if (/detached/.test(t)) return { ...front, type: "detached", storeys: 2, garage: "single", garageSide: "right", driveway: "garage" };
  return { ...front, type: "semi", storeys: 2, attachedSide: "left", garage: "none", driveway: "house" };
}

const W = 360;
const H = 230;
const G = 168; // where the walls meet the ground
const FLOOR = 44;

const C = {
  sky: "#eaf1ee",
  mortar: "#e9dfd3",
  window: "#c9dbe6",
  glassShine: "#e3eef4",
  frame: "#ffffff",
  sill: "#e6e1d8",
  garage: "#eef0f2",
  grass: "#9cbf7f",
  grassDark: "#8ab06d",
  paving: "#cfc8bb",
  drive: "#5e6166",
  pavement: "#e4e1db",
  kerb: "#cdc9c1",
  shrub: "#5d8c4c",
  shrubLight: "#79a862",
  stone: "#efe9de",
};

type Look = { brick: string; render: "none" | "upper" | "full"; renderColour: string; roof: string; door: string; ids: { brick: string; tiles: string } };

const darker = (hex: string, amount = 0.14) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.round(v * (1 - amount)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, "0")).join("")}`;
};

function Defs({ look }: { look: Look }) {
  // Flat colours: the ids stay so walls and roofs can share one definition.
  return (
    <defs>
      <pattern id={look.ids.brick} width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill={look.brick} /></pattern>
      <pattern id={look.ids.tiles} width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill={look.roof} /></pattern>
    </defs>
  );
}

function Window({ cx, y, w = 24, h = 26, onBrick, lookBrick }: { cx: number; y: number; w?: number; h?: number; onBrick: boolean; lookBrick: string }) {
  return (
    <g>
      {onBrick ? <rect x={cx - w / 2 - 2} y={y - 4} width={w + 4} height={4} fill={darker(lookBrick, 0.18)} /> : null}
      <rect x={cx - w / 2} y={y} width={w} height={h} fill={C.frame} />
      <rect x={cx - w / 2 + 2.5} y={y + 2.5} width={w / 2 - 3.5} height={h - 5} fill={C.window} />
      <rect x={cx + 1} y={y + 2.5} width={w / 2 - 3.5} height={h - 5} fill={C.window} />
      <rect x={cx - w / 2 - 2} y={y + h} width={w + 4} height={3} fill={C.sill} />
    </g>
  );
}

function Door({ x, look }: { x: number; look: Look }) {
  const white = look.door.toLowerCase() === "#ffffff";
  return (
    <g>
      <rect x={x - 12} y={G - 38} width={24} height={38} fill={C.frame} />
      <rect x={x - 10} y={G - 36} width={20} height={36} fill={look.door} stroke={white ? "#c9cdd2" : "none"} />
      <rect x={x - 6} y={G - 32} width={12} height={8} fill={C.window} opacity={0.9} />
      <circle cx={x + 6} cy={G - 16} r={1.3} fill={white ? "#444" : "#e7d08a"} />
      {/* Porch canopy */}
      <polygon points={`${x - 17},${G - 40} ${x},${G - 50} ${x + 17},${G - 40}`} fill={`url(#${look.ids.tiles})`} />
      <rect x={x - 17} y={G - 41} width={34} height={2} fill={darker(look.roof, 0.2)} />
      <rect x={x - 15} y={G - 39} width={2} height={5} fill={C.frame} />
      <rect x={x + 13} y={G - 39} width={2} height={5} fill={C.frame} />
    </g>
  );
}

function GarageDoor({ x, width }: { x: number; width: number }) {
  return (
    <g>
      <rect x={x} y={G - 34} width={width} height={34} fill={C.garage} stroke="#c9ced3" strokeWidth="1" />
      {[1, 2, 3, 4, 5].map((i) => <line key={i} x1={x + 2} x2={x + width - 2} y1={G - 34 + i * 5.6} y2={G - 34 + i * 5.6} stroke="#d4d8dc" strokeWidth="1" />)}
    </g>
  );
}

/** Walls with brick and/or render. */
function Walls({ x, w, top, look }: { x: number; w: number; top: number; look: Look }) {
  const brick = `url(#${look.ids.brick})`;
  if (look.render === "none") return <rect x={x} y={top} width={w} height={G - top} fill={brick} />;
  const split = look.render === "upper" ? G - FLOOR - 2 : G - 8;
  return (
    <g>
      <rect x={x} y={top} width={w} height={split - top} fill={look.renderColour} />
      <rect x={x} y={split} width={w} height={G - split} fill={brick} />
      <rect x={x} y={split - 1.5} width={w} height={2.5} fill={darker(look.renderColour, 0.12)} />
    </g>
  );
}

function House({ x, w, storeys, look, door, integralGarageSide, noRoof, shrubs, drive }: {
  x: number; w: number; storeys: number; look: Look; door: "left" | "right" | "centre"; integralGarageSide?: "left" | "right"; noRoof?: boolean; shrubs?: boolean; drive?: [number, number] | null;
}) {
  const floors = Math.max(1, Math.floor(storeys));
  const top = G - floors * FLOOR - 6;
  const roofH = storeys === 1 ? 28 : storeys === 2.5 ? 50 : 36;
  const columns = Math.max(1, Math.round(w / 50));
  const colX = (i: number) => x + (w / columns) * (i + 0.5);
  const onBrick = (y: number) => look.render === "none" || (look.render === "upper" && y > G - FLOOR);

  // Ground floor plan: door, windows, maybe a built-in garage.
  let left = x;
  let right = x + w;
  if (integralGarageSide === "left") left = x + 54;
  if (integralGarageSide === "right") right = x + w - 54;
  const doorX = door === "left" ? left + 18 : door === "right" ? right - 18 : left + (right - left) / 2;
  const groundSpans: Array<[number, number]> = door === "left" ? [[doorX + 18, right]] : door === "right" ? [[left, doorX - 18]] : [[left, doorX - 18], [doorX + 18, right]];

  return (
    <g>
      {!noRoof ? <polygon points={`${x - 7},${top} ${x + 10},${top - roofH} ${x + w - 10},${top - roofH} ${x + w + 7},${top}`} fill={`url(#${look.ids.tiles})`} /> : null}
      <Walls x={x} w={w} top={top} look={look} />
      {!noRoof ? <rect x={x - 7} y={top - 1} width={w + 14} height={3} fill={darker(look.roof, 0.25)} /> : null}
      {/* Upper floors */}
      {Array.from({ length: floors - 1 }, (_, f) => {
        const y = top + 10 + f * FLOOR;
        return Array.from({ length: columns }, (_, i) => <Window key={`${f}-${i}`} cx={colX(i)} y={y} onBrick={onBrick(y)} lookBrick={look.brick} />);
      })}
      {/* Ground floor */}
      {groundSpans.map(([a, b], i) => {
        const span = b - a;
        if (span < 30) return null;
        const n = Math.max(1, Math.round(span / 56));
        return Array.from({ length: n }, (_, j) => {
          const cx = a + (span / n) * (j + 0.5);
          const ww = Math.min(34, span / n - 8);
          const onDrive = drive ? cx + ww / 2 > drive[0] && cx - ww / 2 < drive[1] : false;
          return (
            <g key={`g${i}-${j}`}>
              <Window cx={cx} y={G - 34} w={ww} h={24} onBrick={onBrick(G - 20)} lookBrick={look.brick} />
              {shrubs && !onDrive ? <Shrubs from={cx - ww / 2 - 2} to={cx + ww / 2 + 2} /> : null}
            </g>
          );
        });
      })}
      {integralGarageSide ? <GarageDoor x={integralGarageSide === "left" ? x + 6 : x + w - 50} width={44} /> : null}
      <Door x={doorX} look={look} />
      {/* Loft room: a gabled dormer */}
      {storeys === 2.5 ? (
        <g>
          <polygon points={`${x + w / 2 - 22},${top - 26} ${x + w / 2},${top - 46} ${x + w / 2 + 22},${top - 26}`} fill={`url(#${look.ids.tiles})`} />
          <polyline points={`${x + w / 2 - 23},${top - 25} ${x + w / 2},${top - 47} ${x + w / 2 + 23},${top - 25}`} fill="none" stroke={C.frame} strokeWidth="2.2" strokeLinejoin="round" />
          <rect x={x + w / 2 - 18} y={top - 25} width={36} height={25} fill={look.render !== "none" ? look.renderColour : `url(#${look.ids.brick})`} />
          <Window cx={x + w / 2} y={top - 21} w={22} h={18} onBrick={false} lookBrick={look.brick} />
        </g>
      ) : null}
    </g>
  );
}

function Shrubs({ from, to }: { from: number; to: number }) {
  const span = to - from;
  if (span < 12) return null;
  const n = Math.max(2, Math.round(span / 12));
  return (
    <g>
      {Array.from({ length: n }, (_, i) => {
        const cx = from + (span / n) * (i + 0.5);
        return <ellipse key={i} cx={cx} cy={G - 3} rx={span / n / 2 + 2} ry={7} fill={i % 2 ? C.shrubLight : C.shrub} />;
      })}
    </g>
  );
}

function Car({ cx, colour }: { cx: number; colour: string }) {
  // Seen from the front, parked nose-in on the drive.
  const y = G + 12;
  return (
    <g>
      <rect x={cx - 24} y={y + 14} width={48} height={14} rx={4} fill={colour} />
      <path d={`M${cx - 18} ${y + 15} L${cx - 13} ${y + 2} H${cx + 13} L${cx + 18} ${y + 15} Z`} fill={colour} />
      <path d={`M${cx - 14} ${y + 14} L${cx - 10} ${y + 5} H${cx + 10} L${cx + 14} ${y + 14} Z`} fill="#c9dbe6" />
      <rect x={cx - 21} y={y + 19} width={8} height={4} rx={1.5} fill="#f3eccf" />
      <rect x={cx + 13} y={y + 19} width={8} height={4} rx={1.5} fill="#f3eccf" />
      <rect x={cx - 8} y={y + 22} width={16} height={4} rx={1} fill="#f7f7f2" />
      <rect x={cx - 22} y={y + 28} width={9} height={5} rx={1.5} fill="#2b2e33" />
      <rect x={cx + 13} y={y + 28} width={9} height={5} rx={1.5} fill="#2b2e33" />
    </g>
  );
}

const CAR_COLOURS = ["#5d6d7a", "#e8e6e1"];

export function HouseIllustration({ style, className }: { style: HouseStyle; className?: string }) {
  const uid = useId().replace(/[^a-z0-9]/gi, "");
  const s = { storeys: 2, garage: "none" as const, garageSide: "right" as const, attachedSide: "left" as const, grass: true, shrubs: true, driveway: "none" as const, render: "none" as const, cars: 0 as const, ...style };
  const look: Look = {
    brick: s.brick || BRICK_COLOURS[0][0],
    render: s.render || "none",
    renderColour: s.renderColour || RENDER_COLOURS[0][0],
    roof: s.roof || ROOF_COLOURS[0][0],
    door: s.door || DOOR_COLOURS[0],
    ids: { brick: `b${uid}`, tiles: `t${uid}` },
  };

  const front = (_houseLeft: number, _houseRight: number, doorX: number, driveFrom: number | null, driveTo: number | null) => {
    const cars = Math.min(2, Number(s.cars || 0));
    const span = driveFrom != null && driveTo != null ? driveTo - driveFrom : 0;
    const carSpots = cars && span >= 46 ? (cars === 2 && span >= 112 ? [driveFrom! + span * 0.27, driveFrom! + span * 0.73] : [driveFrom! + span / 2]) : [];
    return (
      <g>
        <rect y={G} width={W} height={H - G} fill={s.grass ? C.grass : C.paving} />
        {driveFrom != null && driveTo != null ? <rect x={driveFrom} y={G} width={driveTo - driveFrom} height={H - G - 12} fill={C.drive} /> : null}
        {s.grass ? <rect x={doorX - 11} y={G} width={22} height={H - G - 12} fill={C.stone} /> : null}
        <rect y={H - 12} width={W} height={12} fill={C.pavement} />
        <rect y={H - 13} width={W} height={2} fill={C.kerb} />
        {carSpots.map((cx, i) => <Car key={i} cx={cx} colour={CAR_COLOURS[i % CAR_COLOURS.length]} />)}
      </g>
    );
  };

  if (s.type === "flat") {
    const floors = Math.max(3, Math.min(6, Math.round(Number(s.storeys) || 4)));
    const top = G - floors * 34 - 8;
    const x = 100;
    const w = 160;
    const onBrick = (y: number) => look.render === "none" || (look.render === "upper" && y > G - 40);
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label="Drawing of a block of flats">
        <Defs look={look} />
        <rect width={W} height={H} fill={C.sky} />
        {front(x, x + w, x + w / 2, s.driveway !== "none" ? x + w + 10 : null, s.driveway !== "none" ? x + w + 70 : null)}
        <rect x={x - 6} y={top - 8} width={w + 12} height={9} fill={look.roof} />
        <Walls x={x} w={w} top={top} look={look} />
        {Array.from({ length: floors - 1 }, (_, f) => [0, 1, 2].map((i) => {
          const y = top + 10 + f * 34;
          const mine = f === floors - 3 && i === 2;
          return (
            <g key={`${f}-${i}`}>
              <Window cx={x + 28 + i * 52} y={y} w={26} h={22} onBrick={onBrick(y)} lookBrick={look.brick} />
              {mine ? <rect x={x + 28 + i * 52 - 15} y={y - 2} width={30} height={28} fill="none" stroke="#e2b23a" strokeWidth="2.5" rx="2" /> : null}
            </g>
          );
        }))}
        <Door x={x + w / 2} look={look} />
      </svg>
    );
  }

  const storeys = s.type === "bungalow" ? 1 : Number(s.storeys) || 2;
  const mainW = s.type === "bungalow" ? 160 : s.type === "detached" ? 140 : s.type === "semi" ? 112 : 96;
  const attachedGarage = (s.type === "detached" || s.type === "semi" || s.type === "bungalow") && (s.garage === "single" || s.garage === "double");
  const garageW = s.garage === "double" ? 96 : 58;
  const integral = s.garage === "integral" ? s.garageSide : undefined;
  const neighbours: Array<"left" | "right"> =
    s.type === "terraced" ? ["left", "right"] : s.type === "semi" || s.type === "end_terrace" ? [s.attachedSide] : [];
  const garageSide = s.type === "semi" ? (s.attachedSide === "left" ? "right" : "left") : s.garageSide;

  const groupW = mainW + (attachedGarage ? garageW : 0);
  let x = W / 2 - groupW / 2;
  if (neighbours.length === 1) x += neighbours[0] === "left" ? 34 : -34;
  const mainX = attachedGarage && garageSide === "left" ? x + garageW : x;
  const garageX = garageSide === "left" ? x : mainX + mainW;
  const doorSide: "left" | "right" | "centre" = neighbours.length === 1 ? neighbours[0] : integral ? (integral === "left" ? "right" : "left") : "centre";
  const doorX = (() => {
    let left = mainX;
    let right = mainX + mainW;
    if (integral === "left") left += 54;
    if (integral === "right") right -= 54;
    return doorSide === "left" ? left + 18 : doorSide === "right" ? right - 18 : left + (right - left) / 2;
  })();

  // Driveway: in front of the garage, or beside the path in front of the house.
  let driveFrom: number | null = null;
  let driveTo: number | null = null;
  if (s.driveway === "garage" && (attachedGarage || integral)) {
    driveFrom = attachedGarage ? garageX + 4 : integral === "left" ? mainX + 2 : mainX + mainW - 54;
    driveTo = attachedGarage ? garageX + garageW - 4 : driveFrom + 52;
  } else if (s.driveway === "full") {
    driveFrom = Math.min(mainX, attachedGarage ? garageX : mainX) - 6;
    driveTo = Math.max(mainX + mainW, attachedGarage ? garageX + garageW : mainX + mainW) + 6;
  } else if (s.driveway === "house" || s.driveway === "garage") {
    const away = doorSide === "left" ? "right" : "left";
    driveFrom = away === "right" ? doorX + 22 : mainX;
    driveTo = away === "right" ? mainX + mainW : doorX - 22;
  }

  const floors = Math.max(1, Math.floor(storeys));
  const wallTop = G - floors * FLOOR - 6;
  const shared = neighbours.length > 0;
  const rowLeft = neighbours.includes("left") ? mainX - mainW : mainX;
  const rowRight = neighbours.includes("right") ? mainX + 2 * mainW : mainX + mainW;
  const ridge = storeys === 2.5 ? 50 : 36;
  const hip = 10;
  const chimneyX = neighbours.includes("left") ? mainX - 7 : mainX + mainW - 7;
  const neighbourDoor = (side: "left" | "right") => (side === "left" ? "right" : "left");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={`Drawing of a ${s.type.replace("_", " ")} house`}>
      <Defs look={look} />
      <rect width={W} height={H} fill={C.sky} />
      {front(mainX, mainX + mainW, doorX, driveFrom, driveTo)}
      {shared ? (
        <g>
          <rect x={chimneyX} y={wallTop - ridge - 10} width={14} height={26} fill={`url(#${look.ids.brick})`} />
          <rect x={chimneyX - 1} y={wallTop - ridge - 12} width={16} height={3} fill={C.stone} />
          <polygon points={`${rowLeft - 7},${wallTop} ${rowLeft + hip},${wallTop - ridge} ${rowRight - hip},${wallTop - ridge} ${rowRight + 7},${wallTop}`} fill={`url(#${look.ids.tiles})`} />
        </g>
      ) : null}
      {neighbours.map((side) => (
        <g key={side} opacity={0.45}>
          <House x={side === "left" ? mainX - mainW : mainX + mainW} w={mainW} storeys={storeys} look={look} door={neighbourDoor(side)} noRoof={shared} />
        </g>
      ))}
      {attachedGarage ? (
        <g>
          <polygon points={`${garageX - 4},${G - 46} ${garageX + 4},${G - 60} ${garageX + garageW - 4},${G - 60} ${garageX + garageW + 4},${G - 46}`} fill={`url(#${look.ids.tiles})`} />
          <rect x={garageX} y={G - 46} width={garageW} height={46} fill={`url(#${look.ids.brick})`} />
          <rect x={garageX - 4} y={G - 47} width={garageW + 8} height={2.5} fill={darker(look.roof, 0.25)} />
          <GarageDoor x={garageX + 7} width={garageW - 14} />
        </g>
      ) : null}
      <House x={mainX} w={mainW} storeys={storeys} look={look} door={doorSide} integralGarageSide={integral} noRoof={shared} shrubs={s.shrubs} drive={driveFrom != null && driveTo != null ? [driveFrom, driveTo] : null} />
      {shared ? <rect x={rowLeft - 7} y={wallTop - 1} width={rowRight - rowLeft + 14} height={3} fill={darker(look.roof, 0.25)} /> : null}
      {!shared ? <rect x={mainX + mainW - 26} y={wallTop - ridge - 10} width={14} height={14} fill={`url(#${look.ids.brick})`} /> : null}
    </svg>
  );
}

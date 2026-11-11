// A simple drawing of the person's home, built from a few choices: the kind of
// house, how many floors, and the garage. Neighbours are drawn faintly so a
// semi or terrace reads as one.

export type HouseStyle = {
  type: "flat" | "terraced" | "end_terrace" | "semi" | "detached" | "bungalow";
  storeys?: number;
  garage?: "none" | "integral" | "single" | "double";
  garageSide?: "left" | "right";
  /** Which side the neighbour is on, for a semi or end terrace. */
  attachedSide?: "left" | "right";
  door?: string;
};

export const DOOR_COLOURS = ["#1f6a50", "#24324a", "#8a2f2f", "#3b3b3b", "#c79a3b", "#ffffff"];

/** A sensible starting drawing from the property type LOOP already has. */
export function defaultHouseStyle(propertyType?: string | null): HouseStyle {
  const t = String(propertyType || "").toLowerCase();
  if (/flat|apartment|maisonette/.test(t)) return { type: "flat", storeys: 3 };
  if (/bungalow/.test(t)) return { type: "bungalow", storeys: 1, garage: "none" };
  if (/end/.test(t) && /terrace/.test(t)) return { type: "end_terrace", storeys: 2, attachedSide: "left" };
  if (/terrace/.test(t)) return { type: "terraced", storeys: 2 };
  if (/semi/.test(t)) return { type: "semi", storeys: 2, attachedSide: "left", garage: "none", garageSide: "right" };
  if (/detached/.test(t)) return { type: "detached", storeys: 2, garage: "single", garageSide: "right" };
  return { type: "semi", storeys: 2, attachedSide: "left", garage: "none", garageSide: "right" };
}

const C = {
  sky: "#eef4f1",
  ground: "#d9e4dc",
  wall: "#e9d8c4",
  wallShade: "#dcc6ad",
  ghost: "#e7e2db",
  roof: "#5b6472",
  roofGhost: "#b8bdc5",
  window: "#cfe3ee",
  frame: "#ffffff",
  garage: "#cfd5db",
  line: "#3d4450",
};

function Windows({ x, y, w, count, h = 24 }: { x: number; y: number; w: number; count: number; h?: number }) {
  if (count < 1) return null;
  const gap = w / count;
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const cx = x + gap * i + gap / 2;
        return (
          <g key={i}>
            <rect x={cx - 11} y={y} width={22} height={h} rx={2} fill={C.window} stroke={C.frame} strokeWidth={2.5} />
            <line x1={cx} y1={y + 1} x2={cx} y2={y + h - 1} stroke={C.frame} strokeWidth={1.5} />
          </g>
        );
      })}
    </>
  );
}

function Door({ x, colour }: { x: number; colour: string }) {
  return (
    <g>
      <rect x={x - 11} y={146} width={22} height={34} rx={2} fill={colour} stroke={colour === "#ffffff" ? "#c9cdd2" : "none"} />
      <circle cx={x + 6} cy={164} r={1.4} fill={colour === "#ffffff" ? C.line : "#f4e2a1"} />
      <rect x={x - 15} y={142} width={30} height={4} rx={1} fill={C.wallShade} />
    </g>
  );
}

function GarageDoor({ x, width }: { x: number; width: number }) {
  return (
    <g>
      <rect x={x} y={150} width={width} height={30} rx={1.5} fill={C.garage} stroke="#b9c0c7" />
      {[0, 1, 2, 3].map((i) => (
        <line key={i} x1={x + 2} x2={x + width - 2} y1={156 + i * 6} y2={156 + i * 6} stroke="#b9c0c7" strokeWidth={1} />
      ))}
    </g>
  );
}

/** One house block: walls, roof, windows. `ghost` draws a neighbour faintly. */
function Block({ x, w, storeys, ghost, door, doorColour, integralGarageSide, chimney, noRoof }: {
  x: number; w: number; storeys: number; ghost?: boolean; door?: "left" | "right" | "centre"; doorColour: string; integralGarageSide?: "left" | "right"; chimney?: "left" | "right"; noRoof?: boolean;
}) {
  const fullFloors = Math.max(1, Math.floor(storeys));
  const wallH = fullFloors * 40 + 6;
  const top = 180 - wallH;
  const roofH = storeys === 1 ? 34 : 44;
  const opacity = ghost ? 0.55 : 1;
  const winCount = Math.max(1, Math.round(w / 48));
  return (
    <g opacity={opacity}>
      {chimney && !noRoof ? <rect x={chimney === "left" ? x + w * 0.18 : x + w * 0.72} y={top - roofH + 6} width={12} height={roofH - 4} fill={ghost ? C.roofGhost : "#8b6f5a"} /> : null}
      {noRoof ? null : <polygon points={`${x - 6},${top} ${x + w / 2},${top - roofH} ${x + w + 6},${top}`} fill={ghost ? C.roofGhost : C.roof} />}
      <rect x={x} y={top} width={w} height={wallH} fill={ghost ? C.ghost : C.wall} />
      {storeys === 2.5 && !ghost ? (
        <g>
          <rect x={x + w / 2 - 16} y={top - 24} width={32} height={20} fill={C.wall} />
          <polygon points={`${x + w / 2 - 20},${top - 24} ${x + w / 2},${top - 38} ${x + w / 2 + 20},${top - 24}`} fill={C.roof} />
          <rect x={x + w / 2 - 9} y={top - 20} width={18} height={14} rx={1.5} fill={C.window} stroke={C.frame} strokeWidth={2} />
        </g>
      ) : null}
      {Array.from({ length: fullFloors - 1 }, (_, floor) => (
        <Windows key={floor} x={x} y={top + 10 + floor * 40} w={w} count={winCount} />
      ))}
      {/* Ground floor: door, a window, maybe the garage door. */}
      {(() => {
        const items: React.ReactNode[] = [];
        let left = x;
        let right = x + w;
        if (integralGarageSide && !ghost) {
          const gx = integralGarageSide === "left" ? x + 6 : x + w - 50;
          items.push(<GarageDoor key="g" x={gx} width={44} />);
          if (integralGarageSide === "left") left = x + 52; else right = x + w - 52;
        }
        const span = right - left;
        const doorX = door === "left" ? left + 16 : door === "right" ? right - 16 : left + span / 2;
        if (!ghost) items.push(<Door key="d" x={doorX} colour={doorColour} />);
        else items.push(<rect key="d" x={doorX - 11} y={146} width={22} height={34} rx={2} fill="#cfc8bf" />);
        const spans: Array<[number, number]> = door === "left" ? [[doorX + 16, right]] : door === "right" ? [[left, doorX - 16]] : [[left, doorX - 16], [doorX + 16, right]];
        spans.forEach(([a, b], i) => {
          if (b - a > 30) items.push(<Windows key={`w${i}`} x={a} y={148} w={b - a} count={Math.max(1, Math.round((b - a) / 52))} h={22} />);
        });
        return items;
      })()}
    </g>
  );
}

export function HouseIllustration({ style, className }: { style: HouseStyle; className?: string }) {
  const s = { storeys: 2 as const, garage: "none" as const, garageSide: "right" as const, attachedSide: "left" as const, door: DOOR_COLOURS[0], ...style };
  const door = s.door || DOOR_COLOURS[0];

  if (s.type === "flat") {
    const floors = Math.max(3, Math.round(Number(s.storeys) || 3));
    const h = floors * 36 + 10;
    const top = 180 - h;
    return (
      <svg viewBox="0 0 320 200" className={className} role="img" aria-label="Drawing of a block of flats">
        <rect width="320" height="200" fill={C.sky} />
        <rect y="180" width="320" height="20" fill={C.ground} />
        <rect x="85" y={top - 6} width="150" height="8" fill={C.roof} />
        <rect x="90" y={top} width="140" height={h} fill={C.wall} />
        {Array.from({ length: floors - 1 }, (_, f) => (
          <g key={f}>
            {[0, 1, 2].map((i) => (
              <rect key={i} x={104 + i * 42} y={top + 10 + f * 36} width={28} height={22} rx={2}
                fill={f === floors - 2 && i === 1 ? "#f2d27a" : C.window} stroke={C.frame} strokeWidth={2.5} />
            ))}
          </g>
        ))}
        <Door x={160} colour={door} />
        <text x="160" y={top + 10 + (floors - 2) * 36 - 4} textAnchor="middle" fontSize="8" fill={C.line} fontFamily="inherit">yours</text>
      </svg>
    );
  }

  const storeys = s.type === "bungalow" ? 1 : Number(s.storeys) || 2;
  const mainW = s.type === "bungalow" ? 150 : s.type === "detached" ? 130 : s.type === "semi" ? 104 : 92;
  const attachedGarage = (s.type === "detached" || s.type === "semi" || s.type === "bungalow") && (s.garage === "single" || s.garage === "double");
  const garageW = s.garage === "double" ? 92 : 56;
  const integral = s.garage === "integral" ? s.garageSide : undefined;

  // Neighbours: a semi has one on the attached side, a terrace both, an end terrace one.
  const neighbours: Array<"left" | "right"> =
    s.type === "terraced" ? ["left", "right"] : s.type === "semi" || s.type === "end_terrace" ? [s.attachedSide] : [];
  // A semi's garage goes on the open side.
  const garageSide = s.type === "semi" ? (s.attachedSide === "left" ? "right" : "left") : s.garageSide;

  const groupW = mainW + (attachedGarage ? garageW : 0);
  let x = 160 - groupW / 2;
  if (neighbours.length === 1) x += neighbours[0] === "left" ? 30 : -30;
  const mainX = attachedGarage && garageSide === "left" ? x + garageW : x;
  const garageX = garageSide === "left" ? x : mainX + mainW;
  const doorSide = neighbours.length === 1 ? (neighbours[0] === "left" ? "left" : "right") : integral ? (integral === "left" ? "right" : "left") : "centre";

  // Semis and terraces share one roof, ridge running along the row.
  const shared = neighbours.length > 0;
  const rowLeft = neighbours.includes("left") ? mainX - mainW : mainX;
  const rowRight = neighbours.includes("right") ? mainX + 2 * mainW : mainX + mainW;
  const wallTop = 180 - (Math.max(1, Math.floor(storeys)) * 40 + 6);
  const ridge = 40;
  const hip = s.type === "semi" ? 34 : 0;
  const roofPoints = `${rowLeft - 6},${wallTop} ${rowLeft + hip},${wallTop - ridge} ${rowRight - hip},${wallTop - ridge} ${rowRight + 6},${wallTop}`;
  const chimneyX = neighbours.includes("left") ? mainX - 6 : mainX + mainW - 6;

  return (
    <svg viewBox="0 0 320 200" className={className} role="img" aria-label={`Drawing of a ${s.type.replace("_", " ")} house`}>
      <rect width="320" height="200" fill={C.sky} />
      <rect y="180" width="320" height="20" fill={C.ground} />
      {shared ? (
        <g>
          <rect x={chimneyX} y={wallTop - ridge - 8} width={12} height={22} fill="#8b6f5a" />
          <polygon points={roofPoints} fill={C.roof} />
          {/* Fade the neighbours' part of the roof. */}
          {neighbours.includes("left") ? <rect x={rowLeft - 6} y={wallTop - ridge} width={mainX - rowLeft + 6} height={ridge} fill={C.sky} opacity={0.45} /> : null}
          {neighbours.includes("right") ? <rect x={mainX + mainW} y={wallTop - ridge} width={rowRight - mainX - mainW + 6} height={ridge} fill={C.sky} opacity={0.45} /> : null}
        </g>
      ) : null}
      {neighbours.includes("left") ? <Block x={mainX - mainW} w={mainW} storeys={storeys} ghost doorColour={door} door="right" noRoof /> : null}
      {neighbours.includes("right") ? <Block x={mainX + mainW} w={mainW} storeys={storeys} ghost doorColour={door} door="left" noRoof /> : null}
      {attachedGarage ? (
        <g>
          <rect x={garageX} y={138} width={garageW} height={42} fill={C.wallShade} />
          <polygon points={`${garageX - 3},${138} ${garageX + garageW / 2},${124} ${garageX + garageW + 3},${138}`} fill={C.roof} />
          <GarageDoor x={garageX + 6} width={garageW - 12} />
        </g>
      ) : null}
      <Block x={mainX} w={mainW} storeys={storeys} doorColour={door} door={doorSide} integralGarageSide={integral} chimney={neighbours.includes("left") ? "left" : "right"} noRoof={shared} />
      <rect x="0" y="179" width="320" height="2" fill="#c6d3ca" />
    </svg>
  );
}

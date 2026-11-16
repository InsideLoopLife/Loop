// A rough floor plan: each floor is a grid with rectangles for rooms. The floors themselves
// come from the house drawing (bungalow, 2 floors + loft, garage or not), and the rooms on
// each floor are whatever the person draws, starting from a sensible suggestion.

import type { HomeRoom } from "@/lib/home/items";

export const GRID_W = 16;
export const GRID_H = 10;

export type SpaceType =
  | "living" | "kitchen" | "dining" | "utility" | "hallway" | "stairs" | "landing" | "toilet" | "bathroom"
  | "bedroom" | "dressing" | "office" | "conservatory" | "cupboard" | "garage" | "loft" | "garden" | "other";

export const SPACE_TYPES: Array<{ key: SpaceType; label: string; fill: string; room: HomeRoom }> = [
  { key: "living", label: "Living room", fill: "#fef3c7", room: "living" },
  { key: "kitchen", label: "Kitchen", fill: "#dcfce7", room: "kitchen" },
  { key: "dining", label: "Dining", fill: "#fde68a", room: "dining" },
  { key: "utility", label: "Utility", fill: "#cffafe", room: "utility" },
  { key: "hallway", label: "Hallway", fill: "#f1f5f9", room: "hallway" },
  { key: "stairs", label: "Stairs", fill: "#e2e8f0", room: "hallway" },
  { key: "landing", label: "Landing", fill: "#f1f5f9", room: "hallway" },
  { key: "toilet", label: "Toilet", fill: "#e0f2fe", room: "bathroom" },
  { key: "bathroom", label: "Bathroom", fill: "#dbeafe", room: "bathroom" },
  { key: "bedroom", label: "Bedroom", fill: "#ede9fe", room: "bedroom" },
  { key: "dressing", label: "Dressing area", fill: "#fae8ff", room: "bedroom" },
  { key: "office", label: "Office", fill: "#ffedd5", room: "office" },
  { key: "conservatory", label: "Conservatory", fill: "#ecfccb", room: "living" },
  { key: "cupboard", label: "Cupboard", fill: "#e7e5e4", room: "other" },
  { key: "garage", label: "Garage", fill: "#e5e7eb", room: "garage" },
  { key: "loft", label: "Loft", fill: "#f5ebe0", room: "loft" },
  { key: "garden", label: "Garden", fill: "#d9f99d", room: "garden" },
  { key: "other", label: "Other", fill: "#f5f5f4", room: "other" },
];
export const SPACE_BY_KEY = new Map(SPACE_TYPES.map((type) => [type.key, type]));

export type Space = { id: string; type: SpaceType; name?: string; x: number; y: number; w: number; h: number };
export type FloorKey = "ground" | "first" | "second" | "third" | "loft" | "outside";
export type Floor = { key: FloorKey; label: string; spaces: Space[] };
export type FloorPlan = { version: 1; floors: Partial<Record<FloorKey, Space[]>> };

/** The parts of the house drawing that shape the plan. */
export type HouseShape = {
  type?: string;
  storeys?: number;
  garage?: string;
  garageSide?: string;
  garageAttached?: boolean;
};

export function spaceName(space: Space) {
  return space.name?.trim() || SPACE_BY_KEY.get(space.type)?.label || "Room";
}

let counter = 0;
export function newSpaceId() {
  counter += 1;
  return `s${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/** Which floors this house has, from the drawing. */
export function floorsFor(shape: HouseShape | null | undefined): Array<{ key: FloorKey; label: string }> {
  const type = shape?.type || "semi";
  if (type === "flat") return [{ key: "ground", label: "Your flat" }, { key: "outside", label: "Outside" }];
  if (type === "bungalow") return [{ key: "ground", label: "Ground floor" }, { key: "outside", label: "Outside" }];
  const storeys = Number(shape?.storeys) || 2;
  const whole = Math.max(1, Math.min(4, Math.floor(storeys)));
  const keys: Array<{ key: FloorKey; label: string }> = [{ key: "ground", label: "Ground floor" }];
  if (whole >= 2) keys.push({ key: "first", label: "First floor" });
  if (whole >= 3) keys.push({ key: "second", label: "Second floor" });
  if (whole >= 4) keys.push({ key: "third", label: "Third floor" });
  if (storeys % 1 !== 0) keys.push({ key: "loft", label: "Loft room" });
  keys.push({ key: "outside", label: "Outside" });
  return keys;
}

const sp = (type: SpaceType, x: number, y: number, w: number, h: number, name?: string): Space => ({ id: `d-${type}-${x}-${y}`, type, x, y, w, h, ...(name ? { name } : {}) });

/** A starting layout for one floor, sized to the house: garage on the right side, a hall by the door. */
export function suggestedSpaces(shape: HouseShape | null | undefined, floor: FloorKey): Space[] {
  const type = shape?.type || "semi";
  const garage = shape?.garage && shape.garage !== "none" ? shape.garage : null;
  const attached = garage === "integral" || (garage && shape?.garageAttached !== false);
  const gw = garage === "double" ? 6 : 4;
  const sideLeft = shape?.garageSide === "left";
  const houseW = attached && type !== "flat" ? GRID_W - gw : GRID_W;
  const x0 = attached && sideLeft ? gw : 0;
  const gx = sideLeft ? 0 : GRID_W - gw;

  if (floor === "outside") {
    const spaces = [sp("garden", 0, 4, GRID_W, 6, "Back garden"), sp("garden", 0, 0, GRID_W - (garage && !attached ? gw : 0), 3, "Front")];
    if (garage && !attached) spaces.push(sp("garage", gx, 0, gw, 4));
    return spaces;
  }
  if (type === "flat") {
    return [sp("living", 0, 0, 9, 5), sp("kitchen", 9, 0, 7, 5), sp("hallway", 0, 5, 3, 5), sp("bedroom", 3, 5, 7, 5), sp("bathroom", 10, 5, 6, 5)];
  }
  if (floor === "ground" && type === "bungalow") {
    const spaces = [sp("living", x0, 0, 6, 5), sp("bedroom", x0 + 6, 0, houseW - 6, 5), sp("kitchen", x0, 5, 5, 5), sp("hallway", x0 + 5, 5, 2, 5), sp("bathroom", x0 + 7, 5, Math.min(4, houseW - 7), 5)];
    if (houseW - 11 >= 3) spaces.push(sp("bedroom", x0 + 11, 5, houseW - 11, 5, "Bedroom 2"));
    if (attached && garage) spaces.push(sp("garage", gx, 0, gw, GRID_H));
    return spaces;
  }
  if (floor === "ground") {
    const big = type === "detached";
    const spaces = [
      sp("hallway", x0, 0, 3, 5),
      sp("stairs", x0, 5, 3, 2),
      sp("living", x0 + 3, 0, houseW - 3, 5),
      sp("kitchen", x0 + 3, 5, houseW - 3 - (big ? 3 : 0), 5),
    ];
    spaces.push(big || type === "semi" ? sp("toilet", x0, 7, 3, 3) : sp("cupboard", x0, 7, 3, 3, "Under stairs"));
    if (big) spaces.push(sp("utility", x0 + houseW - 3, 5, 3, 5));
    if (attached && garage) spaces.push(sp("garage", gx, 0, gw, GRID_H));
    return spaces;
  }
  if (floor === "loft") return [sp("loft", x0 + 2, 1, houseW - 4, 7, "Loft room"), sp("cupboard", x0, 1, 2, 7, "Eaves storage")];
  // Upper floors: over an integral garage there's room upstairs too.
  const upperW = garage === "integral" ? GRID_W : houseW;
  const ux = garage === "integral" ? 0 : x0;
  const half = Math.floor(upperW / 2);
  const n = floor === "first" ? 1 : floor === "second" ? 4 : 6;
  const spaces = [sp("bedroom", ux, 0, half, 5, `Bedroom ${n}`), sp("bedroom", ux + half, 0, upperW - half, 5, `Bedroom ${n + 1}`), sp("landing", ux, 5, 3, 5), sp("bathroom", ux + 3, 5, 4, 5)];
  if (upperW - 7 >= 3) spaces.push(sp(floor === "first" ? "bedroom" : "office", ux + 7, 5, upperW - 7, 5, floor === "first" ? "Bedroom 3" : undefined));
  return spaces;
}

/** The floors to show: from the drawing, with the person's own rooms where they've drawn them. */
export function resolvePlan(shape: HouseShape | null | undefined, plan: FloorPlan | null | undefined): Floor[] {
  return floorsFor(shape).map(({ key, label }) => ({ key, label, spaces: plan?.floors?.[key] ?? suggestedSpaces(shape, key) }));
}

/** Clean what the browser sends before saving. */
export function sanitisePlan(raw: unknown): FloorPlan {
  const floors: FloorPlan["floors"] = {};
  const source = (raw as any)?.floors || {};
  for (const key of ["ground", "first", "second", "third", "loft", "outside"] as FloorKey[]) {
    if (!Array.isArray(source[key])) continue;
    floors[key] = source[key].slice(0, 40).map((space: any) => {
      const x = Math.max(0, Math.min(GRID_W - 1, Math.round(Number(space?.x) || 0)));
      const y = Math.max(0, Math.min(GRID_H - 1, Math.round(Number(space?.y) || 0)));
      return {
        id: String(space?.id || newSpaceId()).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || newSpaceId(),
        type: SPACE_BY_KEY.has(space?.type) ? space.type : "other",
        ...(typeof space?.name === "string" && space.name.trim() ? { name: space.name.trim().slice(0, 40) } : {}),
        x, y,
        w: Math.max(1, Math.min(GRID_W - x, Math.round(Number(space?.w) || 1))),
        h: Math.max(1, Math.min(GRID_H - y, Math.round(Number(space?.h) || 1))),
      } as Space;
    });
  }
  return { version: 1, floors };
}

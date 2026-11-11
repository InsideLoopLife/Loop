// Builds and renders the home as a real 3D scene with three.js: brick and
// render walls, a tiled roof, glazed windows, the garage, the plot and the
// cars, lit by a sun (or the moon) with soft shadows and reflections. It uses
// the same layout plan as the vector drawing, so every option carries over.
// World units are tenths of a metre; our z runs back from the front wall and
// maps to three.js -Z, so the street side faces the camera.
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  BRICK_COLOURS, CAR_COLOURS, DOOR_COLOURS, FH, GARAGE_COLOURS, PAVE, PLOT, ROOF_COLOURS, SIDE_CHARGER_Z, SIDE_METER_Z,
  bodyOf, dormerGeometry, planHome, roofGeometry, smooth,
  type HomePlan, type HouseHotspot, type HouseStyle, type Vehicle, type Win,
} from "@/components/mortgage/HouseIllustration";

type Anchors = Partial<Record<HouseHotspot["id"], THREE.Vector3>>;

const T = (x: number, y: number, z: number) => new THREE.Vector3(x, y, -z);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/* ---------- textures ---------- */

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; };
}

const shadeHex = (hex: string, f: number) => {
  const c = new THREE.Color(hex);
  return `#${c.multiplyScalar(f).getHexString()}`;
};

function canvasTexture(size: [number, number], draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = size[0];
  canvas.height = size[1];
  const ctx = canvas.getContext("2d")!;
  draw(ctx, size[0], size[1]);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function noise(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, seed = 7) {
  const r = rng(seed);
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * amount;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

/** 4 bricks across, 8 courses down: a 12 x 8 unit tile. */
const brickTexture = (colour: string) => canvasTexture([256, 256], (ctx, w, h) => {
  const r = rng(parseInt(colour.slice(1), 16));
  ctx.fillStyle = "#cfc7bb";
  ctx.fillRect(0, 0, w, h);
  const bw = w / 4;
  const bh = h / 8;
  for (let row = 0; row < 8; row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let i = -1; i < 5; i++) {
      ctx.fillStyle = shadeHex(colour, 0.86 + r() * 0.24);
      ctx.fillRect(i * bw + off + 2, row * bh + 2, bw - 4, bh - 4);
    }
  }
  noise(ctx, w, h, 14);
});

const renderTexture = (colour: string) => canvasTexture([128, 128], (ctx, w, h) => {
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, w, h);
  noise(ctx, w, h, 8, 3);
});

/** Roof tiles: rows of slightly varied tiles, a 12 x 12 unit tile. */
const roofTexture = (colour: string) => canvasTexture([256, 256], (ctx, w, h) => {
  const r = rng(parseInt(colour.slice(1), 16) + 5);
  ctx.fillStyle = shadeHex(colour, 0.7);
  ctx.fillRect(0, 0, w, h);
  const rows = 8;
  const cols = 6;
  const rh = h / rows;
  const cw = w / cols;
  for (let row = 0; row < rows; row++) {
    const off = row % 2 ? cw / 2 : 0;
    for (let i = -1; i <= cols; i++) {
      const g = ctx.createLinearGradient(0, row * rh, 0, (row + 1) * rh);
      const base = shadeHex(colour, 0.9 + r() * 0.2);
      g.addColorStop(0, shadeHex(base, 1.08));
      g.addColorStop(0.85, base);
      g.addColorStop(1, shadeHex(base, 0.62));
      ctx.fillStyle = g;
      ctx.fillRect(i * cw + off + 1, row * rh, cw - 2, rh - 1);
    }
  }
  noise(ctx, w, h, 10, 11);
});

const lawnTexture = (night: boolean) => canvasTexture([256, 256], (ctx, w, h) => {
  ctx.fillStyle = night ? "#3f5a37" : "#7fb35c";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = night ? "#46623d" : "#8cbe68";
  ctx.fillRect(0, 0, w / 2, h);
  noise(ctx, w, h, 22, 5);
});

const pavingTexture = () => canvasTexture([256, 256], (ctx, w, h) => {
  const r = rng(99);
  ctx.fillStyle = "#b9b2a6";
  ctx.fillRect(0, 0, w, h);
  const bw = w / 8;
  const bh = h / 16;
  for (let row = 0; row < 16; row++) {
    for (let i = -1; i < 9; i++) {
      ctx.fillStyle = shadeHex("#d3cbbd", 0.92 + r() * 0.12);
      ctx.fillRect(i * bw + (row % 2 ? bw / 2 : 0) + 1.5, row * bh + 1.5, bw - 3, bh - 3);
    }
  }
  noise(ctx, w, h, 10, 21);
});

const tarmacTexture = () => canvasTexture([256, 256], (ctx, w, h) => {
  ctx.fillStyle = "#55595f";
  ctx.fillRect(0, 0, w, h);
  noise(ctx, w, h, 34, 31);
});

const slabTexture = () => canvasTexture([128, 128], (ctx, w, h) => {
  ctx.fillStyle = "#dedbd4";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#bdb8ae";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);
  noise(ctx, w, h, 10, 41);
});

const soilTexture = () => canvasTexture([128, 128], (ctx, w, h) => {
  ctx.fillStyle = "#8a6446";
  ctx.fillRect(0, 0, w, h);
  noise(ctx, w, h, 30, 51);
});

const garageDoorTexture = (colour: string) => canvasTexture([64, 64], (ctx, w, h) => {
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(0, h - 5, w, 3);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(0, h - 2, w, 2);
});

const solarTexture = () => canvasTexture([128, 192], (ctx, w, h) => {
  ctx.fillStyle = "#c9d0d8";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#152440";
  ctx.fillRect(4, 4, w - 8, h - 8);
  ctx.strokeStyle = "#2c4472";
  ctx.lineWidth = 1.5;
  for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(4 + (i * (w - 8)) / 6, 4); ctx.lineTo(4 + (i * (w - 8)) / 6, h - 4); ctx.stroke(); }
  for (let i = 1; i < 10; i++) { ctx.beginPath(); ctx.moveTo(4, 4 + (i * (h - 8)) / 10); ctx.lineTo(w - 4, 4 + (i * (h - 8)) / 10); ctx.stroke(); }
});

const contactShadowTexture = () => canvasTexture([128, 128], (ctx, w, h) => {
  const g = ctx.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
  g.addColorStop(0, "rgba(0,0,0,0.55)");
  g.addColorStop(0.6, "rgba(0,0,0,0.25)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
});

/** UVs taken from world position, so textures keep a real-world scale on any face. */
function worldUV(g: THREE.BufferGeometry, su: number, sv = su) {
  g.computeVertexNormals();
  const pos = g.getAttribute("position");
  const nor = g.getAttribute("normal");
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const [x, y, z] = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const [nx, ny, nz] = [Math.abs(nor.getX(i)), Math.abs(nor.getY(i)), Math.abs(nor.getZ(i))];
    let u: number, v: number;
    if (ny >= nx && ny >= nz) { u = x; v = z; } else if (nx >= nz) { u = z; v = y; } else { u = x; v = y; }
    uv[i * 2] = u / su;
    uv[i * 2 + 1] = v / sv;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}

/** A box from min to max corners in our coordinates. */
function boxGeo(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
  const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, -(z0 + z1) / 2);
  return g;
}

/* ---------- the builder ---------- */

type Mats = ReturnType<typeof makeMaterials>;

function makeMaterials(plan: HomePlan, night: boolean) {
  const { s, walls, roof } = plan;
  const std = (opts: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(opts);
  const wallMat = (colour: string, brick: boolean) =>
    brick ? std({ map: brickTexture(colour), roughness: 0.92 }) : std({ map: renderTexture(colour), roughness: 0.96 });
  return {
    ground: wallMat(walls.ground, walls.groundBrick),
    upper: wallMat(walls.upper, walls.upperBrick),
    roof: std({ map: roofTexture(roof), roughness: 0.8 }),
    roofDark: std({ color: shadeHex(roof, 0.7), roughness: 0.8 }),
    white: std({ color: "#f4f4f1", roughness: 0.55 }),
    sill: std({ color: "#e2ded6", roughness: 0.7 }),
    pipe: std({ color: "#3c4148", roughness: 0.5 }),
    glassDay: new THREE.MeshPhysicalMaterial({ color: "#8fa8ba", roughness: 0.04, metalness: 0.1, clearcoat: 1, envMapIntensity: 1.4 }),
    glassLit: std({ color: "#ffd58a", emissive: "#ffb65a", emissiveIntensity: 1.5, roughness: 0.4 }),
    glassDark: new THREE.MeshPhysicalMaterial({ color: "#1c2533", roughness: 0.08, metalness: 0.1, clearcoat: 1 }),
    door: std({ color: s.door || DOOR_COLOURS[0], roughness: 0.45 }),
    doorGlass: night ? std({ color: "#ffd58a", emissive: "#ffb65a", emissiveIntensity: 1.2 }) : new THREE.MeshPhysicalMaterial({ color: "#a9bfcc", roughness: 0.05, clearcoat: 1 }),
    brass: std({ color: "#c8a24a", metalness: 0.9, roughness: 0.3 }),
    garageDoor: std({ map: garageDoorTexture(s.garageColour || GARAGE_COLOURS[0][0]), roughness: 0.5, metalness: 0.2 }),
    flatRoof: std({ color: "#5d636b", roughness: 0.95 }),
    chimneyPot: std({ color: "#b4643f", roughness: 0.8 }),
    capping: std({ color: "#b9b4ab", roughness: 0.9 }),
    lawn: std({ map: lawnTexture(night), roughness: 1 }),
    paving: std({ map: pavingTexture(), roughness: 0.95 }),
    tarmac: std({ map: tarmacTexture(), roughness: 0.92 }),
    pavement: std({ map: slabTexture(), roughness: 0.95 }),
    kerb: std({ color: "#c4c0b8", roughness: 0.9 }),
    soil: std({ map: soilTexture(), roughness: 1 }),
    soilSide: std({ color: "#7a5a40", roughness: 1 }),
    leaf: std({ color: "#5f9445", roughness: 0.85, flatShading: true }),
    leafLight: std({ color: "#78ad55", roughness: 0.85, flatShading: true }),
    leafDark: std({ color: "#4a7a36", roughness: 0.85, flatShading: true }),
    trunk: std({ color: "#7b5a43", roughness: 0.9 }),
    meter: std({ color: "#ecebe5", roughness: 0.6 }),
    tap: std({ color: "#8f979f", metalness: 0.8, roughness: 0.3 }),
    tapHead: std({ color: "#3f6fb5", roughness: 0.5 }),
    charger: std({ color: "#f5f6f7", roughness: 0.35 }),
    chargerFace: std({ color: "#1d232b", roughness: 0.3 }),
    led: std({ color: "#34d399", emissive: "#34d399", emissiveIntensity: 2 }),
    cable: std({ color: "#1d2227", roughness: 0.6 }),
    solar: std({ map: solarTexture(), roughness: 0.15, metalness: 0.3 }),
  };
}

function build(plan: HomePlan, night: boolean) {
  const root = new THREE.Group();
  const mats = makeMaterials(plan, night);
  const anchors: Anchors = {};
  const add = (g: THREE.BufferGeometry, m: THREE.Material, cast = true, receive = true) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    root.add(mesh);
    return mesh;
  };
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, m: THREE.Material, uv?: [number, number], cast = true) => {
    const g = boxGeo(x0, y0, z0, x1, y1, z1);
    if (uv) worldUV(g, uv[0], uv[1]);
    return add(g, m, cast);
  };
  /** A bar between two points (our coordinates). */
  const beam = (a: [number, number, number], b: [number, number, number], tx: number, ty: number, m: THREE.Material) => {
    const pa = T(...a);
    const pb = T(...b);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(tx, ty, pa.distanceTo(pb)), m);
    mesh.position.copy(pa).add(pb).multiplyScalar(0.5);
    mesh.lookAt(pb);
    mesh.castShadow = true;
    root.add(mesh);
    return mesh;
  };
  const pipe = (a: [number, number, number], b: [number, number, number], r: number, m: THREE.Material) => {
    const pa = T(...a);
    const pb = T(...b);
    const dir = pb.clone().sub(pa);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, dir.length(), 12), m);
    mesh.position.copy(pa).add(pb).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    mesh.castShadow = true;
    root.add(mesh);
    return mesh;
  };

  buildGround(plan, mats, box, add, night);
  if (plan.isFlat) buildFlats(plan, mats, box, anchors, night);
  else {
    buildHouse(plan, mats, box, beam, pipe, add, anchors, night);
    if (plan.outsideGarage) buildGarage(plan, mats, box, beam, add);
  }
  buildGarden(plan, mats, add);
  plan.carSpots.forEach((spot) => root.add(buildCar(spot.vehicle, spot.x, spot.z, night)));
  if (plan.carSpots.length) {
    const last = plan.carSpots[plan.carSpots.length - 1];
    anchors.car = T(last.x + bodyOf(last.vehicle).cw / 2, 15, last.z + 20);
  }
  buildCharger(plan, mats, box, add, anchors);
  return { root, anchors, mats };
}

type BoxFn = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, m: THREE.Material, uv?: [number, number], cast?: boolean) => THREE.Mesh;
type AddFn = (g: THREE.BufferGeometry, m: THREE.Material, cast?: boolean, receive?: boolean) => THREE.Mesh;
type BeamFn = (a: [number, number, number], b: [number, number, number], tx: number, ty: number, m: THREE.Material) => THREE.Mesh;
type PipeFn = (a: [number, number, number], b: [number, number, number], r: number, m: THREE.Material) => THREE.Mesh;

function buildGround(plan: HomePlan, mats: Mats, box: BoxFn, add: AddFn, night: boolean) {
  const { slabL, slabR, slabB, slabF, s, isFlat, drive, driveBack, path, w } = plan;
  box(slabL, -6, slabF, slabR, -0.02, slabB, mats.soilSide, undefined, false);
  // Soil edges with a turf lip.
  box(slabL, -6, slabF - 0.01, slabR, -0.5, slabF, mats.soil, [24, 24], false);
  box(slabR, -6, slabF, slabR + 0.01, -0.5, slabB, mats.soil, [24, 24], false);
  box(slabL, -0.6, 0, slabR, 0, slabB, mats.lawn, [16, 16], false);
  box(slabL, -0.6, PLOT, slabR, 0, 0, isFlat || s.grass !== false ? mats.lawn : mats.paving, isFlat || s.grass !== false ? [16, 16] : [10, 10], false);
  box(slabL, -0.6, slabF, slabR, 0.25, PLOT - 1.4, mats.pavement, [6, 6], false);
  box(slabL, -0.6, PLOT - 1.4, slabR, 0.5, PLOT, mats.kerb, undefined, false);
  if (drive) {
    box(drive[0], -0.55, slabF, drive[1], 0.08, driveBack, mats.tarmac, [20, 20], false);
    if (s.driveway === "full" && plan.outsideGarage && !plan.garageAttached) box(0, -0.55, slabF, w, 0.08, 0, mats.tarmac, [20, 20], false);
  }
  if (path) box(path[0], -0.55, PLOT, path[1], 0.06, 0, mats.paving, [10, 10], false);
  void add;
  void night;
}

/** A window set into a wall: frame, glass, glazing bars and a sill. */
function windowAt(box: BoxFn, mats: Mats, map: (u: number, y: number, n: number) => [number, number, number], u0: number, y0: number, ww: number, hh: number, lit: boolean, night: boolean, sill = true) {
  const b = (ua: number, ya: number, na: number, ub: number, yb: number, nb: number, m: THREE.Material) => {
    const p = map(ua, ya, na);
    const q = map(ub, yb, nb);
    return box(Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.min(p[2], q[2]), Math.max(p[0], q[0]), Math.max(p[1], q[1]), Math.max(p[2], q[2]), m);
  };
  const glass = night ? (lit ? mats.glassLit : mats.glassDark) : mats.glassDay;
  b(u0 - 1.3, y0 - 1.3, 0, u0 + ww + 1.3, y0 + hh + 1.3, 0.25, mats.white);
  b(u0, y0, 0.26, u0 + ww, y0 + hh, 0.3, glass);
  const f = 0.9;
  b(u0 - 1.3, y0 - 1.3, 0.25, u0 + ww + 1.3, y0, 0.9, mats.white);
  b(u0 - 1.3, y0 + hh, 0.25, u0 + ww + 1.3, y0 + hh + 1.3, 0.9, mats.white);
  b(u0 - 1.3, y0, 0.25, u0, y0 + hh, 0.9, mats.white);
  b(u0 + ww, y0, 0.25, u0 + ww + 1.3, y0 + hh, 0.9, mats.white);
  if (ww > 13) b(u0 + ww / 2 - f / 2, y0, 0.25, u0 + ww / 2 + f / 2, y0 + hh, 0.8, mats.white);
  b(u0, y0 + hh * 0.68, 0.25, u0 + ww, y0 + hh * 0.68 + f, 0.8, mats.white);
  if (sill) b(u0 - 2.2, y0 - 2.1, 0, u0 + ww + 2.2, y0 - 1.1, 2.2, mats.sill);
}

function buildHouse(plan: HomePlan, mats: Mats, box: BoxFn, beam: BeamFn, pipe: PipeFn, add: AddFn, anchors: Anchors, night: boolean) {
  const { spec, w, d, s } = plan;
  const geo = roofGeometry(spec);
  const { wallH, ov, eave, ridge, halfZ, slopeY } = geo;
  const floors = spec.floors;
  const lowBand = Math.min(FH, wallH);

  // Walls: the side profile (with the gable) extruded across the width.
  const toWorld = new THREE.Matrix4().set(0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1);
  const extrude = (pts: Array<[number, number]>, m: THREE.Material) => {
    const shape = new THREE.Shape(pts.map(([u, y]) => new THREE.Vector2(u, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
    g.applyMatrix4(toWorld);
    worldUV(g, 12, 8);
    return add(g, m);
  };
  const gableTop = (y: number) => y;
  if (floors > 1) {
    extrude([[0, 0], [d, 0], [d, lowBand], [0, lowBand]], mats.ground);
    extrude([[0, lowBand], [d, lowBand], [d, wallH], [halfZ, gableTop(ridge - 0.4)], [0, wallH]], mats.upper);
  } else {
    extrude([[0, 0], [d, 0], [d, wallH], [halfZ, gableTop(ridge - 0.4)], [0, wallH]], mats.ground);
  }
  if (floors > 1 && plan.walls.ground !== plan.walls.upper) box(-0.2, FH - 0.4, -0.25, w + 0.2, FH + 0.4, d, mats.sill);

  const front = (u: number, y: number, n: number): [number, number, number] => [u, y, -n];
  const side = (u: number, y: number, n: number): [number, number, number] => [w + n, y, u];
  spec.wins.forEach((win: Win, i) => windowAt(box, mats, front, win.x, win.h1, win.w, win.h, i % 4 !== 1, night));
  if (!spec.partyRight) {
    if (floors > 1) windowAt(box, mats, side, d * 0.55 - 4, FH + 8, 8, 10, true, night);
    if (spec.loft) windowAt(box, mats, side, halfZ - 5, wallH + 6, 10, 9, true, night, false);
  }

  // Front door with a canopy.
  if (spec.door) {
    const { x, w: dw } = spec.door;
    box(x - 1.3, 0, -0.25, x + dw + 1.3, 21.3, 0, mats.white);
    box(x, 0, -0.35, x + dw, 20, -0.25, mats.door);
    box(x + 2, 13, -0.45, x + dw - 2, 18, -0.35, mats.doorGlass);
    box(x + dw - 2.4, 9.2, -0.9, x + dw - 1.6, 11.4, -0.35, mats.brass);
    box(x - 3, 23, -7, x + dw + 3, 24.2, 0, mats.white);
    box(x - 3.3, 24.2, -7.3, x + dw + 3.3, 24.8, 0, mats.roofDark);
    box(x - 0.2, 0, -1.8, x + dw + 0.2, 0.8, 0, mats.sill);
  }
  if (spec.integralDoor) {
    const { x, w: gw } = spec.integralDoor;
    box(x - 1.3, 0, -0.25, x + gw + 1.3, 21.3, 0, mats.white);
    box(x, 0, -0.45, x + gw, 20, -0.25, mats.garageDoor, [10, 3.8]);
  }

  // Roof: two tiled slopes on the gable walls, overhanging all round.
  const slopeLen = Math.hypot(halfZ + ov, ridge - eave);
  const angle = Math.atan2(ridge - eave, halfZ + ov);
  const rt = 1.6;
  const slab = (back: boolean) => {
    const g = new THREE.BoxGeometry(w + ov * 2, rt, slopeLen + 0.6);
    g.translate(w / 2, rt / 2, back ? (slopeLen + 0.6) / 2 : -(slopeLen + 0.6) / 2);
    g.rotateX(back ? -angle : angle);
    g.translate(0, eave, back ? -(d + ov) : ov);
    worldUV(g, 12, 12);
    return add(g, mats.roof);
  };
  slab(false);
  slab(true);
  // Fascia, gutter and downpipe; white bargeboards on the gables.
  beam([-ov, eave - 1, -ov - 0.2], [w + ov, eave - 1, -ov - 0.2], 0.5, 2.6, mats.white);
  beam([-ov, eave - 1, d + ov + 0.2], [w + ov, eave - 1, d + ov + 0.2], 0.5, 2.6, mats.white);
  pipe([-ov, eave - 2.6, -ov - 1.1], [w + ov, eave - 2.6, -ov - 1.1], 0.9, mats.pipe);
  pipe([w - 2.4, 0, -1], [w - 2.4, eave - 2.6, -1], 0.6, mats.pipe);
  for (const gx of [-ov - 0.1, w + ov + 0.1]) {
    beam([gx, eave - 1.6, -ov], [gx, ridge - 1.4, halfZ], 0.5, 2.6, mats.white);
    beam([gx, ridge - 1.4, halfZ], [gx, eave - 1.6, d + ov], 0.5, 2.6, mats.white);
  }
  beam([-ov, ridge + rt * 0.6, halfZ], [w + ov, ridge + rt * 0.6, halfZ], 2.6, 2.2, mats.roofDark);

  // Chimney at the left end (the party wall on a semi or terrace).
  const cw = 9;
  const cx = 4;
  const czf = halfZ - 4;
  const ctop = ridge + 11;
  box(cx, slopeY(czf) - 3, czf, cx + cw, ctop, czf + 8, mats.upper, [12, 8]);
  box(cx - 0.8, ctop, czf - 0.8, cx + cw + 0.8, ctop + 1.2, czf + 8.8, mats.capping);
  for (const f of [0.3, 0.7]) pipe([cx + cw * f, ctop + 1.2, czf + 4], [cx + cw * f, ctop + 5, czf + 4], 1.2, mats.chimneyPot);

  // Things on the roof slope: a local frame along the front slope.
  const onSlope = (x0: number, x1: number, t0: number, t1: number, y0: number, y1: number, m: THREE.Material, uvMap = false) => {
    const s0 = t0 * slopeLen;
    const s1 = t1 * slopeLen;
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, s1 - s0);
    g.translate((x0 + x1) / 2, rt + (y0 + y1) / 2, -(s0 + s1) / 2);
    g.rotateX(angle);
    g.translate(0, eave, ov);
    if (uvMap) worldUV(g, 12, 12);
    return add(g, m);
  };
  const dormer = spec.loft && spec.loftWindow !== "skylight" ? dormerGeometry(spec) : null;
  if (spec.loft && spec.loftWindow === "skylight") {
    for (const f of [0.3, 0.7]) {
      onSlope(w * f - 6.6, w * f + 6.6, 0.18, 0.52, 0, 0.7, mats.white);
      onSlope(w * f - 5.6, w * f + 5.6, 0.2, 0.5, 0.7, 0.9, night ? mats.glassLit : mats.glassDay);
    }
  }
  if (dormer) {
    const { dw, dx, yb, yt, yr, zf, zr } = dormer;
    const zBack = zr + 2;
    box(dx, yb - 2, zf, dx + dw, yt, zBack, mats.upper, [12, 8]);
    windowAt(box, mats, (u, y, n) => [u, y, zf - n], dx + 3.5, yb + 2.5, dw - 7, yt - yb - 5.5, true, night, false);
    if (spec.loftWindow === "dormer") {
      const g = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(dx - 1.6, yt - 0.6), new THREE.Vector2(dx + dw / 2, yr + 0.6), new THREE.Vector2(dx + dw + 1.6, yt - 0.6)]), { depth: zBack - zf + 1.6, bevelEnabled: false });
      g.translate(0, 0, -(zBack + 0.1));
      g.scale(1, 1, 1);
      worldUV(g, 12, 12);
      add(g, mats.roof);
      const tri = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(dx, yt), new THREE.Vector2(dx + dw / 2, yr), new THREE.Vector2(dx + dw, yt)]), { depth: 1, bevelEnabled: false });
      tri.translate(0, 0, -zf - 0.5);
      worldUV(tri, 12, 8);
      add(tri, mats.upper);
      beam([dx - 1.6, yt - 0.9, zf - 1.7], [dx + dw / 2, yr + 0.3, zf - 1.7], 0.5, 1.6, mats.white);
      beam([dx + dw / 2, yr + 0.3, zf - 1.7], [dx + dw + 1.6, yt - 0.9, zf - 1.7], 0.5, 1.6, mats.white);
    } else {
      box(dx - 1.2, yt, zf - 1.2, dx + dw + 1.2, yt + 1.2, zBack, mats.flatRoof);
      box(dx - 1.2, yt - 1.4, zf - 1.4, dx + dw + 1.2, yt + 1.2, zf - 1.2, mats.white);
    }
  }
  if (spec.solar) {
    const xl = -ov;
    const xr = w + ov;
    const n = Math.max(2, Math.floor((xr - xl - 14) / 11));
    const start = (xl + xr) / 2 - (n * 11 - 1) / 2;
    const blocked: Array<[number, number, number]> = dormer
      ? [[dormer.dx - 2, dormer.dx + dormer.dw + 2, (dormer.zr + ov) / (halfZ + ov) + 0.08]]
      : spec.loft ? [[w * 0.3 - 8, w * 0.3 + 8, 0.55], [w * 0.7 - 8, w * 0.7 + 8, 0.55]] : [];
    let first: THREE.Vector3 | null = null;
    for (const [t0, t1] of [[0.12, 0.43], [0.46, 0.77]]) {
      for (let i = 0; i < n; i++) {
        const px = start + i * 11;
        if (blocked.some(([a, b, t]) => t0 < t && px + 10 > a && px < b)) continue;
        const mesh = onSlope(px, px + 10, t0, t1, 0.3, 1.1, mats.solar);
        if (!first) { mesh.geometry.computeBoundingBox(); first = mesh.geometry.boundingBox!.getCenter(new THREE.Vector3()); }
      }
    }
    if (first) anchors.solar = first;
  }

  // Meter boxes on the side wall (or the front on a mid terrace), and an outside tap.
  if (spec.meters) {
    box(w, 6.8, SIDE_METER_Z, w + 1.4, 12.6, SIDE_METER_Z + 5.4, mats.meter);
    box(w, 0.6, SIDE_METER_Z, w + 1.4, 6.4, SIDE_METER_Z + 5.4, mats.meter);
    anchors.electricity = T(w + 1.4, 9.7, SIDE_METER_Z + 2.7);
    anchors.gas = T(w + 1.4, 3.5, SIDE_METER_Z + 2.7);
  } else {
    const mx = plan.frontMeterX;
    box(mx, 6.8, -1.4, mx + 5.2, 12.6, 0, mats.meter);
    box(mx, 0.6, -1.4, mx + 5.2, 6.4, 0, mats.meter);
    anchors.electricity = T(mx + 2.6, 9.7, -1.4);
    anchors.gas = T(mx + 2.6, 3.5, -1.4);
  }
  box(plan.tapX, 5.2, -1.6, plan.tapX + 1.2, 6.4, 0, mats.tap);
  box(plan.tapX - 0.4, 6.4, -1.2, plan.tapX + 1.6, 7.2, -0.4, mats.tapHead);
  anchors.water = T(plan.tapX + 0.6, 6, -1.6);
  anchors.home = T(w / 2, ridge + 2, halfZ);
  if (!anchors.solar) anchors.solar = T(w / 2, slopeY(halfZ * 0.5), halfZ * 0.5);
  void s;
}

function buildGarage(plan: HomePlan, mats: Mats, box: BoxFn, beam: BeamFn, add: AddFn) {
  const { garageX: x0, garageZ: z0, gw: w, garageD: d, garageAttached } = plan;
  const h = 25;
  box(x0, 0, z0, x0 + w, h, z0 + d, mats.ground, [12, 8]);
  box(x0 + 3.8, 0, z0 - 0.3, x0 + w - 3.8, 20.6, z0, mats.white);
  box(x0 + 5, 0, z0 - 0.5, x0 + w - 5, 19.5, z0 - 0.3, mats.garageDoor, [10, 3.8]);
  if (garageAttached) {
    box(x0 - 0.2, h, z0 - 0.4, x0 + w + 0.4, h + 1.4, z0 + d, mats.flatRoof);
    box(x0 - 0.2, h - 1.2, z0 - 0.8, x0 + w + 0.4, h + 1.4, z0 - 0.4, mats.white);
  } else {
    const rise = w * 0.32;
    const shape = new THREE.Shape([new THREE.Vector2(x0, h), new THREE.Vector2(x0 + w / 2, h + rise), new THREE.Vector2(x0 + w, h)]);
    const gable = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
    gable.translate(0, 0, -(z0 + d));
    worldUV(gable, 12, 8);
    add(gable, mats.ground);
    const len = Math.hypot(w / 2 + 1.6, rise + 0.8);
    const ang = Math.atan2(rise + 0.8, w / 2 + 1.6);
    for (const side of [-1, 1]) {
      const g = new THREE.BoxGeometry(len, 1.2, d + 3);
      g.translate((side * len) / 2, 0.6, -(z0 + d / 2));
      g.rotateZ(side * -ang);
      g.translate(x0 + w / 2, h + rise + 0.3, 0);
      worldUV(g, 12, 12);
      add(g, mats.roof);
    }
    beam([x0 - 1.4, h - 0.6, z0 - 1.6], [x0 + w / 2, h + rise + 0.2, z0 - 1.6], 0.5, 1.8, mats.white);
    beam([x0 + w / 2, h + rise + 0.2, z0 - 1.6], [x0 + w + 1.4, h - 0.6, z0 - 1.6], 0.5, 1.8, mats.white);
  }
}

function buildFlats(plan: HomePlan, mats: Mats, box: BoxFn, anchors: Anchors, night: boolean) {
  const floors = Math.max(3, Math.min(6, Math.round(Number(plan.s.storeys) || 4)));
  const fh = 24;
  const w = 110;
  const d = 70;
  const h = floors * fh;
  box(0, 0, 0, w, h, d, mats.ground, [12, 8]);
  box(-0.6, h, -0.6, w + 0.6, h + 2.4, d + 0.6, mats.white);
  box(1, h + 0.2, 1, w - 1, h + 2.6, d - 1, mats.flatRoof);
  const front = (u: number, y: number, n: number): [number, number, number] => [u, y, -n];
  const side = (u: number, y: number, n: number): [number, number, number] => [w + n, y, u];
  for (let f = 0; f < floors; f++) {
    for (let i = 0; i < 4; i++) {
      if (f === 0 && (i === 1 || i === 2)) continue;
      windowAt(box, mats, front, 10 + i * 25.5, f * fh + 8, 13, 11, f === 1 || (f + i) % 3 === 0, night);
    }
    for (const t of [0.3, 0.7]) windowAt(box, mats, side, d * t - 5, f * fh + 8, 10, 10, (f + t * 10) % 3 !== 0, night);
  }
  box(w / 2 - 9, 0, -0.3, w / 2 + 9, 21.2, 0, mats.white);
  box(w / 2 - 8, 0, -0.5, w / 2 + 8, 20, -0.3, mats.doorGlass);
  box(w / 2 - 12, 23, -7, w / 2 + 12, 24.4, 0, mats.white);
  anchors.home = T(w / 2, h + 3, d / 2);
  anchors.electricity = T(w / 2 - 14, 12, 0);
  anchors.gas = T(w / 2 - 14, 6, 0);
  anchors.water = T(w / 2 + 14, 6, 0);
}

function buildGarden(plan: HomePlan, mats: Mats, add: AddFn) {
  const { slabL, slabR, slabB, s, spec, isFlat } = plan;
  const blob = (x: number, y: number, z: number, r: number, m: THREE.Material) => {
    const g = new THREE.IcosahedronGeometry(r, 1);
    g.translate(x, y, -z);
    return add(g, m);
  };
  const tree = (x: number, z: number, r: number) => {
    const trunk = new THREE.CylinderGeometry(1.2, 1.6, r * 1.4, 8);
    trunk.translate(x, r * 0.7, -z);
    add(trunk, mats.trunk);
    blob(x, r * 1.9, z, r, mats.leaf);
    blob(x + r * 0.45, r * 1.7, z - r * 0.3, r * 0.7, mats.leafDark);
    blob(x - r * 0.35, r * 2.3, z + r * 0.2, r * 0.6, mats.leafLight);
  };
  tree(slabL + 10, slabB - 10, 12);
  tree(slabR - 14, slabB - 6, 14);
  if (s.shrubs !== false) {
    const beds = isFlat ? [{ x: 8, w: 26 }] : spec.wins.filter((win) => win.h1 < FH).map((win) => ({ x: win.x - 1, w: win.w + 2 }));
    beds.forEach(({ x, w }) => {
      const g = boxGeo(x - 1, -0.4, -6.5, x + w + 1, 0.3, 0);
      worldUV(g, 24, 24);
      add(g, mats.soil, false);
      const n = Math.max(2, Math.round(w / 7));
      for (let i = 0; i < n; i++) {
        const bx = x + ((i + 0.5) / n) * w;
        blob(bx, 3.2, -3.4, 3.8, i % 2 ? mats.leafDark : mats.leaf);
        blob(bx - 1, 4.6, -4, 2, mats.leafLight);
      }
    });
  }
}

function buildCharger(plan: HomePlan, mats: Mats, box: BoxFn, add: AddFn, anchors: Anchors) {
  const { charger, chargedCar, w } = plan;
  if (!charger) return;
  let start: THREE.Vector3;
  if (charger.front) {
    const z = charger.z;
    box(charger.x, 11.4, z - 1.4, charger.x + 3.2, 17, z, mats.charger);
    box(charger.x + 0.5, 14.6, z - 1.5, charger.x + 2.7, 16.4, z - 1.4, mats.chargerFace);
    box(charger.x + 1.3, 12.2, z - 1.5, charger.x + 1.9, 12.8, z - 1.4, mats.led);
    start = T(charger.x + 1.6, 11.6, z - 1.2);
    anchors.charger = T(charger.x + 1.6, 14.2, z - 1.4);
  } else {
    const z = SIDE_CHARGER_Z;
    box(w, 11.4, z, w + 1.4, 17, z + 3.6, mats.charger);
    box(w + 1.4, 14.6, z + 0.6, w + 1.5, 16.4, z + 3, mats.chargerFace);
    box(w + 1.4, 12.2, z + 1.5, w + 1.5, 12.8, z + 2.1, mats.led);
    start = T(w + 1.2, 11.6, z + 1.8);
    anchors.charger = T(w + 1.4, 14.2, z + 1.8);
  }
  if (!chargedCar) return;
  const b = bodyOf(chargedCar.vehicle);
  const port = T(chargedCar.x + b.cw + 0.2, b.port[1], chargedCar.z + b.port[0] + 1.2);
  const mid = start.clone().add(port).multiplyScalar(0.5);
  mid.y = 0.6;
  const curve = new THREE.CatmullRomCurve3([start, start.clone().lerp(mid, 0.45).setY(4), mid, port.clone().lerp(mid, 0.4).setY(3), port]);
  add(new THREE.TubeGeometry(curve, 40, 0.45, 8, false), mats.cable);
}

/* ---------- cars ---------- */

function buildCar(vehicle: Vehicle, x: number, z: number, night: boolean) {
  const group = new THREE.Group();
  const b = bodyOf(vehicle);
  const ev = vehicle.ev !== false;
  const { L, cw } = b;
  const cx = x + cw / 2;
  const colour = vehicle.colour || CAR_COLOURS[0][0];
  const paint = new THREE.MeshPhysicalMaterial({ color: colour, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.1 });
  const glass = new THREE.MeshPhysicalMaterial({ color: "#0d1218", metalness: 0.3, roughness: 0.04, clearcoat: 1, envMapIntensity: 1.3 });
  const trim = new THREE.MeshStandardMaterial({ color: "#16181b", roughness: 0.55 });
  const tyre = new THREE.MeshStandardMaterial({ color: "#151619", roughness: 0.92 });
  const rimMat = new THREE.MeshStandardMaterial({ color: ev ? "#3a3f46" : "#c9ced4", metalness: 0.9, roughness: ev ? 0.35 : 0.22 });
  const rimLight = new THREE.MeshStandardMaterial({ color: "#c9ced4", metalness: 0.9, roughness: 0.22 });
  const chrome = new THREE.MeshStandardMaterial({ color: "#d9dde2", metalness: 1, roughness: 0.15 });
  const lamp = new THREE.MeshStandardMaterial({ color: "#b0141c", emissive: "#ff2a2a", emissiveIntensity: night ? 3 : 0.9, roughness: 0.25 });
  const plateMat = new THREE.MeshStandardMaterial({ color: "#f2c94c", roughness: 0.5 });
  const put = (g: THREE.BufferGeometry, m: THREE.Material, cast = true) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  /* Body: a loft of rounded cross-sections along the car. */
  const prof = smooth(b.pts, 10);
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
    let bot = 3.2 + Math.max(0, rearB - 3.2) * clamp01(1 - zz / 4) + Math.max(0, frontB - 3.2) * clamp01(1 - (L - zz) / 4);
    for (const wz of b.wheels) { const dd = Math.abs(zz - wz); if (dd < R) bot = Math.max(bot, b.r + Math.sqrt(R * R - dd * dd)); }
    return bot;
  };
  const beltBase = b.win[0][1] - 0.2;
  const winZ = b.win.map((p) => p[0]);
  const winMin = Math.min(...winZ);
  const winMax = Math.max(...winZ);
  const bPillar = (b.win[2][0] + b.win[3][0]) / 2;
  const half = (zz: number) => {
    const top = topAt(zz);
    const belt = Math.min(beltBase, top - 0.4);
    const endD = Math.min(zz, L - zz);
    const hw = (cw / 2) * (1 - 0.1 * Math.max(0, 1 - endD / 4) ** 2);
    const g = clamp01((top - belt - 0.6) / 3);
    const rw = hw * 0.74;
    const bot = Math.min(bottomAt(zz), belt - 2.4);
    const base = Math.min(belt + 0.35, top);
    const pts: Array<[number, number]> = [
      [hw * 0.8, bot],
      [hw * 0.93, bot + 0.35],
      [hw * 0.99, bot + 1.1],
      [hw, lerp(bot + 1.1, belt - 0.6, 0.5)],
      [hw, belt - 0.6],
      [hw * 0.985, belt],
      [lerp(hw * 0.9, hw * 0.95, g), base],
      [lerp(hw * 0.85, lerp(hw * 0.95, rw, 0.55), g), Math.max(base, lerp(base, top - 1.5, g))],
      [lerp(hw * 0.78, rw, g), Math.max(base, top - 0.55)],
      [lerp(hw * 0.55, rw * 0.78, g), Math.max(base, top - 0.12)],
      [0, top],
    ];
    for (let i = 1; i < pts.length; i++) if (pts[i][1] < pts[i - 1][1]) pts[i][1] = pts[i - 1][1];
    return { g, pts };
  };
  const stations: number[] = [];
  for (let s = 0; s < L; s += 0.5) stations.push(s);
  stations.push(L);
  const N = 11;
  const ringLen = N * 2 - 1;
  const positions: number[] = [];
  const gs: number[] = [];
  stations.forEach((zz) => {
    const { g, pts } = half(zz);
    gs.push(g);
    const ring = [...pts.map(([w, h]) => [cx + w, h]), ...pts.slice(0, -1).reverse().map(([w, h]) => [cx - w, h])];
    ring.forEach(([px, ph]) => positions.push(px, ph, -(z + zz)));
  });
  const groups: Record<"paint" | "glass" | "trim", number[]> = { paint: [], glass: [], trim: [] };
  const inRange = (zm: number, [a, c]: [number, number]) => zm > a && zm < c;
  for (let i = 0; i < stations.length - 1; i++) {
    const zm = (stations[i] + stations[i + 1]) / 2;
    const g = (gs[i] + gs[i + 1]) / 2;
    for (let j = 0; j < ringLen - 1; j++) {
      const a = i * ringLen + j;
      const bIdx = a + 1;
      const c = a + ringLen;
      const dIdx = c + 1;
      const k = Math.min(j, ringLen - 2 - j); // mirror index for the left side
      let kind: "paint" | "glass" | "trim" = "paint";
      if ((k === 6 || k === 7) && g > 0.5 && zm > winMin + 0.6 && zm < winMax - 0.6 && Math.abs(zm - bPillar) > 0.6) kind = "glass";
      else if (k >= 8 && (b.glass.some((r) => inRange(zm, r)) || (ev && inRange(zm, [b.roof[0] + 0.8, b.roof[1] - 0.8])))) kind = "glass";
      else if (k <= 1 && b.rails) kind = "trim";
      groups[kind].push(a, c, bIdx, bIdx, c, dIdx);
    }
  }
  const body = new THREE.BufferGeometry();
  body.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const index = [...groups.paint, ...groups.glass, ...groups.trim];
  body.setIndex(index);
  body.addGroup(0, groups.paint.length, 0);
  body.addGroup(groups.paint.length, groups.glass.length, 1);
  body.addGroup(groups.paint.length + groups.glass.length, groups.trim.length, 2);
  body.computeVertexNormals();
  const bodyMesh = new THREE.Mesh(body, [paint, glass, trim]);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  group.add(bodyMesh);
  // Close the ends.
  const cap = (zz: number) => {
    const { pts } = half(zz);
    const ring = [...pts.map(([w, h]) => new THREE.Vector2(w, h)), ...pts.slice(0, -1).reverse().map(([w, h]) => new THREE.Vector2(-w, h))];
    const g = new THREE.ShapeGeometry(new THREE.Shape(ring));
    g.translate(cx, 0, -(z + zz));
    return put(g, paint);
  };
  cap(0).geometry.rotateY(0);
  cap(L);

  /* Wheels: tyres, rims and dark arch liners. */
  for (const wz of b.wheels) {
    for (const sx of [-1, 1]) {
      const xo = sx > 0 ? x + cw - 0.4 : x + 0.4;
      const tw = 3;
      const tg = new THREE.CylinderGeometry(b.r, b.r, tw, 40);
      tg.rotateZ(Math.PI / 2);
      tg.translate(xo - (sx * tw) / 2, b.r, -(z + wz));
      put(tg, tyre);
      const liner = new THREE.CylinderGeometry(R - 0.2, R - 0.2, 1.4, 32);
      liner.rotateZ(Math.PI / 2);
      liner.translate(xo - sx * (tw + 1.6), b.r, -(z + wz));
      put(liner, trim, false);
      const rg = new THREE.CylinderGeometry(b.r * 0.72, b.r * 0.72, 0.5, 40);
      rg.rotateZ(Math.PI / 2);
      rg.translate(xo + sx * 0.05, b.r, -(z + wz));
      put(rg, rimMat);
      const spokes = 5;
      for (let i = 0; i < spokes; i++) {
        const a = (i / spokes) * Math.PI * 2;
        const sg = new THREE.BoxGeometry(0.5, ev ? 1.6 : 0.9, b.r * 0.62);
        sg.translate(0, 0, b.r * 0.31);
        sg.rotateX(a);
        sg.translate(xo + sx * 0.35, b.r, -(z + wz));
        put(sg, ev ? rimLight : chrome);
      }
      const hub = new THREE.CylinderGeometry(0.9, 0.9, 0.7, 16);
      hub.rotateZ(Math.PI / 2);
      hub.translate(xo + sx * 0.4, b.r, -(z + wz));
      put(hub, rimLight);
    }
  }

  /* Back: lights, plate, diffuser, exhausts. */
  const hwBack = (cw / 2) * 0.9;
  const backBot = bottomAt(0);
  const rearBox = (x0: number, x1: number, y0: number, y1: number, depth: number, m: THREE.Material) => {
    const g = boxGeo(x0, y0, z - depth, x1, y1, z + 0.4);
    return put(g, m);
  };
  if (ev) {
    rearBox(cx - hwBack, cx + hwBack, b.lights[0], b.lights[1], 0.25, lamp);
  } else {
    for (const sx of [-1, 1]) {
      const xa = cx + sx * hwBack;
      const xb = cx + sx * (hwBack - 4.4);
      rearBox(Math.min(xa, xb), Math.max(xa, xb), b.lights[0] - 0.7, b.lights[1] + 0.7, 0.25, lamp);
      const side = boxGeo(sx > 0 ? x + cw - 0.6 : x + 0.4, b.lights[0] - 0.5, z + 0.6, sx > 0 ? x + cw + 0.2 : x - 0.2, b.lights[1] + 0.5, z + 3);
      put(side, lamp);
    }
  }
  rearBox(cx - 3.6, cx + 3.6, b.plate[0], b.plate[1], 0.2, plateMat);
  rearBox(cx - hwBack * 0.85, cx + hwBack * 0.85, backBot, backBot + 1.4, 0.2, trim);
  if (!ev) {
    const pipes = b.boot || vehicle.body === "coupe_suv" || vehicle.body === "large_suv" ? [-1, 1] : [-1];
    for (const sx of pipes) {
      const pg = new THREE.CylinderGeometry(0.75, 0.75, 2.4, 16);
      pg.rotateX(Math.PI / 2);
      pg.translate(cx + sx * hwBack * 0.6, backBot + 0.7, -(z + 0.6));
      put(pg, chrome);
    }
  }

  /* Mirrors, handles, rails or an aerial. */
  const ws = b.glass[b.glass.length - 1][0];
  for (const sx of [-1, 1]) {
    const mx = sx > 0 ? x + cw : x;
    const mg = boxGeo(Math.min(mx - sx * 0.6, mx + sx * 1.3), beltBase + 0.5, z + ws + 0.2, Math.max(mx - sx * 0.6, mx + sx * 1.3), beltBase + 1.7, z + ws + 1.4);
    put(mg, paint);
    for (const f of [0.34, 0.6]) {
      const hg = boxGeo(Math.min(mx, mx + sx * 0.25), beltBase - 1.5, z + L * f - 1.4, Math.max(mx, mx + sx * 0.25), beltBase - 0.8, z + L * f + 1.4);
      put(hg, ev ? trim : chrome, false);
    }
  }
  const roofTop = Math.max(...b.pts.map((p) => p[1]));
  if (b.rails && !ev) {
    for (const sx of [-1, 1]) {
      const rx = cx + sx * (cw / 2) * 0.6;
      put(boxGeo(rx - 0.4, roofTop - 0.1, z + b.roof[0] + 1, rx + 0.4, roofTop + 0.9, z + b.roof[1] - 1), chrome);
    }
  } else {
    const fin = new THREE.ConeGeometry(0.7, 2.4, 4);
    fin.rotateX(Math.PI / 2.6);
    fin.translate(cx, roofTop + 0.6, -(z + b.roof[0] + 1.4));
    put(fin, trim);
  }

  /* A soft contact shadow under the car. */
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(cw + 6, L + 6),
    new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, depthWrite: false, opacity: night ? 0.9 : 0.75 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(cx, 0.12, -(z + L / 2));
  group.add(shadow);
  return group;
}

/* ---------- the renderer ---------- */

export type HouseRenderer = {
  render: (style: HouseStyle, night: boolean, width: number, height: number) => Record<string, [number, number]>;
  dispose: () => void;
};

export function createHouseRenderer(canvas: HTMLCanvasElement, viewW: number, viewH: number): HouseRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  let current: { scene: THREE.Scene; mats: Mats } | null = null;

  const disposeScene = () => {
    if (!current) return;
    current.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
      (Array.isArray(m) ? m : m ? [m] : []).forEach((mat) => {
        Object.values(mat).forEach((value) => { if (value instanceof THREE.Texture) value.dispose(); });
        mat.dispose();
      });
    });
    current = null;
  };

  return {
    render(style, night, width, height) {
      disposeScene();
      const plan = planHome(style);
      const scene = new THREE.Scene();
      scene.environment = envTex;
      scene.environmentIntensity = night ? 0.12 : 0.55;
      const { root, anchors, mats } = build(plan, night);
      if (plan.flip) root.scale.x = -1;
      scene.add(root);

      const centre = T((plan.slabL + plan.slabR) / 2, 20, (plan.slabF + plan.slabB) / 2);
      if (plan.flip) centre.x *= -1;
      const hemi = new THREE.HemisphereLight(night ? "#5a6f99" : "#dcecff", night ? "#1c2230" : "#6c7a5a", night ? 0.35 : 1.1);
      scene.add(hemi);
      const sun = new THREE.DirectionalLight(night ? "#9fb4ff" : "#fff3e0", night ? 0.45 : 2.6);
      sun.position.copy(centre).add(new THREE.Vector3(plan.flip ? 90 : -90, 160, 120));
      sun.target.position.copy(centre);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      const span = Math.max(plan.slabR - plan.slabL, plan.slabB - plan.slabF) * 0.85;
      Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 1, far: 600 });
      sun.shadow.radius = 4;
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.4;
      scene.add(sun, sun.target);
      if (night && !plan.isFlat && plan.spec.door) {
        const lamp = new THREE.PointLight("#ffbe6b", 900, 70, 2);
        const p = T(plan.spec.door.x + plan.spec.door.w / 2, 22, -6);
        if (plan.flip) p.x *= -1;
        lamp.position.copy(p);
        scene.add(lamp);
      }

      // An orthographic camera from the front-right, above, framed on the plot.
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2000);
      const dir = new THREE.Vector3(0.6, 0.48, 0.97).normalize();
      if (plan.flip) dir.x *= -1;
      camera.position.copy(centre).addScaledVector(dir, 600);
      camera.lookAt(centre);
      camera.updateMatrixWorld();
      const top = plan.top;
      const fit: Array<[number, number, number]> = [
        [plan.slabL, -6, plan.slabF], [plan.slabR, -6, plan.slabF], [plan.slabR, 0, plan.slabB], [plan.slabL, 0, plan.slabB], [plan.slabL, 0, plan.slabF],
        [0, top, plan.d / 2], [plan.w, top, plan.d / 2], [plan.slabL + 10, 40, plan.slabB - 10],
      ];
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      fit.forEach(([fx, fy, fz]) => {
        const p = T(fx, fy, fz);
        if (plan.flip) p.x *= -1;
        p.applyMatrix4(camera.matrixWorldInverse);
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      });
      const aspect = viewW / viewH;
      let halfW = (maxX - minX) / 2 * 1.06;
      let halfH = (maxY - minY) / 2 * 1.08;
      if (halfW / halfH > aspect) halfH = halfW / aspect; else halfW = halfH * aspect;
      const midX = (minX + maxX) / 2;
      const midY = (minY + maxY) / 2;
      Object.assign(camera, { left: midX - halfW, right: midX + halfW, top: midY + halfH, bottom: midY - halfH });
      camera.updateProjectionMatrix();

      renderer.setSize(width, height, false);
      renderer.render(scene, camera);
      current = { scene, mats };

      // Where each marker points, in the drawing's 360 x 250 frame.
      const out: Record<string, [number, number]> = {};
      Object.entries(anchors).forEach(([key, p]) => {
        if (!p) return;
        const v = p.clone();
        if (plan.flip) v.x *= -1;
        v.project(camera);
        out[key] = [((v.x + 1) / 2) * viewW, ((1 - v.y) / 2) * viewH];
      });
      return out;
    },
    dispose() {
      disposeScene();
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}

export { BRICK_COLOURS, ROOF_COLOURS, PAVE };

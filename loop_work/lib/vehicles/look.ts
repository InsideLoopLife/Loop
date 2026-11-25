// How a car looks on the drive drawing: its colour (one of the drawing's paint colours) and body style.
// Kept free of React so server code and the drawing can both use it.

export type CarBody = "hatch" | "saloon" | "fastback" | "crossover" | "coupe_suv" | "large_suv";

export const CAR_BODY_OPTIONS: [CarBody, string][] = [
  ["hatch", "Hatchback"],
  ["saloon", "Saloon / estate"],
  ["fastback", "Sleek saloon"],
  ["crossover", "SUV"],
  ["coupe_suv", "Coupé SUV"],
  ["large_suv", "Large SUV / 7-seater"],
];

/** The drawing's paints — the same hex values as the house drawing's CAR_COLOURS. */
export const CAR_PAINTS: { name: string; hex: string; words: RegExp }[] = [
  { name: "White", hex: "#eceeef", words: /white|pearl|ivory|cream|glacier|pure|polar|alpine|frozen/i },
  { name: "Black", hex: "#1d1f22", words: /black|obsidian|onyx|ebony|carbon/i },
  { name: "Silver", hex: "#9aa3ad", words: /silver|grey|gray|graphite|gunmetal|titanium|moonstone|platinum|pewter|slate|magnetic|steel|chrome/i },
  { name: "Midnight", hex: "#34404f", words: /midnight|dark blue|deep blue|navy|petrol blue|dolphin|indium|anthracite/i },
  { name: "Blue", hex: "#2f5a7a", words: /blue|azure|ocean|cobalt|sky|teal|turquoise|aqua|lapiz|lapis/i },
  { name: "Red", hex: "#8c2b2b", words: /red|ruby|crimson|burgundy|maroon|cherry|orange|copper|bronze|kings red|flame|lava/i },
];

/** The nearest drawing paint for a colour as people write it ("Pure White", "Moonstone Grey"). */
export function paintFor(colour: string | null | undefined): string | null {
  const text = String(colour || "").trim();
  if (!text) return null;
  if (/^#[0-9a-f]{6}$/i.test(text)) return CAR_PAINTS.find((p) => p.hex.toLowerCase() === text.toLowerCase())?.hex ?? null;
  // Check "dark blue" / "navy" (Midnight) before plain blue, and named paints before word lists.
  const exact = CAR_PAINTS.find((p) => p.name.toLowerCase() === text.toLowerCase());
  if (exact) return exact.hex;
  return CAR_PAINTS.find((p) => p.words.test(text))?.hex ?? null;
}

const LARGE_SUV = /range rover(?! (evoque|velar|sport))|discovery(?! sport)|defender|x5|x7|q7|q8|xc90|gle|gls|touareg|land cruiser|santa fe|sorento|kodiaq|tayron|tarraco|ev9|model x|explorer|cayenne|bentayga|g-class|outlander|x-trail|ioniq 9|pilot/i;
const COUPE_SUV = /x4|x6|q3 sportback|q5 sportback|glc coup|gle coup|evoque|velar|taigo|arona|cupra formentor|formentor|puma|c-hr|chr|juke|ix2|ev3|kona|xc40 recharge|ex30|model y/i;
const SUV = /tiguan|t-roc|t-cross|id\.?4|id\.?5|kuga|ecosport|qashqai|ariya|sportage|niro|ev6|tucson|ioniq 5|bayon|rav4|yaris cross|corolla cross|cr-v|hr-v|zr-v|cx-30|cx-5|cx-60|3008|2008|5008|c5 aircross|c3 aircross|captur|austral|arkana|duster|bigster|karoq|kamiq|enyaq|elroq|ateca|x1|x2|x3|ix1|ix3|q2|q3|q4|q5|gla|glb|glc|eqa|eqb|xc40|xc60|ex40|discovery sport|range rover sport|macan|mokka|grandland|frontera|tonale|stelvio|jeep|compass|renegade|avenger|mg zs|mg hs|zs ev|sealion|atto|jaecoo|omoda|tiggo|mustang mach|kia xceed|xceed|soul|sorento/i;
const FASTBACK = /model 3|model s|tesla|ioniq 6|polestar 2|arteon|a5 sportback|a7|4 series gran|i4|cla|taycan|panamera|stinger|id\.?7|seal\b|ev4/i;
const SALOON = /passat|superb|octavia|insignia|mondeo|3 series|5 series|i5|a4|a6|c-class|e-class|camry|accord|mazda6|xe|xf|s60|s90|v60|v90|estate|tourer|avant|touring|sw\b|combi/i;

/** A body style guessed from the model name. */
export function guessBody(make?: string | null, model?: string | null): CarBody | null {
  const text = `${make || ""} ${model || ""}`.trim();
  if (!text) return null;
  if (LARGE_SUV.test(text)) return "large_suv";
  if (COUPE_SUV.test(text)) return "coupe_suv";
  if (SUV.test(text)) return "crossover";
  if (FASTBACK.test(text)) return "fastback";
  if (SALOON.test(text)) return "saloon";
  if (/golf|polo|up!|id\.?3|fiesta|focus|corsa|astra|clio|megane|208|308|yaris|corolla|civic|jazz|i10|i20|i30|picanto|rio|ceed|fabia|scala|ibiza|leon|a1|a3|1 series|a-class|mini|500|panda|micra|leaf|swift|mg4|zoe|born|c3|c4|208|sandero|ev2/i.test(text)) return "hatch";
  return null;
}

/** The look of a car for the drive drawing, or null if there's nothing to go on. */
export function carLook(car: { colour?: string | null; body_style?: string | null; make?: string | null; model?: string | null; name?: string | null; fuel_type?: string | null }) {
  const body = (CAR_BODY_OPTIONS.some(([key]) => key === car.body_style) ? car.body_style : null) as CarBody | null;
  const guessedBody = body || guessBody(car.make, car.model || car.name);
  const colour = paintFor(car.colour);
  if (!guessedBody && !colour) return null;
  return {
    ...(guessedBody ? { body: guessedBody } : {}),
    ...(colour ? { colour } : {}),
    ev: car.fuel_type === "electric" || car.fuel_type === "plug_in_hybrid",
  };
}

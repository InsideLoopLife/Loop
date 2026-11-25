// Makes and models on UK sale 2021–2026, for the "Which car?" picker. Names only — figures
// come from the shared register (vehicle_model_specs), filled in by lookups as people use it.
// Anything missing can be typed in.

export const CAR_CATALOGUE: Record<string, string[]> = {
  "Abarth": ["500e", "595", "695", "600e"],
  "Alfa Romeo": ["Giulia", "Stelvio", "Tonale", "Junior"],
  "Aston Martin": ["DB12", "DBX", "Vantage"],
  "Audi": ["A1", "A3", "A4", "A5", "A6", "A7", "A8", "Q2", "Q3", "Q4 e-tron", "Q5", "Q6 e-tron", "Q7", "Q8", "Q8 e-tron", "e-tron GT", "TT"],
  "Bentley": ["Bentayga", "Continental GT", "Flying Spur"],
  "BMW": ["1 Series", "2 Series Active Tourer", "2 Series Coupe", "2 Series Gran Coupe", "3 Series", "4 Series", "5 Series", "7 Series", "8 Series", "i4", "i5", "i7", "iX", "iX1", "iX2", "iX3", "X1", "X2", "X3", "X4", "X5", "X6", "X7", "Z4"],
  "BYD": ["Atto 2", "Atto 3", "Dolphin", "Seal", "Seal U", "Sealion 7"],
  "Citroen": ["Berlingo", "C3", "C3 Aircross", "C4", "C4 X", "C5 Aircross", "C5 X", "e-C3", "e-C4", "SpaceTourer"],
  "Cupra": ["Born", "Formentor", "Leon", "Tavascan", "Terramar", "Ateca"],
  "Dacia": ["Bigster", "Duster", "Jogger", "Sandero", "Sandero Stepway", "Spring"],
  "DS": ["DS 3", "DS 4", "DS 7", "DS 9"],
  "Fiat": ["500", "500e", "500X", "600", "Grande Panda", "Panda", "Tipo"],
  "Ford": ["Bronco", "Explorer", "Fiesta", "Focus", "Galaxy", "Kuga", "Mustang", "Mustang Mach-E", "Puma", "Puma Gen-E", "Ranger", "S-Max", "Tourneo Connect", "Tourneo Custom", "Transit Custom"],
  "Genesis": ["G70", "G80", "GV60", "GV70", "GV80"],
  "Honda": ["Civic", "CR-V", "e:Ny1", "HR-V", "Jazz", "ZR-V"],
  "Hyundai": ["Bayon", "i10", "i20", "i30", "Inster", "Ioniq 5", "Ioniq 6", "Kona", "Santa Fe", "Tucson"],
  "Jaguar": ["E-Pace", "F-Pace", "F-Type", "I-Pace", "XE", "XF"],
  "Jeep": ["Avenger", "Compass", "Renegade", "Wrangler"],
  "Kia": ["Ceed", "EV3", "EV6", "EV9", "Niro", "Picanto", "ProCeed", "Rio", "Sorento", "Soul", "Sportage", "Stonic", "XCeed"],
  "Land Rover": ["Defender", "Discovery", "Discovery Sport", "Range Rover", "Range Rover Evoque", "Range Rover Sport", "Range Rover Velar"],
  "Lexus": ["ES", "LBX", "NX", "RX", "RZ", "UX"],
  "Mazda": ["CX-30", "CX-5", "CX-60", "CX-80", "Mazda2", "Mazda3", "MX-30", "MX-5"],
  "Mercedes-Benz": ["A-Class", "B-Class", "C-Class", "CLA", "CLE", "E-Class", "EQA", "EQB", "EQE", "EQS", "G-Class", "GLA", "GLB", "GLC", "GLE", "GLS", "S-Class", "V-Class"],
  "MG": ["Cyberster", "HS", "MG3", "MG4", "MG5", "MG ZS", "S5"],
  "MINI": ["Aceman", "Clubman", "Convertible", "Cooper", "Countryman", "Electric"],
  "Mitsubishi": ["ASX", "Eclipse Cross", "Outlander"],
  "Nissan": ["Ariya", "Juke", "Leaf", "Micra", "Qashqai", "X-Trail"],
  "Peugeot": ["208", "2008", "308", "3008", "408", "508", "5008", "e-208", "e-2008", "Rifter"],
  "Polestar": ["Polestar 2", "Polestar 3", "Polestar 4"],
  "Porsche": ["911", "Cayenne", "Macan", "Panamera", "Taycan"],
  "Renault": ["Arkana", "Austral", "Captur", "Clio", "Megane E-Tech", "Rafale", "Renault 5", "Scenic E-Tech", "Symbioz"],
  "SEAT": ["Arona", "Ateca", "Ibiza", "Leon", "Tarraco"],
  "Skoda": ["Elroq", "Enyaq", "Fabia", "Kamiq", "Karoq", "Kodiaq", "Octavia", "Scala", "Superb"],
  "Smart": ["#1", "#3"],
  "SsangYong / KGM": ["Korando", "Rexton", "Tivoli", "Torres"],
  "Subaru": ["Forester", "Outback", "Solterra", "XV / Crosstrek"],
  "Suzuki": ["Across", "Ignis", "S-Cross", "Swace", "Swift", "Vitara"],
  "Tesla": ["Model 3", "Model S", "Model X", "Model Y"],
  "Toyota": ["Aygo X", "bZ4X", "C-HR", "Corolla", "Corolla Cross", "GR86", "GR Yaris", "Land Cruiser", "Prius", "Proace City Verso", "RAV4", "Supra", "Yaris", "Yaris Cross"],
  "Vauxhall": ["Astra", "Combo Life", "Corsa", "Corsa Electric", "Crossland", "Frontera", "Grandland", "Mokka", "Vivaro Life"],
  "Volkswagen": ["Arteon", "Caddy", "California", "Golf", "Golf GTI", "Golf R", "ID. Buzz", "ID.3", "ID.4", "ID.5", "ID.7", "Multivan", "Passat", "Polo", "T-Cross", "T-Roc", "Taigo", "Tayron", "Tiguan", "Tiguan Allspace", "Touareg", "Touran", "up!"],
  "Volvo": ["EX30", "EX40", "EX90", "S60", "S90", "V60", "V90", "XC40", "XC60", "XC90"],
};

export const CAR_MAKES = Object.keys(CAR_CATALOGUE);

/** Common trim names per make, as suggestions only. */
export const COMMON_TRIMS: Record<string, string[]> = {
  "Volkswagen": ["Life", "Match", "Style", "SEL", "Elegance", "R-Line", "Black Edition", "GTD", "R"],
  "Ford": ["Titanium", "ST-Line", "ST-Line X", "Active", "Vignale", "Trend", "Zetec"],
  "Audi": ["Sport", "S line", "Black Edition", "Vorsprung", "Technik"],
  "BMW": ["SE", "Sport", "M Sport", "M Sport Pro"],
  "Mercedes-Benz": ["Sport", "AMG Line", "AMG Line Premium", "Exclusive"],
  "Kia": ["1", "2", "3", "4", "GT-Line", "GT-Line S"],
  "Hyundai": ["SE Connect", "Premium", "N Line", "Ultimate"],
  "Toyota": ["Icon", "Design", "Excel", "GR Sport", "Dynamic"],
  "Nissan": ["Visia", "Acenta Premium", "N-Connecta", "Tekna", "Tekna+"],
  "Skoda": ["SE", "SE L", "SportLine", "Laurin & Klement", "vRS"],
  "Vauxhall": ["Design", "GS", "Ultimate", "Griffin"],
  "Peugeot": ["Active", "Allure", "GT", "GT Premium"],
};

export const CAR_YEARS = Array.from({ length: 2027 - 2015 }, (_, i) => 2026 - i);

/** Stable key for the shared register. */
export function specKey(input: { make: string; model: string; trim?: string | null; year?: number | null; fuel?: string | null; engine?: string | null }) {
  const clean = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^a-z0-9.]+/g, " ").trim();
  return [clean(input.make), clean(input.model), clean(input.trim), input.year || "", clean(input.fuel), clean(input.engine)].join("|");
}

const MAKE_ALIASES: Record<string, string> = { vw: "Volkswagen", volkswagen: "Volkswagen", merc: "Mercedes-Benz", mercedes: "Mercedes-Benz", "land rover": "Land Rover", "range rover": "Land Rover", lr: "Land Rover", vauxhall: "Vauxhall", skoda: "Skoda", citroën: "Citroen", mini: "MINI", bmw: "BMW", mg: "MG", ds: "DS", byd: "BYD" };

/** Guess make (and model, if named) from a bill label like "VW", "Ford Kuga lease" or "BMW Finance". */
export function guessMakeModel(label: string): { make: string | null; model: string | null } {
  const t = label.toLowerCase();
  let make: string | null = null;
  for (const [alias, name] of Object.entries(MAKE_ALIASES)) if (new RegExp(`\\b${alias}\\b`).test(t)) { make = name; break; }
  if (!make) make = CAR_MAKES.find((m) => new RegExp(`\\b${m.toLowerCase().replace(/[^a-z0-9 ]/g, ".")}\\b`).test(t)) || null;
  const model = make ? (CAR_CATALOGUE[make] || []).find((m) => t.includes(m.toLowerCase())) || null : null;
  return { make, model };
}

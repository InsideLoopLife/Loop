// What each brand usually gives as a warranty in the UK, with where it came from. Only brands
// checked against the brand's own UK pages (or the brand's own terms) are listed; anything else
// gets no pointer rather than a guess. Terms change, so each entry says when it was checked.

export type BrandWarranty = {
  brand: string;
  /** Lowercase names that identify the brand in a product name or brand box. */
  match: string[];
  /** Standard months for these kinds of item; "*" covers anything else from the brand. */
  months: Partial<Record<string, number>> & { "*"?: number };
  /** Plain-English pointers: registering, free extensions, parts-only cover. */
  notes: string[];
  source: string;
  checked: string;
};

const CHECKED = "Nov 2026";

export const BRAND_WARRANTIES: BrandWarranty[] = [
  {
    brand: "Worcester Bosch",
    match: ["worcester"],
    months: { boiler: 24, "*": 24 },
    notes: [
      "Boiler guarantees depend on the model and who fits it — oil boilers start at 2 years.",
      "Greenstar 8000+ gas boilers get 12 years when fitted by a Worcester Bosch Accredited Installer with a Greenstar system filter.",
      "Register within 30 days of installation, and keep up the annual service.",
    ],
    source: "https://www.worcester-bosch.co.uk/support/product-guarantees/guarantee-length",
    checked: CHECKED,
  },
  {
    brand: "Bosch",
    match: ["bosch"],
    months: { "*": 24 },
    notes: [
      "2 years parts and labour as standard on Bosch home appliances.",
      "You can buy a Bosch Extended Warranty to 5 years in total within 28 days of purchase.",
      "Some models come with 5 years free if registered within 3 months.",
    ],
    source: "https://www.bosch-home.co.uk/en/warranty-overview",
    checked: CHECKED,
  },
  {
    brand: "Samsung",
    match: ["samsung"],
    months: { fridge_freezer: 24, freezer: 24, washing_machine: 24 },
    notes: [
      "24 months standard on Samsung fridges and washing machines. Other products vary — check Samsung's warranty page.",
      "20 years parts-only on the Digital Inverter motor/compressor for appliances bought from July 2022.",
      "Selected appliances from selected retailers get 5 years parts and labour if redeemed within 90 days.",
    ],
    source: "https://www.samsung.com/uk/support/warranty/",
    checked: CHECKED,
  },
  {
    brand: "LG",
    match: ["lg"],
    months: { washing_machine: 24, tumble_dryer: 24, fridge_freezer: 24 },
    notes: [
      "2 years parts and labour as standard on LG laundry.",
      "Direct Drive motors have a 10-year parts-only warranty (20 years on select models).",
      "Promotional 5-year warranties need signing up within 90 days of purchase.",
    ],
    source: "https://www.lg.com/uk/support/product-support/warranty/warranty-consumer/",
    checked: CHECKED,
  },
  {
    brand: "Miele",
    match: ["miele"],
    months: { "*": 24 },
    notes: [
      "2 years parts and labour on all domestic appliances — register the appliance to activate it.",
      "Promotional 5- or 10-year warranties need registering within 28 days of purchase.",
    ],
    source: "https://www.miele.co.uk/cs/legal/gtc-service-certificates-131",
    checked: CHECKED,
  },
  {
    brand: "Beko",
    match: ["beko"],
    months: { "*": 12 },
    notes: [
      "1 year parts and labour on freestanding appliances.",
      "Built-in appliances and American-style fridge freezers go to 2 years if registered within 90 days.",
      "Large appliances bought from 1 Sept 2024 also get a 10-year parts guarantee (register to activate).",
    ],
    source: "https://www.beko.co.uk/support/faqs/are-appliance-warranties-worth-it",
    checked: CHECKED,
  },
  {
    brand: "Hotpoint",
    match: ["hotpoint"],
    months: { "*": 12 },
    notes: [
      "1 year manufacturer's guarantee.",
      "Register the appliance and Hotpoint supplies parts free for the first 10 years (labour isn't included after year 1).",
    ],
    source: "https://customerservice.elevatepropertygroup.co.uk/file/elevate/kitchen-hotpoint-and-whirlpool-warranty-42472.pdf",
    checked: CHECKED,
  },
  {
    brand: "AEG",
    match: ["aeg"],
    months: { "*": 24 },
    notes: [
      "2 years as standard on all AEG appliances.",
      "Selected models get 5 years in total if registered within 90 days of purchase.",
    ],
    source: "https://www.aeg.co.uk/support/warranties/",
    checked: CHECKED,
  },
  {
    brand: "Dyson",
    match: ["dyson"],
    months: { vacuum: 24, "*": 24 },
    notes: [
      "2 years on cordless and robot vacuums, fans, heaters, purifiers and hair tools.",
      "5 years on corded (upright and cylinder) vacuums.",
    ],
    source: "https://www.dyson.co.uk/inside-dyson/terms/the-dyson-guarantee",
    checked: CHECKED,
  },
  {
    brand: "Apple",
    match: ["apple", "macbook", "imac", "ipad", "iphone"],
    months: { "*": 12 },
    notes: [
      "Apple's own limited warranty is 1 year.",
      "UK consumer law runs alongside it: up to 6 years to claim for an inherent fault in England and Wales (5 in Scotland).",
    ],
    source: "https://www.apple.com/legal/warranty/docs/statutory_warranty-uk.pdf",
    checked: CHECKED,
  },
];

/** The brand's usual warranty for this kind of item, if we know it. */
export function brandWarrantyFor(text: string | null | undefined, kind: string) {
  const haystack = ` ${String(text || "").toLowerCase()} `;
  const entry = BRAND_WARRANTIES.find((candidate) => candidate.match.some((word) => new RegExp(`[^a-z]${word}[^a-z]`).test(haystack)));
  if (!entry) return null;
  const months = entry.months[kind] ?? entry.months["*"] ?? null;
  return { ...entry, standardMonths: months };
}

/** Applies whatever the brand: UK consumer law. */
export const UK_CONSUMER_LAW_NOTE = "Even outside warranty, UK law says goods must last a reasonable time for their price and use. You have up to 6 years (5 in Scotland) to claim if a fault was there from the start.";
export const UK_CONSUMER_LAW_SOURCE = "https://www.whitegoodshelp.co.uk/faulty-appliances-consumer-rights-act";

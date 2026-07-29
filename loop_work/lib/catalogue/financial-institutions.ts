export type FinancialInstitution = {
  slug: string;
  name: string;
  aliases: string[];
  type: "bank" | "building_society" | "savings_platform" | "investment_platform" | "e_money" | "credit_union";
  logoText: string;
  brandClass: string;
  commonSavingsTypes: string[];
};

function row(
  slug: string,
  name: string,
  type: FinancialInstitution["type"],
  logoText: string,
  brandClass: string,
  aliases: string[] = [],
  commonSavingsTypes: string[] = ["Easy access", "Regular saver", "Cash ISA", "Fixed saver"],
): FinancialInstitution {
  return { slug, name, aliases, type, logoText, brandClass, commonSavingsTypes };
}

export const FINANCIAL_INSTITUTIONS: FinancialInstitution[] = [
  row("revolut", "Revolut", "e_money", "R", "bg-black text-white", ["revolut bank", "revolut ltd"], ["Instant Access Savings", "Flexible Cash Funds", "Vaults"]),
  row("chase", "Chase", "bank", "C", "bg-blue-900 text-white", ["jp morgan chase", "jpmorgan chase"], ["Saver account", "Round-up account", "Current account saver"]),
  row("monzo", "Monzo", "bank", "M", "bg-pink-500 text-white", ["monzo bank"], ["Instant Access Savings Pot", "Easy Access Cash ISA", "Fixed Pot"]),
  row("starling", "Starling Bank", "bank", "SB", "bg-teal-700 text-white", ["starling"], ["Saving Spaces", "Fixed Saver", "Current account interest"]),
  row("first_direct", "First Direct", "bank", "FD", "bg-black text-white", ["firstdirect", "first direct bank"], ["Regular Saver", "Bonus Savings", "Cash ISA"]),
  row("nationwide", "Nationwide", "building_society", "NW", "bg-blue-700 text-white", ["nationwide building society"], ["Flex Regular Saver", "Triple Access Saver", "Fixed Rate Online Bond"]),
  row("natwest", "NatWest", "bank", "NW", "bg-purple-700 text-white", ["national westminster", "nat west"], ["Digital Regular Saver", "Fixed Term Savings", "Instant Saver"]),
  row("santander", "Santander", "bank", "S", "bg-red-600 text-white", ["santander uk"], ["Edge Saver", "Easy Access Saver", "Fixed Rate ISA"]),
  row("barclays", "Barclays", "bank", "B", "bg-sky-600 text-white", ["barclays bank"], ["Rainy Day Saver", "Everyday Saver", "Fixed Term Deposit"]),
  row("lloyds", "Lloyds Bank", "bank", "L", "bg-emerald-700 text-white", ["lloyds", "lloyds tsb"], ["Club Lloyds Monthly Saver", "Easy Saver", "Fixed Bond"]),
  row("halifax", "Halifax", "bank", "H", "bg-blue-800 text-white", ["halifax bank"], ["Regular Saver", "Everyday Saver", "Fixed Saver"]),
  row("hsbc", "HSBC", "bank", "HS", "bg-red-500 text-white", ["hsbc uk", "hongkong and shanghai banking corporation"], ["Online Bonus Saver", "Regular Saver", "Fixed Rate Saver"]),
  row("tsb", "TSB", "bank", "TSB", "bg-blue-700 text-white", ["trustee savings bank"], ["Monthly Saver", "Easy Saver", "Fixed Bond"]),
  row("virgin_money", "Virgin Money", "bank", "VM", "bg-red-700 text-white", ["virgin", "clydesdale", "yorkshire bank"], ["M Plus Saver", "Cash ISA", "Fixed Rate Bond"]),
  row("rbs", "Royal Bank of Scotland", "bank", "RBS", "bg-blue-950 text-white", ["royal bank scotland"], ["Digital Regular Saver", "Instant Saver", "Fixed Term Savings"]),
  row("bank_of_scotland", "Bank of Scotland", "bank", "BoS", "bg-blue-800 text-white", ["bos"], ["Monthly Saver", "Access Saver", "Fixed Saver"]),
  row("ulster_bank", "Ulster Bank", "bank", "UB", "bg-emerald-700 text-white", ["ulster"], ["Loyalty Saver", "Fixed Term Savings"]),
  row("metro_bank", "Metro Bank", "bank", "M", "bg-red-600 text-white", ["metro"], ["Instant Access", "Fixed Term Savings", "Cash ISA"]),
  row("cooperative_bank", "The Co-operative Bank", "bank", "CO", "bg-blue-800 text-white", ["co-op bank", "coop bank", "cooperative"], ["Smart Saver", "Regular Saver", "Fixed Term Deposit"]),
  row("m_and_s_bank", "M&S Bank", "bank", "M&S", "bg-green-800 text-white", ["mands bank", "marks and spencer bank"], ["Monthly Saver", "Cash ISA", "Fixed Rate Saver"]),
  row("tesco_bank", "Tesco Bank", "bank", "T", "bg-blue-700 text-white", ["tesco"], ["Internet Saver", "Fixed Rate Saver", "Cash ISA"]),
  row("sainsburys_bank", "Sainsbury's Bank", "bank", "S", "bg-orange-600 text-white", ["sainsburys", "sainsbury bank"], ["Defined Access Saver", "Fixed Rate Saver", "Cash ISA"]),
  row("m_and_g", "M&G", "savings_platform", "M&G", "bg-slate-900 text-white", ["mandg", "m and g"], ["Cash ISA", "Fixed Term Savings"]),
  row("premium_bonds", "NS&I", "savings_platform", "NS", "bg-teal-700 text-white", ["national savings", "premium bonds", "national savings and investments"], ["Premium Bonds", "Direct Saver", "Income Bonds"]),
  row("marcus", "Marcus by Goldman Sachs", "bank", "M", "bg-slate-800 text-white", ["marcus", "goldman sachs"], ["Online Savings Account", "Cash ISA"]),
  row("atom", "Atom Bank", "bank", "AT", "bg-violet-700 text-white", ["atom"], ["Instant Saver", "Fixed Saver"]),
  row("zopa", "Zopa", "bank", "Z", "bg-teal-600 text-white", ["zopa bank"], ["Smart Saver", "Cash ISA", "Fixed Term Savings"]),
  row("tandem", "Tandem Bank", "bank", "T", "bg-green-700 text-white", ["tandem"], ["Instant Access Saver", "Fixed Saver", "Cash ISA"]),
  row("aldermore", "Aldermore", "bank", "A", "bg-cyan-700 text-white", ["aldermore bank"], ["Easy Access", "Fixed Rate Account", "Cash ISA"]),
  row("paragon", "Paragon Bank", "bank", "P", "bg-indigo-700 text-white", ["paragon"], ["Easy Access", "Fixed Rate Savings", "Cash ISA"]),
  row("shawbrook", "Shawbrook Bank", "bank", "SB", "bg-emerald-800 text-white", ["shawbrook"], ["Easy Access", "Fixed Rate Bond", "Cash ISA"]),
  row("oaknorth", "OakNorth Bank", "bank", "ON", "bg-orange-500 text-white", ["oak north"], ["Easy Access", "Fixed Term Savings", "Cash ISA"]),
  row("raisin", "Raisin UK", "savings_platform", "R", "bg-blue-600 text-white", ["raisin"], ["Savings marketplace", "Fixed Term Deposit", "Notice Account"]),
  row("hargreaves_active_savings", "HL Active Savings", "savings_platform", "HL", "bg-blue-950 text-white", ["hargreaves active savings", "hargreaves lansdown active savings"], ["Savings marketplace", "Fixed term", "Easy access"]),
  row("charter_savings", "Charter Savings Bank", "bank", "CS", "bg-slate-800 text-white", ["charter"], ["Easy Access", "Notice Account", "Fixed Rate Bond"]),
  row("ford_money", "Ford Money", "bank", "FM", "bg-blue-800 text-white", ["ford"], ["Flexible Saver", "Fixed Saver", "Cash ISA"]),
  row("post_office_money", "Post Office Money", "savings_platform", "PO", "bg-red-600 text-white", ["post office"], ["Online Saver", "Fixed Rate Bond", "Cash ISA"]),
  row("coventry", "Coventry Building Society", "building_society", "CB", "bg-blue-900 text-white", ["coventry"], ["Easy Access", "Regular Saver", "Fixed Bond", "Cash ISA"]),
  row("yorkshire_bs", "Yorkshire Building Society", "building_society", "YB", "bg-blue-700 text-white", ["ybs", "yorkshire building society"], ["Regular Saver", "Easy Access", "Fixed Rate Bond"]),
  row("skipton", "Skipton Building Society", "building_society", "SK", "bg-red-700 text-white", ["skipton"], ["Member Regular Saver", "Easy Access", "Fixed Rate Bond"]),
  row("leeds_bs", "Leeds Building Society", "building_society", "LB", "bg-blue-800 text-white", ["leeds bs", "leeds building society"], ["Regular Saver", "Easy Access", "Fixed Rate Bond"]),
  row("principality", "Principality Building Society", "building_society", "PB", "bg-red-800 text-white", ["principality", "principality bs"], ["Online Saver", "Fixed Bond", "Cash ISA"]),
  row("newcastle_bs", "Newcastle Building Society", "building_society", "NB", "bg-blue-700 text-white", ["newcastle bs", "newcastle building society"], ["Regular Saver", "Fixed Rate Bond", "Cash ISA"]),
  row("nottingham_bs", "The Nottingham", "building_society", "NB", "bg-green-800 text-white", ["nottingham building society", "nottingham bs"], ["Beehive Money", "Fixed Rate Bond", "Cash ISA"]),
  row("west_brom", "West Brom Building Society", "building_society", "WB", "bg-red-700 text-white", ["west brom", "west bromwich building society"], ["WeBSave", "Fixed Rate Bond", "Regular Saver"]),
  row("chelsea_bs", "Chelsea Building Society", "building_society", "CH", "bg-blue-700 text-white", ["chelsea bs"], ["Savings", "Cash ISA", "Fixed Bond"]),
  row("cumberland", "Cumberland Building Society", "building_society", "CU", "bg-green-700 text-white", ["cumberland"], ["Instant Access", "Fixed Rate Bond", "Cash ISA"]),
  row("bath_bs", "Bath Building Society", "building_society", "BA", "bg-stone-700 text-white", ["bath bs"], ["Regular Saver", "Instant Access", "Fixed Rate Bond"]),
  row("saffron_bs", "Saffron Building Society", "building_society", "SA", "bg-orange-600 text-white", ["saffron bs", "saffron"], ["Regular Saver", "Easy Access", "Fixed Rate Bond"]),
  row("furness_bs", "Furness Building Society", "building_society", "FU", "bg-blue-800 text-white", ["furness"], ["Regular Saver", "Easy Access", "Fixed Rate Bond"]),
  row("family_bs", "Family Building Society", "building_society", "FB", "bg-indigo-700 text-white", ["family bs", "national counties"], ["Market Tracker Saver", "Cash ISA", "Fixed Rate Bond"]),
  row("ecology_bs", "Ecology Building Society", "building_society", "EC", "bg-green-700 text-white", ["ecology"], ["Easy Access", "Cash ISA", "Regular Saver"]),
  row("cambridge_bs", "Cambridge Building Society", "building_society", "CB", "bg-blue-800 text-white", ["cambridge bs"], ["Easy Access", "Fixed Rate Bond", "Cash ISA"]),
  row("hinckley_rugby", "Hinckley & Rugby Building Society", "building_society", "HR", "bg-purple-700 text-white", ["hinckley and rugby", "hinckley rugby"], ["Notice Account", "Fixed Rate Bond", "Cash ISA"]),
  row("dudley_bs", "Dudley Building Society", "building_society", "DB", "bg-red-800 text-white", ["dudley"], ["Easy Access", "Regular Saver", "Fixed Bond"]),
  row("teachers_bs", "Teachers Building Society", "building_society", "TB", "bg-blue-600 text-white", ["teachers bs"], ["Easy Access", "Fixed Rate Bond", "Cash ISA"]),
  row("moneybox", "Moneybox", "savings_platform", "MB", "bg-blue-500 text-white", ["money box"], ["Cash ISA", "Simple Saver", "Lifetime ISA"]),
  row("plum", "Plum", "savings_platform", "P", "bg-purple-700 text-white", ["plum app"], ["Easy Access Interest Pockets", "Cash ISA"]),
  row("chip", "Chip", "savings_platform", "CH", "bg-slate-950 text-white", ["chip savings"], ["Instant Access", "Prize Savings", "Cash ISA"]),
  row("moneyfarm", "Moneyfarm", "investment_platform", "MF", "bg-green-700 text-white", ["money farm"], ["Stocks ISA cash", "GIA cash"]),
  row("trading212", "Trading 212", "investment_platform", "212", "bg-blue-700 text-white", ["trading212", "t212"], ["Cash ISA", "Invest cash interest", "Stocks ISA cash"]),
  row("vanguard", "Vanguard", "investment_platform", "V", "bg-red-700 text-white", ["vanguard uk"], ["Cash account", "Stocks and Shares ISA", "General account"]),
  row("aj_bell", "AJ Bell", "investment_platform", "AJ", "bg-blue-900 text-white", ["ajbell", "youinvest"], ["SIPP cash", "ISA cash", "GIA cash"]),
  row("interactive_investor", "Interactive Investor", "investment_platform", "II", "bg-slate-900 text-white", ["ii", "interactive investor"], ["SIPP cash", "ISA cash", "Trading account cash"]),
  row("hl", "Hargreaves Lansdown", "investment_platform", "HL", "bg-blue-950 text-white", ["hargreaves", "hargreaves lansdown"], ["Active Savings", "ISA cash", "SIPP cash"]),
].sort((a, b) => a.name.localeCompare(b.name));

export function normaliseInstitutionSearch(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|bank|plc|uk|limited|ltd)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function findInstitution(value: string | null | undefined) {
  const clean = normaliseInstitutionSearch(value);
  if (!clean) return null;
  return FINANCIAL_INSTITUTIONS.find((institution) => {
    const haystack = normaliseInstitutionSearch([institution.slug, institution.name, ...institution.aliases].join(" "));
    return institution.slug === String(value || "").toLowerCase().trim() || haystack === clean || haystack.includes(clean) || clean.includes(haystack);
  }) || null;
}

export function institutionLogoClass(slugOrName: string | null | undefined) {
  return findInstitution(slugOrName)?.brandClass || "bg-slate-950 text-white";
}

export function institutionLogoText(slugOrName: string | null | undefined) {
  return findInstitution(slugOrName)?.logoText || String(slugOrName || "£").slice(0, 2).toUpperCase();
}

const INSTITUTION_DOMAINS: Record<string, string> = {
  revolut: "revolut.com",
  chase: "chase.co.uk",
  monzo: "monzo.com",
  starling: "starlingbank.com",
  first_direct: "firstdirect.com",
  nationwide: "nationwide.co.uk",
  natwest: "natwest.com",
  santander: "santander.co.uk",
  barclays: "barclays.co.uk",
  lloyds: "lloydsbank.com",
  halifax: "halifax.co.uk",
  hsbc: "hsbc.co.uk",
  tsb: "tsb.co.uk",
  virgin_money: "uk.virginmoney.com",
  rbs: "rbs.co.uk",
  metro_bank: "metrobankonline.co.uk",
  cooperative_bank: "co-operativebank.co.uk",
  tesco_bank: "tescobank.com",
  sainsburys_bank: "sainsburysbank.co.uk",
  premium_bonds: "nsandi.com",
  marcus: "marcus.co.uk",
  atom: "atombank.co.uk",
  zopa: "zopa.com",
  tandem: "tandem.co.uk",
  aldermore: "aldermore.co.uk",
  paragon: "paragonbank.co.uk",
  shawbrook: "shawbrook.co.uk",
  oaknorth: "oaknorth.co.uk",
  raisin: "raisin.co.uk",
  hargreaves_active_savings: "hl.co.uk",
  charter_savings: "chartersavingsbank.co.uk",
  ford_money: "fordmoney.co.uk",
  post_office_money: "postoffice.co.uk",
  coventry: "coventrybuildingsociety.co.uk",
  yorkshire_bs: "ybs.co.uk",
  skipton: "skipton.co.uk",
  leeds_bs: "leedsbuildingsociety.co.uk",
  principality: "principality.co.uk",
  newcastle_bs: "newcastle.co.uk",
  nottingham_bs: "thenottingham.com",
  west_brom: "westbrom.co.uk",
  cumberland: "cumberland.co.uk",
  moneybox: "moneyboxapp.com",
  plum: "withplum.com",
  chip: "getchip.uk",
  moneyfarm: "moneyfarm.com",
  trading212: "trading212.com",
  vanguard: "vanguardinvestor.co.uk",
  aj_bell: "ajbell.co.uk",
  interactive_investor: "ii.co.uk",
  hl: "hl.co.uk",
};

export function institutionLogoUrl(slugOrName: string | null | undefined) {
  const institution = findInstitution(slugOrName);
  const domain = institution ? INSTITUTION_DOMAINS[institution.slug] : null;
  return domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128` : null;
}

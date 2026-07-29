export type InvestmentLogoIdentity = {
  ticker?: string | null;
  name?: string | null;
  providerLogoUrl?: string | null;
};

const DOMAIN_BY_TICKER: Record<string, string> = {
  AAPL: "apple.com",
  AMZN: "amazon.com",
  BMO: "bmo.com",
  BNS: "scotiabank.com",
  CAH: "cardinalhealth.com",
  CB: "chubb.com",
  CSCO: "cisco.com",
  ECL: "ecolab.com",
  GAME: "gamesquare.com",
  G4M: "gear4music.com",
  GD: "gd.com",
  GFIN: "gfinity.net",
  GOEV: "canoo.com",
  GOOG: "abc.xyz",
  GOOGL: "abc.xyz",
  GWW: "grainger.com",
  IBM: "ibm.com",
  JPM: "jpmorganchase.com",
  JNJ: "jnj.com",
  KO: "coca-colacompany.com",
  META: "meta.com",
  MNTS: "momentus.space",
  MSFT: "microsoft.com",
  NIO: "nio.com",
  NUE: "nucor.com",
  NVDA: "nvidia.com",
  PLUG: "plugpower.com",
  PPG: "ppg.com",
  RY: "rbc.com",
  SLB: "slb.com",
  SYY: "sysco.com",
  TD: "td.com",
  THG: "thg.com",
  TROW: "troweprice.com",
  WMT: "walmart.com",
  VOO: "vanguard.com",
  VTI: "vanguard.com",
  VUSA: "vanguard.co.uk",
  ISF: "ishares.com",
  INRG: "ishares.com",
};

const SIMPLE_ICON_BY_TICKER: Record<string, string> = {
  AAPL: "apple",
  AMZN: "amazon",
  CSCO: "cisco",
  GOOG: "google",
  GOOGL: "google",
  IBM: "ibm",
  META: "meta",
  MSFT: "microsoft",
  NIO: "nio",
  NVDA: "nvidia",
};

function cleanTicker(value?: string | null) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\.(L|TO|V|AX|PA|DE|F|SW)$/i, "");
}

function domainFromName(value?: string | null) {
  const name = String(value || "").toLowerCase();
  if (/vanguard|lifestrategy/.test(name)) return "vanguard.co.uk";
  if (/ishares|blackrock/.test(name)) return "ishares.com";
  if (/legal\s*&\s*general|legal and general|\bl&g\b/.test(name)) return "legalandgeneral.com";
  if (/fidelity/.test(name)) return "fidelity.co.uk";
  if (/hsbc/.test(name)) return "hsbc.co.uk";
  if (/jpmorgan|jp morgan/.test(name)) return "jpmorganchase.com";
  if (/t\.?\s*rowe|t rowe/.test(name)) return "troweprice.com";
  if (/gear4music/.test(name)) return "gear4music.com";
  if (/gamesquare/.test(name)) return "gamesquare.com";
  if (/canoo/.test(name)) return "canoo.com";
  if (/plug power/.test(name)) return "plugpower.com";
  if (/momentus/.test(name)) return "momentus.space";
  return null;
}

export function investmentLogoCandidates(identity: InvestmentLogoIdentity) {
  const ticker = cleanTicker(identity.ticker);
  const provider = String(identity.providerLogoUrl || "").trim();
  const domain = DOMAIN_BY_TICKER[ticker] || domainFromName(identity.name);
  const candidates: string[] = [];
  if (/^https?:\/\//i.test(provider)) candidates.push(provider);
  if (SIMPLE_ICON_BY_TICKER[ticker]) {
    candidates.push(`https://cdn.simpleicons.org/${SIMPLE_ICON_BY_TICKER[ticker]}`);
  }
  if (domain) {
    candidates.push(`https://www.google.com/s2/favicons?sz=128&domain_url=${encodeURIComponent(`https://${domain}`)}`);
    candidates.push(`https://logo.clearbit.com/${domain}`);
  }
  if (ticker && ticker.length <= 8 && !/^GB00|^IE00|^LU00/.test(ticker)) {
    candidates.push(`https://storage.googleapis.com/iexcloud-hl37opg/api/logos/${encodeURIComponent(ticker)}.png`);
  }
  return Array.from(new Set(candidates));
}

export function investmentLogoInitials(identity: InvestmentLogoIdentity) {
  const ticker = cleanTicker(identity.ticker);
  if (ticker) return ticker.slice(0, 4);
  return String(identity.name || "Asset")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "AS";
}

export type AccountOffering = {
  value: string;
  label: string;
  accountKind: "pension" | "investment";
};

export type ProviderGlossaryEntry = {
  id: string;
  name: string;
  aliases: string[];
  category: "pension" | "investment" | "both";
  offerings: AccountOffering[];
  defaultAnnualPlatformFeePercent: number | null;
  defaultFixedMonthlyFee: number | null;
  defaultTradingFeeNote?: string;
  defaultFxFeePercent?: number | null;
  supportsPies?: boolean;
  supportsFractionalShares?: boolean;
  supportsFundSearch?: boolean;
  supportsPriceLookup?: boolean;
  docs: { label: string; url: string; purpose: string }[];
  notes: string;
};

export const PROVIDER_GLOSSARY: ProviderGlossaryEntry[] = [
  {
    id: "legal-general",
    name: "Legal & General",
    aliases: ["L&G", "Legal and General", "LGIM", "L&G Workplace"],
    category: "pension",
    offerings: [
      { value: "work", label: "Workplace pension", accountKind: "pension" },
      { value: "private", label: "Private/personal pension", accountKind: "pension" },
    ],
    defaultAnnualPlatformFeePercent: null,
    defaultFixedMonthlyFee: null,
    supportsFundSearch: true,
    docs: [
      { label: "L&G workplace funds", url: "https://www.legalandgeneral.com/retirement/pensions/workplace-pensions/funds/", purpose: "Lists workplace fund information, charges, risk ratings and factsheet links." },
      { label: "L&G fund centre", url: "https://fundcentres.landg.com/en/uk/workplace-adviser/fund-centre/", purpose: "Fund centre for searching funds/factsheets." },
      { label: "Pension charges guide", url: "https://www.legalandgeneral.com/retirement/pensions/guides/pension-charges/", purpose: "Explains pension charge types and plan-specific caveats." },
    ],
    notes: "L&G workplace charges are plan/fund-specific. Use the AI/provider helper to find the exact fund, then store the source URL and confirmed fee.",
  },
  {
    id: "pensionbee",
    name: "PensionBee",
    aliases: ["Pension Bee"],
    category: "pension",
    offerings: [{ value: "private", label: "Private pension", accountKind: "pension" }],
    defaultAnnualPlatformFeePercent: null,
    defaultFixedMonthlyFee: null,
    supportsFundSearch: true,
    docs: [{ label: "PensionBee fees", url: "https://www.pensionbee.com/uk/fees", purpose: "Current plan fee information and charging method." }],
    notes: "Plan fees vary, so select the plan/fund and store the current fee source.",
  },
  {
    id: "trading-212",
    name: "Trading 212",
    aliases: ["212", "T212"],
    category: "investment",
    offerings: [
      { value: "gia", label: "Invest / GIA", accountKind: "investment" },
      { value: "isa", label: "Stocks & Shares ISA", accountKind: "investment" },
    ],
    defaultAnnualPlatformFeePercent: 0,
    defaultFixedMonthlyFee: 0,
    defaultFxFeePercent: 0.15,
    supportsPies: true,
    supportsFractionalShares: true,
    supportsPriceLookup: true,
    docs: [
      { label: "Trading 212 fees", url: "https://helpcentre.trading212.com/hc/en-us/articles/11471996799517-What-are-the-fees-in-the-Invest-and-ISAs", purpose: "Invest/ISA fee summary." },
      { label: "Trading 212 ISA", url: "https://www.trading212.com/isa", purpose: "ISA product page and pie/fractional-share feature notes." },
    ],
    notes: "Usually no platform/custody fee for Invest/ISA; FX may apply. Pies and fractional shares are supported.",
  },
  {
    id: "revolut",
    name: "Revolut",
    aliases: ["Revolut Trading"],
    category: "investment",
    offerings: [
      { value: "gia", label: "Investment / GIA", accountKind: "investment" },
      { value: "isa", label: "Stocks & Shares ISA", accountKind: "investment" },
    ],
    defaultAnnualPlatformFeePercent: 0,
    defaultFixedMonthlyFee: 0,
    supportsFractionalShares: true,
    supportsPriceLookup: true,
    docs: [
      { label: "Revolut ISA fees", url: "https://www.revolut.com/stocks-and-shares-isa/", purpose: "ISA fee/product comparison." },
      { label: "Revolut trading fees", url: "https://help.revolut.com/help/wealth/stocks/trading-stocks/trading-fees/what-fees-will-i-be-charged-for-my-trading/", purpose: "Trading commission and allowance information." },
    ],
    notes: "Trading commissions can depend on plan and allowance. Store account-level notes for the exact plan.",
  },
  {
    id: "vanguard",
    name: "Vanguard",
    aliases: ["Vanguard UK"],
    category: "both",
    offerings: [
      { value: "isa", label: "Stocks & Shares ISA", accountKind: "investment" },
      { value: "gia", label: "General Account / GIA", accountKind: "investment" },
      { value: "sipp", label: "SIPP / Personal pension", accountKind: "investment" },
      { value: "private", label: "Private pension", accountKind: "pension" },
    ],
    defaultAnnualPlatformFeePercent: null,
    defaultFixedMonthlyFee: null,
    supportsFundSearch: true,
    docs: [{ label: "Vanguard fees", url: "https://www.vanguardinvestor.co.uk/what-we-offer/fees-explained", purpose: "Platform/product fee source." }],
    notes: "Fees depend on wrapper/account and service tier. Confirm from provider docs.",
  },
  {
    id: "hargreaves-lansdown",
    name: "Hargreaves Lansdown",
    aliases: ["HL"],
    category: "both",
    offerings: [
      { value: "isa", label: "Stocks & Shares ISA", accountKind: "investment" },
      { value: "gia", label: "Fund & Share Account / GIA", accountKind: "investment" },
      { value: "sipp", label: "SIPP", accountKind: "investment" },
      { value: "private", label: "Private pension/SIPP", accountKind: "pension" },
    ],
    defaultAnnualPlatformFeePercent: null,
    defaultFixedMonthlyFee: null,
    supportsFundSearch: true,
    supportsPriceLookup: true,
    docs: [{ label: "HL charges", url: "https://www.hl.co.uk/investment-services/isa/savings-interest-rates-and-charges", purpose: "ISA/platform charge source." }],
    notes: "Charges vary by investment type and wrapper. Confirm before relying on defaults.",
  },
  {
    id: "aj-bell",
    name: "AJ Bell",
    aliases: ["AJ Bell Youinvest"],
    category: "both",
    offerings: [
      { value: "isa", label: "Stocks & Shares ISA", accountKind: "investment" },
      { value: "gia", label: "Dealing account / GIA", accountKind: "investment" },
      { value: "sipp", label: "SIPP", accountKind: "investment" },
      { value: "private", label: "Private pension/SIPP", accountKind: "pension" },
    ],
    defaultAnnualPlatformFeePercent: null,
    defaultFixedMonthlyFee: null,
    supportsFundSearch: true,
    supportsPriceLookup: true,
    docs: [{ label: "AJ Bell charges", url: "https://www.ajbell.co.uk/charges-and-rates", purpose: "Charges and rates." }],
    notes: "Charges vary by wrapper and investment type.",
  },
  {
    id: "fidelity",
    name: "Fidelity",
    aliases: ["Fidelity International"],
    category: "both",
    offerings: [
      { value: "isa", label: "Stocks & Shares ISA", accountKind: "investment" },
      { value: "gia", label: "Investment account / GIA", accountKind: "investment" },
      { value: "sipp", label: "SIPP", accountKind: "investment" },
      { value: "private", label: "Private pension/SIPP", accountKind: "pension" },
    ],
    defaultAnnualPlatformFeePercent: null,
    defaultFixedMonthlyFee: null,
    supportsFundSearch: true,
    docs: [{ label: "Fidelity service fees", url: "https://www.fidelity.co.uk/services/charges-fees/", purpose: "Service fee and trading charge source." }],
    notes: "Confirm service fee by account/value band.",
  },
  {
    id: "interactive-investor",
    name: "interactive investor",
    aliases: ["ii", "Interactive Investor"],
    category: "both",
    offerings: [
      { value: "isa", label: "Stocks & Shares ISA", accountKind: "investment" },
      { value: "gia", label: "Trading account / GIA", accountKind: "investment" },
      { value: "sipp", label: "SIPP", accountKind: "investment" },
      { value: "private", label: "Private pension/SIPP", accountKind: "pension" },
    ],
    defaultAnnualPlatformFeePercent: 0,
    defaultFixedMonthlyFee: null,
    supportsPriceLookup: true,
    docs: [{ label: "ii pricing", url: "https://www.ii.co.uk/our-charges", purpose: "Subscription and trading-fee source." }],
    notes: "Often subscription-based rather than percentage-based. Enter the chosen monthly plan fee.",
  },
  {
    id: "investengine",
    name: "InvestEngine",
    aliases: ["Invest Engine"],
    category: "investment",
    offerings: [
      { value: "isa", label: "Stocks & Shares ISA", accountKind: "investment" },
      { value: "gia", label: "General Investment Account", accountKind: "investment" },
    ],
    defaultAnnualPlatformFeePercent: null,
    defaultFixedMonthlyFee: null,
    supportsPies: true,
    docs: [{ label: "InvestEngine fees", url: "https://investengine.com/costs/", purpose: "Cost/fee source." }],
    notes: "ETF-focused. Confirm whether account is DIY/managed and store the source.",
  },
  {
    id: "moneybox",
    name: "Moneybox",
    aliases: ["Money Box"],
    category: "both",
    offerings: [
      { value: "isa", label: "Stocks & Shares ISA", accountKind: "investment" },
      { value: "gia", label: "GIA", accountKind: "investment" },
      { value: "private", label: "Personal Pension", accountKind: "pension" },
    ],
    defaultAnnualPlatformFeePercent: null,
    defaultFixedMonthlyFee: null,
    supportsFundSearch: true,
    docs: [{ label: "Moneybox fees", url: "https://www.moneyboxapp.com/fees/", purpose: "Fee source." }],
    notes: "Fees vary by product and balance. Confirm via provider.",
  },
];

export function normaliseProviderName(value: string) {
  return value.trim().toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function findProvider(value?: string | null) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return null;
  const norm = normaliseProviderName(text);
  return PROVIDER_GLOSSARY.find((provider) => provider.id === norm || provider.name.toLowerCase() === text || provider.aliases.some((alias) => alias.toLowerCase() === text || normaliseProviderName(alias) === norm)) || null;
}

export function investmentProviders() {
  return PROVIDER_GLOSSARY.filter((provider) => provider.category === "investment" || provider.category === "both");
}

export function pensionProviders() {
  return PROVIDER_GLOSSARY.filter((provider) => provider.category === "pension" || provider.category === "both");
}

export function accountOfferingsFor(providerName: string, kind: "pension" | "investment") {
  const provider = findProvider(providerName);
  return (provider?.offerings || []).filter((offering) => offering.accountKind === kind);
}

export const integrationProviderPlan = [
  {
    area: "GPT / ChatGPT finance",
    recommended: "Use ChatGPT finance where available for personal analysis, but do not rely on it as this app's data layer",
    status: "Important: your custom app still needs its own provider + consent flow",
    notes: "ChatGPT may support account connections in some regions/plans, but those connections are for ChatGPT itself. A separate private Next.js app cannot automatically reuse those bank connections through the OpenAI API.",
  },
  {
    area: "Banking",
    recommended: "Free now: manual/CSV import. API later: TrueLayer, Plaid, Yapily, Tink, Moneyhub or GoCardless Bank Account Data if available to you",
    status: "Free production account-data APIs are limited; most providers offer sandbox/free testing, then paid production or sales-led access",
    notes: "Use CSV import first for the private build. Never store bank passwords. Open Banking still needs its own provider account, redirect consent flow and server-side token storage.",
  },
  {
    area: "Investments",
    recommended: "Free now: manual snapshots/CSV exports. API later: Moneyhub/Open Finance or Plaid where coverage supports your providers",
    status: "Investment/pension account coverage is less standard than bank transactions",
    notes: "Build daily balance snapshots and CSV import first. Many UK pension/investment platforms do not expose a simple free consumer API.",
  },
  {
    area: "Market prices",
    recommended: "Free/manual now; optional Alpha Vantage or Financial Modeling Prep token later",
    status: "Useful for listed shares/ETFs; workplace pension fund coverage may still need manual values/factsheets",
    notes: "V17 includes a server-side quote-check route. Store market-data keys in Integrations using provider alpha_vantage, financial_modeling_prep or fmp before wiring scheduled updates.",
  },
  {
    area: "Statutory rates",
    recommended: "GOV.UK source check + OpenAI-assisted summary notes",
    status: "Now: store rate assumptions; later: scheduled check into statutory_rate_assumptions",
    notes: "Use this for SMP, tax thresholds, student loan thresholds and stamp duty assumptions. The AI should cite and store source URLs, not silently overwrite numbers.",
  },
  {
    area: "House prices",
    recommended: "HM Land Registry Price Paid Data + manual watchlist + optional commercial valuation APIs",
    status: "Now: manual low/mid/high sources; later: public datasets/enrichment/API sync",
    notes: "Land Registry gives sold prices, not live asking prices or valuation guarantees. Zoopla/Rightmove-style AVM/listing data usually needs commercial access or manual source storage.",
  },
  {
    area: "Maps / geocoding",
    recommended: "Google Maps Geocoding or another geocoder, server-side only",
    status: "Now: store address, coordinates and map URL manually; later: API geocode after address entry",
    notes: "Use this to convert addresses into latitude/longitude and show map links. Keep provider keys out of browser code where possible.",
  },
  {
    area: "Property valuations",
    recommended: "Manual valuation sources first; PropertyData/Zoopla/commercial AVM later if accessible",
    status: "Now: average stored valuation sources; later: API enrichment",
    notes: "The app stores each valuation source separately and calculates low/mid/high rather than overwriting the home value with one untrusted number.",
  },
  {
    area: "Mortgage rates",
    recommended: "Manual lender assumptions + OpenAI-assisted research notes",
    status: "Now: manual rates; later: automated research/sync",
    notes: "Live broker/lender product data often requires commercial access. OpenAI can help summarise rate pages, but source URLs and assumptions still need storing.",
  },
  {
    area: "AI research",
    recommended: "OpenAI project API key saved under Integrations for local-only testing",
    status: "Now: store token server-side; later: move to vault before deployment",
    notes: "Use for mortgage-rate research prompts and statutory-rate checking only. Do not expose the key to browser code.",
  },
];

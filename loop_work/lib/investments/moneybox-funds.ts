/**
 * ============================================================================
 * FILE: moneybox-funds.ts
 * DESCRIPTION: Moneybox asset catalogue, search resolution engine, and portfolio
 *              calculation logic. Links retail friendly names to institutional 
 *              identifiers and strictly decouples Current Valuation Drift from 
 *              Future Reinvestment Targets.
 * LAST REVIEWED: 2026-07-20
 * ============================================================================
 */

import { resolveProviderFund, ProviderFund } from './provider-fund-catalogue';

export type MoneyboxAsset = {
  key: string;
  name: string;
  provider: string;
  assetKind: "fund" | "etf" | "share" | "cash" | "other";
  ticker?: string | null;
  exchange?: string | null;
  isin?: string | null;
  annualFeePercent?: number | null;
  priceQuoteUnit?: "gbp" | "gbx" | "usd" | "eur";
  sourceUrl?: string | null;
  description?: string;
  pricePollingEnabled?: boolean;
  aliases?: string[];
  catalogueId?: string | null; // Optional link to PROVIDER_FUND_CATALOGUE
};

const FUNDS_SOURCE = "https://www.moneyboxapp.com/funds/";
const STOCKS_SOURCE = "https://www.moneyboxapp.com/faqs/category/investments/support-us-stocks/which-stocks-can-i-invest-in";
const CASH_SOURCE = "https://www.moneyboxapp.com/app/isa-what-is-available-cash-and-how-do-i-use-it/";

export const MONEYBOX_ASSETS_LAST_REVIEWED = "2026-07-20";

export const MONEYBOX_ASSETS: MoneyboxAsset[] = [
  // Moneybox fund range: tracker funds, ETFs, ESG funds and cash/near-cash options.
  {
    key: "moneybox-global-shares",
    name: "Global Shares",
    provider: "Fidelity",
    assetKind: "fund",
    isin: "GB00BJS8SJ34",
    annualFeePercent: 0.12,
    priceQuoteUnit: "gbp",
    sourceUrl: FUNDS_SOURCE,
    description: "Core Moneybox global equity fund tracking the global stock market (Fidelity Index World Fund P Acc).",
    aliases: ["world shares", "global equity", "fidelity global shares", "global shares"],
    catalogueId: "fidelity-fidelity-index-world-fund"
  },
  {
    key: "moneybox-global-health-pharmaceuticals-shares",
    name: "Global Health & Pharmaceuticals Shares",
    provider: "Legal & General",
    assetKind: "fund",
    isin: "GB00B0CNH056", // Enriched from institutional data
    annualFeePercent: 0.31,
    priceQuoteUnit: "gbp",
    sourceUrl: FUNDS_SOURCE,
    description: "Healthcare and pharmaceutical company exposure.",
    aliases: ["health", "pharma", "healthcare", "global health pharma", "global-health-pharma", "moneybox-global-health-pharma"],
    catalogueId: "legal-general-landg-pmc-global-health-pharmaceuticals-index-trust-i-acc"
  },
  {
    key: "moneybox-islamic-global-shares",
    name: "Islamic Global Shares",
    provider: "HSBC",
    assetKind: "fund",
    isin: "LU2092165666", // Enriched from institutional data
    annualFeePercent: 0.62,
    priceQuoteUnit: "gbp",
    sourceUrl: FUNDS_SOURCE,
    description: "Global shares screened to follow Islamic finance principles.",
    aliases: ["sharia", "shariah", "islamic", "halal investing"],
    catalogueId: "hsbc-islamic-global-equity-index-fund-bc-gbp-acc"
  },
  {
    key: "moneybox-emerging-markets-shares",
    name: "Emerging Markets Shares",
    provider: "Fidelity",
    assetKind: "fund",
    isin: "GB00BHRS7Z06", // Enriched from institutional data
    annualFeePercent: 0.20,
    priceQuoteUnit: "gbp",
    sourceUrl: FUNDS_SOURCE,
    description: "Emerging markets equity exposure across developing markets.",
    aliases: ["emerging markets", "em shares", "developing markets"],
    catalogueId: "fidelity-fidelity-index-emerging-markets-fund"
  },
  {
    key: "moneybox-physical-gold-etc",
    name: "Physical Gold ETC",
    provider: "iShares",
    assetKind: "etf",
    ticker: "SGLN",
    exchange: "LSE",
    isin: "IE00B4ND3602",
    annualFeePercent: 0.12,
    priceQuoteUnit: "gbx",
    pricePollingEnabled: true,
    sourceUrl: FUNDS_SOURCE,
    description: "Physical gold exchange-traded commodity exposure.",
    aliases: ["gold", "physical gold", "etc"],
  },
  {
    key: "moneybox-overseas-government-bonds",
    name: "Overseas Government Bonds",
    provider: "iShares",
    assetKind: "fund",
    isin: "GB00B83Y1F47", // Enriched from institutional data
    annualFeePercent: 0.11,
    priceQuoteUnit: "gbp",
    sourceUrl: FUNDS_SOURCE,
    description: "Developed-market government bond exposure.",
    aliases: ["overseas bonds", "government bonds", "global government bonds"],
    catalogueId: "ishares-overseas-government-bond-index-uk-d-acc"
  },
  {
    key: "moneybox-global-technology-shares",
    name: "Global Technology Shares",
    provider: "Legal & General",
    assetKind: "fund",
    isin: "GB00B0CNH163", // Enriched from institutional data
    annualFeePercent: 0.31,
    priceQuoteUnit: "gbp",
    sourceUrl: FUNDS_SOURCE,
    description: "Technology-focused global shares option.",
    aliases: ["tech", "technology", "l&g technology", "legal and general technology"],
    catalogueId: "legal-general-landg-pmc-global-technology-index-trust-i-acc"
  },
  {
    key: "moneybox-cash-trust",
    name: "Cash Trust",
    provider: "Legal & General",
    assetKind: "cash",
    isin: "GB00B0CNHB64", // Enriched: Institutional ISIN for L&G Cash Trust
    annualFeePercent: 0.15,
    priceQuoteUnit: "gbp",
    sourceUrl: FUNDS_SOURCE,
    description: "Cautious cash-like Moneybox fund option; use for Cash Trust allocations.",
    aliases: ["cash", "cash trust", "unknown allocation", "uninvested cash"],
    catalogueId: "legal-general-landg-pmc-cash-fund-3"
  },
  {
    key: "moneybox-cyber-security-etf",
    name: "Cyber Security ETF",
    provider: "Legal & General",
    assetKind: "etf",
    ticker: "ISPY",
    exchange: "LSE",
    annualFeePercent: 0.69,
    priceQuoteUnit: "gbx",
    pricePollingEnabled: true,
    sourceUrl: FUNDS_SOURCE,
    description: "Cyber security themed ETF exposure.",
    aliases: ["cyber", "cybersecurity", "security"],
  },
  {
    key: "moneybox-ftse-100-etf",
    name: "FTSE 100 ETF",
    provider: "Vanguard",
    assetKind: "etf",
    ticker: "VUKE",
    exchange: "LSE",
    isin: "IE00B810Q511",
    annualFeePercent: 0.09,
    priceQuoteUnit: "gbx",
    pricePollingEnabled: true,
    sourceUrl: FUNDS_SOURCE,
    description: "UK large-cap equity ETF.",
    aliases: ["ftse100", "uk 100", "vuke"],
  },
  {
    key: "moneybox-sp-500-etf",
    name: "S&P 500 ETF",
    provider: "Vanguard",
    assetKind: "etf",
    ticker: "VUSA",
    exchange: "LSE",
    isin: "IE00B3XXRP09",
    annualFeePercent: 0.07,
    priceQuoteUnit: "gbx",
    pricePollingEnabled: true,
    sourceUrl: FUNDS_SOURCE,
    description: "US large-cap S&P 500 ETF.",
    aliases: ["sp500", "s&p500", "s and p 500", "vusa"],
  },
  {
    key: "moneybox-european-shares-etf",
    name: "European Shares ETF",
    provider: "iShares",
    assetKind: "etf",
    annualFeePercent: 0.12,
    priceQuoteUnit: "gbx",
    pricePollingEnabled: true,
    sourceUrl: FUNDS_SOURCE,
    description: "European company ETF exposure.",
    aliases: ["europe", "european", "europe shares"],
  },
  {
    key: "moneybox-ftse-250-etf",
    name: "FTSE 250 ETF",
    provider: "Vanguard",
    assetKind: "etf",
    ticker: "VMID",
    exchange: "LSE",
    isin: "IE00BKX55Q28",
    annualFeePercent: 0.10,
    priceQuoteUnit: "gbx",
    pricePollingEnabled: true,
    sourceUrl: FUNDS_SOURCE,
    description: "UK mid-cap equity ETF.",
    aliases: ["ftse250", "uk mid cap", "vmid"],
  },
  {
    key: "moneybox-russell-2000-etf",
    name: "Russell 2000 ETF",
    provider: "SPDR",
    assetKind: "etf",
    annualFeePercent: 0.30,
    priceQuoteUnit: "gbx",
    pricePollingEnabled: true,
    sourceUrl: FUNDS_SOURCE,
    description: "US small-cap Russell 2000 ETF exposure.",
    aliases: ["russell", "russell2000", "us small cap", "small cap"],
  },
  {
    key: "moneybox-semiconductor-etf",
    name: "Semiconductor ETF",
    provider: "VanEck",
    assetKind: "etf",
    ticker: "SMGB",
    exchange: "LSE",
    annualFeePercent: 0.35,
    priceQuoteUnit: "gbx",
    pricePollingEnabled: true,
    sourceUrl: FUNDS_SOURCE,
    description: "Semiconductor themed ETF.",
    aliases: ["chips", "semiconductors", "semi", "smgb"],
  },
  {
    key: "moneybox-global-gender-equality-etf",
    name: "Global Gender Equality ETF",
    provider: "UBS",
    assetKind: "etf",
    annualFeePercent: 0.20,
    priceQuoteUnit: "gbx",
    pricePollingEnabled: true,
    sourceUrl: FUNDS_SOURCE,
    description: "ETF focused on companies leading on gender equality.",
    aliases: ["gender equality", "equality"],
  },
  {
    key: "moneybox-global-blockchain-etf",
    name: "Global Blockchain ETF",
    provider: "Invesco",
    assetKind: "etf",
    annualFeePercent: 0.65,
    priceQuoteUnit: "gbx",
    pricePollingEnabled: true,
    sourceUrl: FUNDS_SOURCE,
    description: "Blockchain industry ETF exposure.",
    aliases: ["blockchain", "crypto infrastructure"],
  },
  {
    key: "moneybox-high-dividend-yield-etf",
    name: "High Dividend Yield ETF",
    provider: "Vanguard",
    assetKind: "etf",
    annualFeePercent: 0.29,
    priceQuoteUnit: "gbx",
    pricePollingEnabled: true,
    sourceUrl: FUNDS_SOURCE,
    description: "ETF exposure to companies with higher dividend yields.",
    aliases: ["dividend", "income", "high dividend"],
  },
  {
    key: "moneybox-global-shares-low-volatility-etf",
    name: "Global Shares Low Volatility ETF",
    provider: "Xtrackers",
    assetKind: "etf",
    annualFeePercent: 0.25,
    priceQuoteUnit: "gbx",
    pricePollingEnabled: true,
    sourceUrl: FUNDS_SOURCE,
    description: "Global shares ETF tilted to lower volatility companies.",
    aliases: ["low volatility", "minimum volatility", "low vol"],
  },
  {
    key: "moneybox-global-aggregate-bonds-etf",
    name: "Global Aggregate Bonds ETF",
    provider: "Vanguard",
    assetKind: "etf",
    ticker: "VAGP",
    exchange: "LSE",
    isin: "IE00BG47KH54",
    annualFeePercent: 0.08,
    priceQuoteUnit: "gbx",
    pricePollingEnabled: true,
    sourceUrl: FUNDS_SOURCE,
    description: "Global aggregate bond ETF.",
    aliases: ["global bonds", "aggregate bonds", "vagp"],
  },
  {
    key: "moneybox-uk-government-bonds-gilts-etf",
    name: "UK Government Bonds (Gilts) ETF",
    provider: "Vanguard",
    assetKind: "etf",
    ticker: "VGOV",
    exchange: "LSE",
    isin: "IE00B42WWV65",
    annualFeePercent: 0.05,
    priceQuoteUnit: "gbx",
    pricePollingEnabled: true,
    sourceUrl: FUNDS_SOURCE,
    description: "UK gilt ETF.",
    aliases: ["uk government bonds", "gilts", "vgov", "uk bonds", "moneybox-uk-government-bonds-etf"],
  },
  {
    key: "moneybox-us-government-bonds-etf",
    name: "US Government Bonds ETF",
    provider: "Vanguard",
    assetKind: "etf",
    ticker: "VUTY",
    exchange: "LSE",
    isin: "IE00BZ163M45",
    annualFeePercent: 0.05,
    priceQuoteUnit: "gbx",
    pricePollingEnabled: true,
    sourceUrl: FUNDS_SOURCE,
    description: "US Treasury bond ETF.",
    aliases: ["us treasuries", "treasury", "vuty", "us bonds"],
  },
  {
    key: "vanguard-lifestrategy-20-equity-fund-acc",
    name: "Vanguard LifeStrategy 20% Equity Fund Accumulation",
    provider: "Vanguard",
    assetKind: "fund",
    isin: "GB00B4NXY349",
    annualFeePercent: 0.22,
    priceQuoteUnit: "gbp",
    pricePollingEnabled: true,
    sourceUrl: "https://www.vanguard.co.uk/",
    description: "Multi-asset fund holding roughly 20% equities and 80% bonds.",
    aliases: ["lifestrategy 20", "lifestrategy 20%", "vanguard lifestrategy 20"],
  },
  {
    key: "vanguard-lifestrategy-40-equity-fund-acc",
    name: "Vanguard LifeStrategy 40% Equity Fund Accumulation",
    provider: "Vanguard",
    assetKind: "fund",
    isin: "GB00B3ZHN960",
    annualFeePercent: 0.22,
    priceQuoteUnit: "gbp",
    pricePollingEnabled: true,
    sourceUrl: "https://www.vanguard.co.uk/",
    description: "Multi-asset fund holding roughly 40% equities and 60% bonds.",
    aliases: ["lifestrategy 40", "lifestrategy 40%", "vanguard lifestrategy 40"],
  },
  {
    key: "vanguard-lifestrategy-60-equity-fund-acc",
    name: "Vanguard LifeStrategy 60% Equity Fund Accumulation",
    provider: "Vanguard",
    assetKind: "fund",
    isin: "GB00B3TYHH97",
    annualFeePercent: 0.22,
    priceQuoteUnit: "gbp",
    pricePollingEnabled: true,
    sourceUrl: "https://www.vanguard.co.uk/",
    description: "Multi-asset fund holding roughly 60% equities and 40% bonds.",
    aliases: ["lifestrategy 60", "lifestrategy 60%", "vanguard lifestrategy 60"],
  },
  {
    key: "vanguard-lifestrategy-80-equity-fund-acc",
    name: "Vanguard LifeStrategy 80% Equity Fund Accumulation",
    provider: "Vanguard",
    assetKind: "fund",
    isin: "GB00B4PQW151",
    annualFeePercent: 0.22,
    priceQuoteUnit: "gbp",
    pricePollingEnabled: true,
    sourceUrl: "https://www.vanguard.co.uk/",
    description: "Multi-asset fund holding roughly 80% equities and 20% bonds.",
    aliases: ["lifestrategy 80", "lifestrategy 80%", "vanguard lifestrategy 80"],
  },
  {
    key: "vanguard-lifestrategy-100-equity-fund-acc",
    name: "Vanguard LifeStrategy 100% Equity Fund Accumulation",
    provider: "Vanguard",
    assetKind: "fund",
    isin: "GB00B41XG308",
    annualFeePercent: 0.22,
    priceQuoteUnit: "gbp",
    pricePollingEnabled: true,
    sourceUrl: "https://www.vanguard.co.uk/",
    description: "All-equity multi-asset fund — 100% globally diversified shares, no bonds.",
    aliases: ["lifestrategy 100", "lifestrategy 100%", "vanguard lifestrategy 100", "lifestrategy 100% shares"],
  },
  {
    key: "moneybox-global-shares-esg",
    name: "Global Shares ESG",
    provider: "Old Mutual",
    assetKind: "fund",
    isin: "GB00BJS8SK49",
    annualFeePercent: 0.13,
    priceQuoteUnit: "gbp",
    sourceUrl: FUNDS_SOURCE,
    description: "ESG screened global shares option.",
    aliases: ["esg global shares", "sustainable global shares", "responsible global shares"],
  },
  {
    key: "moneybox-global-property-shares-esg",
    name: "Global Property Shares ESG",
    provider: "iShares",
    assetKind: "fund",
    isin: "GB00B5BFJG71", // Enriched from institutional data
    annualFeePercent: 0.18,
    priceQuoteUnit: "gbp",
    sourceUrl: FUNDS_SOURCE,
    description: "Global property company exposure with ESG screening.",
    aliases: ["property", "real estate", "global property esg", "global-property-esg", "moneybox-global-property-esg"],
    catalogueId: "ishares-global-property-securities-equity-index-uk-d-acc"
  },
  {
    key: "moneybox-emerging-markets-shares-esg",
    name: "Emerging Markets Shares ESG",
    provider: "Royal London",
    assetKind: "fund",
    annualFeePercent: 0.23,
    priceQuoteUnit: "gbp",
    sourceUrl: FUNDS_SOURCE,
    description: "ESG screened emerging markets shares.",
    aliases: ["emerging markets esg", "em esg", "sustainable emerging markets"],
  },
  {
    key: "moneybox-overseas-corporate-bonds-esg",
    name: "Overseas Corporate Bonds ESG",
    provider: "iShares",
    assetKind: "fund",
    isin: "GB00B84DSH94", // Enriched from institutional data
    annualFeePercent: 0.11,
    priceQuoteUnit: "gbp",
    sourceUrl: FUNDS_SOURCE,
    description: "ESG screened overseas corporate bond exposure.",
    aliases: ["corporate bonds", "overseas corporate bonds", "esg bonds"],
    catalogueId: "ishares-overseas-corporate-bond-index-uk-d-acc"
  },
  {
    key: "moneybox-global-clean-energy-etf",
    name: "Global Clean Energy ETF",
    provider: "iShares",
    assetKind: "etf",
    ticker: "INRG",
    exchange: "LSE",
    isin: "IE00B1XNHC34",
    annualFeePercent: 0.65,
    priceQuoteUnit: "gbx",
    pricePollingEnabled: true,
    sourceUrl: FUNDS_SOURCE,
    description: "Clean energy themed ETF.",
    aliases: ["clean energy", "renewable energy", "inrg"],
  },
  {
    key: "moneybox-automation-robotics-etf",
    name: "Automation & Robotics ETF",
    provider: "iShares",
    assetKind: "etf",
    ticker: "RBTX",
    exchange: "LSE",
    annualFeePercent: 0.40,
    priceQuoteUnit: "gbx",
    pricePollingEnabled: true,
    sourceUrl: FUNDS_SOURCE,
    description: "Automation and robotics themed ETF.",
    aliases: ["robotics", "automation", "rbtx"],
  },
  {
    key: "moneybox-clean-water-etf",
    name: "Clean Water ETF",
    provider: "Legal & General",
    assetKind: "etf",
    annualFeePercent: 0.49,
    priceQuoteUnit: "gbx",
    pricePollingEnabled: true,
    sourceUrl: FUNDS_SOURCE,
    description: "Clean water technology and infrastructure ETF exposure.",
    aliases: ["water", "clean water"],
  },
  {
    key: "moneybox-digitalisation-etf",
    name: "Digitalisation ETF",
    provider: "iShares",
    assetKind: "etf",
    annualFeePercent: 0.40,
    priceQuoteUnit: "gbx",
    pricePollingEnabled: true,
    sourceUrl: FUNDS_SOURCE,
    description: "Digital services and digitalisation themed ETF.",
    aliases: ["digital", "digitalization", "digital services"],
  },
  {
    key: "moneybox-global-ageing-population-etf",
    name: "Global Ageing Population ETF",
    provider: "iShares",
    assetKind: "etf",
    annualFeePercent: 0.40,
    priceQuoteUnit: "gbx",
    pricePollingEnabled: true,
    sourceUrl: FUNDS_SOURCE,
    description: "ETF exposure to companies serving ageing population needs.",
    aliases: ["aging population", "ageing", "ageing population"],
  },
  {
    key: "moneybox-sp-500-esg-etf",
    name: "S&P 500 ESG ETF",
    provider: "UBS",
    assetKind: "etf",
    annualFeePercent: 0.10,
    priceQuoteUnit: "gbx",
    pricePollingEnabled: true,
    sourceUrl: FUNDS_SOURCE,
    description: "ESG screened S&P 500 ETF exposure.",
    aliases: ["sp500 esg", "s&p 500 esg", "s and p 500 esg"],
  },
  {
    key: "moneybox-european-shares-esg-etf",
    name: "European Shares ESG ETF",
    provider: "iShares",
    assetKind: "etf",
    annualFeePercent: 0.20,
    priceQuoteUnit: "gbx",
    pricePollingEnabled: true,
    sourceUrl: FUNDS_SOURCE,
    description: "ESG focused European shares ETF.",
    aliases: ["european esg", "europe sri", "european shares sri"],
  },
  {
    key: "moneybox-global-carbon-transition-etf",
    name: "Global Carbon Transition ETF",
    provider: "J.P. Morgan",
    assetKind: "etf",
    annualFeePercent: 0.19,
    priceQuoteUnit: "gbx",
    pricePollingEnabled: true,
    sourceUrl: FUNDS_SOURCE,
    description: "ETF exposure to companies positioned for the low-carbon transition.",
    aliases: ["carbon transition", "low carbon", "climate transition"],
  },
  {
    key: "moneybox-artificial-intelligence-etf",
    name: "Artificial Intelligence (AI) ETF",
    provider: "WisdomTree",
    assetKind: "etf",
    ticker: "WTAI",
    exchange: "LSE",
    annualFeePercent: 0.40,
    priceQuoteUnit: "gbx",
    pricePollingEnabled: true,
    sourceUrl: FUNDS_SOURCE,
    description: "Artificial intelligence themed ETF.",
    aliases: ["ai", "artificial intelligence", "wtai"],
  },

  // Moneybox S&S ISA US stocks.
  {
    key: "moneybox-us-stock-adobe",
    name: "Adobe",
    provider: "Adobe Inc.",
    assetKind: "share",
    ticker: "ADBE",
    exchange: "NASDAQ",
    annualFeePercent: 0,
    priceQuoteUnit: "usd",
    pricePollingEnabled: true,
    sourceUrl: STOCKS_SOURCE,
    description: "US stock available in Moneybox S&S ISA.",
    aliases: ["adobe stock", "adbe"],
  },
  {
    key: "moneybox-us-stock-alphabet",
    name: "Alphabet",
    provider: "Alphabet Inc.",
    assetKind: "share",
    ticker: "GOOGL",
    exchange: "NASDAQ",
    annualFeePercent: 0,
    priceQuoteUnit: "usd",
    pricePollingEnabled: true,
    sourceUrl: STOCKS_SOURCE,
    description: "US stock available in Moneybox S&S ISA.",
    aliases: ["google", "googl", "goog", "alphabet stock"],
  },
  {
    key: "moneybox-us-stock-amazon",
    name: "Amazon",
    provider: "Amazon.com Inc.",
    assetKind: "share",
    ticker: "AMZN",
    exchange: "NASDAQ",
    annualFeePercent: 0,
    priceQuoteUnit: "usd",
    pricePollingEnabled: true,
    sourceUrl: STOCKS_SOURCE,
    description: "US stock available in Moneybox S&S ISA.",
    aliases: ["amazon stock", "amzn"],
  },
  {
    key: "moneybox-us-stock-apple",
    name: "Apple",
    provider: "Apple Inc.",
    assetKind: "share",
    ticker: "AAPL",
    exchange: "NASDAQ",
    annualFeePercent: 0,
    priceQuoteUnit: "usd",
    pricePollingEnabled: true,
    sourceUrl: STOCKS_SOURCE,
    description: "US stock available in Moneybox S&S ISA.",
    aliases: ["apple stock", "aapl"],
  },
  {
    key: "moneybox-us-stock-att",
    name: "AT&T",
    provider: "AT&T Inc.",
    assetKind: "share",
    ticker: "T",
    exchange: "NYSE",
    annualFeePercent: 0,
    priceQuoteUnit: "usd",
    pricePollingEnabled: true,
    sourceUrl: STOCKS_SOURCE,
    description: "US stock available in Moneybox S&S ISA.",
    aliases: ["att", "at and t", "t"],
  },
  {
    key: "moneybox-us-stock-berkshire-hathaway",
    name: "Berkshire Hathaway",
    provider: "Berkshire Hathaway Inc.",
    assetKind: "share",
    ticker: "BRK.B",
    exchange: "NYSE",
    annualFeePercent: 0,
    priceQuoteUnit: "usd",
    pricePollingEnabled: true,
    sourceUrl: STOCKS_SOURCE,
    description: "US stock available in Moneybox S&S ISA.",
    aliases: ["berkshire", "berkshire hathaway b", "brk.b", "brk-b"],
  },
  {
    key: "moneybox-us-stock-coca-cola",
    name: "Coca-Cola",
    provider: "The Coca-Cola Company",
    assetKind: "share",
    ticker: "KO",
    exchange: "NYSE",
    annualFeePercent: 0,
    priceQuoteUnit: "usd",
    pricePollingEnabled: true,
    sourceUrl: STOCKS_SOURCE,
    description: "US stock available in Moneybox S&S ISA.",
    aliases: ["coke", "coca cola", "ko"],
  },
  {
    key: "moneybox-us-stock-jpmorgan-chase",
    name: "JPMorgan Chase & Co",
    provider: "JPMorgan Chase & Co.",
    assetKind: "share",
    ticker: "JPM",
    exchange: "NYSE",
    annualFeePercent: 0,
    priceQuoteUnit: "usd",
    pricePollingEnabled: true,
    sourceUrl: STOCKS_SOURCE,
    description: "US stock available in Moneybox S&S ISA.",
    aliases: ["jp morgan", "jpmorgan", "jpmorgan chase", "jpm"],
  },
  {
    key: "moneybox-us-stock-mastercard",
    name: "Mastercard",
    provider: "Mastercard Inc.",
    assetKind: "share",
    ticker: "MA",
    exchange: "NYSE",
    annualFeePercent: 0,
    priceQuoteUnit: "usd",
    pricePollingEnabled: true,
    sourceUrl: STOCKS_SOURCE,
    description: "US stock available in Moneybox S&S ISA.",
    aliases: ["mastercard stock", "ma"],
  },
  {
    key: "moneybox-us-stock-mcdonalds",
    name: "McDonald's",
    provider: "McDonald's Corp.",
    assetKind: "share",
    ticker: "MCD",
    exchange: "NYSE",
    annualFeePercent: 0,
    priceQuoteUnit: "usd",
    pricePollingEnabled: true,
    sourceUrl: STOCKS_SOURCE,
    description: "US stock available in Moneybox S&S ISA.",
    aliases: ["mcdonalds", "mcdonald's", "mcd"],
  },
  {
    key: "moneybox-us-stock-meta",
    name: "Meta",
    provider: "Meta Platforms Inc.",
    assetKind: "share",
    ticker: "META",
    exchange: "NASDAQ",
    annualFeePercent: 0,
    priceQuoteUnit: "usd",
    pricePollingEnabled: true,
    sourceUrl: STOCKS_SOURCE,
    description: "US stock available in Moneybox S&S ISA.",
    aliases: ["facebook", "meta platforms", "meta"],
  },
  {
    key: "moneybox-us-stock-microsoft",
    name: "Microsoft",
    provider: "Microsoft Corp.",
    assetKind: "share",
    ticker: "MSFT",
    exchange: "NASDAQ",
    annualFeePercent: 0,
    priceQuoteUnit: "usd",
    pricePollingEnabled: true,
    sourceUrl: STOCKS_SOURCE,
    description: "US stock available in Moneybox S&S ISA.",
    aliases: ["microsoft stock", "msft"],
  },
  {
    key: "moneybox-us-stock-nike",
    name: "Nike",
    provider: "Nike Inc.",
    assetKind: "share",
    ticker: "NKE",
    exchange: "NYSE",
    annualFeePercent: 0,
    priceQuoteUnit: "usd",
    pricePollingEnabled: true,
    sourceUrl: STOCKS_SOURCE,
    description: "US stock available in Moneybox S&S ISA.",
    aliases: ["nike stock", "nke"],
  },
  {
    key: "moneybox-us-stock-nvidia",
    name: "NVIDIA",
    provider: "NVIDIA Corp.",
    assetKind: "share",
    ticker: "NVDA",
    exchange: "NASDAQ",
    annualFeePercent: 0,
    priceQuoteUnit: "usd",
    pricePollingEnabled: true,
    sourceUrl: STOCKS_SOURCE,
    description: "US stock available in Moneybox S&S ISA.",
    aliases: ["nvidia", "nvda", "nvidia stock"],
  },
  {
    key: "moneybox-us-stock-pfizer",
    name: "Pfizer",
    provider: "Pfizer Inc.",
    assetKind: "share",
    ticker: "PFE",
    exchange: "NYSE",
    annualFeePercent: 0,
    priceQuoteUnit: "usd",
    pricePollingEnabled: true,
    sourceUrl: STOCKS_SOURCE,
    description: "US stock available in Moneybox S&S ISA.",
    aliases: ["pfizer stock", "pfe"],
  },
  {
    key: "moneybox-us-stock-procter-gamble",
    name: "Procter & Gamble",
    provider: "Procter & Gamble Co.",
    assetKind: "share",
    ticker: "PG",
    exchange: "NYSE",
    annualFeePercent: 0,
    priceQuoteUnit: "usd",
    pricePollingEnabled: true,
    sourceUrl: STOCKS_SOURCE,
    description: "US stock available in Moneybox S&S ISA.",
    aliases: ["procter and gamble", "p&g", "pg"],
  },
  {
    key: "moneybox-us-stock-t-mobile",
    name: "T-Mobile",
    provider: "T-Mobile US Inc.",
    assetKind: "share",
    ticker: "TMUS",
    exchange: "NASDAQ",
    annualFeePercent: 0,
    priceQuoteUnit: "usd",
    pricePollingEnabled: true,
    sourceUrl: STOCKS_SOURCE,
    description: "US stock available in Moneybox S&S ISA.",
    aliases: ["tmobile", "t mobile", "tmus"],
  },
  {
    key: "moneybox-us-stock-tesla",
    name: "Tesla",
    provider: "Tesla Inc.",
    assetKind: "share",
    ticker: "TSLA",
    exchange: "NASDAQ",
    annualFeePercent: 0,
    priceQuoteUnit: "usd",
    pricePollingEnabled: true,
    sourceUrl: STOCKS_SOURCE,
    description: "US stock available in Moneybox S&S ISA.",
    aliases: ["tesla stock", "tsla"],
  },
  {
    key: "moneybox-us-stock-visa",
    name: "Visa",
    provider: "Visa Inc.",
    assetKind: "share",
    ticker: "V",
    exchange: "NYSE",
    annualFeePercent: 0,
    priceQuoteUnit: "usd",
    pricePollingEnabled: true,
    sourceUrl: STOCKS_SOURCE,
    description: "US stock available in Moneybox S&S ISA.",
    aliases: ["visa stock", "v"],
  },
  {
    key: "moneybox-us-stock-disney",
    name: "Disney",
    provider: "The Walt Disney Company",
    assetKind: "share",
    ticker: "DIS",
    exchange: "NYSE",
    annualFeePercent: 0,
    priceQuoteUnit: "usd",
    pricePollingEnabled: true,
    sourceUrl: STOCKS_SOURCE,
    description: "US stock available in Moneybox S&S ISA.",
    aliases: ["walt disney", "the walt disney company", "dis"],
  },
  {
    key: "moneybox-available-cash-unknown",
    name: "Available Cash / unknown allocation",
    provider: "Moneybox",
    assetKind: "cash",
    annualFeePercent: 0,
    priceQuoteUnit: "gbp",
    sourceUrl: CASH_SOURCE,
    description: "Use this for Available Cash, spare cash, or an allocation the user cannot identify yet.",
    aliases: ["available cash", "save now invest later", "cash waiting", "manual unknown"],
  },
];

// ============================================================================
// --- EXISTING SEARCH & RESOLUTION LOGIC (PRESERVED) ---
// ============================================================================

export function normaliseMoneyboxKey(value: string) {
  return value.trim().toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function searchFields(asset: MoneyboxAsset) {
  return [
    asset.key,
    asset.name,
    asset.provider,
    asset.assetKind,
    asset.ticker,
    asset.exchange,
    asset.isin,
    asset.description,
    ...(asset.aliases || []),
  ].filter(Boolean).join(" ");
}

export function findMoneyboxAsset(value?: string | null) {
  const clean = normaliseMoneyboxKey(String(value || ""));
  if (!clean) return null;
  return MONEYBOX_ASSETS.find((asset) => {
    const candidates = [asset.key, asset.name, asset.ticker, asset.isin, ...(asset.aliases || [])].filter(Boolean).map((item) => normaliseMoneyboxKey(String(item)));
    return candidates.includes(clean);
  }) || null;
}

export function searchMoneyboxAssets(query: string, limit = MONEYBOX_ASSETS.length) {
  const safeLimit = Math.max(1, Math.min(Number(limit || MONEYBOX_ASSETS.length), MONEYBOX_ASSETS.length));
  const clean = query.trim().toLowerCase();
  if (!clean) return MONEYBOX_ASSETS.slice(0, safeLimit);
  const tokens = clean.split(/\s+/).map(normaliseMoneyboxKey).filter(Boolean);
  return MONEYBOX_ASSETS
    .map((asset) => {
      const haystack = normaliseMoneyboxKey(searchFields(asset));
      const name = normaliseMoneyboxKey(asset.name);
      const ticker = normaliseMoneyboxKey(asset.ticker || "");
      const aliases = (asset.aliases || []).map(normaliseMoneyboxKey);
      const score = tokens.reduce((sum, token) => {
        if (!token) return sum;
        if (ticker && ticker === token) return sum + 12;
        if (name === token) return sum + 10;
        if (name.startsWith(token)) return sum + 6;
        if (aliases.some((alias) => alias === token || alias.includes(token))) return sum + 5;
        return sum + (haystack.includes(token) ? 2 : 0);
      }, 0);
      return { asset, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.asset.name.localeCompare(b.asset.name))
    .slice(0, safeLimit)
    .map((item) => item.asset);
}

// ============================================================================
// --- NEW: PORTFOLIO WEIGHTING & DRIFT CALCULATION ENGINES ---
// ============================================================================

export type FlexiblePortfolioInput = {
  assetIdentifier?: string;      // Accepts key, alias, name, or ISIN
  mappingKey?: string;
  key?: string;
  id?: string;
  currentValueGbp?: number;      // e.g., 10861
  value?: number;
  amount?: number;
  futureReinvestmentPercent?: number; // e.g., 80
  future_allocation?: number;
  percentage?: number;
  [extraProp: string]: any;
};

export interface EvaluatedMoneyboxPosition {
  readonly key: string;
  readonly friendlyName: string;
  readonly officialFundName: string;
  readonly provider: string;
  readonly assetKind: string;
  readonly identifier: string | null;          // ISIN or Ticker
  readonly catalogueId: string | null;
  readonly currentValueGbp: number;
  readonly currentWeightPercent: number;       // Actual valuation % (e.g., 49.37%)
  readonly futureReinvestmentPercent: number;  // Contribution target % (e.g., 80.00%)
  readonly allocationDriftPercent: number;     // Difference: (Current Weight - Future Target)
  readonly isReceivingNewInflows: boolean;
  readonly totalEstimatedAnnualFeePercent: number | null; // Includes 0.45% Moneybox platform fee
}

export interface MoneyboxValuationReport {
  readonly totalValuationGbp: number;
  readonly totalFutureAllocationPercent: number;
  readonly isFutureAllocationValid: boolean;   // True if future allocation sums to 100%
  readonly weightedAverageAnnualFeePercent: number;
  readonly positions: EvaluatedMoneyboxPosition[];
}

/**
 * Evaluates a user's Moneybox portfolio.
 * Accurately calculates real-time drift (Current Weight vs Future Reinvestment Rule)
 * while enriching the UI data with official tickers/ISINs from the Master Catalogue.
 */
export function calculateMoneyboxPortfolio(inputs: FlexiblePortfolioInput[]): MoneyboxValuationReport {
  if (!inputs || inputs.length === 0) {
    throw new Error('[Moneybox Engine Error]: Cannot evaluate an empty portfolio array.');
  }

  // 1. Normalize inputs
  const normalizedHoldings = inputs.map(raw => {
    const queryKey = String(raw.assetIdentifier || raw.mappingKey || raw.key || raw.id || '').trim();
    const currentValueGbp = Number(raw.currentValueGbp ?? raw.value ?? raw.amount ?? 0);
    const futureReinvestmentPercent = Number(raw.futureReinvestmentPercent ?? raw.future_allocation ?? raw.percentage ?? 0);

    const asset = findMoneyboxAsset(queryKey);
    if (!asset) {
      throw new Error(`[Moneybox Engine Error]: Unable to locate asset matching identifier "${queryKey}".`);
    }

    return { asset, currentValueGbp, futureReinvestmentPercent };
  });

  // 2. Sum valuations and validate contribution targets
  const totalValuationGbp = normalizedHoldings.reduce((sum, item) => sum + item.currentValueGbp, 0);
  const totalFutureAllocationPercent = normalizedHoldings.reduce((sum, item) => sum + item.futureReinvestmentPercent, 0);
  const isFutureAllocationValid = Math.abs(totalFutureAllocationPercent - 100) < 0.001;

  let totalFeeNumerator = 0;
  let feeValuationBase = 0;

  // 3. Process positions and link to raw institutional data
  const evaluatedPositions: EvaluatedMoneyboxPosition[] = normalizedHoldings.map(pos => {
    const { asset, currentValueGbp, futureReinvestmentPercent } = pos;

    // Resolve raw asset data from institutional catalogue if linked
    let officialName = asset.name;
    let providerName = asset.provider;
    if (asset.catalogueId) {
      try {
        const underlying: ProviderFund = resolveProviderFund(asset.catalogueId);
        officialName = underlying.fund_name;
        providerName = underlying.provider_id;
      } catch (e) {
        // Fallback to Moneybox asset properties if institutional lookup fails
      }
    }

    // Calculate actual current weight (e.g., £10,861 / £22,000 = 49.37%)
    const currentWeightPercent = totalValuationGbp > 0
      ? (currentValueGbp / totalValuationGbp) * 100
      : 0;

    // Calculate Drift: Current Actual Weight minus Future Reinvestment Target
    const allocationDriftPercent = currentWeightPercent - futureReinvestmentPercent;

    const fundFee = asset.annualFeePercent ?? null;
    const totalFee = fundFee !== null ? (0.45 + fundFee) : null; // 0.45% Moneybox platform charge

    if (totalFee !== null && currentValueGbp > 0) {
      totalFeeNumerator += (currentValueGbp * totalFee);
      feeValuationBase += currentValueGbp;
    }

    return {
      key: asset.key,
      friendlyName: asset.name,
      officialFundName: officialName,
      provider: providerName,
      assetKind: asset.assetKind,
      identifier: asset.isin || asset.ticker || null,
      catalogueId: asset.catalogueId || null,
      currentValueGbp,
      currentWeightPercent: Number(currentWeightPercent.toFixed(2)),
      futureReinvestmentPercent,
      allocationDriftPercent: Number(allocationDriftPercent.toFixed(2)),
      isReceivingNewInflows: futureReinvestmentPercent > 0,
      totalEstimatedAnnualFeePercent: totalFee !== null ? Number(totalFee.toFixed(3)) : null
    };
  });

  const weightedAverageAnnualFeePercent = feeValuationBase > 0
    ? Number((totalFeeNumerator / feeValuationBase).toFixed(3))
    : 0;

  return {
    totalValuationGbp: Number(totalValuationGbp.toFixed(2)),
    totalFutureAllocationPercent: Number(totalFutureAllocationPercent.toFixed(2)),
    isFutureAllocationValid,
    weightedAverageAnnualFeePercent,
    positions: evaluatedPositions
  };
}

/**
 * Calculates how a new cash deposit should be split across holdings,
 * strictly applying the user's Future Reinvestment Rate and ignoring current drift.
 */
export function calculateReinvestmentSplit(
  newInflowGbp: number, 
  report: MoneyboxValuationReport
): Array<{ identifier: string | null; friendlyName: string; allocatedGbp: number; percentage: number }> {
  if (newInflowGbp <= 0) {
    throw new Error('[Reinvestment Error]: Inflow amount must be greater than zero.');
  }
  if (!report.isFutureAllocationValid) {
    throw new Error('[Reinvestment Error]: Cannot split cash inflows because future allocations do not sum to 100%.');
  }

  return report.positions
    .filter(pos => pos.isReceivingNewInflows)
    .map(pos => {
      const allocatedAmount = (newInflowGbp * pos.futureReinvestmentPercent) / 100;
      return {
        identifier: pos.identifier,
        friendlyName: pos.friendlyName,
        allocatedGbp: Number(allocatedAmount.toFixed(2)),
        percentage: pos.futureReinvestmentPercent
      };
    });
}
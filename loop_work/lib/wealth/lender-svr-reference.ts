// Lenders' standard variable rates (SVR): what a borrower rolls onto when a
// fixed or tracker deal ends. Used as the fallback picture when the daily
// lender deal pages can't be read. Each lender links to its own page, so the
// figure can be checked at source.
//
// Checked 11 Nov 2026, after the Bank of England raised Bank Rate from 3.75%
// to 4% on 5 Nov 2026. Rates and dates are from each lender's page where it
// says, otherwise from the MoneySavingExpert round-up of lender responses.
// Update this list when Bank Rate next moves.

export const SVR_REFERENCE_CHECKED_ON = "2026-11-11";
export const SVR_ROUNDUP_URL = "https://www.moneysavingexpert.com/news/2026/11/mortgage-rate-hikes-base-rate/";
export const BANK_RATE_URL = "https://www.bankofengland.co.uk/monetary-policy/the-interest-rate-bank-rate";

export type LenderSvr = {
  lender: string;
  /** SVR today, before any announced change. */
  svrPercent: number | null;
  /** Announced new SVR and the date it applies from. */
  nextSvrPercent?: number;
  nextFrom?: string;
  note?: string;
  url: string;
};

export const LENDER_SVRS: LenderSvr[] = [
  { lender: "Halifax", svrPercent: 7.24, nextSvrPercent: 7.49, nextFrom: "2026-12-01", note: "Homeowner Variable Rate is the same", url: "https://www.halifax.co.uk/mortgages/existing-customers/bank-rate-changes.html" },
  { lender: "Lloyds Bank", svrPercent: null, nextSvrPercent: 6.0, nextFrom: "2026-12-01", note: "Homeowner Variable Rate rises to 7.49%", url: "https://www.lloydsbank.com/mortgages/existing-customers/base-rate-rise-mortgage-calculator.html" },
  { lender: "Nationwide", svrPercent: null, nextSvrPercent: 6.74, nextFrom: "2026-12-01", note: "Standard Mortgage Rate", url: "https://www.nationwide.co.uk/mortgages/existing-mortgage-members/standard-and-base-mortgage-rates" },
  { lender: "Barclays", svrPercent: null, nextSvrPercent: 5.99, nextFrom: "2026-12-01", url: SVR_ROUNDUP_URL },
  { lender: "Santander", svrPercent: null, nextSvrPercent: 6.75, nextFrom: "2026-12-03", note: "Follow-on rate rises to 7.25%", url: "https://www.santander.co.uk/personal/support/loans-and-mortgages/standard-variable-and-follow-on-rates" },
  { lender: "Virgin Money", svrPercent: null, nextSvrPercent: 6.99, nextFrom: "2026-12-01", url: "https://uk.virginmoney.com/mortgages/bank-of-england-base-rate/" },
  { lender: "Co-op Bank", svrPercent: null, nextSvrPercent: 6.79, nextFrom: "2026-11-09", url: SVR_ROUNDUP_URL },
  { lender: "Clydesdale Bank", svrPercent: null, nextSvrPercent: 6.99, nextFrom: "2026-11-16", url: SVR_ROUNDUP_URL },
  { lender: "Principality BS", svrPercent: null, nextSvrPercent: 7.05, nextFrom: "2026-12-01", url: SVR_ROUNDUP_URL },
  { lender: "West Brom BS", svrPercent: null, nextSvrPercent: 6.49, nextFrom: "2026-12-01", url: SVR_ROUNDUP_URL },
  { lender: "HSBC", svrPercent: 6.24, note: "New rate not announced yet", url: "https://www.hsbc.co.uk/mortgages/our-rates/" },
  { lender: "First Direct", svrPercent: 6.24, note: "New rate not announced yet", url: SVR_ROUNDUP_URL },
  { lender: "Coventry BS", svrPercent: 6.54, note: "New rate not announced yet", url: "https://www.coventrybuildingsociety.co.uk/member/help/mortgages/standard-variable-rate-options.html" },
  { lender: "Skipton BS", svrPercent: 6.29, note: "New rate not announced yet", url: SVR_ROUNDUP_URL },
  { lender: "Yorkshire BS", svrPercent: 6.74, note: "Rising from 29 Nov; new rate not announced yet", url: SVR_ROUNDUP_URL },
  { lender: "Newcastle BS", svrPercent: 6.31, note: "New rate not announced yet", url: SVR_ROUNDUP_URL },
  { lender: "Metro Bank", svrPercent: 7.25, note: "New rate not announced yet", url: SVR_ROUNDUP_URL },
  { lender: "Leeds BS", svrPercent: 7.74, note: "New rate not announced yet", url: SVR_ROUNDUP_URL },
  { lender: "NatWest", svrPercent: null, note: "Not announced yet", url: "https://personal.natwest.com/personal/mortgages/mortgage-types-and-rates/standard-variable-rate-mortgage.html" },
];

/** The rate that applies on a given day: the announced one once its date arrives. */
export function svrOn(entry: LenderSvr, isoDate: string) {
  if (entry.nextSvrPercent != null && entry.nextFrom && isoDate >= entry.nextFrom) return entry.nextSvrPercent;
  return entry.svrPercent ?? entry.nextSvrPercent ?? null;
}

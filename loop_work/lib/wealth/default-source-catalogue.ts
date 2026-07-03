import { normaliseProviderSlug } from "@/lib/wealth/provider-normalise";

export type DefaultMortgageSource = {
  lenderName: string;
  sourceUrl: string;
  sourceKind?: string;
  notes?: string;
};

export type DefaultSavingsSource = {
  providerName: string;
  sourceUrl: string;
  productHint?: string;
  sourceKind?: string;
  notes?: string;
};

export const defaultMortgageSources: DefaultMortgageSource[] = [
  ["NatWest", "https://www.natwest.com/mortgages/mortgage-rates.html"],
  ["Halifax", "https://www.halifax.co.uk/mortgages/mortgage-rates.html"],
  ["Nationwide Building Society", "https://www.nationwide.co.uk/mortgages/mortgage-rates/"],
  ["Santander", "https://www.santander.co.uk/personal/mortgages/mortgage-rates"],
  ["Barclays", "https://www.barclays.co.uk/mortgages/mortgage-rates/"],
  ["HSBC", "https://www.hsbc.co.uk/mortgages/our-rates/"],
  ["Lloyds Bank", "https://www.lloydsbank.com/mortgages/mortgage-rates.html"],
  ["TSB", "https://www.tsb.co.uk/mortgages/mortgage-rates/"],
  ["Virgin Money", "https://uk.virginmoney.com/mortgages/find-a-mortgage/"],
  ["Coventry Building Society", "https://www.coventrybuildingsociety.co.uk/member/mortgages/mortgage-rates.html"],
  ["Skipton Building Society", "https://www.skipton.co.uk/mortgages/mortgage-rates"],
  ["Leeds Building Society", "https://www.leedsbuildingsociety.co.uk/mortgages/mortgage-rates/"],
  ["Yorkshire Building Society", "https://www.ybs.co.uk/mortgages/mortgage-rates"],
  ["First Direct", "https://www.firstdirect.com/mortgages/rates/"],
  ["Metro Bank", "https://www.metrobankonline.co.uk/mortgages/products/"],
  ["Accord Mortgages", "https://www.accordmortgages.com/products"],
  ["Platform", "https://www.platform.co.uk/mortgage-products"],
  ["Kensington Mortgages", "https://www.kensingtonmortgages.co.uk/intermediaries/products"],
].map(([lenderName, sourceUrl]) => ({ lenderName, sourceUrl, sourceKind: "lender_product_page", notes: "Seeded by LOOP default UK mortgage source universe. Keep source robots/legal restrictions under review." }));

export const defaultSavingsSources: DefaultSavingsSource[] = [
  ["MoneySavingExpert", "https://www.moneysavingexpert.com/savings/savings-accounts-best-interest/", "market best buy"],
  ["Moneyfacts", "https://moneyfactscompare.co.uk/savings-accounts/", "market best buy"],
  ["Savings Champion", "https://savingschampion.co.uk/best-buys", "market best buy"],
  ["NS&I", "https://www.nsandi.com/products", "Premium Bonds / Direct Saver"],
  ["Nationwide Building Society", "https://www.nationwide.co.uk/savings/", "savings rates"],
  ["NatWest", "https://www.natwest.com/savings.html", "savings rates"],
  ["First Direct", "https://www.firstdirect.com/savings-and-investments/savings/", "savings rates"],
  ["Revolut", "https://www.revolut.com/savings/", "savings"],
  ["Monzo", "https://monzo.com/savings/", "savings"],
  ["Starling Bank", "https://www.starlingbank.com/current-account/saving-spaces/", "savings"],
  ["Chase", "https://www.chase.co.uk/gb/en/product/chase-saver-account/", "easy access"],
  ["Marcus by Goldman Sachs", "https://www.marcus.co.uk/uk/en/savings", "easy access"],
  ["Zopa", "https://www.zopa.com/savings", "savings"],
  ["Chip", "https://www.getchip.uk/savings", "savings"],
  ["Moneybox", "https://www.moneyboxapp.com/savings/", "savings"],
  ["Plum", "https://withplum.com/savings", "savings"],
  ["Coventry Building Society", "https://www.coventrybuildingsociety.co.uk/member/savings.html", "savings rates"],
  ["Skipton Building Society", "https://www.skipton.co.uk/savings", "savings rates"],
  ["Leeds Building Society", "https://www.leedsbuildingsociety.co.uk/savings/", "savings rates"],
  ["Yorkshire Building Society", "https://www.ybs.co.uk/savings", "savings rates"],
  ["Principality Building Society", "https://www.principality.co.uk/savings", "savings rates"],
  ["Newcastle Building Society", "https://www.newcastle.co.uk/savings", "savings rates"],
  ["Paragon Bank", "https://www.paragonbank.co.uk/savings", "savings rates"],
  ["Shawbrook Bank", "https://www.shawbrook.co.uk/direct/savings/", "savings rates"],
  ["Atom Bank", "https://www.atombank.co.uk/savings/", "savings rates"],
  ["Tandem Bank", "https://www.tandem.co.uk/savings", "savings rates"],
  ["Aldermore", "https://www.aldermore.co.uk/personal/savings-accounts/", "savings rates"],
  ["Cynergy Bank", "https://www.cynergybank.co.uk/personal-savings/", "savings rates"],
  ["Ford Money", "https://www.fordmoney.co.uk/savings-products", "savings rates"],
  ["OakNorth", "https://www.oaknorth.co.uk/personal-savings/", "savings rates"],
].map(([providerName, sourceUrl, productHint]) => ({ providerName, sourceUrl, productHint, sourceKind: "provider_or_best_buy_page", notes: "Seeded by LOOP default UK savings source universe. AI should stage rows with confidence and admin/source checks before wide publication." }));

export async function ensureDefaultSourceUniverse(supabase: any) {
  const mortgageRows = defaultMortgageSources.map((source) => ({
    lender_slug: normaliseProviderSlug(source.lenderName),
    lender_name: source.lenderName,
    source_url: source.sourceUrl,
    source_kind: source.sourceKind || "lender_product_page",
    status: "active",
    notes: source.notes || null,
    check_frequency_hours: 12,
    updated_at: new Date().toISOString(),
  }));
  const savingsRows = defaultSavingsSources.map((source) => ({
    provider_slug: normaliseProviderSlug(source.providerName),
    provider_name: source.providerName,
    source_url: source.sourceUrl,
    source_kind: source.sourceKind || "provider_or_best_buy_page",
    product_hint: source.productHint || null,
    status: "active",
    notes: source.notes || null,
    check_frequency_hours: 12,
    updated_at: new Date().toISOString(),
  }));

  const mortgage = await supabase.from("mortgage_lender_sources").upsert(mortgageRows, { onConflict: "lender_slug,source_url" });
  if (mortgage.error) throw new Error(mortgage.error.message);
  const savings = await supabase.from("savings_rate_sources").upsert(savingsRows, { onConflict: "provider_slug,source_url" });
  if (savings.error) throw new Error(savings.error.message);
  return { mortgage_sources: mortgageRows.length, savings_sources: savingsRows.length };
}

export type VerifiedFundIdentity = {
  isin: string;
  yahooSymbol: string;
  expectedName: string;
  requiredTokenGroups: string[][];
  conflictingPhrases?: string[];
};

export type FundIdentityResult = {
  status: "verified" | "conflict" | "unverified";
  note: string;
  identity: VerifiedFundIdentity | null;
};

const VERIFIED_FUNDS: readonly VerifiedFundIdentity[] = [
  {
    isin: "GB00BJS8SJ34",
    yahooSymbol: "0P000125KV.L",
    expectedName: "Fidelity Index World Fund P Acc",
    requiredTokenGroups: [["fidelity"], ["index"], ["world"], ["acc", "accumulation"]],
  },
  {
    isin: "GB00B5BFJG71",
    yahooSymbol: "0P0000XUDF.L",
    expectedName: "iShares Environment & Low Carbon Tilt Real Estate Index Fund",
    requiredTokenGroups: [["ishares"], ["real"], ["estate"]],
  },
  {
    isin: "GB00B84DSH94",
    yahooSymbol: "0P0000W38W.L",
    expectedName: "L&G Corporate Bond ESG Fund",
    requiredTokenGroups: [["corporate"], ["bond"]],
  },
  {
    isin: "GB00B4PQW151",
    yahooSymbol: "0P0000TKZM.L",
    expectedName: "Vanguard LifeStrategy 80% Equity Fund Accumulation",
    requiredTokenGroups: [["vanguard"], ["lifestrategy"], ["80"], ["equity"], ["acc", "accumulation"]],
    conflictingPhrases: ["20 equity", "40 equity", "60 equity", "100 equity"],
  },
] as const;

function normalize(value?: string | null) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function verifiedFundIdentity(reference?: string | null) {
  const normalized = String(reference || "").trim().toUpperCase();
  if (!normalized) return null;
  return VERIFIED_FUNDS.find(
    (fund) => fund.isin === normalized || fund.yahooSymbol.toUpperCase() === normalized,
  ) || null;
}

export function verifiedYahooFundSymbol(isin?: string | null) {
  return verifiedFundIdentity(isin)?.yahooSymbol || null;
}

export function validateVerifiedFundQuote(
  reference: string | null | undefined,
  providerName: string | null | undefined,
  providerSymbol: string | null | undefined,
): FundIdentityResult {
  const identity = verifiedFundIdentity(reference);
  if (!identity) {
    return { status: "unverified", note: "No verified identity profile exists for this fund.", identity: null };
  }

  const symbol = String(providerSymbol || "").trim().toUpperCase();
  const allowedSymbols = new Set([identity.yahooSymbol.toUpperCase(), identity.isin]);
  if (!allowedSymbols.has(symbol)) {
    return {
      status: "conflict",
      note: `Expected ${identity.yahooSymbol} for ${identity.isin}, but the provider returned ${symbol || "no symbol"}.`,
      identity,
    };
  }

  const name = normalize(providerName);
  if (!name) {
    return { status: "conflict", note: "The provider returned no fund name to verify.", identity };
  }
  const conflictingPhrase = (identity.conflictingPhrases || []).find((phrase) => name.includes(normalize(phrase)));
  if (conflictingPhrase) {
    return {
      status: "conflict",
      note: `Provider name conflicts with the expected fund (${conflictingPhrase}).`,
      identity,
    };
  }
  const missingGroup = identity.requiredTokenGroups.find(
    (group) => !group.some((token) => name.split(" ").includes(normalize(token))),
  );
  if (missingGroup) {
    return {
      status: "conflict",
      note: `Provider name does not sufficiently match ${identity.expectedName}; missing ${missingGroup.join("/")}.`,
      identity,
    };
  }

  return {
    status: "verified",
    note: `Provider symbol and name match ${identity.expectedName}.`,
    identity,
  };
}

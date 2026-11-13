// Shared food text matching: any word order, plurals, small typos and UK/brand synonyms.
// Used for the UK reference food list and to rank branded results.

const STOP_WORDS = new Set(["a", "an", "the", "and", "with", "of", "in", "on", "for", "my", "some", "bit", "few"]);

// Everyday words people type → the words the reference data uses. Applied before tokenising.
const PLAIN_FOOD_PHRASES: Array<[RegExp, string]> = [
  [/\bjacket (potato|spud)s?\b/g, "potatoes baked flesh and skin"],
  [/\bspuds?\b/g, "potatoes"],
  [/\bmash(ed)? potato(es)?\b|\bmash\b/g, "potatoes mashed"],
  [/\b(oven )?chips\b|\bfries\b/g, "potato chips"],
  [/\bcrisps\b/g, "potato crisps"],
  [/\boj\b/g, "orange juice"],
  [/\bcuppa\b|\bbrew\b|\bcup of tea\b/g, "tea"],
  [/\bcup of coffee\b/g, "coffee"],
  [/\bspag bol\b|\bspaghetti bol\b/g, "spaghetti bolognese"],
  [/\bmince\b(?! pie)/g, "beef mince"],
  [/\bsemi skimmed\b|\bsemi\b(?= milk)/g, "semi-skimmed"],
  [/\bfull fat milk\b/g, "whole milk"],
  [/\bcornflakes\b/g, "corn flakes"],
  [/\bbeans on toast\b/g, "baked beans toast"],
  [/\begg(s)? on toast\b/g, "egg toast"],
  [/\btoast\b/g, "bread toasted"],
  [/\bporridge\b/g, "porridge"],
  [/\bbrekkie\b/g, "breakfast"],
];

// Spelling variants: each group is treated as the same word.
const SPELLING_GROUPS: string[][] = [
  ["yoghurt", "yogurt"],
  ["houmous", "hummus", "humous", "hummous"],
  ["aubergine", "eggplant"],
  ["courgette", "zucchini"],
  ["coriander", "cilantro"],
  ["prawn", "shrimp"],
  ["mangetout", "snowpea"],
  ["rocket", "arugula"],
  ["chickpea", "garbanzo"],
  ["biscuit", "cookie"],
  ["sweet", "candy"],
  ["jam", "jelly"],
  ["fibre", "fiber"],
  ["grey", "gray"],
  ["flavoured", "flavored"],
  ["wholemeal", "wholewheat"],
];
const SPELLING_MAP = new Map<string, string>();
for (const group of SPELLING_GROUPS) for (const word of group) SPELLING_MAP.set(word, group[0]);

// Brand nicknames → the name on the pack (for Open Food Facts searching and ranking).
const BRAND_PHRASES: Array<[RegExp, string]> = [
  [/\bcoke zero\b/g, "coca-cola zero sugar"],
  [/\bdiet coke\b/g, "diet coke"],
  [/\bcoke\b/g, "coca-cola"],
  [/\bpepsi max\b/g, "pepsi max"],
  [/\birn ?bru\b/g, "irn-bru"],
  [/\bkit ?kat\b/g, "kitkat"],
  [/\bdairy milk\b/g, "cadbury dairy milk"],
  [/\bmaccies\b|\bmaccy d'?s\b|\bmcdonalds\b/g, "mcdonald's"],
  [/\bmarmite\b/g, "marmite"],
  [/\bred bull\b/g, "red bull"],
  [/\bmonster\b/g, "monster energy"],
  [/\bfruit shoot\b/g, "robinsons fruit shoot"],
  [/\bpot noodle\b/g, "pot noodle"],
  [/\bhob ?nobs?\b/g, "hobnobs"],
  [/\bjaffa cakes?\b/g, "jaffa cakes"],
  [/\bwarbies\b/g, "warburtons"],
  [/\bsainsburys\b/g, "sainsbury's"],
  [/\bm ?& ?s\b|\bmarks and spencer\b/g, "m&s"],
];

export const KNOWN_BRAND_WORDS = /\b(coca|cola|coke|pepsi|fanta|sprite|tango|irn|kitkat|cadbury|mars|snickers|twix|walkers|mcvitie|warburtons|hovis|kellogg|nestle|heinz|muller|yeo|activia|danone|alpro|oatly|greggs|costa|starbucks|pret|nando|mcdonald|kfc|burger king|subway|domino|pizza hut|tesco|sainsbury|asda|morrisons|waitrose|aldi|lidl|iceland|m&s|co-op|ocado|quaker|weetabix|monster|red bull|lucozade|ribena|robinsons|innocent|tropicana|pringles|doritos|haribo|lindt|ben & jerry|magnum|walls|birds eye|mccain|richmond|cathedral city|philadelphia|dairylea|lurpak|flora|anchor|kerrygold|marmite|nutella|bisto|oxo|uncle ben|tilda|napolina|dolmio|loyd grossman|pot noodle|zoe|huel|myprotein|grenade|fulfil|gfuel|g fuel)\b/i;

export function normaliseFoodText(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[''`]/g, "")
    .replace(/[^a-z0-9%.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stemFoodWord(word: string) {
  let w = SPELLING_MAP.get(word) || word;
  if (w.length > 4 && w.endsWith("ies")) w = `${w.slice(0, -3)}y`;
  else if (w.length > 4 && w.endsWith("oes")) w = w.slice(0, -2);
  else if (w.length > 4 && /(ches|shes|xes|sses)$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us") && !w.endsWith("is")) w = w.slice(0, -1);
  return SPELLING_MAP.get(w) || w;
}

export function foodTokens(value: string) {
  return normaliseFoodText(value)
    .split(" ")
    .filter((token) => token && !STOP_WORDS.has(token))
    .map(stemFoodWord);
}

/** Query rewritten with everyday phrases mapped to reference-data wording. */
export function expandPlainFoodQuery(query: string) {
  let text = ` ${normaliseFoodText(query)} `;
  for (const [pattern, replacement] of PLAIN_FOOD_PHRASES) text = text.replace(pattern, replacement);
  return text.replace(/\s+/g, " ").trim();
}

/** Query rewritten with brand nicknames mapped to the name on the pack. */
export function expandBrandQuery(query: string) {
  let text = ` ${String(query || "").toLowerCase()} `;
  for (const [pattern, replacement] of BRAND_PHRASES) text = text.replace(pattern, replacement);
  return text.replace(/\s+/g, " ").trim();
}

export function looksBranded(query: string) {
  return KNOWN_BRAND_WORDS.test(expandBrandQuery(query));
}

function editDistanceAtMost(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return false;
  // Optimal string alignment distance (insert, delete, substitute, swap neighbours).
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i += 1) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      if (d[i][j] < rowMin) rowMin = d[i][j];
    }
    if (rowMin > max) return false;
  }
  return d[a.length][b.length] <= max;
}

/** How well one query word matches one candidate word: 1 exact, 0.85 prefix, 0.7 typo, 0 none. */
export function wordMatch(queryWord: string, word: string) {
  if (queryWord === word) return 1;
  if (queryWord.length >= 3 && word.startsWith(queryWord)) return 0.85;
  if (word.length >= 4 && queryWord.startsWith(word) && queryWord.length - word.length <= 2) return 0.8;
  if (queryWord.length >= 5 && queryWord[0] === word[0]) {
    const max = queryWord.length >= 8 ? 2 : 1;
    if (editDistanceAtMost(queryWord, word, max)) return 0.7;
  }
  return 0;
}

/** Share of query words found in the text (0–1), in any order, allowing plurals and typos. */
export function tokenCoverage(queryTokens: string[], textTokens: string[]) {
  if (!queryTokens.length) return { coverage: 0, matched: 0 };
  let total = 0;
  let matched = 0;
  for (const q of queryTokens) {
    let best = 0;
    for (const t of textTokens) {
      const score = wordMatch(q, t);
      if (score > best) best = score;
      if (best === 1) break;
    }
    if (best > 0) matched += 1;
    total += best;
  }
  return { coverage: total / queryTokens.length, matched };
}

/** General relevance of a product label to a query, 0–~1.5. Used to rank branded results. */
export function textRelevance(query: string, text: string) {
  const expanded = expandBrandQuery(query);
  const queryTokens = foodTokens(expanded);
  const textTokens = foodTokens(text);
  const { coverage } = tokenCoverage(queryTokens, textTokens);
  const phrase = normaliseFoodText(text).includes(normaliseFoodText(expanded)) ? 0.3 : 0;
  return coverage + phrase;
}

export type QuantityHint = { text: string; count: number | null; amount: number | null; unit: "g" | "ml" | null };

const NUMBER_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, half: 0.5, "a couple of": 2, couple: 2, "half a": 0.5, "half an": 0.5 };

/** Pulls "2", "200g", "a pint of", "half a" off the front of a query so the food can be matched and the amount pre-filled. */
export function parseQuantity(query: string): QuantityHint {
  let text = String(query || "").trim().toLowerCase();
  let count: number | null = null;
  let amount: number | null = null;
  let unit: "g" | "ml" | null = null;
  const measured = text.match(/^(\d+(?:\.\d+)?)\s*(g|grams?|kg|kilos?|ml|millilitres?|milliliters?|l|litres?|liters?)\b\s*(?:of\s+)?/);
  const pint = text.match(/^(half\s+(?:a\s+)?|a\s+|one\s+|1\s+|2\s+|two\s+)?pints?\s+(?:of\s+)?/);
  if (measured) {
    const value = Number(measured[1]);
    const u = measured[2];
    amount = /^kg|^kilo/.test(u) ? value * 1000 : /^l|^litre|^liter/.test(u) ? value * 1000 : value;
    unit = /^m|^l/.test(u) ? "ml" : "g";
    text = text.slice(measured[0].length);
  } else if (pint) {
    const lead = (pint[1] || "").trim();
    const pints = /half/.test(lead) ? 0.5 : /2|two/.test(lead) ? 2 : 1;
    amount = Math.round(568 * pints);
    unit = "ml";
    text = text.slice(pint[0].length);
  } else {
    const counted = text.match(/^(\d+(?:\.\d+)?|a couple of|half an?|half|one|two|three|four|five|six|an?)\s+(?:x\s+)?/);
    if (counted) {
      const raw = counted[1];
      const value = Number.isFinite(Number(raw)) ? Number(raw) : NUMBER_WORDS[raw] ?? null;
      if (value && value > 0 && value <= 20) count = value;
      text = text.slice(counted[0].length);
    }
  }
  return { text: text.trim() || String(query || "").trim(), count, amount, unit };
}

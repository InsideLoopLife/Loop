// Heads-ups on bills that are about to change price: confirmed rises (Netflix,
// broadband mid-contract rises), forecasts (the energy price cap if you're
// not fixed), and yearly changes (water and council tax every April). Also
// spots common bills that aren't in Money in & out yet, so the plan is
// accurate.
//
// The figures below are dated. When a provider announces a new rise, update
// the rule and its `checked` date. Last checked 11 November 2026.

export type BillKind = "energy" | "water" | "council_tax" | "broadband" | "mobile" | "telecom" | "streaming" | "other";

export type WatchItem = {
  id: string;
  label: string;
  brand_name?: string | null;
  amount: number;
  recurrence: string;
  start_date: string;
  end_date: string | null;
  day_of_month?: number | null;
  category?: string | null;
};

export type WatchResponse = {
  watch_key: string;
  planned_item_id: string | null;
  response: "applied" | "dismissed" | "fixed" | "variable" | "service";
  value: string | null;
  fixed_until: string | null;
};

export type PriceAlert = {
  key: string;
  itemId: string | null;
  name: string;
  kind: BillKind;
  status: "confirmed" | "forecast" | "expected" | "question" | "missing";
  headline: string;
  detail: string;
  current: number | null;
  next: number | null;
  /** First date the new price applies (YYYY-MM-DD). */
  effective: string | null;
  canApply: boolean;
  question?: { prompt: string; options: Array<{ label: string; response: WatchResponse["response"]; value?: string; askDate?: boolean }> };
  source?: { name: string; url: string };
  addHref?: string;
};

const has = (item: WatchItem, re: RegExp) => re.test(`${item.label} ${item.brand_name || ""}`);
const money = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const yearly = (monthly: number) => `£${Math.round(Math.abs(monthly) * 12).toLocaleString("en-GB")} a year`;
const round2 = (n: number) => Math.round(n * 100) / 100;
const dateLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

const ENERGY = /octopus|british gas|e\.?on|edf|ovo|scottish ?power|so energy|utility warehouse|outfox|good energy|ecotricity|\benergy\b|electric|\bgas\b/i;
const WATER = /united utilities|severn trent|thames water|yorkshire water|anglian water|southern water|south west water|welsh water|dwr cymru|northumbrian|wessex water|affinity water|south east water|\bwater\b/i;
const COUNCIL_TAX = /council ?tax/i;
const TELECOM = /\b(ee|bt|plusnet|virgin media|talktalk|vodafone|three|o2|sky|giffgaff|id mobile|tesco mobile|voxi|smarty|lebara|lyca|community fibre|hyperoptic|shell energy broadband)\b/i;
const BROADBAND_WORDS = /broadband|fibre|wifi|wi-fi|internet|landline/i;
const MOBILE_WORDS = /mobile|sim\b|phone|iphone|airtime|data plan/i;

export function billKind(item: WatchItem): BillKind {
  if (has(item, COUNCIL_TAX)) return "council_tax";
  if (has(item, WATER)) return "water";
  if (has(item, TELECOM)) return has(item, BROADBAND_WORDS) ? "broadband" : has(item, MOBILE_WORDS) ? "mobile" : "telecom";
  if (has(item, BROADBAND_WORDS)) return "broadband";
  if (has(item, ENERGY)) return "energy";
  if (has(item, /netflix|spotify|disney\+?|apple (tv|one|music)|amazon prime|now tv|youtube premium|paramount/i)) return "streaming";
  return "other";
}

/* ---------- dated facts ---------- */

/** Netflix UK, September 2026: old → new monthly price, for existing members after 30 days' notice. */
const NETFLIX: Array<[number, number, string]> = [[18.99, 20.99, "Premium"], [12.99, 13.99, "Standard"], [4.99, 5.99, "Extra member with ads"]];
const NETFLIX_SOURCE = { name: "ISPreview, Sept 2026", url: "https://www.ispreview.co.uk/index.php/2026/09/netflix-hikes-uk-prices-for-customers-of-its-video-streaming-service.html" };

/** Broadband mid-contract rises from April 2027, per month, for customers on pounds-and-pence contracts. */
const BROADBAND_2027: Array<{ re: RegExp; name: string; amount: number | null; from: string; who: string }> = [
  { re: /\bbt\b/i, name: "BT", amount: 4, from: "2027-03-31", who: "if you joined or re-contracted on or after 31 July 2025" },
  { re: /\bee\b/i, name: "EE", amount: 4, from: "2027-03-31", who: "if you joined or upgraded on or after 31 July 2025" },
  { re: /plusnet/i, name: "Plusnet", amount: 4, from: "2027-03-31", who: "if you signed up on or after 5 August 2025" },
  { re: /virgin media/i, name: "Virgin Media", amount: 4, from: "2027-04-01", who: "(£3.50 if you joined between 9 January and 2 October 2025)" },
  { re: /talktalk/i, name: "TalkTalk", amount: 4, from: "2027-04-01", who: "for contracts taken on or after 16 November 2025" },
  { re: /vodafone/i, name: "Vodafone", amount: 3.5, from: "2027-04-01", who: "for contracts from 12 November 2025" },
  { re: /\bthree\b/i, name: "Three", amount: 3.5, from: "2027-04-01", who: "on pounds-and-pence terms" },
  { re: /\bsky\b/i, name: "Sky", amount: null, from: "2027-04-01", who: "Sky usually announces in February (it was £3 a month in April 2026)" },
];
const BROADBAND_SOURCE = { name: "BroadbandSwitch, July 2026", url: "https://broadbandswitch.uk/insights/broadband-price-rises-april-2027/" };

/** Energy price cap: Cornwall Insight forecast for January 2027 (published 30 Sept 2026); Ofgem confirms in late November. */
const ENERGY_CAP = { from: "2027-01-01", percent: 16, status: "forecast" as const, note: "Cornwall Insight forecasts the price cap rising about 16% on 1 January 2027. Ofgem confirms the figure in late November.", source: { name: "Cornwall Insight, Sept 2026", url: "https://www.cornwall-insight.com/press-releases/16-price-cap-rise-forecast-in-january/" } };

/** Council tax: councils with social care duties can raise it by up to 4.99% without a referendum. */
const COUNCIL_TAX_CAP = 4.99;

function nextBillDate(item: WatchItem, today: Date) {
  const day = item.day_of_month || Number(item.start_date.slice(8, 10)) || 1;
  const d = new Date(today.getFullYear(), today.getMonth(), Math.min(day, 28));
  if (d <= today) d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

export function priceWatch(items: WatchItem[], responses: WatchResponse[], opts: { today?: Date; hasHome?: boolean } = {}): PriceAlert[] {
  const today = opts.today ?? new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const answer = (key: string) => responses.find((r) => r.watch_key === key);
  const itemAnswer = (itemId: string, prefix: string) => responses.find((r) => r.planned_item_id === itemId && r.watch_key.startsWith(prefix));
  const active = items.filter((item) => item.recurrence !== "one_off" && (!item.end_date || item.end_date >= todayIso));
  const alerts: PriceAlert[] = [];

  for (const item of active) {
    const name = item.brand_name || item.label;
    let kind = billKind(item);
    if (kind === "telecom") {
      const service = itemAnswer(item.id, "service:")?.value;
      if (service === "broadband" || service === "mobile") kind = service;
      else {
        alerts.push({
          key: `service:${item.id}`, itemId: item.id, name, kind, status: "question",
          headline: `Is ${name} your broadband or a mobile?`,
          detail: "Broadband and mobile contracts go up by different amounts each April, so LOOP needs to know which this is.",
          current: item.amount, next: null, effective: null, canApply: false,
          question: { prompt: "This is my", options: [{ label: "Broadband", response: "service", value: "broadband" }, { label: "Mobile", response: "service", value: "mobile" }, { label: "Both", response: "service", value: "broadband" }] },
        });
        continue;
      }
    }

    if (kind === "streaming" && has(item, /netflix/i)) {
      const match = NETFLIX.find(([old]) => Math.abs(item.amount - old) < 0.01);
      const key = `netflix-2026:${item.id}`;
      if (match && !answer(key)) {
        const [old, next, plan] = match;
        alerts.push({
          key, itemId: item.id, name, kind, status: "confirmed",
          headline: `Netflix ${plan} is going up from ${money(old)} to ${money(next)} a month`,
          detail: `That's ${yearly(next - old)} more. It applies from your first bill 30 days after Netflix emails you, so probably your next one.`,
          current: old, next, effective: nextBillDate(item, today), canApply: true, source: NETFLIX_SOURCE,
        });
      }
    }

    if (kind === "broadband") {
      const rule = BROADBAND_2027.find((r) => has(item, r.re));
      const key = `broadband-2027:${item.id}`;
      if (rule && !answer(key) && item.end_date === null && item.start_date < rule.from) {
        alerts.push(rule.amount
          ? {
              key, itemId: item.id, name, kind, status: "confirmed",
              headline: `${rule.name} broadband goes up ${money(rule.amount)} a month from ${dateLabel(rule.from)}`,
              detail: `${money(item.amount)} becomes ${money(round2(item.amount + rule.amount))}, ${yearly(rule.amount)} more, ${rule.who}. Your contract says the exact amount.`,
              current: item.amount, next: round2(item.amount + rule.amount), effective: rule.from, canApply: true, source: BROADBAND_SOURCE,
            }
          : {
              key, itemId: item.id, name, kind, status: "expected",
              headline: `${rule.name} broadband usually goes up in April`,
              detail: `${rule.who}. LOOP will update this when it's announced.`,
              current: item.amount, next: null, effective: rule.from, canApply: false, source: BROADBAND_SOURCE,
            });
      }
    }

    if (kind === "mobile") {
      const key = `mobile-2027:${item.id}`;
      if (!answer(key) && item.end_date === null && item.start_date < "2027-04-01") {
        alerts.push({
          key, itemId: item.id, name, kind, status: "expected",
          headline: `${name} will probably go up in April 2027`,
          detail: "Most mobile contracts rise each April by a set amount written into your contract, often £1.50 to £3 a month. Check yours so it isn't a surprise. SIM-only deals out of contract are often cheaper to switch.",
          current: item.amount, next: null, effective: "2027-04-01", canApply: false,
        });
      }
    }

    if (kind === "energy") {
      const fixed = itemAnswer(item.id, "energy-tariff:");
      const key = `energy-cap-2027-01:${item.id}`;
      if (!fixed) {
        alerts.push({
          key: `energy-tariff:${item.id}`, itemId: item.id, name, kind, status: "question",
          headline: `Is your ${name} price fixed?`,
          detail: "If you're on a standard (variable) tariff, your bill follows Ofgem's price cap, which changes every January, April, July and October.",
          current: item.amount, next: null, effective: null, canApply: false,
          question: { prompt: "My energy price is", options: [{ label: "Fixed until…", response: "fixed", askDate: true }, { label: "Not fixed", response: "variable" }] },
        });
      } else if ((fixed.response === "variable" || (fixed.response === "fixed" && fixed.fixed_until && fixed.fixed_until < ENERGY_CAP.from)) && !answer(key) && ENERGY_CAP.from > todayIso && item.start_date < ENERGY_CAP.from) {
        const next = round2(item.amount * (1 + ENERGY_CAP.percent / 100));
        alerts.push({
          key, itemId: item.id, name, kind, status: ENERGY_CAP.status,
          headline: `${name} could go up about ${ENERGY_CAP.percent}% in January`,
          detail: `${ENERGY_CAP.note} On ${money(item.amount)} a month that's about ${money(next)}, ${yearly(next - item.amount)} more. A fixed deal now could avoid it.`,
          current: item.amount, next, effective: ENERGY_CAP.from, canApply: true, source: ENERGY_CAP.source,
        });
      } else if (fixed.response === "fixed" && fixed.fixed_until && fixed.fixed_until > todayIso) {
        const days = (new Date(fixed.fixed_until).getTime() - today.getTime()) / 86400000;
        if (days < 60 && !answer(`energy-fix-ends:${item.id}`)) {
          alerts.push({
            key: `energy-fix-ends:${item.id}`, itemId: item.id, name, kind, status: "expected",
            headline: `Your ${name} fixed deal ends on ${dateLabel(fixed.fixed_until)}`,
            detail: "After that you move to the standard tariff unless you pick a new deal. Compare fixed deals now.",
            current: item.amount, next: null, effective: fixed.fixed_until, canApply: false,
          });
        }
      }
    }

    if (kind === "water") {
      const key = `water-2027:${item.id}`;
      if (!answer(key) && item.end_date === null) {
        alerts.push({
          key, itemId: item.id, name, kind, status: "expected",
          headline: `${name} goes up every April`,
          detail: `Water companies confirm next year's bills in February. In April 2026 ${/united utilities/i.test(name) ? "United Utilities bills rose about 14% (12% with a meter)" : "most bills rose between 5% and 14%"}. Check the letter they send in February and update it here.`,
          current: item.amount, next: null, effective: "2027-04-01", canApply: false,
          source: /united utilities/i.test(name) ? { name: "United Utilities", url: "https://www.unitedutilities.com/my-account/your-bill/our-household-charges-20262027/why-are-bills-going-up/" } : undefined,
        });
      }
    }

    if (kind === "council_tax") {
      const key = `council-tax-2027:${item.id}`;
      const laterExists = items.some((other) => other.id !== item.id && billKind(other) === "council_tax" && other.start_date > (item.end_date || "9999"));
      if (!answer(key) && !laterExists && item.start_date < "2027-04-01") {
        const next = round2(item.amount * (1 + COUNCIL_TAX_CAP / 100));
        const ends = item.end_date;
        alerts.push({
          key, itemId: item.id, name, kind, status: "expected",
          headline: ends ? `Council tax for 2027–28 isn't in your plan yet` : `Council tax goes up in April`,
          detail: `${ends ? `Your plan stops after ${dateLabel(ends)}. ` : ""}Most councils raise it by up to ${COUNCIL_TAX_CAP}% each April: about ${money(next)} a month instead of ${money(item.amount)}. Your council confirms it in March.`,
          current: item.amount, next, effective: "2027-04-01", canApply: true,
          source: { name: "GOV.UK council tax", url: "https://www.gov.uk/council-tax" },
        });
      }
    }
  }

  // Common bills that are missing, so the month plan isn't too rosy.
  if (opts.hasHome !== false) {
    const kinds = new Set(active.map(billKind));
    if (!kinds.has("energy") && !answer("missing:energy")) {
      alerts.push({
        key: "missing:energy", itemId: null, name: "Energy", kind: "energy", status: "missing",
        headline: "No energy bill in your plan",
        detail: "Gas and electricity are usually one of the biggest bills. Add it so your month is accurate, and LOOP can warn you about price cap changes.",
        current: null, next: null, effective: null, canApply: false, addHref: "/spending?add=monthly&prefill_label=Energy",
      });
    }
    if (!kinds.has("broadband") && !kinds.has("telecom") && !answer("missing:broadband")) {
      alerts.push({
        key: "missing:broadband", itemId: null, name: "Broadband", kind: "broadband", status: "missing",
        headline: "No broadband in your plan",
        detail: "Add your broadband so LOOP can warn you about its yearly price rise.",
        current: null, next: null, effective: null, canApply: false, addHref: "/spending?add=monthly&prefill_label=Broadband",
      });
    }
  }

  const order = { confirmed: 0, forecast: 1, question: 2, expected: 3, missing: 4 };
  return alerts.sort((a, b) => order[a.status] - order[b.status] || (a.effective || "9999").localeCompare(b.effective || "9999"));
}

// Patterns over the last 1–2 weeks for one person: what keeps going over, what's going well.
// Every insight needs enough logged days to be fair, uses real numbers, says why (with a source)
// and suggests one practical swap. Messages about children are written for the parent.

import { TARGET_SOURCES, type PersonTargets } from "@/lib/nutrition/targets";

export type PatternLog = {
  eaten_on: string;
  eaten_at?: string | null;
  label: string;
  meal_slot?: string | null;
  calories?: number | null;
  protein_g?: number | null;
  fibre_g?: number | null;
  sugar_g?: number | null;
  added_sugar_g?: number | null;
  salt_g?: number | null;
  saturated_fat_g?: number | null;
  caffeine_mg?: number | null;
};

export type Insight = {
  id: string;
  tone: "warn" | "good" | "info";
  title: string;
  body: string;
  why?: string;
  source?: { label: string; url?: string };
  swap?: string;
  /** Lower = shown first. */
  priority: number;
};

export type PatternSummary = {
  windowDays: number;
  loggedDays: number;
  insights: Insight[];
  needsMoreLogging: boolean;
};

const n = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type Day = { date: string; logs: PatternLog[]; kcal: number; caffeine: number; freeSugar: number; salt: number; fibre: number; protein: number; satFat: number; lateCaffeine: number; drinkSugar: number };

function topSources(logs: PatternLog[], key: keyof PatternLog, limit = 2) {
  const byLabel = new Map<string, number>();
  for (const log of logs) {
    const value = n(log[key]);
    if (value <= 0) continue;
    const label = String(log.label || "").replace(/\s+/g, " ").trim().slice(0, 40);
    byLabel.set(label, (byLabel.get(label) || 0) + value);
  }
  return Array.from(byLabel.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([label]) => label);
}

function listText(items: string[]) {
  if (items.length <= 1) return items[0] || "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const SUGARY_DRINK = /juice|smoothie|cola|coke(?! zero)|pepsi(?! max)|lemonade|fanta|sprite|tango|irn|squash|cordial|fizzy|pop|milkshake|frappe|hot chocolate|energy drink|lucozade|ribena|fruit shoot/i;

export function buildPatterns(input: { logs: PatternLog[]; endDate: string; targets: PersonTargets; name: string; isSelf: boolean; windowDays?: number }): PatternSummary {
  const windowDays = input.windowDays ?? 14;
  const start = addDays(input.endDate, -(windowDays - 1));
  const t = input.targets;
  const who = input.isSelf ? "You" : input.name;
  const whoLower = input.isSelf ? "you" : input.name;
  const your = input.isSelf ? "your" : `${input.name}'s`;
  const minKcal = t.isChild ? 300 : 500;

  const days: Day[] = [];
  for (let i = 0; i < windowDays; i += 1) {
    const date = addDays(start, i);
    const logs = input.logs.filter((log) => log.eaten_on === date);
    const sum = (key: keyof PatternLog) => logs.reduce((total, log) => total + n(log[key]), 0);
    const lateCaffeine = logs.filter((log) => n(log.caffeine_mg) >= 40 && log.eaten_at && log.eaten_at.slice(0, 5) >= "15:00").reduce((total, log) => total + n(log.caffeine_mg), 0);
    const drinkSugar = logs.filter((log) => (log.meal_slot === "drink" || SUGARY_DRINK.test(log.label)) && SUGARY_DRINK.test(log.label)).reduce((total, log) => total + n(log.added_sugar_g || log.sugar_g), 0);
    days.push({ date, logs, kcal: sum("calories"), caffeine: sum("caffeine_mg"), freeSugar: sum("added_sugar_g"), salt: sum("salt_g"), fibre: sum("fibre_g"), protein: sum("protein_g"), satFat: sum("saturated_fat_g"), lateCaffeine, drinkSugar });
  }

  // A "logged day" is one with enough food recorded to be representative.
  const logged = days.filter((day) => day.logs.length >= 2 && day.kcal >= minKcal);
  const anyLogs = days.some((day) => day.logs.length);
  const minDays = windowDays >= 14 ? 7 : 4;
  const insights: Insight[] = [];
  const windowText = `the last ${windowDays} days`;

  // Caffeine for children counts on any day it appears (even partial days).
  const caffeineDays = (t.isChild ? days.filter((day) => day.logs.length) : logged);
  if (t.isChild) {
    const limit = t.caffeine_mg;
    const over = caffeineDays.filter((day) => (limit == null ? day.caffeine >= 10 : day.caffeine > limit));
    if (over.length >= 2) {
      const sources = topSources(over.flatMap((day) => day.logs), "caffeine_mg");
      insights.push({
        id: "child-caffeine",
        tone: "warn",
        priority: 1,
        title: `${who} had caffeine on ${over.length} days`,
        body: `${limit == null ? "Caffeine" : `More than ${limit}mg of caffeine`} showed up on ${over.length} of ${windowText}${sources.length ? `, mostly from ${listText(sources)}` : ""}.`,
        why: limit == null
          ? "For children, EFSA's guide is no more than 3mg per kg of body weight a day. Add their weight in their details to get an exact figure."
          : "For children, EFSA's guide is no more than 3mg per kg of body weight a day; caffeine can also affect sleep.",
        source: TARGET_SOURCES.caffeine,
        swap: "Caffeine-free versions of cola and squash are an easy swap.",
      });
    }
  }

  if (logged.length < minDays) {
    if (anyLogs) {
      insights.push({ id: "need-more", tone: "info", priority: 50, title: "Patterns need a few more days", body: `${who === "You" ? "You've" : `${who} has`} ${logged.length} full day${logged.length === 1 ? "" : "s"} logged in ${windowText}. Log at least ${minDays} full days (2+ meals or drinks) and Loop will start spotting patterns.` });
    }
    return { windowDays, loggedDays: logged.length, insights: insights.sort((a, b) => a.priority - b.priority), needsMoreLogging: true };
  }

  const avg = (key: keyof Day) => logged.reduce((total, day) => total + n(day[key]), 0) / logged.length;
  const share = (count: number) => count / logged.length;
  const loggedText = `${logged.length} logged day${logged.length === 1 ? "" : "s"}`;

  // Adult caffeine
  if (!t.isChild && t.caffeine_mg != null) {
    const over = logged.filter((day) => day.caffeine > (t.caffeine_mg as number));
    if (over.length >= 3 && share(over.length) >= 0.3) {
      const average = Math.round(over.reduce((total, day) => total + day.caffeine, 0) / over.length);
      const sources = topSources(over.flatMap((day) => day.logs), "caffeine_mg");
      insights.push({
        id: "caffeine-over",
        tone: "warn",
        priority: 2,
        title: `Caffeine over ${t.caffeine_mg}mg on ${over.length} days`,
        body: `${who} went over ${t.caffeine_mg}mg on ${over.length} of ${loggedText} (about ${average}mg on those days)${sources.length ? `, mainly ${listText(sources)}` : ""}.`,
        why: t.caffeine_mg === 400
          ? "EFSA, Europe's food safety body, judges up to 400mg a day (and up to 200mg at once) safe for healthy adults. It also found doses of around 100mg close to bedtime can affect sleep for some people."
          : `This uses ${your} personal limit of ${t.caffeine_mg}mg a day. UK advice in pregnancy and breastfeeding is no more than 200mg.`,
        source: TARGET_SOURCES.caffeine,
        swap: "Swapping one mug of coffee for decaf saves around 100mg.",
      });
    }
    const late = logged.filter((day) => day.lateCaffeine >= 75);
    if (late.length >= 3) {
      insights.push({
        id: "caffeine-late",
        tone: "info",
        priority: 6,
        title: `Caffeine after 3pm on ${late.length} days`,
        body: `${who} had 75mg or more of caffeine after 3pm on ${late.length} of ${loggedText}.`,
        why: "EFSA found single doses of around 100mg can make it take longer to fall asleep and shorten sleep in some adults. Caffeine stays in the body for hours.",
        source: TARGET_SOURCES.caffeine,
        swap: "Try decaf or tea after mid-afternoon.",
      });
    }
  }

  // Free sugars
  const sugarLimit = t.added_sugar_g ?? (t.band === "toddler" ? 5 : null);
  if (sugarLimit != null) {
    const over = logged.filter((day) => day.freeSugar > sugarLimit);
    if (over.length >= 3 && share(over.length) >= 0.4) {
      const average = Math.round(avg("freeSugar"));
      const sources = topSources(over.flatMap((day) => day.logs), "added_sugar_g");
      insights.push({
        id: "sugar-over",
        tone: "warn",
        priority: 3,
        title: t.added_sugar_g == null ? `Added sugar on ${over.length} days` : `Free sugars over ${sugarLimit}g on ${over.length} days`,
        body: `${who} averaged ${average}g of free sugars a day across ${loggedText}${sources.length ? `; the biggest sources were ${listText(sources)}` : ""}.`,
        why: t.added_sugar_g == null
          ? "UK advice for under 4s is to avoid foods and drinks with added sugar, and to drink water and milk."
          : `The UK limit for ${t.bandLabel.toLowerCase()} is ${sugarLimit}g of free sugars a day (about ${Math.round(sugarLimit / 4.2)} sugar cubes). Free sugars include added sugar, honey, syrups and fruit juice.`,
        source: TARGET_SOURCES.sugar,
        swap: t.isChild ? "Swapping one sugary drink for water or milk is usually the biggest win." : "Sugary drinks and sweet snacks are usually the quickest cut.",
      });
    }
  }

  // Sugary drinks (children especially)
  const drinkDays = logged.filter((day) => day.drinkSugar >= (t.isChild ? 5 : 15));
  if (drinkDays.length >= (t.isChild ? 3 : 5)) {
    const sources = topSources(drinkDays.flatMap((day) => day.logs.filter((log) => SUGARY_DRINK.test(log.label))), "sugar_g");
    insights.push({
      id: "sugary-drinks",
      tone: "warn",
      priority: 4,
      title: `Sugary drinks on ${drinkDays.length} days`,
      body: `${who} had sugary drinks${sources.length ? ` (mostly ${listText(sources)})` : ""} on ${drinkDays.length} of ${loggedText}.`,
      why: "UK advice is that sugar-sweetened drinks should be kept to a minimum for children and adults. A 150ml glass of juice is about the most to have in a day.",
      source: TARGET_SOURCES.sugar,
      swap: t.isChild ? "Try water, milk, or juice diluted half and half with water." : "Diet or zero-sugar versions, or sparkling water with a slice of lemon.",
    });
  }

  // Salt
  const saltOver = logged.filter((day) => day.salt > t.salt_g);
  if (saltOver.length >= 3 && share(saltOver.length) >= 0.4) {
    const sources = topSources(saltOver.flatMap((day) => day.logs), "salt_g");
    insights.push({
      id: "salt-over",
      tone: "warn",
      priority: 5,
      title: `Salt over ${t.salt_g}g on ${saltOver.length} days`,
      body: `${who} averaged ${avg("salt").toFixed(1)}g of salt a day across ${loggedText}${sources.length ? `; the biggest sources were ${listText(sources)}` : ""}.`,
      why: `The UK maximum for ${t.bandLabel.toLowerCase()} is ${t.salt_g}g a day. Most salt comes from foods like bread, processed meat, sauces and takeaways rather than the salt shaker.`,
      source: TARGET_SOURCES.salt,
      swap: "Lower-salt sauces and stock, and fewer processed meats, make the biggest difference.",
    });
  }

  // Fibre
  const fibreAvg = avg("fibre");
  if (fibreAvg < t.fibre_g * 0.6) {
    insights.push({
      id: "fibre-low",
      tone: "warn",
      priority: 7,
      title: `Fibre averaging ${Math.round(fibreAvg)}g a day`,
      body: `Across ${loggedText}, ${whoLower} averaged ${Math.round(fibreAvg)}g of fibre a day against a UK guide of ${t.fibre_g}g.`,
      why: "Most people in the UK fall short on fibre. It supports gut health and is linked with lower risk of heart disease, type 2 diabetes and bowel cancer.",
      source: TARGET_SOURCES.fibre,
      swap: "Wholemeal bread, oats, beans or lentils, and leaving potato skins on, each add several grams.",
    });
  } else if (fibreAvg >= t.fibre_g * 0.9) {
    insights.push({
      id: "fibre-good",
      tone: "good",
      priority: 20,
      title: `Fibre on target — ${Math.round(fibreAvg)}g a day`,
      body: `${who} averaged ${Math.round(fibreAvg)}g of fibre a day across ${loggedText}, close to or above the ${t.fibre_g}g guide.`,
      why: "Only a small minority of UK adults and children reach the fibre guide, so this is genuinely good going.",
      source: TARGET_SOURCES.fibre,
    });
  }

  // Saturated fat (adults/teens)
  if (!["toddler", "child_4_6", "child_7_10", "child_unknown"].includes(t.band)) {
    const satOver = logged.filter((day) => day.satFat > t.saturated_fat_g);
    if (satOver.length >= 4 && share(satOver.length) >= 0.5) {
      const sources = topSources(satOver.flatMap((day) => day.logs), "saturated_fat_g");
      insights.push({
        id: "satfat-over",
        tone: "info",
        priority: 8,
        title: `Saturated fat over ${t.saturated_fat_g}g on ${satOver.length} days`,
        body: `${who} averaged ${Math.round(avg("satFat"))}g a day across ${loggedText}${sources.length ? `, mostly from ${listText(sources)}` : ""}.`,
        why: `UK guidance is no more than about ${t.saturated_fat_g}g a day; regularly going over can raise cholesterol.`,
        swap: "Leaner mince, less butter and cheese, or a plant oil instead of butter for cooking.",
      });
    }
  }

  // Protein (adults only, gentle)
  if (!t.isChild) {
    const proteinAvg = avg("protein");
    if (proteinAvg < t.protein_g * 0.7) {
      insights.push({ id: "protein-low", tone: "info", priority: 9, title: `Protein averaging ${Math.round(proteinAvg)}g a day`, body: `That's below the UK reference amount of about ${Math.round(t.protein_g)}g for ${whoLower}.`, swap: "Eggs, Greek yoghurt, beans, fish or chicken at breakfast or lunch help most." });
    }
  }

  // Good streak: within sugar and salt limits
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    const day = days[i];
    if (!(day.logs.length >= 2 && day.kcal >= minKcal)) break;
    if (day.salt > t.salt_g || (sugarLimit != null && day.freeSugar > sugarLimit)) break;
    streak += 1;
  }
  if (streak >= 4) {
    insights.push({ id: "streak", tone: "good", priority: 21, title: `${streak} days in a row within sugar and salt limits`, body: `${who} ${input.isSelf ? "have" : "has"} stayed within the UK sugar and salt limits for ${streak} logged days running.` });
  }

  // Seasonal vitamin D reminder (UK government advice, October–March)
  const month = Number(input.endDate.slice(5, 7));
  if (month >= 10 || month <= 3) {
    insights.push({ id: `vitd-${input.endDate.slice(0, 4)}`, tone: "info", priority: 30, title: "Vitamin D in autumn and winter", body: `It's hard to get enough vitamin D from food alone. UK advice is for everyone to consider a daily 10 microgram supplement from October to March${t.isChild ? ", and children aged 1 to 4 should have one all year round" : ""}.`, source: { label: "NHS / UK government advice" } });
  }

  if (!insights.some((insight) => insight.tone === "warn")) {
    insights.push({ id: "all-good", tone: "good", priority: 25, title: "Nothing to flag", body: `No limits were regularly exceeded across ${loggedText}. Keep it up.` });
  }
  return { windowDays, loggedDays: logged.length, insights: insights.sort((a, b) => a.priority - b.priority), needsMoreLogging: false };
}

/** Average day score this week vs the week before: "up", "down" or "flat". */
export function weeklyTrend(dayScores: Array<{ date: string; score: number; logged: boolean }>, endDate: string) {
  const thisWeekStart = addDays(endDate, -6);
  const lastWeekStart = addDays(endDate, -13);
  const avgOf = (from: string, to: string) => {
    const items = dayScores.filter((day) => day.logged && day.date >= from && day.date <= to);
    return items.length >= 3 ? items.reduce((sum, day) => sum + day.score, 0) / items.length : null;
  };
  const current = avgOf(thisWeekStart, endDate);
  const previous = avgOf(lastWeekStart, addDays(thisWeekStart, -1));
  if (current == null || previous == null) return null;
  const diff = Math.round(current - previous);
  return { current: Math.round(current), previous: Math.round(previous), diff, direction: diff >= 4 ? "up" : diff <= -4 ? "down" : "flat" } as const;
}

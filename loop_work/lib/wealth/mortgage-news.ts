// Recent mortgage and interest-rate headlines from publishers' own RSS
// feeds, as reading for people weighing up a new mortgage. Only the
// headline, publisher, date and link are shown; the article stays on the
// publisher's site. Cached for three hours.

export type MortgageNewsItem = { title: string; url: string; source: string; publishedAt: string | null };

const FEEDS: Array<{ source: string; url: string; filter: boolean }> = [
  { source: "The Guardian", url: "https://www.theguardian.com/money/mortgages/rss", filter: false },
  { source: "This is Money", url: "https://www.thisismoney.co.uk/money/mortgageshome/index.rss", filter: false },
  { source: "BBC News", url: "https://feeds.bbci.co.uk/news/business/rss.xml", filter: true },
];

const RELEVANT = /mortgage|remortgag|bank rate|base rate|interest rate|bank of england|house price|first-time buyer|first time buyer|\bsvr\b|fixed[- ]rate|landlord/i;

const decode = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#8217;/g, "’").replace(/&#8216;/g, "‘")
    .trim();

const tag = (xml: string, name: string) => {
  const match = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return match ? decode(match[1]) : "";
};

async function readFeed(feed: (typeof FEEDS)[number]): Promise<MortgageNewsItem[]> {
  try {
    const res = await fetch(feed.url, {
      headers: { "user-agent": "LOOP mortgage reading list (insideloop.life)" },
      next: { revalidate: 3 * 60 * 60 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)]
      .map((match) => {
        const item = match[0];
        const date = tag(item, "pubDate") || tag(item, "dc:date");
        const parsed = date ? new Date(date) : null;
        return {
          title: tag(item, "title"),
          url: tag(item, "link") || tag(item, "guid"),
          source: feed.source,
          publishedAt: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null,
        };
      })
      .filter((item) => item.title && /^https?:\/\//.test(item.url))
      .filter((item) => !feed.filter || RELEVANT.test(item.title));
  } catch {
    return [];
  }
}

/** Newest first, last 30 days, one copy of each headline. */
export async function loadMortgageNews(limit = 8): Promise<MortgageNewsItem[]> {
  const all = (await Promise.all(FEEDS.map(readFeed))).flat();
  const cutoff = Date.now() - 30 * 86400000;
  const seen = new Set<string>();
  return all
    .filter((item) => !item.publishedAt || Date.parse(item.publishedAt) >= cutoff)
    .sort((a, b) => Date.parse(b.publishedAt || "1970") - Date.parse(a.publishedAt || "1970"))
    .filter((item) => {
      const key = item.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

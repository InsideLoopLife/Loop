import "server-only";

/**
 * Change-aware read cache for the user-scoped Supabase server client.
 *
 * Every tracked table has a change counter in `loop_change_marks`, bumped by a database trigger on
 * any insert/update/delete — whoever makes the change (this app, another household member, a
 * background job, an import). A read (`GET /rest/v1/<table>`) is cached under a key made of:
 *   - the verified user it was made for (cached answers are never shared between people),
 *   - the exact request (URL with every filter, headers that shape the answer),
 *   - the counters of every table the answer depends on: the table itself, tables embedded in the
 *     select, and the tables its security rules read (folded into the counter by the database).
 * If any of those counters has moved, the key no longer matches and the read goes to the database.
 *
 * Safety rules:
 *   - Only tables that have a counter are cached; anything else (views, new tables) goes straight through.
 *   - Writes and unknown RPCs are never cached, and after any write the counters are re-read.
 *   - A cached answer is only served after the request's own token has been verified.
 *   - Counters are shared across requests for at most COUNTER_TTL_MS, so a change made elsewhere
 *     (another person, a job) shows up within that window; changes made through this server show
 *     up straight away.
 * Set LOOP_QUERY_CACHE=off to switch it off.
 */

type CachedResponse = { body: string; status: number; statusText: string; headers: Array<[string, string]>; bytes: number; at: number };
type Verified = { sub: string; exp: number };

const COUNTER_TTL_MS = 1500;
const ENTRY_MAX_AGE_MS = 15 * 60 * 1000; // backstop only; correctness comes from the counters
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_ENTRY_BYTES = 2 * 1024 * 1024;

// Database functions: the counter snapshot lists read-only ones as "rpc:<name>" — a version when it's
// safe to cache (reads only tracked tables, no clock/randomness), -1 when it's a read that mustn't be
// cached. Functions not listed may write, so they're treated as writes.

const state = {
  entries: new Map<string, CachedResponse>(),
  bytes: 0,
  marks: null as Record<string, number> | null,
  marksAt: 0,
  /** Counters read after this many writes through this server; any later write makes them stale. */
  marksSeq: -1,
  writeSeq: 0,
  marksInflight: null as { seq: number; promise: Promise<Record<string, number> | null> } | null,
  verified: new Map<string, Verified>(),
  stats: { hits: 0, misses: 0, bypass: 0, writes: 0, markReads: 0, evictions: 0 },
  lastLog: 0,
};

function enabled() {
  return process.env.LOOP_QUERY_CACHE !== "off";
}

function headerValue(init: RequestInit | undefined, request: Request | null, name: string) {
  if (request) return request.headers.get(name);
  const h = init?.headers;
  if (!h) return null;
  if (h instanceof Headers) return h.get(name);
  if (Array.isArray(h)) return h.find(([k]) => k.toLowerCase() === name)?.[1] ?? null;
  const record = h as Record<string, string>;
  const key = Object.keys(record).find((k) => k.toLowerCase() === name);
  return key ? record[key] : null;
}

/** Tables named in a PostgREST select, e.g. "id,category:spending_categories(name),people!fk(name)". */
export function embeddedTables(select: string | null): string[] {
  if (!select) return [];
  const found = new Set<string>();
  const pattern = /(?:^|[,(])\s*(?:\.\.\.)?\s*(?:[A-Za-z0-9_]+\s*:\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*(?:![A-Za-z0-9_]+)?\s*\(/g;
  for (const match of select.matchAll(pattern)) found.add(match[1]);
  return [...found];
}

function remember(key: string, value: CachedResponse) {
  const existing = state.entries.get(key);
  if (existing) { state.bytes -= existing.bytes; state.entries.delete(key); }
  state.entries.set(key, value);
  state.bytes += value.bytes;
  while (state.bytes > MAX_TOTAL_BYTES && state.entries.size) {
    const oldest = state.entries.keys().next().value as string;
    state.bytes -= state.entries.get(oldest)!.bytes;
    state.entries.delete(oldest);
    state.stats.evictions += 1;
  }
}

function recall(key: string) {
  const value = state.entries.get(key);
  if (!value) return null;
  if (Date.now() - value.at > ENTRY_MAX_AGE_MS) {
    state.entries.delete(key);
    state.bytes -= value.bytes;
    return null;
  }
  // Move to the end (most recently used).
  state.entries.delete(key);
  state.entries.set(key, value);
  return value;
}

function logStats() {
  const now = Date.now();
  if (now - state.lastLog < 60_000) return;
  state.lastLog = now;
  console.log(JSON.stringify({ event: "query_cache", ...state.stats, entries: state.entries.size, mb: Math.round(state.bytes / 104857.6) / 10 }));
}

/**
 * Wrap fetch for a user-scoped Supabase client. `verify(token)` must return the verified user id for
 * an access token (or null); it's called at most once per token.
 */
export function createCachingFetch(options: {
  supabaseUrl: string;
  verify: (token: string) => Promise<Verified | null>;
  baseFetch?: typeof fetch;
}): typeof fetch {
  const base = options.baseFetch ?? fetch;
  const restPrefix = `${options.supabaseUrl.replace(/\/+$/, "")}/rest/v1/`;

  async function verifiedSub(token: string): Promise<string | null> {
    const now = Date.now() / 1000;
    const known = state.verified.get(token);
    if (known && known.exp > now + 5) return known.sub;
    const result = await options.verify(token).catch(() => null);
    if (!result || !(result.exp > now + 5)) return null;
    if (state.verified.size > 500) state.verified.clear();
    state.verified.set(token, result);
    return result.sub;
  }

  async function marks(headers: Headers): Promise<Record<string, number> | null> {
    const seq = state.writeSeq;
    if (state.marks && state.marksSeq === seq && Date.now() - state.marksAt < COUNTER_TTL_MS) return state.marks;
    // Share a read that's already on its way, but only if it started after the latest write.
    if (state.marksInflight && state.marksInflight.seq === seq) return state.marksInflight.promise;
    const requestedAt = Date.now();
    const promise = (async () => {
      try {
        const response = await base(`${restPrefix}rpc/loop_change_marks_snapshot`, {
          method: "POST",
          headers: { apikey: headers.get("apikey") || "", authorization: headers.get("authorization") || "", "content-type": "application/json", accept: "application/json" },
          body: "{}",
          cache: "no-store",
        });
        if (!response.ok) return null;
        const data = (await response.json()) as Record<string, number>;
        state.stats.markReads += 1;
        if (seq >= state.marksSeq) {
          state.marks = data;
          state.marksAt = requestedAt;
          state.marksSeq = seq;
        }
        return data;
      } catch {
        return null;
      } finally {
        if (state.marksInflight?.seq === seq) state.marksInflight = null;
      }
    })();
    state.marksInflight = { seq, promise };
    return promise;
  }

  return async function cachingFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const request = input instanceof Request ? input : null;
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = String(init?.method || request?.method || "GET").toUpperCase();

    if (!enabled() || !url.startsWith(restPrefix)) return base(input as RequestInfo, init);

    const path = url.slice(restPrefix.length).split("?")[0];
    const isRpc = path.startsWith("rpc/");
    const rpcName = isRpc ? path.slice(4) : null;
    const readMethod = method === "GET" || method === "HEAD";

    const profile = headerValue(init, request, "accept-profile") || headerValue(init, request, "content-profile");
    const auth = headerValue(init, request, "authorization") || "";
    const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
    const headers = new Headers(request ? request.headers : (init?.headers as HeadersInit | undefined));

    // Database functions: look them up in the counter snapshot to know whether they're reads.
    let rpcVersion: number | undefined;
    if (isRpc && token && !(profile && profile !== "public")) {
      const known = await marks(headers);
      rpcVersion = known?.[`rpc:${rpcName}`];
    }
    const cacheableRpc = isRpc && rpcVersion !== undefined && rpcVersion >= 0;
    const readOnlyRpc = isRpc && rpcVersion !== undefined;

    // Writes (and functions we can't prove are read-only): pass through, then mark counters stale.
    if (!(readMethod && !isRpc) && !cacheableRpc) {
      const response = await base(input as RequestInfo, init);
      if (!readMethod && !readOnlyRpc) { state.writeSeq += 1; state.stats.writes += 1; }
      else state.stats.bypass += 1;
      return response;
    }

    if ((profile && profile !== "public") || !token) {
      state.stats.bypass += 1;
      return base(input as RequestInfo, init);
    }

    const tables = isRpc ? [`rpc:${rpcName}`] : [path, ...embeddedTables(new URL(url).searchParams.get("select"))];

    const [sub, currentMarks] = await Promise.all([verifiedSub(token), marks(headers)]);
    if (!sub || !currentMarks || tables.some((t) => !(t in currentMarks) || currentMarks[t] < 0)) {
      state.stats.bypass += 1;
      return base(input as RequestInfo, init);
    }

    const body = cacheableRpc ? (typeof init?.body === "string" ? init.body : request ? await request.clone().text() : "") : "";
    const key = [
      sub, method, url,
      headerValue(init, request, "accept") || "",
      headerValue(init, request, "prefer") || "",
      headerValue(init, request, "range") || "",
      body,
      tables.map((t) => `${t}:${currentMarks[t]}`).join(","),
    ].join("\u0001");

    const hit = recall(key);
    if (hit) {
      state.stats.hits += 1;
      logStats();
      return new Response(method === "HEAD" ? null : hit.body, { status: hit.status, statusText: hit.statusText, headers: hit.headers });
    }

    state.stats.misses += 1;
    const response = await base(input as RequestInfo, init);
    if (response.status === 200 || response.status === 206) {
      try {
        const text = await response.clone().text();
        const bytes = text.length * 2 + 256;
        if (bytes <= MAX_ENTRY_BYTES) {
          remember(key, { body: text, status: response.status, statusText: response.statusText, headers: [...response.headers.entries()].filter(([name]) => !["content-encoding", "content-length", "transfer-encoding", "connection"].includes(name.toLowerCase())), bytes, at: Date.now() });
        }
      } catch {
        // Unreadable body: just don't cache it.
      }
    }
    logStats();
    return response;
  };
}

/** For tests and diagnostics. */
export function queryCacheStats() {
  return { ...state.stats, entries: state.entries.size, bytes: state.bytes };
}

export function resetQueryCacheForTests() {
  state.entries.clear();
  state.bytes = 0;
  state.marks = null;
  state.marksSeq = -1;
  state.writeSeq = 0;
  state.marksInflight = null;
  state.verified.clear();
  Object.assign(state.stats, { hits: 0, misses: 0, bypass: 0, writes: 0, markReads: 0, evictions: 0 });
}

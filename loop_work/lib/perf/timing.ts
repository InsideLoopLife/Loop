// Temporary page timing: logs one JSON line per request to the server log so
// slow steps can be found from Render's logs. Cheap enough to leave in.
export function createPageTimer(page: string) {
  const started = Date.now();
  const steps: Record<string, number> = {};
  return {
    async time<T>(label: string, work: PromiseLike<T> | T): Promise<T> {
      const t = Date.now();
      try { return await work; } finally { steps[label] = Date.now() - t; }
    },
    log(extra: Record<string, unknown> = {}) {
      console.log(JSON.stringify({ event: "page_timing", page, total_ms: Date.now() - started, steps, ...extra }));
    },
  };
}

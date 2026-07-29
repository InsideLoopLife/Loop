export type UptimeCheckResult = {
  status: "up" | "down" | "slow" | "failed";
  statusCode?: number | null;
  latencyMs?: number | null;
  error?: string | null;
};

export async function checkUrl(targetUrl: string, timeoutMs = 8000, expectedMin = 200, expectedMax = 399): Promise<UptimeCheckResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(targetUrl, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "user-agent": process.env.LOOP_UPTIME_USER_AGENT || "InsideLoopUptime/0.1",
      },
    });

    const latencyMs = Date.now() - started;
    clearTimeout(timeout);

    if (res.status >= expectedMin && res.status <= expectedMax) {
      return {
        status: latencyMs > timeoutMs * 0.8 ? "slow" : "up",
        statusCode: res.status,
        latencyMs,
      };
    }

    return {
      status: "down",
      statusCode: res.status,
      latencyMs,
      error: `Unexpected HTTP ${res.status}`,
    };
  } catch (error: any) {
    clearTimeout(timeout);
    return {
      status: "failed",
      latencyMs: Date.now() - started,
      error: error?.message || "Request failed",
    };
  }
}

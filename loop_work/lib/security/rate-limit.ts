import { createAdminClient, hasSupabaseAdminKey } from "@/lib/supabase/admin";

type RateLimitArgs = {
  userId: string;
  bucket: string;
  limit: number;
  windowSeconds: number;
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: string;
};

const localBuckets = new Map<string, { count: number; resetAt: number }>();

function localRateLimit({ userId, bucket, limit, windowSeconds }: RateLimitArgs): RateLimitResult {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const resetAt = windowStart + windowMs;
  const key = `${userId}:${bucket}:${windowStart}`;
  const existing = localBuckets.get(key);
  const count = (existing?.resetAt === resetAt ? existing.count : 0) + 1;
  localBuckets.set(key, { count, resetAt });

  for (const [entryKey, entry] of localBuckets) {
    if (entry.resetAt < now) localBuckets.delete(entryKey);
  }

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetAt: new Date(resetAt).toISOString(),
  };
}

export async function enforceUserRateLimit(args: RateLimitArgs): Promise<RateLimitResult> {
  if (!hasSupabaseAdminKey()) return localRateLimit(args);

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("consume_app_rate_limit", {
      p_user_id: args.userId,
      p_bucket: args.bucket,
      p_limit: args.limit,
      p_window_seconds: args.windowSeconds,
    });

    if (error || !Array.isArray(data) || !data[0]) return localRateLimit(args);
    const row = data[0] as { allowed: boolean; remaining: number; reset_at: string };
    return {
      allowed: Boolean(row.allowed),
      remaining: Number(row.remaining || 0),
      resetAt: row.reset_at || new Date(Date.now() + args.windowSeconds * 1000).toISOString(),
    };
  } catch {
    return localRateLimit(args);
  }
}

// On the live site, Next.js hides the message of any error a save throws, so
// people only ever saw a generic failure. Saves wrapped with runFriendly hand
// their message back instead (as { __loopError }), and the save status box
// (components/feedback/SubmissionTray) shows it. Redirects still work.

export type LoopActionError = { __loopError: string };

const TECHNICAL = /violates|constraint|column|relation|syntax|schema cache|null value|invalid input|JSON|undefined|TypeError|fetch failed|PGRST|duplicate key/i;

export function friendlyMessage(message?: string | null) {
  const text = String(message || "").trim();
  if (!text || TECHNICAL.test(text) || text.length > 240) return "Something went wrong saving that. Nothing was changed – please try again.";
  return text;
}

export function isLoopError(value: unknown): value is LoopActionError {
  return Boolean(value && typeof value === "object" && "__loopError" in (value as any));
}

export async function runFriendly<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const digest = String(error?.digest || "");
    if (/^NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR)/.test(digest) || error?.message === "NEXT_REDIRECT") throw error;
    console.error("[save failed]", error);
    return { __loopError: friendlyMessage(error?.message) } as unknown as T;
  }
}

/** In a client component: turn a polite failure back into an error the form can show. */
export function ensureSaved<T>(result: T): T {
  if (isLoopError(result)) throw new Error(result.__loopError);
  return result;
}

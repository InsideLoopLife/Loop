"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ACCESS_COOKIE_NAME, accessCookieValue, accessGateRequired, cookieOptions, recordBetaRedemption, validateAccessCode } from "@/lib/access/beta-gate";

function safeNext(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/login";
}

export async function unlockBetaAccess(formData: FormData) {
  const code = String(formData.get("access_code") || "");
  const next = safeNext(String(formData.get("next") || "/login"));
  if (!accessGateRequired()) redirect(next);

  const result = await validateAccessCode(code);
  if (!result.ok) {
    redirect(`/access?error=1&next=${encodeURIComponent(next)}`);
  }

  const cookieStore = await cookies();
  cookieStore.set(ACCESS_COOKIE_NAME, accessCookieValue(), cookieOptions());

  const headerStore = await headers();
  await recordBetaRedemption({
    codeId: result.codeId,
    source: result.source,
    host: headerStore.get("host"),
    userAgent: headerStore.get("user-agent"),
  });

  redirect(next);
}

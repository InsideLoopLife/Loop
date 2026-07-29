import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE_NAME, accessCookieValue, accessGateRequired, cookieOptions, recordBetaRedemption, validateAccessCode } from "@/lib/access/beta-gate";

export async function POST(request: NextRequest) {
  if (!accessGateRequired()) return NextResponse.json({ ok: true, gateRequired: false });

  let code = "";
  try {
    const body = await request.json();
    code = String(body?.accessCode || body?.access_code || "");
  } catch {
    const formData = await request.formData().catch(() => null);
    code = String(formData?.get("access_code") || formData?.get("accessCode") || "");
  }

  const result = await validateAccessCode(code);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: "invalid_access_code" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ACCESS_COOKIE_NAME, accessCookieValue(), cookieOptions());
  await recordBetaRedemption({
    codeId: result.codeId,
    source: result.source,
    host: request.headers.get("host"),
    userAgent: request.headers.get("user-agent"),
  });
  return response;
}

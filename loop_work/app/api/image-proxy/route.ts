import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function safeImageUrl(raw: string | null) {
  const value = String(raw || "").trim();
  if (!value) return null;
  try {
    const url = new URL(value.startsWith("//") ? `https:${value}` : value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const imageUrl = safeImageUrl(request.nextUrl.searchParams.get("url"));
  if (!imageUrl) return NextResponse.json({ error: "Invalid image URL" }, { status: 400 });

  try {
    const response = await fetch(imageUrl, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 LoopHealth image proxy/1.0",
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.1",
        Referer: new URL(imageUrl).origin,
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) return NextResponse.json({ error: `Image fetch failed: ${response.status}` }, { status: 502 });
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("image/")) return NextResponse.json({ error: "URL did not return an image" }, { status: 415 });

    const length = Number(response.headers.get("content-length") || 0);
    if (length > MAX_IMAGE_BYTES) return NextResponse.json({ error: "Image is too large" }, { status: 413 });

    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_IMAGE_BYTES) return NextResponse.json({ error: "Image is too large" }, { status: 413 });

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return NextResponse.json({ error: "Image proxy failed" }, { status: 502 });
  }
}

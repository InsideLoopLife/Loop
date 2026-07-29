import { NextRequest } from "next/server";

export const runtime = "nodejs";

function simpleSvg(message: string) {
  const safe = message.replace(/[<>&"]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[ch] || ch));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240"><rect width="240" height="240" rx="24" fill="#f8fafc"/><rect x="16" y="16" width="208" height="208" rx="20" fill="#fff" stroke="#cbd5e1"/><text x="120" y="104" text-anchor="middle" font-family="Arial" font-size="16" font-weight="700" fill="#0f172a">QR unavailable</text><text x="120" y="130" text-anchor="middle" font-family="Arial" font-size="11" fill="#64748b">Use join link below</text><text x="120" y="156" text-anchor="middle" font-family="Arial" font-size="8" fill="#94a3b8">${safe.slice(0, 80)}</text></svg>`;
}

export async function GET(request: NextRequest) {
  const data = request.nextUrl.searchParams.get("data") || "";
  if (!data || data.length > 2048) return new Response("Invalid QR data", { status: 400 });

  // Keep this dependency-free so local builds do not fail if optional QR packages are absent.
  // The image is served by a public QR endpoint; if that endpoint is unavailable, the route
  // returns a readable SVG fallback rather than crashing the app.
  const qrUrl = new URL("https://api.qrserver.com/v1/create-qr-code/");
  qrUrl.searchParams.set("size", "240x240");
  qrUrl.searchParams.set("format", "svg");
  qrUrl.searchParams.set("data", data);

  try {
    const response = await fetch(qrUrl.toString(), { cache: "no-store" });
    if (response.ok) {
      const svg = await response.text();
      return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" } });
    }
  } catch (error) {
    console.warn("[qr] external QR generation unavailable", error);
  }

  return new Response(simpleSvg(data), { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" } });
}

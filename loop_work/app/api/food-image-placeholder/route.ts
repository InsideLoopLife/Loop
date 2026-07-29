import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function initials(label: string) {
  return label.split(/\s+/).filter(Boolean).slice(0, 3).map((part) => part[0]?.toUpperCase() || "").join("") || "LH";
}

export async function GET(request: NextRequest) {
  const label = String(request.nextUrl.searchParams.get("label") || "Food").slice(0, 80);
  const safeLabel = escapeXml(label);
  const safeInitials = escapeXml(initials(label));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="620" viewBox="0 0 900 620" role="img" aria-label="${safeLabel}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ecfdf5"/><stop offset="0.55" stop-color="#fef3c7"/><stop offset="1" stop-color="#fed7aa"/></linearGradient>
      <radialGradient id="shine" cx="25%" cy="20%" r="60%"><stop offset="0" stop-color="#ffffff" stop-opacity="0.9"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="28" stdDeviation="28" flood-color="#0f172a" flood-opacity="0.18"/></filter>
    </defs>
    <rect width="900" height="620" rx="54" fill="url(#bg)"/>
    <rect width="900" height="620" rx="54" fill="url(#shine)"/>
    <circle cx="450" cy="260" r="118" fill="#ffffff" fill-opacity="0.74" filter="url(#shadow)"/>
    <circle cx="450" cy="260" r="82" fill="#020617" fill-opacity="0.92"/>
    <text x="450" y="283" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="52" font-weight="900" fill="#ffffff">${safeInitials}</text>
    <text x="450" y="438" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="900" fill="#020617">${safeLabel}</text>
    <text x="450" y="482" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="700" fill="#475569">LoopHealth image suggestion</text>
  </svg>`;
  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}

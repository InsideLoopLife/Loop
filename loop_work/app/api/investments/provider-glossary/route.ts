import { NextResponse } from "next/server";
import { PROVIDER_GLOSSARY, findProvider } from "@/lib/investments/provider-glossary";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const kind = searchParams.get("kind");
  let providers = PROVIDER_GLOSSARY;
  if (q) {
    const found = findProvider(q);
    providers = found ? [found] : PROVIDER_GLOSSARY.filter((provider) => `${provider.name} ${provider.aliases.join(" ")}`.toLowerCase().includes(q.toLowerCase()));
  }
  if (kind === "pension" || kind === "investment") {
    providers = providers.filter((provider) => provider.category === kind || provider.category === "both");
  }
  return NextResponse.json({ providers, lastChecked: new Date().toISOString() });
}

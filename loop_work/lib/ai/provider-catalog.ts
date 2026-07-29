export type LoopAiProviderKey = "openai" | "anthropic" | "google" | "manual";

export type LoopAiProviderOption = {
  key: LoopAiProviderKey;
  label: string;
  envKey: string;
  models: string[];
  notes: string;
};

export const LOOP_AI_PROVIDER_CATALOG: LoopAiProviderOption[] = [
  {
    key: "openai",
    label: "OpenAI / GPT",
    envKey: "OPENAI_API_KEY",
    models: ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini", "gpt-4o"],
    notes: "Default LOOP lane for quick help, nutrition, profile insights and vision where configured.",
  },
  {
    key: "anthropic",
    label: "Anthropic / Claude",
    envKey: "ANTHROPIC_API_KEY",
    models: ["claude-3-5-haiku-latest", "claude-3-5-sonnet-latest", "claude-3-7-sonnet-latest"],
    notes: "Good candidate for longer reasoning, security reviews and structured code diagnostics.",
  },
  {
    key: "google",
    label: "Google / Gemini",
    envKey: "GOOGLE_AI_API_KEY",
    models: ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash"],
    notes: "Useful as an alternative provider for fast categorisation, large-context review and fallback routing.",
  },
  {
    key: "manual",
    label: "Manual / no API",
    envKey: "MANUAL_REVIEW_ONLY",
    models: ["manual-review"],
    notes: "Keeps the lane disabled for automated generation and routes work to admin review.",
  },
];

export function providerByKey(provider?: string | null) {
  return LOOP_AI_PROVIDER_CATALOG.find((entry) => entry.key === provider) || LOOP_AI_PROVIDER_CATALOG[0];
}

export function modelsForProvider(provider?: string | null) {
  return providerByKey(provider).models;
}

export function envForProvider(provider?: string | null) {
  return providerByKey(provider).envKey;
}

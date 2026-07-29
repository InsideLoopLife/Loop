"use client";

import { useMemo, useState } from "react";
import { LOOP_AI_PROVIDER_CATALOG, envForProvider, modelsForProvider } from "@/lib/ai/provider-catalog";
import type { LoopAiTaskKind } from "@/lib/ai/model-routing";

type AiRoute = {
  route_key: string;
  display_name: string;
  task_kind: LoopAiTaskKind;
  default_model: string;
  fallback_model: string | null;
  default_api_key_env: string;
  recommended_effort: string | null;
  notes: string | null;
  billing_scope?: string | null;
};

type TierAiConfig = {
  id?: string;
  tier_key: string;
  route_key: string;
  provider: string;
  model: string;
  api_key_env_name: string;
  daily_limit: number | null;
  monthly_budget_pence: number | null;
  enabled: boolean;
  notes: string | null;
};

export function ProviderModelFields({
  providerName = "provider",
  modelName = "model",
  apiKeyName = "api_key_env_name",
  defaultProvider = "openai",
  defaultModel,
  defaultApiKeyEnv,
}: {
  providerName?: string;
  modelName?: string;
  apiKeyName?: string;
  defaultProvider?: string | null;
  defaultModel?: string | null;
  defaultApiKeyEnv?: string | null;
}) {
  const initialProvider = LOOP_AI_PROVIDER_CATALOG.some((entry) => entry.key === defaultProvider) ? String(defaultProvider) : "openai";
  const [provider, setProvider] = useState(initialProvider);
  const models = useMemo(() => modelsForProvider(provider), [provider]);
  const selectedModel = defaultModel && models.includes(defaultModel) ? defaultModel : models[0];
  const apiEnv = provider === initialProvider && defaultApiKeyEnv ? defaultApiKeyEnv : envForProvider(provider);

  return (
    <>
      <select
        name={providerName}
        value={provider}
        onChange={(event) => setProvider(event.target.value)}
        className="rounded-2xl border border-slate-200 px-4 py-3 font-bold"
      >
        {LOOP_AI_PROVIDER_CATALOG.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
      </select>
      <select name={modelName} defaultValue={selectedModel} className="rounded-2xl border border-slate-200 px-4 py-3 font-bold">
        {models.map((model) => <option key={model} value={model}>{model}</option>)}
      </select>
      <input name={apiKeyName} key={`${provider}-${apiEnv}`} defaultValue={apiEnv} placeholder={envForProvider(provider)} className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
      <p className="text-xs font-bold text-slate-500 md:col-span-3">
        Key hint: add the secret to your hosting environment as <code>{apiEnv}</code>. LOOP stores the env variable name here, not the secret value.
      </p>
    </>
  );
}

export function TierAiRouteForm({
  tierKey,
  route,
  existing,
  action,
}: {
  tierKey: string;
  route: AiRoute;
  existing?: TierAiConfig;
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <form action={action} className="grid gap-3 rounded-3xl bg-white p-4 md:grid-cols-3">
      <input type="hidden" name="tier_key" value={tierKey} />
      <input type="hidden" name="route_key" value={route.route_key} />
      <div className="md:col-span-3">
        <p className="font-black text-slate-950">{route.display_name}</p>
        <p className="text-xs font-bold text-slate-500">{route.notes || "Customer AI lane."}</p>
      </div>
      <ProviderModelFields defaultProvider={existing?.provider || "openai"} defaultModel={existing?.model || route.default_model} defaultApiKeyEnv={existing?.api_key_env_name || route.default_api_key_env} />
      <input name="daily_limit" type="number" min="0" defaultValue={existing?.daily_limit ?? ""} placeholder="Per-user daily requests" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
      <input name="monthly_budget_pence" type="number" min="0" defaultValue={existing?.monthly_budget_pence ?? ""} placeholder="Per-user monthly budget pence" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
      <label className="flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-3 font-bold"><input type="checkbox" name="enabled" defaultChecked={existing?.enabled ?? true} /> Enabled</label>
      <textarea name="notes" defaultValue={existing?.notes || ""} placeholder="Why this tier uses this model/key" className="min-h-20 rounded-2xl border border-slate-200 px-4 py-3 font-bold md:col-span-3" />
      <button className="rounded-2xl bg-slate-950 px-5 py-3 font-black text-white md:col-span-3">Save AI lane</button>
    </form>
  );
}

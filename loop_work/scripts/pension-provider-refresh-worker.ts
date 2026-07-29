import { createWorkerDatabaseClient } from "@/platform/database/worker-client";
import { runPensionProviderRefresh } from "@/lib/investments/pension-provider-refresh";

async function main() {
  const result = await runPensionProviderRefresh(createWorkerDatabaseClient("wealth"), { logger: console });
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[pension-provider-refresh-worker] failed", error);
  process.exit(1);
});

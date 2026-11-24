// Runs once when the server starts.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { installOpenAiGuard } = await import("./lib/ai/openai-guard");
    installOpenAiGuard();
  }
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { loadAppSecrets } = await import("./lib/app-secrets");
  await loadAppSecrets();
  // On serverless hosting (Vercel) there is no long-running process: sync jobs run right after the request instead.
  if (process.env.DISABLE_SYNC_WORKER !== "1" && !process.env.VERCEL) {
    const { startSyncWorker } = await import("./lib/sync/engine");
    startSyncWorker(5_000);
  }
}

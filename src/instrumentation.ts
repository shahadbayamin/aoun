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

/** Keep the last server errors (message + route) so /api/health can show them on hosted deployments. */
export async function onRequestError(err: unknown, request: { path: string }) {
  try {
    if (process.env.NEXT_RUNTIME !== "nodejs") return;
    const { default: pg } = await import("pg");
    const { pickDatabaseUrl } = await import("./lib/db-url");
    const c = new pg.Client({ connectionString: pickDatabaseUrl() });
    await c.connect();
    await c.query(`CREATE TABLE IF NOT EXISTS "ServerError" (id serial PRIMARY KEY, at timestamptz DEFAULT now(), path text, message text)`);
    const e = err as Error;
    await c.query(`INSERT INTO "ServerError"(path, message) VALUES ($1, $2)`, [request.path, `${e?.message ?? String(err)}\n${(e?.stack ?? "").split("\n").slice(0, 6).join("\n")}`.slice(0, 2000)]);
    await c.end();
  } catch {}
}

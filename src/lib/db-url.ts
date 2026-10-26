/**
 * The database URL. Vercel databases (Prisma Postgres, Neon) expose several variables, sometimes with a custom
 * prefix (e.g. STORAGE_URL); the app needs a plain postgres:// connection string, so the first one found is used.
 */
export function pickDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const plain = (u?: string) => !!u && /^postgres(ql)?:\/\//.test(u);
  const named = [env.DATABASE_URL, env.POSTGRES_URL, env.DATABASE_URL_UNPOOLED, env.POSTGRES_URL_NON_POOLING];
  const any = Object.keys(env).filter((k) => /(_URL|DATABASE_URL)$/.test(k)).sort().map((k) => env[k]);
  return [...named, ...any].find(plain);
}

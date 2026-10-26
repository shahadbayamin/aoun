import { NextResponse } from "next/server";
import { pickDatabaseUrl } from "@/lib/db-url";

export const dynamic = "force-dynamic";

/** Health check: is the database reachable from the running site? (no secrets in the answer) */
export async function GET() {
  const out: Record<string, unknown> = { vercel: !!process.env.VERCEL, dbUrlFound: !!pickDatabaseUrl(), secretsLoaded: !!process.env.SECRETS_ENCRYPTION_KEY };
  out.envNames = Object.keys(process.env).filter((k) => /URL|POSTGRES|PRISMA|DATABASE/.test(k)).sort();
  try {
    const { default: pg } = await import("pg");
    const c = new pg.Client({ connectionString: pickDatabaseUrl() });
    await c.connect();
    out.pg = (await c.query(`SELECT count(*)::int AS n FROM "Hospital"`)).rows[0].n;
    await c.end();
  } catch (e) {
    out.pgError = String((e as Error).message).replace(/postgres(ql)?:\/\/\S+/g, "<url>");
  }
  try {
    const { prisma } = await import("@/lib/db");
    out.prisma = await prisma.hospital.count();
  } catch (e) {
    out.prismaError = String((e as Error).message).replace(/postgres(ql)?:\/\/\S+/g, "<url>").slice(0, 800);
  }
  return NextResponse.json(out, { status: out.prismaError || out.pgError ? 500 : 200 });
}

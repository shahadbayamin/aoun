import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Health check: the site is up and the database answers. */
export async function GET() {
  try {
    const { prisma } = await import("@/lib/db");
    const hospitals = await prisma.hospital.count();
    return NextResponse.json({ ok: true, database: "ok", hospitals });
  } catch {
    return NextResponse.json({ ok: false, database: "unreachable" }, { status: 503 });
  }
}

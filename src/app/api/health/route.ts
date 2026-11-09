import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Health check: the site is up and the database answers. */
export async function GET() {
  try {
    const { prisma } = await import("@/lib/db");
    const hospitals = await prisma.hospital.count();
    return NextResponse.json({ ok: true, database: "ok", hospitals });
  } catch (e) {
    const reason = String((e as Error)?.message ?? e).replace(/postgres(ql)?:\/\/\S+/g, "<url>").split("\n").filter(Boolean).slice(-3).join(" ").slice(0, 300);
    return NextResponse.json({ ok: false, database: "unreachable", reason }, { status: 503 });
  }
}

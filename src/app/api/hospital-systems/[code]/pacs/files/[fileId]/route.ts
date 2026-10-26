import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { verifyFileToken } from "@/lib/hospital-system/pacs";
import { sendFile } from "@/lib/send-file";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Simulated hospital PACS retrieval endpoint (WADO-style). Lives "inside" the hospital system:
 * a file can only be pulled with a short-lived token signed by that hospital for that file,
 * and only once the study is APPROVED.
 */
export async function GET(req: Request, { params }: { params: Promise<{ code: string; fileId: string }> }) {
  const { code, fileId } = await params;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const hospital = await prisma.hospital.findUnique({ where: { code } });
  if (!hospital || !token || !verifyFileToken(hospital.apiSecretEnc, fileId, token)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const f = await prisma.sourceFile.findFirst({ where: { id: fileId, sourceStudy: { hospitalId: hospital.id, status: "APPROVED" } } });
  if (!f || !(await storage.exists(f.storageKey))) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return sendFile(req, await storage.get(f.storageKey), f.mimeType, f.fileName, true);
}

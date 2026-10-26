import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";

const ALLOWED: Record<string, string> = {
  "demo-mri-brain.dcm": "application/dicom",
  "demo-mri-cine.mp4": "video/mp4",
  "demo-mri-brain.png": "image/png",
  "demo-mri-report.pdf": "application/pdf",
  "demo-chest-xray.dcm": "application/dicom",
  "demo-chest-xray.jpg": "image/jpeg",
  "demo-chest-report.pdf": "application/pdf",
};

/** DEMO MODE ONLY: download synthetic sample files to upload in the Hospital A portal. */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!env.demoMode || !ALLOWED[name]) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const buf = await fs.readFile(path.join(process.cwd(), "demo-assets", name));
  return new Response(new Uint8Array(buf), { headers: { "content-type": ALLOWED[name], "content-disposition": `attachment; filename="${name}"` } });
}

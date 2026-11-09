import { NextResponse } from "next/server";
import { verifyHospitalRequest } from "@/lib/integration/hmac";
import { ingestStudy } from "@/lib/integration/receive";
import { INTEGRATION_PATH } from "@/lib/sync/engine";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Aoun integration API — participating hospitals push APPROVED imaging studies here.
 * Auth: HMAC-SHA256 signed request (see src/lib/integration/hmac.ts). Idempotent on event id + Study Instance UID.
 * 201 = linked, 200 = duplicate (already linked), 202 = received but quarantined, 4xx/5xx = rejected / retryable.
 */
export async function POST(req: Request) {
  const body = await req.text();
  if (body.length > 1_000_000) return NextResponse.json({ error: "PAYLOAD_TOO_LARGE", retryable: false }, { status: 413 });
  try {
    const { hospital, eventId } = await verifyHospitalRequest(req, INTEGRATION_PATH, body);
    rateLimit(`integration:${hospital.code}`, 120, 60_000);
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      return NextResponse.json({ error: "INVALID_JSON", retryable: false }, { status: 400 });
    }
    const r = await ingestStudy(hospital, eventId, json);
    return NextResponse.json(r.body, { status: r.httpStatus });
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 401 || e.status === 403) {
        await audit({
          actor: { label: `unverified:${req.headers.get("x-taree-hospital") ?? "unknown"}`, role: "HOSPITAL_SYSTEM" },
          action: "INTEGRATION_AUTH_FAILED",
          outcome: "DENIED",
          details: { code: e.code },
        });
      }
      return NextResponse.json({ error: e.code, message: e.message, retryable: e.status === 429, ...e.extra }, { status: e.status });
    }
    console.error("[integration] error", e);
    return NextResponse.json({ error: "INTERNAL", retryable: true }, { status: 500 });
  }
}

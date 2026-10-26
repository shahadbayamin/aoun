import { z } from "zod";
import { route, parseJson } from "@/lib/api";
import { erCtx } from "@/lib/portal-ctx";
import { resolveQr } from "@/lib/qr";
import { grantFromQrScan } from "@/lib/access-flow";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Hospital B scans the patient's QR: verified doctor → token validated (short-lived, single-use)
 * → patient resolved internally → time-limited access grant → doctor goes straight to the record.
 */
export const POST = route(async (req) => {
  const { payload } = await parseJson(req, z.object({ payload: z.string().min(4).max(300) }));
  const { ctx, actor } = await erCtx("QR_RESOLVE");
  rateLimit(`qr-resolve:${ctx.pro.id}`, 20, 60_000);
  const scan = await resolveQr(payload, { actor, professionalId: ctx.pro.id, hospitalId: ctx.hospital.id });
  const grant = await grantFromQrScan(ctx, actor, scan.id);
  return { grantId: grant.id, redirect: `/er/record/${grant.id}` };
});

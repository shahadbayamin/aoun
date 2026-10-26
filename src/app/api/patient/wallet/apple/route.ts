import { route } from "@/lib/api";
import { patientCtx } from "@/lib/portal-ctx";
import { buildApplePass } from "@/lib/wallet";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";

export const runtime = "nodejs";

/** The patient's card as an Apple Wallet pass (.pkpass) — opening it on an iPhone shows "Add to Apple Wallet". */
export const GET = route(async () => {
  const { patient, actor } = await patientCtx();
  const buf = await buildApplePass(patient.id);
  if (!buf) throw new ApiError(503, "WALLET_NOT_CONFIGURED", "Apple Wallet غير مفعّل بعد (يحتاج شهادة Apple Developer) / Apple Wallet is not set up yet");
  await audit({ actor, action: "WALLET_PASS_ISSUED", patientId: patient.id, details: { wallet: "apple" } });
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "application/vnd.apple.pkpass", "Content-Disposition": 'attachment; filename="aoun.pkpass"', "Cache-Control": "no-store" },
  });
});

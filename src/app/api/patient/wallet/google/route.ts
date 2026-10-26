import { route } from "@/lib/api";
import { patientCtx } from "@/lib/portal-ctx";
import { googleSaveUrl } from "@/lib/wallet";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";

/** A signed "Save to Google Wallet" link for the patient's card. */
export const POST = route(async () => {
  const { patient, actor } = await patientCtx();
  const url = await googleSaveUrl(patient.id);
  if (!url) throw new ApiError(503, "WALLET_NOT_CONFIGURED", "Google Wallet غير مفعّل بعد (يحتاج حساب Google Wallet للمطوّرين) / Google Wallet is not set up yet");
  await audit({ actor, action: "WALLET_PASS_ISSUED", patientId: patient.id, details: { wallet: "google" } });
  return { url };
});

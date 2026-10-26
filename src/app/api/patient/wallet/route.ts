import { route } from "@/lib/api";
import { patientCtx } from "@/lib/portal-ctx";
import { appleConfig, googleConfig } from "@/lib/wallet";

/** Which wallets are ready on this server (Apple needs a signing certificate, Google an issuer account). */
export const GET = route(async () => {
  await patientCtx();
  return { apple: !!appleConfig(), google: !!googleConfig() };
});

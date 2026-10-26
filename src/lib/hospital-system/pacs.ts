import { decryptSecret, hmacHex, safeEqual } from "../crypto";
import { env } from "../env";

/**
 * Simulated hospital PACS (DICOMweb/WADO-style retrieval).
 * Each file is retrievable only with a short-lived token signed with the hospital's secret,
 * issued per synchronization attempt. In production this is the hospital's DICOMweb endpoint
 * behind its integration gateway (mTLS + OAuth2 client credentials).
 */
const TOKEN_TTL_MS = 10 * 60_000;

export function pacsFileUrl(hospitalCode: string, fileId: string) {
  return `${env.appUrl}/api/hospital-systems/${hospitalCode}/pacs/files/${fileId}`;
}

export function pacsUrlPrefix(hospitalCode: string) {
  return `${env.appUrl}/api/hospital-systems/${hospitalCode}/pacs/files/`;
}

export function issueFileToken(apiSecretEnc: string, fileId: string) {
  const exp = Date.now() + TOKEN_TTL_MS;
  return `${exp}.${hmacHex(decryptSecret(apiSecretEnc), `pacs:${fileId}:${exp}`)}`;
}

export function verifyFileToken(apiSecretEnc: string, fileId: string, token: string) {
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!sig || !Number.isFinite(exp) || exp < Date.now()) return false;
  return safeEqual(hmacHex(decryptSecret(apiSecretEnc), `pacs:${fileId}:${exp}`), sig);
}

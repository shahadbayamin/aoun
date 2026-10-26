import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "./db";
import { env } from "./env";
import { sha256 } from "./crypto";
import { publicBaseUrl } from "./public-url";
import { ageFrom } from "./labels";
import forge from "node-forge";

/**
 * The patient's card saved in Apple Wallet / Google Wallet.
 * Its QR is a permanent link (<public-url>/w/<token>) that only opens the record for a signed-in doctor.
 * The token is derived from a server secret (so Apple and Google passes carry the same code) and only its hash is stored.
 */
export function walletToken(patientId: string) {
  return crypto.createHmac("sha256", env.secretsKey).update(`aoun-wallet:v1:${patientId}`).digest("base64url").slice(0, 32);
}

export async function ensureWalletToken(patientId: string) {
  const token = walletToken(patientId);
  const hash = sha256(token);
  await prisma.patient.update({ where: { id: patientId }, data: { walletTokenHash: hash } });
  return { token, url: `${publicBaseUrl()}/w/${token}` };
}

export async function patientByWalletToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  return prisma.patient.findUnique({ where: { walletTokenHash: sha256(token) } });
}

/** What the wallet card shows. */
export async function walletCardData(patientId: string) {
  const p = await prisma.patient.findUniqueOrThrow({
    where: { id: patientId },
    include: { profile: true, allergies: true, conditions: true },
  });
  return {
    id: p.id,
    nameAr: p.fullNameAr,
    nameEn: p.fullNameEn,
    maskedId: p.maskedId,
    age: ageFrom(p.dateOfBirth),
    sex: p.sex,
    bloodType: p.profile?.bloodType ?? null,
    allergies: p.allergies.map((a) => a.substance),
    conditions: p.conditions.map((c) => c.name),
    contact: p.profile?.emergencyContactName ? `${p.profile.emergencyContactName}${p.profile.emergencyContactPhone ? ` · ${p.profile.emergencyContactPhone}` : ""}` : null,
  };
}

const readIf = (p?: string) => {
  if (!p) return null;
  const abs = path.isAbsolute(p) ? p : path.join(process.cwd(), p);
  return fs.existsSync(abs) ? fs.readFileSync(abs) : null;
};

/* ───────────── Apple Wallet (.pkpass) ───────────── */

/**
 * Apple only accepts passes signed with a Pass Type ID certificate from an Apple Developer account.
 * Put the files in <aoun>/wallet/apple/: pass.p12 (exported from Keychain) + AppleWWDRCAG4.cer (or PEM files),
 * and set APPLE_PASS_TYPE_ID, APPLE_TEAM_ID (and APPLE_PASS_P12_PASSWORD) in .env.
 */
export function appleConfig() {
  const dir = path.join(process.cwd(), "wallet", "apple");
  const passTypeIdentifier = process.env.APPLE_PASS_TYPE_ID;
  const teamIdentifier = process.env.APPLE_TEAM_ID;
  if (!passTypeIdentifier || !teamIdentifier) return null;
  let cert = readIf(process.env.APPLE_PASS_CERT || path.join(dir, "pass.pem"));
  let key = readIf(process.env.APPLE_PASS_KEY || path.join(dir, "pass.key"));
  let passphrase = process.env.APPLE_PASS_KEY_PASSPHRASE || undefined;
  try {
    const p12 = !cert || !key ? readIf(process.env.APPLE_PASS_P12 || path.join(dir, "pass.p12")) : null;
    if (p12) {
      const pk = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(p12.toString("binary")), process.env.APPLE_PASS_P12_PASSWORD ?? "");
      const c = pk.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0]?.cert;
      const k = pk.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]?.key;
      if (c && k) { cert = Buffer.from(forge.pki.certificateToPem(c)); key = Buffer.from(forge.pki.privateKeyToPem(k)); passphrase = undefined; }
    }
    let wwdr = readIf(process.env.APPLE_WWDR_CERT || path.join(dir, "wwdr.pem"));
    if (!wwdr) {
      const cer = fs.existsSync(dir) ? fs.readdirSync(dir).find((f) => /^AppleWWDR.*\.cer$/i.test(f) || f === "wwdr.cer") : undefined;
      if (cer) wwdr = Buffer.from(forge.pki.certificateToPem(forge.pki.certificateFromAsn1(forge.asn1.fromDer(fs.readFileSync(path.join(dir, cer)).toString("binary")))));
    }
    if (!cert || !key || !wwdr) return null;
    return { cert, key, wwdr, passphrase, passTypeIdentifier, teamIdentifier };
  } catch (e) {
    console.error("[wallet] Apple certificate could not be read", e);
    return null;
  }
}

const asset = (name: string) => fs.readFileSync(path.join(process.cwd(), "public", "wallet", name));

export async function buildApplePass(patientId: string) {
  const cfg = appleConfig();
  if (!cfg) return null;
  const { PKPass } = await import("passkit-generator");
  const d = await walletCardData(patientId);
  const { url } = await ensureWalletToken(patientId);
  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: cfg.passTypeIdentifier,
    teamIdentifier: cfg.teamIdentifier,
    serialNumber: `aoun-${d.id}`,
    organizationName: "عون · Aoun",
    description: "بطاقة عون الطبية",
    logoText: "عون",
    foregroundColor: "rgb(255,255,255)",
    labelColor: "rgb(204,236,238)",
    backgroundColor: "rgb(8,127,140)",
    sharingProhibited: true,
    generic: {
      primaryFields: [{ key: "name", label: "المريض", value: d.nameAr }],
      secondaryFields: [
        { key: "blood", label: "فصيلة الدم", value: d.bloodType ?? "—" },
        { key: "age", label: "العمر", value: `${d.age} سنة` },
      ],
      auxiliaryFields: [{ key: "allergies", label: "الحساسية", value: d.allergies.join("، ") || "لا توجد" }],
      backFields: [
        { key: "nameEn", label: "Name", value: d.nameEn },
        { key: "id", label: "رقم الهوية", value: d.maskedId },
        { key: "conditions", label: "الأمراض المزمنة", value: d.conditions.join("، ") || "لا توجد" },
        { key: "allergiesB", label: "الحساسية", value: d.allergies.join("، ") || "لا توجد" },
        ...(d.contact ? [{ key: "contact", label: "جهة الاتصال للطوارئ", value: d.contact }] : []),
        { key: "how", label: "للطبيب", value: "امسح الرمز ثم سجّل دخولك في عون لفتح ملف المريض." },
      ],
    },
    barcodes: [{ format: "PKBarcodeFormatQR", message: url, messageEncoding: "iso-8859-1", altText: "عون" }],
  };
  const pass = new PKPass(
    {
      "pass.json": Buffer.from(JSON.stringify(passJson)),
      "icon.png": asset("icon.png"),
      "icon@2x.png": asset("icon@2x.png"),
      "logo.png": asset("logo.png"),
      "logo@2x.png": asset("logo@2x.png"),
    },
    { signerCert: cfg.cert, signerKey: cfg.key, signerKeyPassphrase: cfg.passphrase, wwdr: cfg.wwdr },
  );
  return pass.getAsBuffer();
}

/* ───────────── Google Wallet ("Save to Google Wallet" link) ───────────── */

/** Needs a free Google Wallet issuer account + a service-account key (JSON). */
export function googleConfig() {
  const raw = readIf(process.env.GOOGLE_WALLET_KEY_FILE || path.join("wallet", "google", "service-account.json"));
  const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID;
  if (!raw || !issuerId) return null;
  try {
    const sa = JSON.parse(raw.toString("utf8")) as { client_email: string; private_key: string };
    if (!sa.client_email || !sa.private_key) return null;
    return { issuerId, email: sa.client_email, privateKey: sa.private_key };
  } catch {
    return null;
  }
}

export async function googleSaveUrl(patientId: string) {
  const cfg = googleConfig();
  if (!cfg) return null;
  const d = await walletCardData(patientId);
  const { url } = await ensureWalletToken(patientId);
  const classId = `${cfg.issuerId}.aoun_medical_card`;
  const objectId = `${cfg.issuerId}.aoun_${d.id.replace(/[^A-Za-z0-9_.-]/g, "_")}`;
  const lv = (ar: string, en: string) => ({ defaultValue: { language: "ar", value: ar }, translatedValues: [{ language: "en", value: en }] });
  const payload = {
    iss: cfg.email,
    aud: "google",
    typ: "savetowallet",
    iat: Math.floor(Date.now() / 1000),
    origins: [] as string[],
    payload: {
      genericClasses: [{ id: classId }],
      genericObjects: [
        {
          id: objectId,
          classId,
          state: "ACTIVE",
          hexBackgroundColor: "#087F8C",
          cardTitle: lv("عون · البطاقة الطبية", "Aoun · Medical card"),
          subheader: lv("المريض", "Patient"),
          header: lv(d.nameAr, d.nameEn),
          textModulesData: [
            { id: "blood", header: "فصيلة الدم", body: d.bloodType ?? "—" },
            { id: "age", header: "العمر", body: `${d.age} سنة` },
            { id: "allergies", header: "الحساسية", body: d.allergies.join("، ") || "لا توجد" },
            { id: "conditions", header: "الأمراض المزمنة", body: d.conditions.join("، ") || "لا توجد" },
            ...(d.contact ? [{ id: "contact", header: "جهة الاتصال للطوارئ", body: d.contact }] : []),
          ],
          barcode: { type: "QR_CODE", value: url, alternateText: "عون" },
        },
      ],
    },
  };
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64(payload)}`;
  const sig = crypto.createSign("RSA-SHA256").update(unsigned).sign(cfg.privateKey).toString("base64url");
  return `https://pay.google.com/gp/v/save/${unsigned}.${sig}`;
}

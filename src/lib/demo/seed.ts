import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { PrismaClient, FileFormat } from "@prisma/client";
import { encryptSecret, hashIdentifier, idTypeFor, maskId, sha256 } from "../crypto";
import { env } from "../env";
import { storage } from "../storage";
import { MIME } from "../files";
import { hospitalIdHash } from "../hospital-system/ris";

/**
 * FICTIONAL DEMONSTRATION DATA ONLY.
 * All names, identifiers, hospitals and clinical details below are invented.
 * National IDs follow the 10-digit format but are not real identities.
 */
export const DEMO_PASSWORD = "Aoun@2026";

export const DEMO = {
  hospitals: {
    A: { code: "HOSP-A", nameAr: "مستشفى الأمل التخصصي", nameEn: "Al-Amal Specialist Hospital", city: "Riyadh", type: "PUBLIC" as const },
    B: { code: "HOSP-B", nameAr: "مستشفى الشفاء العام", nameEn: "Al-Shifa General Hospital", city: "Jeddah", type: "PRIVATE" as const },
    C: { code: "HOSP-C", nameAr: "مدينة النور الطبية", nameEn: "Al-Noor Medical City", city: "Dammam", type: "PUBLIC" as const },
    X: { code: "HOSP-X", nameAr: "عيادة الرازي", nameEn: "Al-Razi Clinic", city: "Abha", type: "PRIVATE" as const, inactive: true },
  },
  patients: {
    sara: { nationalId: "1098765432", nameAr: "سارة أحمد القحطاني", nameEn: "Sara Ahmed Al-Qahtani", dob: "1990-04-12", sex: "FEMALE" as const, phone: "0500000001", account: true },
    khalid: { nationalId: "1087654321", nameAr: "خالد عمر الحربي", nameEn: "Khalid Omar Al-Harbi", dob: "1978-11-03", sex: "MALE" as const, phone: "0500000002", account: true },
    faisal: { nationalId: "1076543210", nameAr: "فيصل ناصر الدوسري", nameEn: "Faisal Nasser Al-Dosari", dob: "1969-08-30", sex: "MALE" as const, phone: "0500000003", account: true },
    // Has a verified identity in the (dev) identity provider but no Aoun account yet → use for live registration.
    mohammed: { nationalId: "2123456789", nameAr: "محمد رحمن خان", nameEn: "Mohammed Rahman Khan", dob: "1985-02-20", sex: "MALE" as const, phone: "0500000004", account: false },
  },
  staff: {
    radiologist: { email: "huda@alamal.med", nameAr: "د. هدى السبيعي", nameEn: "Dr. Huda Al-Subaie", license: "SCFHS-DEMO-R-1001" },
    erDoctor: { email: "fahad@alshifa.med", nameAr: "د. فهد العتيبي", nameEn: "Dr. Fahad Al-Otaibi", license: "SCFHS-DEMO-E-2001" },
    erDoctor2: { email: "reem@alshifa.med", nameAr: "د. ريم الشمري", nameEn: "Dr. Reem Al-Shammari", license: "SCFHS-DEMO-E-2002" },
    unverified: { email: "majed@alshifa.med", nameAr: "د. ماجد الزهراني", nameEn: "Dr. Majed Al-Zahrani", license: "SCFHS-DEMO-E-9999" },
    admin: { email: "admin@aoun.med", nameAr: "مشرف منصة عون", nameEn: "Aoun Platform Admin" },
  },
};

const ASSETS = path.join(process.cwd(), "demo-assets");

async function wipe(prisma: PrismaClient) {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename::text AS tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations', '_taree_migrations', 'AppSecret')`;
  if (tables.length) {
    await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"public"."${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  }
  await fs.rm(path.resolve(env.storageDir), { recursive: true, force: true });
}

export async function seedDemo(prisma: PrismaClient, log: (m: string) => void = () => {}) {
  await wipe(prisma);
  const pw = await bcrypt.hash(DEMO_PASSWORD, 10);
  const d = (s: string) => new Date(s + "T00:00:00.000Z");

  // ── Hospitals
  const H: Record<string, { id: string; code: string; nameEn: string; nameAr: string }> = {};
  for (const [k, h] of Object.entries(DEMO.hospitals)) {
    H[k] = await prisma.hospital.create({
      data: {
        code: h.code,
        nameAr: h.nameAr,
        nameEn: h.nameEn,
        city: h.city,
        type: h.type,
        isActive: !("inactive" in h),
        apiSecretEnc: encryptSecret(crypto.randomBytes(32).toString("base64url")),
      },
    });
  }
  log("hospitals");

  // ── Dev identity provider + patients
  const P: Record<string, { id: string; userId: string | null }> = {};
  for (const [k, p] of Object.entries(DEMO.patients)) {
    const idType = idTypeFor(p.nationalId);
    await prisma.devIdentityRecord.create({
      data: {
        idType,
        identifierHash: hashIdentifier(idType, p.nationalId),
        maskedId: maskId(p.nationalId),
        fullNameAr: p.nameAr,
        fullNameEn: p.nameEn,
        dateOfBirth: d(p.dob),
        sex: p.sex,
        phone: p.phone,
      },
    });
    if (!p.account) continue;
    const user = await prisma.user.create({
      data: { role: "PATIENT", username: hashIdentifier(idType, p.nationalId), passwordHash: pw, displayName: p.nameAr, phone: p.phone },
    });
    const patient = await prisma.patient.create({
      data: {
        userId: user.id,
        fullNameAr: p.nameAr,
        fullNameEn: p.nameEn,
        dateOfBirth: d(p.dob),
        sex: p.sex,
        maskedId: maskId(p.nationalId),
        identityVerified: true,
        identityVerifiedAt: new Date(),
        identitySource: "DEV_IDENTITY_PROVIDER",
        identityMappings: {
          create: { idType, identifierHash: hashIdentifier(idType, p.nationalId), verified: true, verificationMethod: "DEV_IDENTITY_PROVIDER+OTP" },
        },
      },
    });
    P[k] = { id: patient.id, userId: user.id };
  }
  log("patients");

  // ── Clinical profile (Sara: rich; Khalid: sparse → shows "unknown"; Faisal: minimal)
  await prisma.medicalProfile.create({
    data: {
      patientId: P.sara.id,
      bloodType: "A+",
      bloodTypeSource: "PROVIDER_VERIFIED",
      bloodTypeVerifiedBy: DEMO.hospitals.C.nameEn,
      medicalAlerts: [],
      emergencyContactName: "أحمد القحطاني",
      emergencyContactPhone: "0500000101",
      emergencyContactRel: "الأب",
      takesMedications: true,
    },
  });
  await prisma.allergy.createMany({
    data: [
      { patientId: P.sara.id, substance: "الفول السوداني والمكسرات الشجرية", severity: "SEVERE", source: "SELF_REPORTED" },
      { patientId: P.sara.id, substance: "البنسلين", severity: "MODERATE", source: "SELF_REPORTED" },
    ],
  });
  await prisma.chronicCondition.createMany({
    data: [
      { patientId: P.sara.id, name: "داء السكري", source: "SELF_REPORTED" },
      { patientId: P.sara.id, name: "أمراض القلب والشرايين", source: "SELF_REPORTED" },
    ],
  });
  await prisma.medication.createMany({
    data: [
      { patientId: P.sara.id, name: "Warfarin", category: "مميعات الدم", dose: "5 mg", frequency: "Once daily", highRisk: true, source: "PROVIDER_VERIFIED", hospitalId: H.C.id },
      { patientId: P.sara.id, name: "Metformin", category: "أدوية السكري", dose: "1000 mg", frequency: "Twice daily", source: "PROVIDER_VERIFIED", hospitalId: H.C.id },
      { patientId: P.sara.id, category: "أدوية الضغط", source: "SELF_REPORTED" },
    ],
  });
  await prisma.surgery.create({ data: { patientId: P.sara.id, name: "Appendectomy / استئصال الزائدة", year: 2012, hospitalName: DEMO.hospitals.C.nameEn, source: "HOSPITAL_RECORD" } });
  await prisma.medicalProfile.create({ data: { patientId: P.khalid.id, takesMedications: false, emergencyContactName: "منى الحربي", emergencyContactPhone: "0500000102", emergencyContactRel: "الزوجة" } });
  await prisma.chronicCondition.create({ data: { patientId: P.khalid.id, name: "أمراض الجهاز التنفسي والربو", source: "SELF_REPORTED" } });
  await prisma.medicalProfile.create({ data: { patientId: P.faisal.id, bloodType: "O-", bloodTypeSource: "SELF_REPORTED", noKnownAllergies: false } });
  await prisma.encounter.createMany({
    data: [
      { patientId: P.sara.id, hospitalId: H.C.id, type: "OUTPATIENT", date: d("2024-09-15"), description: "Endocrinology follow-up" },
      { patientId: P.sara.id, hospitalId: H.C.id, type: "INPATIENT", date: d("2022-06-02"), description: "Admission — new-onset atrial fibrillation" },
      { patientId: P.khalid.id, hospitalId: H.C.id, type: "OUTPATIENT", date: d("2025-01-20"), description: "Pulmonology clinic" },
    ],
  });
  log("clinical");

  // ── Hospital A's own RIS patient index (hospital-local data)
  const hospIndex = [
    { p: DEMO.patients.sara, dob: DEMO.patients.sara.dob },
    { p: DEMO.patients.khalid, dob: DEMO.patients.khalid.dob },
    { p: DEMO.patients.mohammed, dob: DEMO.patients.mohammed.dob },
    // Data-entry error at Hospital A (day/month transposed) → Aoun must quarantine, not mis-link.
    { p: DEMO.patients.faisal, dob: "1969-03-08" },
  ];
  let mrn = 300100;
  for (const { p, dob } of hospIndex) {
    await prisma.hospitalPatientIndex.create({
      data: {
        hospitalId: H.A.id,
        mrn: `MRN-${mrn++}`,
        idType: idTypeFor(p.nationalId),
        nationalIdEnc: encryptSecret(p.nationalId),
        nationalIdHash: hospitalIdHash(H.A.id, p.nationalId),
        fullNameAr: p.nameAr,
        fullNameEn: p.nameEn,
        dateOfBirth: d(dob),
        sex: p.sex,
      },
    });
  }
  log("hospital index");

  // ── Staff
  async function staff(
    s: { email: string; nameAr: string; nameEn: string; license?: string },
    role: "RADIOLOGIST" | "DOCTOR" | "ADMIN",
    opts: { hospital?: string; department?: string; verified: boolean; specialty?: string },
  ) {
    const user = await prisma.user.create({ data: { role, email: s.email, passwordHash: pw, displayName: s.nameAr } });
    const pro = await prisma.healthcareProfessional.create({
      data: {
        userId: user.id,
        fullNameAr: s.nameAr,
        fullNameEn: s.nameEn,
        licenseNumber: s.license ?? `ADMIN-${user.id.slice(-6)}`,
        profession: role === "RADIOLOGIST" ? "RADIOLOGIST" : role === "DOCTOR" ? "PHYSICIAN" : "ADMIN",
        specialty: opts.specialty,
        licenseVerified: opts.verified,
        licenseVerifiedAt: opts.verified ? new Date() : null,
      },
    });
    if (opts.hospital) {
      await prisma.professionalAffiliation.create({
        data: {
          professionalId: pro.id,
          hospitalId: H[opts.hospital].id,
          department: opts.department!,
          status: opts.verified ? "ACTIVE" : "PENDING",
          verifiedAt: opts.verified ? new Date() : null,
          verifiedBy: opts.verified ? "seed" : null,
        },
      });
    }
    return user;
  }
  await staff(DEMO.staff.radiologist, "RADIOLOGIST", { hospital: "A", department: "RADIOLOGY", verified: true, specialty: "Diagnostic Radiology" });
  await staff(DEMO.staff.erDoctor, "DOCTOR", { hospital: "B", department: "EMERGENCY", verified: true, specialty: "Emergency Medicine" });
  await staff(DEMO.staff.erDoctor2, "DOCTOR", { hospital: "B", department: "EMERGENCY", verified: true, specialty: "Emergency Medicine" });
  await staff(DEMO.staff.unverified, "DOCTOR", { hospital: "B", department: "EMERGENCY", verified: false, specialty: "Emergency Medicine" });
  await staff(DEMO.staff.admin, "ADMIN", { verified: true });
  log("staff");

  for (const k of ["sara", "khalid", "faisal"]) {
    await prisma.notification.create({
      data: {
        userId: P[k].userId!,
        type: "WELCOME",
        titleAr: "مرحباً بك في منصة عون",
        titleEn: "Welcome to Aoun",
        bodyAr: "يمكنك الآن عرض بطاقتك الطبية ورمز الطوارئ.",
        bodyEn: "You can now show your medical card and emergency QR.",
      },
    });
  }
  return { hospitals: H, patients: P };
}

import crypto from "node:crypto";
import { z } from "zod";
import type { Hospital, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { hashIdentifier, normalizeId, sha256 } from "../crypto";
import { storage } from "../storage";
import { maxBytesFor, safeFileName, sniffFormat } from "../files";
import { audit, type AuditActor } from "../audit";
import { notify } from "../notify";
import { ApiError } from "../errors";
import { pacsUrlPrefix } from "../hospital-system/pacs";

/**
 * Aoun central platform — inbound imaging study ingestion.
 * Called by POST /api/integrations/imaging-studies after the hospital's signature is verified.
 */

export const StudyPayload = z.object({
  schemaVersion: z.literal("taree.imaging-study.v1"),
  eventId: z.string().min(8).max(200),
  study: z.object({
    studyInstanceUid: z.string().regex(/^[0-9.]{3,64}$/, "Invalid DICOM UID"),
    accessionNumber: z.string().min(1).max(64),
    modality: z.enum(["XRAY", "MRI", "CT", "ULTRASOUND", "OTHER"]),
    bodyRegion: z.string().min(1).max(120),
    examDate: z.string().datetime(),
    radiologistName: z.string().min(1).max(120),
    approvedAt: z.string().datetime(),
  }),
  patient: z.object({
    idType: z.enum(["NATIONAL_ID", "IQAMA"]),
    identifier: z.string().regex(/^[12]\d{9}$/, "Identifier must be a 10-digit national ID / Iqama"),
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    mrn: z.string().min(1).max(64),
    sex: z.enum(["MALE", "FEMALE"]).optional(),
  }),
  report: z.object({ text: z.string().max(50_000), author: z.string().max(120), finalizedAt: z.string().datetime() }),
  files: z
    .array(
      z.object({
        fileId: z.string().min(1).max(64),
        kind: z.enum(["IMAGE", "REPORT"]),
        format: z.enum(["DICOM", "JPEG", "PNG", "PDF", "VIDEO"]),
        fileName: z.string().min(1).max(200),
        mimeType: z.string().max(100),
        sizeBytes: z.number().int().positive(),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        retrieveUrl: z.string().url(),
        retrieveToken: z.string().min(10).max(200),
      }),
    )
    .min(1)
    .max(40),
});
export type StudyPayload = z.infer<typeof StudyPayload>;

type Result = { httpStatus: number; body: Record<string, unknown> };

async function newReference() {
  for (let i = 0; i < 5; i++) {
    const ref = `AOUN-${new Date().getFullYear()}-${crypto.randomInt(100000, 999999)}`;
    if (!(await prisma.imagingStudy.findUnique({ where: { referenceNumber: ref } }))) return ref;
  }
  return `AOUN-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

/** Verified identity matching. Never links on an uncertain match — quarantines instead. */
async function matchPatient(hospitalId: string, p: StudyPayload["patient"]) {
  const idHash = hashIdentifier(p.idType, p.identifier);
  const mapping = await prisma.identityMapping.findUnique({
    where: { idType_identifierHash_scope: { idType: p.idType, identifierHash: idHash, scope: "GLOBAL" } },
    include: { patient: true },
  });
  if (!mapping) return { patientId: null, reason: "NO_VERIFIED_IDENTITY: identifier not registered in Aoun" };
  if (!mapping.verified) return { patientId: null, reason: "UNVERIFIED_IDENTITY: identity mapping is not verified" };
  const dob = mapping.patient.dateOfBirth.toISOString().slice(0, 10);
  if (dob !== p.dateOfBirth) return { patientId: null, reason: "DEMOGRAPHIC_MISMATCH: date of birth does not match verified identity" };

  const mrnHash = hashIdentifier("HOSPITAL_MRN", p.mrn, hospitalId);
  const mrn = await prisma.identityMapping.findUnique({
    where: { idType_identifierHash_scope: { idType: "HOSPITAL_MRN", identifierHash: mrnHash, scope: hospitalId } },
  });
  if (mrn && mrn.patientId !== mapping.patientId) {
    return { patientId: null, reason: "MRN_CONFLICT: hospital MRN is already linked to a different patient" };
  }
  return { patientId: mapping.patientId, mrnHash, mrnKnown: !!mrn, method: "NATIONAL_ID+DOB(+MRN)" };
}

async function fetchFile(hospital: Hospital, f: StudyPayload["files"][number]): Promise<Buffer> {
  // SSRF guard: files may only be pulled from the sending hospital's registered PACS endpoint.
  if (!f.retrieveUrl.startsWith(pacsUrlPrefix(hospital.code))) {
    throw new ApiError(422, "UNTRUSTED_FILE_SOURCE", "File URL is not the hospital's registered PACS endpoint", { retryable: false });
  }
  let res: Response;
  try {
    res = await fetch(f.retrieveUrl, { headers: { authorization: `Bearer ${f.retrieveToken}` }, signal: AbortSignal.timeout(90_000) });
  } catch (e) {
    throw new ApiError(502, "FILE_TRANSFER_FAILED", `Could not reach hospital PACS: ${(e as Error).message}`, { retryable: true });
  }
  if (res.status === 404) throw new ApiError(422, "MISSING_FILE", `File ${f.fileName} is missing at the source PACS`, { retryable: false });
  if (!res.ok) throw new ApiError(502, "FILE_TRANSFER_FAILED", `PACS responded ${res.status}`, { retryable: true });
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length !== f.sizeBytes || sha256(buf) !== f.sha256) {
    throw new ApiError(422, "CHECKSUM_MISMATCH", `Integrity check failed for ${f.fileName}`, { retryable: true });
  }
  const sniffed = sniffFormat(buf);
  if (!sniffed || sniffed.format !== f.format || buf.length > maxBytesFor(sniffed.format)) {
    throw new ApiError(422, "INVALID_FILE", `File ${f.fileName} failed content validation`, { retryable: false });
  }
  return buf;
}

export async function ingestStudy(hospital: Hospital, eventId: string, raw: unknown): Promise<Result> {
  const actor: AuditActor = { label: `hospital:${hospital.code}`, role: "HOSPITAL_SYSTEM", hospitalId: hospital.id };
  const ev = (type: string, message: string, details?: object) =>
    prisma.syncEvent.create({ data: { hospitalId: hospital.id, type, message, details: details ?? undefined } });

  const parsed = StudyPayload.safeParse(raw);
  if (!parsed.success) {
    await ev("VALIDATION_FAILED", "Inbound study rejected: payload validation failed", { issues: parsed.error.issues.slice(0, 5) });
    await audit({ actor, action: "INTEGRATION_STUDY_REJECTED", outcome: "DENIED", details: { reason: "VALIDATION", eventId } });
    return { httpStatus: 400, body: { error: "VALIDATION_ERROR", message: "Payload validation failed", issues: parsed.error.issues, retryable: false } };
  }
  const p = parsed.data;
  if (p.eventId !== eventId) return { httpStatus: 400, body: { error: "EVENT_ID_MISMATCH", retryable: false } };
  p.patient.identifier = normalizeId(p.patient.identifier);

  // 1. Idempotency — duplicate events and duplicate studies (stable DICOM Study Instance UID).
  const existing = await prisma.imagingStudy.findUnique({
    where: { sourceHospitalId_sourceStudyUid: { sourceHospitalId: hospital.id, sourceStudyUid: p.study.studyInstanceUid } },
  });
  if (existing) {
    await ev("DUPLICATE_IGNORED", `Duplicate delivery of ${p.study.accessionNumber} ignored`, { referenceNumber: existing.referenceNumber });
    return {
      httpStatus: existing.status === "QUARANTINED" ? 202 : 200,
      body: { status: existing.status === "QUARANTINED" ? "QUARANTINED" : "SYNCED", duplicate: true, studyId: existing.id, referenceNumber: existing.referenceNumber, reason: existing.quarantineReason },
    };
  }

  // 2. Verified identity matching.
  const match = await matchPatient(hospital.id, p.patient);
  await ev(match.patientId ? "PATIENT_MATCHED" : "IDENTITY_UNCERTAIN", match.patientId
    ? `Patient matched through verified identity mapping (${match.method})`
    : `Identity could not be verified — study will be quarantined (${match.reason})`);

  // 3. Retrieve files from the hospital PACS, verify integrity, store encrypted.
  const studyId = crypto.randomUUID();
  const stored: { key: string; f: StudyPayload["files"][number]; buf: Buffer }[] = [];
  try {
    for (const f of p.files) {
      const buf = await fetchFile(hospital, f);
      const key = `taree/studies/${studyId}/${crypto.randomUUID()}`;
      await storage.put(key, buf);
      stored.push({ key, f, buf });
    }
  } catch (e) {
    await Promise.all(stored.map((s) => storage.remove(s.key)));
    const err = e instanceof ApiError ? e : new ApiError(502, "FILE_TRANSFER_FAILED", (e as Error).message, { retryable: true });
    await ev("FILE_TRANSFER_FAILED", err.message, { code: err.code });
    return { httpStatus: err.status, body: { error: err.code, message: err.message, ...err.extra } };
  }
  await ev("FILES_TRANSFERRED", `${stored.length} file(s) retrieved from hospital PACS, verified (SHA-256) and stored encrypted`);

  const referenceNumber = await newReference();
  const quarantined = !match.patientId;
  const contentHash = sha256(p.study.studyInstanceUid + stored.map((s) => s.f.sha256).join(""));

  try {
    const study = await prisma.$transaction(async (tx) => {
      const study = await tx.imagingStudy.create({
        data: {
          id: studyId,
          referenceNumber,
          patientId: match.patientId,
          sourceHospitalId: hospital.id,
          sourceStudyUid: p.study.studyInstanceUid,
          accessionNumber: p.study.accessionNumber,
          modality: p.study.modality,
          bodyRegion: p.study.bodyRegion,
          examDate: new Date(p.study.examDate),
          radiologistName: p.study.radiologistName,
          status: quarantined ? "QUARANTINED" : "AVAILABLE",
          quarantineReason: quarantined ? match.reason : null,
          matchMethod: match.patientId ? match.method : null,
          contentHash,
          // Quarantined studies keep a hashed identifier so an administrator can reconcile them.
          files: {
            create: stored.map((s) => ({
              kind: s.f.kind,
              format: s.f.format,
              fileName: safeFileName(s.f.fileName),
              mimeType: sniffFormat(s.buf)!.mime,
              sizeBytes: s.buf.length,
              sha256: s.f.sha256,
              storageKey: s.key,
            })),
          },
          report: { create: { text: p.report.text, author: p.report.author, finalizedAt: new Date(p.report.finalizedAt) } },
        },
      });
      if (match.patientId && !match.mrnKnown) {
        await tx.identityMapping.create({
          data: { patientId: match.patientId, idType: "HOSPITAL_MRN", identifierHash: match.mrnHash!, scope: hospital.id, verified: true, verificationMethod: "LINKED_VIA_VERIFIED_NATIONAL_ID" },
        });
      }
      if (match.patientId) {
        await tx.encounter.create({
          data: {
            patientId: match.patientId,
            hospitalId: hospital.id,
            type: "RADIOLOGY",
            date: new Date(p.study.examDate),
            description: `${p.study.modality} — ${p.study.bodyRegion}`,
          },
        });
      }
      await tx.integrationReceipt.create({
        data: { hospitalId: hospital.id, eventId, studyId, outcome: quarantined ? "QUARANTINED" : "SYNCED" },
      });
      return study;
    });

    await ev(quarantined ? "QUARANTINED" : "LINKED", quarantined
      ? `Study ${referenceNumber} held in quarantine for identity reconciliation`
      : `Study ${referenceNumber} linked to the patient's unified medical record`, { referenceNumber });
    await audit({
      actor,
      action: quarantined ? "INTEGRATION_STUDY_QUARANTINED" : "INTEGRATION_STUDY_LINKED",
      patientId: match.patientId,
      resourceType: "ImagingStudy",
      resourceId: study.id,
      details: { referenceNumber, accessionNumber: p.study.accessionNumber, eventId, files: stored.length, reason: match.reason } as Prisma.JsonObject,
    });

    if (match.patientId) {
      const patient = await prisma.patient.findUnique({ where: { id: match.patientId } });
      await notify(patient?.userId, {
        type: "STUDY_SYNCED",
        titleAr: "تمت إضافة فحص أشعة جديد إلى سجلك",
        titleEn: "A new imaging study was added to your record",
        bodyAr: `${hospital.nameAr} — ${p.study.bodyRegion} (${referenceNumber})`,
        bodyEn: `${hospital.nameEn} — ${p.study.bodyRegion} (${referenceNumber})`,
        link: `/patient/imaging/${study.id}`,
      });
    }

    return quarantined
      ? { httpStatus: 202, body: { status: "QUARANTINED", studyId: study.id, referenceNumber, reason: match.reason } }
      : { httpStatus: 201, body: { status: "SYNCED", studyId: study.id, referenceNumber, syncedAt: study.syncedAt } };
  } catch (e) {
    await Promise.all(stored.map((s) => storage.remove(s.key)));
    // Lost a race with a concurrent duplicate delivery → idempotent success.
    if ((e as { code?: string }).code === "P2002") {
      const dup = await prisma.imagingStudy.findUnique({
        where: { sourceHospitalId_sourceStudyUid: { sourceHospitalId: hospital.id, sourceStudyUid: p.study.studyInstanceUid } },
      });
      if (dup) return { httpStatus: 200, body: { status: "SYNCED", duplicate: true, studyId: dup.id, referenceNumber: dup.referenceNumber } };
    }
    throw e;
  }
}

/**
 * Apply a corrected report to the study already linked in the patient's Aoun record.
 * The original author and finalization time are kept; amendedAt records when it was corrected.
 * Returns null when the study has not reached Aoun yet (the corrected text then travels with the sync).
 */
export async function amendLinkedReport(hospitalId: string, studyInstanceUid: string, text: string, author: string) {
  const study = await prisma.imagingStudy.findUnique({
    where: { sourceHospitalId_sourceStudyUid: { sourceHospitalId: hospitalId, sourceStudyUid: studyInstanceUid } },
    include: { report: true },
  });
  if (!study) return null;
  const now = new Date();
  const report = study.report
    ? await prisma.radiologyReport.update({ where: { id: study.report.id }, data: { text, amendedAt: now } })
    : await prisma.radiologyReport.create({ data: { studyId: study.id, text, author, finalizedAt: now } });
  return { study, report };
}

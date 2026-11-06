import crypto from "node:crypto";
import type { FileKind, Modality } from "@prisma/client";
import { prisma } from "../db";
import { decryptSecret, encryptSecret, hashIdentifier, idTypeFor, normalizeId, sha256 } from "../crypto";
import { storage } from "../storage";
import { maxBytesFor, safeFileName, sniffFormat } from "../files";
import { ApiError, badRequest, notFound } from "../errors";
import { audit, type AuditActor } from "../audit";
import { kickJob } from "../sync/engine";

/**
 * Simulated hospital Radiology Information System (RIS).
 * This module only touches the hospital-local tables (HospitalPatientIndex, SourceStudy, SourceFile)
 * and enqueues outbound SyncJobs. It never writes to Taree's unified record directly.
 */

export const hospitalIdHash = (hospitalId: string, nationalId: string) =>
  hashIdentifier("HOSP_LOCAL", nationalId, hospitalId);

export async function lookupHospitalPatient(hospitalId: string, nationalId: string) {
  const id = normalizeId(nationalId);
  if (!/^[12]\d{9}$/.test(id)) throw badRequest("National ID / Iqama must be 10 digits starting with 1 or 2");
  return prisma.hospitalPatientIndex.findFirst({ where: { hospitalId, nationalIdHash: hospitalIdHash(hospitalId, id) } });
}

/**
 * Find the patient in this hospital's index; if they have never visited this hospital, register them
 * from the national identity record (simulates the registration desk verifying the ID card).
 */
export async function findOrRegisterHospitalPatient(hospitalId: string, nationalId: string) {
  const found = await lookupHospitalPatient(hospitalId, nationalId);
  if (found) return found;
  const id = normalizeId(nationalId);
  const rec = await prisma.devIdentityRecord.findUnique({ where: { identifierHash: hashIdentifier(idTypeFor(id), id) } });
  if (!rec) return null;
  return registerHospitalPatient(hospitalId, { nationalId: id, fullNameAr: rec.fullNameAr, fullNameEn: rec.fullNameEn, dateOfBirth: rec.dateOfBirth, sex: rec.sex });
}

/**
 * National ID of a Taree patient, recovered from a hospital's own (encrypted) patient index —
 * used when a doctor adds imaging straight from a scanned card, so they don't retype the ID.
 * Taree itself never stores the raw ID; we match each hospital entry by its keyed hash.
 */
export async function nationalIdForTareePatient(patientId: string) {
  const maps = await prisma.identityMapping.findMany({ where: { patientId, scope: "GLOBAL" }, select: { identifierHash: true } });
  const want = new Set(maps.map((m) => m.identifierHash));
  if (!want.size) return null;
  const rows = await prisma.hospitalPatientIndex.findMany({ select: { nationalIdEnc: true } });
  for (const r of rows) {
    let id: string;
    try { id = decryptSecret(r.nationalIdEnc); } catch { continue; }
    if (want.has(hashIdentifier(idTypeFor(id), id))) return id;
  }
  return null;
}

/** Register a patient in the hospital's own index (e.g. a new walk-in) — demo helper. */
export async function registerHospitalPatient(
  hospitalId: string,
  p: { nationalId: string; fullNameAr: string; fullNameEn: string; dateOfBirth: Date; sex: "MALE" | "FEMALE" },
) {
  const id = normalizeId(p.nationalId);
  const mrn = `MRN-${crypto.randomInt(100000, 999999)}`;
  return prisma.hospitalPatientIndex.create({
    data: {
      hospitalId,
      mrn,
      idType: idTypeFor(id),
      nationalIdEnc: encryptSecret(id),
      nationalIdHash: hospitalIdHash(hospitalId, id),
      fullNameAr: p.fullNameAr,
      fullNameEn: p.fullNameEn,
      dateOfBirth: p.dateOfBirth,
      sex: p.sex,
    },
  });
}

export const decryptHospitalNationalId = (enc: string) => decryptSecret(enc);

function dicomUid() {
  // 2.25.<128-bit UUID as decimal> — a valid globally unique DICOM UID
  return "2.25." + BigInt("0x" + crypto.randomUUID().replace(/-/g, "")).toString(10);
}

export async function createDraftStudy(
  hospitalId: string,
  hospitalCode: string,
  data: {
    hospitalPatientId: string;
    modality: Modality;
    bodyRegion: string;
    examDate: Date;
    radiologistName: string;
    radiologistUserId: string;
    reportText: string;
  },
) {
  const hp = await prisma.hospitalPatientIndex.findFirst({ where: { id: data.hospitalPatientId, hospitalId } });
  if (!hp) throw notFound("Patient not found in this hospital's index");
  const d = new Date();
  const accessionNumber = `${hospitalCode}-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${crypto.randomInt(10000, 99999)}`;
  return prisma.sourceStudy.create({
    data: { ...data, hospitalId, accessionNumber, studyInstanceUid: dicomUid(), status: "DRAFT" },
  });
}

export async function attachFile(hospitalId: string, sourceStudyId: string, kind: FileKind, name: string, buf: Buffer) {
  const study = await prisma.sourceStudy.findFirst({ where: { id: sourceStudyId, hospitalId } });
  if (!study) throw notFound("Study not found");
  if (study.status !== "DRAFT") throw new ApiError(409, "STUDY_LOCKED", "Approved studies cannot be modified");
  if (buf.length === 0) throw badRequest("Empty file");
  const sniffed = sniffFormat(buf);
  if (!sniffed) throw badRequest("Unsupported file type. Allowed: DICOM, JPEG, PNG, PDF, MP4/WebM video");
  if (kind === "REPORT" && sniffed.format !== "PDF") throw badRequest("Report uploads must be PDF");
  if (kind === "IMAGE" && sniffed.format === "PDF") throw badRequest("Upload PDFs as the radiology report");
  if (buf.length > maxBytesFor(sniffed.format)) throw badRequest("File exceeds the maximum allowed size");
  const id = crypto.randomUUID();
  const storageKey = `hospitals/${hospitalId}/pacs/${sourceStudyId}/${id}`;
  await storage.put(storageKey, buf);
  return prisma.sourceFile.create({
    data: {
      id,
      sourceStudyId,
      kind,
      format: sniffed.format,
      mimeType: sniffed.mime,
      fileName: safeFileName(name),
      sizeBytes: buf.length,
      sha256: sha256(buf),
      storageKey,
    },
  });
}

export async function removeFile(hospitalId: string, fileId: string) {
  const f = await prisma.sourceFile.findFirst({ where: { id: fileId, sourceStudy: { hospitalId } }, include: { sourceStudy: true } });
  if (!f) throw notFound();
  if (f.sourceStudy.status !== "DRAFT") throw new ApiError(409, "STUDY_LOCKED", "Approved studies cannot be modified");
  await prisma.sourceFile.delete({ where: { id: f.id } });
  await storage.remove(f.storageKey);
}

/**
 * "اعتماد وحفظ الأشعة" — Approve & Finalize.
 * Locks the study in the hospital RIS and atomically enqueues an outbound synchronization job.
 * The job is processed asynchronously (kicked immediately, with a background worker for retries).
 */
export async function approveStudy(hospitalId: string, sourceStudyId: string, actor: AuditActor, opts: { simulateFailures?: number } = {}) {
  const study = await prisma.sourceStudy.findFirst({ where: { id: sourceStudyId, hospitalId }, include: { files: true } });
  if (!study) throw notFound("Study not found");
  if (study.status === "APPROVED") {
    const job = await prisma.syncJob.findFirst({ where: { sourceStudyId }, orderBy: { createdAt: "desc" } });
    return { study, job, alreadyApproved: true };
  }
  if (!study.files.some((f) => f.kind === "IMAGE")) throw badRequest("Attach at least one imaging file before approval");
  if (study.reportText.trim().length < 10 && !study.files.some((f) => f.kind === "REPORT"))
    throw badRequest("A radiology report (text or PDF) is required before approval");

  const { updated, job } = await prisma.$transaction(async (tx) => {
    const res = await tx.sourceStudy.updateMany({
      where: { id: sourceStudyId, status: "DRAFT" },
      data: { status: "APPROVED", approvedAt: new Date() },
    });
    if (res.count !== 1) throw new ApiError(409, "ALREADY_APPROVED", "Study already approved");
    const job = await tx.syncJob.create({
      data: {
        eventId: `evt_${crypto.randomUUID()}`,
        sourceStudyId,
        hospitalId,
        simulateFailures: Math.max(0, Math.min(3, opts.simulateFailures ?? 0)),
      },
    });
    await tx.syncEvent.createMany({
      data: [
        { jobId: job.id, hospitalId, type: "STUDY_APPROVED", message: "Study approved and finalized in hospital RIS" },
        { jobId: job.id, hospitalId, type: "JOB_CREATED", message: "Outbound synchronization job queued for Taree" },
      ],
    });
    const updated = await tx.sourceStudy.findUniqueOrThrow({ where: { id: sourceStudyId } });
    return { updated, job };
  });

  await audit({
    actor,
    action: "RIS_STUDY_APPROVED",
    resourceType: "SourceStudy",
    resourceId: sourceStudyId,
    details: { accessionNumber: study.accessionNumber, syncJobId: job.id },
  });
  kickJob(job.id);
  return { study: updated, job, alreadyApproved: false };
}

/**
 * Correct the report of a study this radiologist already uploaded («تعديل التقرير»).
 * Only the report text changes — the images stay locked. Returns the updated hospital record.
 */
export async function amendSourceReport(hospitalId: string, sourceStudyId: string, userId: string, reportText: string) {
  const study = await prisma.sourceStudy.findFirst({ where: { id: sourceStudyId, hospitalId } });
  if (!study) throw notFound("Study not found");
  if (study.radiologistUserId !== userId) throw new ApiError(403, "NOT_REPORT_AUTHOR", "يمكن لكاتب التقرير فقط تعديله / Only the report's author can edit it");
  const text = reportText.trim();
  if (text.length < 10) throw badRequest("اكتب تقريراً مختصراً (10 أحرف على الأقل)");
  return prisma.sourceStudy.update({ where: { id: study.id }, data: { reportText: text } });
}

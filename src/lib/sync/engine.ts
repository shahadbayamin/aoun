import type { SyncJob } from "@prisma/client";
import { after } from "next/server";
import { prisma } from "../db";
import { env } from "../env";
import { decryptSecret } from "../crypto";
import { audit } from "../audit";
import { signedHeaders } from "../integration/hmac";
import { issueFileToken, pacsFileUrl } from "../hospital-system/pacs";

/**
 * Outbound synchronization engine (runs on the hospital side of the integration).
 *
 * Lifecycle:  PENDING → SENDING → SYNCED
 *                           ↘ RETRY (exponential backoff) → SENDING …
 *                           ↘ FAILED (non-retryable or attempts exhausted)
 *                           ↘ QUARANTINED (Taree could not safely match the patient)
 *
 * Jobs are claimed atomically (conditional UPDATE) so the immediate kick, the background
 * worker and manual retries can never process the same attempt twice.
 */

export const INTEGRATION_PATH = "/api/integrations/imaging-studies";

/** Demo mode: brief pause between stages so the presenter can see Approved → Sending → Synced. */
const stagePause = () => {
  const ms = env.demoMode ? Number(process.env.DEMO_SYNC_STAGE_DELAY_MS ?? 900) : 0;
  return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
};

const backoffMs = (attempt: number) => Math.min(5_000 * 2 ** (attempt - 1), 5 * 60_000);

class SyncError extends Error {
  constructor(
    message: string,
    public retryable: boolean,
    public code = "SYNC_ERROR",
  ) {
    super(message);
  }
}

async function event(job: Pick<SyncJob, "id" | "hospitalId">, type: string, message: string, details?: object) {
  await prisma.syncEvent.create({ data: { jobId: job.id, hospitalId: job.hospitalId, type, message, details: details ?? undefined } });
}

async function claim(jobId: string) {
  const now = new Date();
  const res = await prisma.syncJob.updateMany({
    where: { id: jobId, status: { in: ["PENDING", "RETRY"] }, nextAttemptAt: { lte: now } },
    data: { status: "SENDING", attempts: { increment: 1 }, startedAt: now, lastError: null },
  });
  if (res.count !== 1) return null;
  return prisma.syncJob.findUnique({ where: { id: jobId } });
}

export async function buildPayload(job: SyncJob) {
  const s = await prisma.sourceStudy.findUniqueOrThrow({
    where: { id: job.sourceStudyId },
    include: { files: true, hospitalPatient: true, hospital: true },
  });
  if (s.status !== "APPROVED") throw new SyncError("Study is not approved", false, "NOT_APPROVED");
  return {
    schemaVersion: "taree.imaging-study.v1",
    eventId: job.eventId,
    study: {
      studyInstanceUid: s.studyInstanceUid,
      accessionNumber: s.accessionNumber,
      modality: s.modality,
      bodyRegion: s.bodyRegion,
      examDate: s.examDate.toISOString(),
      radiologistName: s.radiologistName,
      approvedAt: (s.approvedAt ?? new Date()).toISOString(),
    },
    patient: {
      idType: s.hospitalPatient.idType,
      identifier: decryptSecret(s.hospitalPatient.nationalIdEnc),
      dateOfBirth: s.hospitalPatient.dateOfBirth.toISOString().slice(0, 10),
      mrn: s.hospitalPatient.mrn,
      sex: s.hospitalPatient.sex,
    },
    report: { text: s.reportText, author: s.radiologistName, finalizedAt: (s.approvedAt ?? new Date()).toISOString() },
    files: s.files.map((f) => ({
      fileId: f.id,
      kind: f.kind,
      format: f.format,
      fileName: f.fileName,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
      sha256: f.sha256,
      retrieveUrl: pacsFileUrl(s.hospital.code, f.id),
      retrieveToken: issueFileToken(s.hospital.apiSecretEnc, f.id),
    })),
  };
}

export async function processJob(jobId: string): Promise<SyncJob | null> {
  const job = await claim(jobId);
  if (!job) return null;
  const hospital = await prisma.hospital.findUniqueOrThrow({ where: { id: job.hospitalId } });
  await event(job, "SENDING", `Attempt ${job.attempts}/${job.maxAttempts}: sending study to Taree integration API`);
  await stagePause();

  try {
    if (job.attempts <= job.simulateFailures) {
      throw new SyncError("Simulated network failure (demo mode)", true, "SIMULATED_FAILURE");
    }
    const payload = await buildPayload(job);
    const body = JSON.stringify(payload);
    let res: Response;
    try {
      res = await fetch(env.appUrl + INTEGRATION_PATH, {
        method: "POST",
        headers: signedHeaders(hospital.code, decryptSecret(hospital.apiSecretEnc), "POST", INTEGRATION_PATH, body, job.eventId),
        body,
        signal: AbortSignal.timeout(120_000),
      });
    } catch (e) {
      throw new SyncError(`Transport error: ${(e as Error).message}`, true, "TRANSPORT");
    }
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (res.status === 200 || res.status === 201) {
      const done = await prisma.syncJob.update({
        where: { id: job.id },
        data: {
          status: "SYNCED",
          completedAt: new Date(),
          tareeStudyId: String(json.studyId),
          tareeReference: String(json.referenceNumber),
        },
      });
      await event(job, json.duplicate ? "DUPLICATE_ACKNOWLEDGED" : "SYNCED", json.duplicate
        ? "Taree already holds this study (idempotent duplicate) — marked as synced"
        : "Study linked to the patient's unified medical record in Taree", { referenceNumber: json.referenceNumber });
      await audit({
        actor: { label: `system:sync:${hospital.code}`, role: "SYSTEM", hospitalId: hospital.id },
        action: "SYNC_COMPLETED",
        resourceType: "SyncJob",
        resourceId: job.id,
        details: { referenceNumber: json.referenceNumber, attempts: job.attempts },
      });
      return done;
    }
    if (res.status === 202 && json.status === "QUARANTINED") {
      const q = await prisma.syncJob.update({
        where: { id: job.id },
        data: {
          status: "QUARANTINED",
          completedAt: new Date(),
          tareeStudyId: String(json.studyId),
          tareeReference: String(json.referenceNumber),
          lastError: String(json.reason ?? "Patient identity could not be verified"),
        },
      });
      await event(job, "QUARANTINED", "Taree received the study but quarantined it for identity reconciliation", { reason: json.reason });
      return q;
    }
    const retryable = res.status >= 500 || res.status === 429 || json.retryable === true;
    throw new SyncError(`Taree responded ${res.status}: ${json.message ?? json.error ?? "error"}`, retryable, String(json.error ?? res.status));
  } catch (e) {
    const err = e instanceof SyncError ? e : new SyncError((e as Error).message, true);
    const canRetry = err.retryable && job.attempts < job.maxAttempts;
    const delay = backoffMs(job.attempts);
    const updated = await prisma.syncJob.update({
      where: { id: job.id },
      data: {
        status: canRetry ? "RETRY" : "FAILED",
        lastError: err.message,
        nextAttemptAt: new Date(Date.now() + (canRetry ? delay : 0)),
      },
    });
    await event(job, canRetry ? "RETRY_SCHEDULED" : "FAILED", canRetry
      ? `${err.message} — retrying in ${Math.round(delay / 1000)}s`
      : `${err.message} — synchronization failed`, { code: err.code });
    if (!canRetry) {
      await audit({
        actor: { label: `system:sync:${hospital.code}`, role: "SYSTEM", hospitalId: hospital.id },
        action: "SYNC_FAILED",
        outcome: "FAILURE",
        resourceType: "SyncJob",
        resourceId: job.id,
        details: { error: err.message, code: err.code },
      });
    }
    if (canRetry && !process.env.VERCEL) setTimeout(() => kickJob(job.id), delay + 50).unref?.();
    return updated;
  }
}

/** Fire-and-forget immediate processing after approval. */
export function kickJob(jobId: string) {
  const run = async () => {
    await stagePause();
    await processJob(jobId).catch((e) => console.error("[sync] job failed unexpectedly", jobId, e));
  };
  // Serverless hosting (Vercel): keep the function alive until the job is done.
  if (process.env.VERCEL) return after(run);
  setImmediate(run);
}

/** Manually re-queue a failed job (operator action). */
export async function requeueJob(jobId: string, hospitalId?: string) {
  const res = await prisma.syncJob.updateMany({
    where: { id: jobId, status: "FAILED", ...(hospitalId ? { hospitalId } : {}) },
    data: { status: "RETRY", nextAttemptAt: new Date(), maxAttempts: { increment: 1 }, simulateFailures: 0 },
  });
  if (res.count === 1) {
    const job = await prisma.syncJob.findUniqueOrThrow({ where: { id: jobId } });
    await event(job, "MANUAL_RETRY", "Operator requested a new synchronization attempt");
    kickJob(jobId);
  }
  return res.count === 1;
}

/** Background worker tick: pick up any due PENDING/RETRY jobs (e.g. after a server restart). */
export async function runDueJobs(limit = 10) {
  const due = await prisma.syncJob.findMany({
    where: { status: { in: ["PENDING", "RETRY"] }, nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
    select: { id: true },
  });
  for (const j of due) await processJob(j.id);
  // Jobs stuck in SENDING for > 5 minutes (crashed mid-attempt) are returned to the queue.
  await prisma.syncJob.updateMany({
    where: { status: "SENDING", startedAt: { lt: new Date(Date.now() - 5 * 60_000) } },
    data: { status: "RETRY", nextAttemptAt: new Date(), lastError: "Attempt interrupted; re-queued" },
  });
  return due.length;
}

const g = globalThis as unknown as { __tareeWorker?: NodeJS.Timeout };
export function startSyncWorker(intervalMs = 5_000) {
  if (g.__tareeWorker) return;
  g.__tareeWorker = setInterval(() => {
    runDueJobs().catch((e) => console.error("[sync-worker]", e));
  }, intervalMs);
  g.__tareeWorker.unref?.();
  console.log("[sync-worker] started");
}

import type { AuditOutcome, Prisma } from "@prisma/client";
import { prisma } from "./db";
import { sha256 } from "./crypto";
import { requestMeta } from "./request-meta";

export type AuditActor = { userId?: string | null; role?: string | null; label: string; hospitalId?: string | null };

export const SYSTEM_ACTOR: AuditActor = { label: "system:taree", role: "SYSTEM" };

export type AuditInput = {
  actor: AuditActor;
  action: string;
  outcome?: AuditOutcome;
  patientId?: string | null;
  resourceType?: string;
  resourceId?: string | null;
  details?: Record<string, unknown>;
};

export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(",")}}`;
}

type HashFields = {
  createdAt: Date;
  actorUserId: string | null;
  actorRole: string | null;
  actorLabel: string;
  hospitalId: string | null;
  action: string;
  outcome: string;
  patientId: string | null;
  resourceType: string | null;
  resourceId: string | null;
  details: unknown;
};

export function auditHash(prevHash: string, f: HashFields) {
  return sha256(prevHash + stableStringify({ ...f, createdAt: f.createdAt.toISOString() }));
}

/** Append a tamper-evident (hash-chained) audit entry. Never throws into the caller's flow. */
export async function audit(input: AuditInput) {
  const meta = await requestMeta();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(727274)`;
      const last = await tx.auditLog.findFirst({ orderBy: { seq: "desc" }, select: { hash: true } });
      const prevHash = last?.hash ?? "GENESIS";
      const f: HashFields = {
        createdAt: new Date(),
        actorUserId: input.actor.userId ?? null,
        actorRole: input.actor.role ?? null,
        actorLabel: input.actor.label,
        hospitalId: input.actor.hospitalId ?? null,
        action: input.action,
        outcome: input.outcome ?? "SUCCESS",
        patientId: input.patientId ?? null,
        resourceType: input.resourceType ?? null,
        resourceId: input.resourceId ?? null,
        details: (input.details ?? null) as unknown,
      };
      await tx.auditLog.create({
        data: {
          ...f,
          outcome: f.outcome as AuditOutcome,
          details: (f.details ?? undefined) as Prisma.InputJsonValue | undefined,
          ip: meta.ip,
          userAgent: meta.userAgent,
          prevHash,
          hash: auditHash(prevHash, f),
        },
      });
    });
  } catch (e) {
    console.error("[audit] failed to write audit entry", e);
  }
}

/** Recompute the chain; returns the first broken sequence number, or null if intact. */
export async function verifyAuditChain(): Promise<{ ok: boolean; checked: number; brokenAt: number | null }> {
  const rows = await prisma.auditLog.findMany({ orderBy: { seq: "asc" } });
  let prev = "GENESIS";
  for (const r of rows) {
    const h = auditHash(prev, {
      createdAt: r.createdAt,
      actorUserId: r.actorUserId,
      actorRole: r.actorRole,
      actorLabel: r.actorLabel,
      hospitalId: r.hospitalId,
      action: r.action,
      outcome: r.outcome,
      patientId: r.patientId,
      resourceType: r.resourceType,
      resourceId: r.resourceId,
      details: r.details ?? null,
    });
    if (r.prevHash !== prev || r.hash !== h) return { ok: false, checked: rows.length, brokenAt: r.seq };
    prev = r.hash;
  }
  return { ok: true, checked: rows.length, brokenAt: null };
}

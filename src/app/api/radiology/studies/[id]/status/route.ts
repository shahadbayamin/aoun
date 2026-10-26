import { prisma } from "@/lib/db";
import { route } from "@/lib/api";
import { radiologyCtx } from "@/lib/portal-ctx";
import { notFound } from "@/lib/errors";
import { after } from "next/server";
import { runDueJobs } from "@/lib/sync/engine";

/** Polled by the Hospital A dashboard to show live synchronization progress. */
export const GET = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const { id } = await params;
  const { ctx } = await radiologyCtx("RIS_SYNC_STATUS");
  const study = await prisma.sourceStudy.findFirst({
    where: { id, hospitalId: ctx.hospital.id },
    select: { id: true, status: true, approvedAt: true, accessionNumber: true },
  });
  if (!study) throw notFound();
  // Serverless hosting: retries are picked up while the dashboard is watching (no background worker).
  if (process.env.VERCEL) after(() => runDueJobs(3).catch(() => {}));
  const job = await prisma.syncJob.findFirst({
    where: { sourceStudyId: id },
    orderBy: { createdAt: "desc" },
    include: { events: { orderBy: { createdAt: "asc" } } },
  });
  return { study, job };
});

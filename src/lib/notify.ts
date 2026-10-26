import { prisma } from "./db";

export async function notify(
  userId: string | null | undefined,
  n: { type: string; titleAr: string; titleEn: string; bodyAr: string; bodyEn: string; link?: string },
) {
  if (!userId) return;
  await prisma.notification.create({ data: { userId, ...n } });
}

-- AlterTable
ALTER TABLE "QrSession" ADD COLUMN IF NOT EXISTS "shortCodeHash" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "QrSession_shortCodeHash_idx" ON "QrSession"("shortCodeHash");

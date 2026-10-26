-- The patient's card in Apple Wallet / Google Wallet carries a permanent QR (only its hash is stored).
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "walletTokenHash" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Patient_walletTokenHash_key" ON "Patient"("walletTokenHash");

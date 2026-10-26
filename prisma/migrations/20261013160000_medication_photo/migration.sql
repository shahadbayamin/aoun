-- The patient may attach a photo of a medicine (instead of, or in addition to, its name / category).
ALTER TABLE "Medication" ADD COLUMN IF NOT EXISTS "photoKey" TEXT;
ALTER TABLE "Medication" ADD COLUMN IF NOT EXISTS "photoMime" TEXT;

-- Medications: the patient may know only the category (e.g. blood-pressure medicine), not the name.
ALTER TABLE "Medication" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "Medication" ALTER COLUMN "name" DROP NOT NULL;
-- "Do you take any medications?" (null = not answered)
ALTER TABLE "MedicalProfile" ADD COLUMN IF NOT EXISTS "takesMedications" BOOLEAN;
UPDATE "MedicalProfile" mp SET "takesMedications" = true
 WHERE "takesMedications" IS NULL AND EXISTS (SELECT 1 FROM "Medication" m WHERE m."patientId" = mp."patientId" AND m.active);

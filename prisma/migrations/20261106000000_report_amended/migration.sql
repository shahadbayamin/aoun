-- Radiologists can correct a report after upload; the time of the latest correction is shown with it.
ALTER TABLE "RadiologyReport" ADD COLUMN "amendedAt" TIMESTAMP(3);

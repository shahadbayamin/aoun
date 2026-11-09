-- Remove the test upload made while checking the online site ("Live check", AOUN-2026-875773 / HOSP-A-20261026-22110).
-- Data-only cleanup: matches nothing on other copies of Aoun.
DELETE FROM "StoredObject" WHERE "key" IN (
  SELECT f."storageKey" FROM "ImagingFile" f JOIN "ImagingStudy" s ON s."id" = f."studyId" WHERE s."referenceNumber" = 'AOUN-2026-875773');
DELETE FROM "StoredObject" WHERE "key" IN (
  SELECT f."storageKey" FROM "SourceFile" f JOIN "SourceStudy" s ON s."id" = f."sourceStudyId" WHERE s."accessionNumber" = 'HOSP-A-20261026-22110');
DELETE FROM "IntegrationReceipt" WHERE "studyId" IN (SELECT "id" FROM "ImagingStudy" WHERE "referenceNumber" = 'AOUN-2026-875773');
DELETE FROM "ImagingStudy" WHERE "referenceNumber" = 'AOUN-2026-875773';
DELETE FROM "SourceStudy" WHERE "accessionNumber" = 'HOSP-A-20261026-22110';

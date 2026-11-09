-- Remove two single-image CT uploads (9 Nov 2026) from the online demo data, at the owner's request.
-- Data-only cleanup: matches nothing on other copies of Aoun.
CREATE TEMP TABLE _rm ON COMMIT DROP AS
  SELECT "id", "sourceHospitalId", "sourceStudyUid" FROM "ImagingStudy"
   WHERE "id" IN ('29d47b2a-2c30-46e9-ae0c-0dba399cdc90', '0147a4c9-3ec5-4432-98e6-c30f2eccef9f');
DELETE FROM "StoredObject" WHERE "key" IN (SELECT f."storageKey" FROM "ImagingFile" f WHERE f."studyId" IN (SELECT "id" FROM _rm));
DELETE FROM "StoredObject" WHERE "key" IN (
  SELECT sf."storageKey" FROM "SourceFile" sf JOIN "SourceStudy" ss ON ss."id" = sf."sourceStudyId"
   JOIN _rm r ON r."sourceHospitalId" = ss."hospitalId" AND r."sourceStudyUid" = ss."studyInstanceUid");
DELETE FROM "IntegrationReceipt" WHERE "studyId" IN (SELECT "id" FROM _rm);
DELETE FROM "SourceStudy" ss USING _rm r WHERE r."sourceHospitalId" = ss."hospitalId" AND r."sourceStudyUid" = ss."studyInstanceUid";
DELETE FROM "ImagingStudy" WHERE "id" IN (SELECT "id" FROM _rm);

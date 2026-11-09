-- Remove the MRI upload (6 Nov 2026, Al Shifa) from patient «رنيم فهد السلمي» in the online data, at the owner's request.
-- Data-only cleanup: matches nothing on other copies of Aoun.
CREATE TEMP TABLE _rm ON COMMIT DROP AS
  SELECT s."id", s."sourceHospitalId", s."sourceStudyUid" FROM "ImagingStudy" s
    JOIN "Patient" p ON p."id" = s."patientId"
   WHERE p."fullNameAr" = 'رنيم فهد السلمي' AND s."modality" = 'MRI';
DELETE FROM "StoredObject" WHERE "key" IN (SELECT f."storageKey" FROM "ImagingFile" f WHERE f."studyId" IN (SELECT "id" FROM _rm));
DELETE FROM "StoredObject" WHERE "key" IN (
  SELECT sf."storageKey" FROM "SourceFile" sf JOIN "SourceStudy" ss ON ss."id" = sf."sourceStudyId"
   JOIN _rm r ON r."sourceHospitalId" = ss."hospitalId" AND r."sourceStudyUid" = ss."studyInstanceUid");
DELETE FROM "IntegrationReceipt" WHERE "studyId" IN (SELECT "id" FROM _rm);
DELETE FROM "SourceStudy" ss USING _rm r WHERE r."sourceHospitalId" = ss."hospitalId" AND r."sourceStudyUid" = ss."studyInstanceUid";
DELETE FROM "ImagingStudy" WHERE "id" IN (SELECT "id" FROM _rm);

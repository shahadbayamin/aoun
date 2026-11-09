-- Imaging already uploaded by Dr. Ajwad / Dr. Lama before their hospitals were corrected: show the right hospital.
UPDATE "ImagingStudy" s
   SET "sourceHospitalId" = (SELECT "id" FROM "Hospital" WHERE "nameAr" = 'مستشفى الأمل التخصصي' LIMIT 1)
 WHERE EXISTS (SELECT 1 FROM "Hospital" WHERE "nameAr" = 'مستشفى الأمل التخصصي')
   AND (s."radiologistName" ILIKE '%ajwad%' OR s."radiologistName" LIKE '%أجود%'
        OR EXISTS (SELECT 1 FROM "RadiologyReport" r WHERE r."studyId" = s."id" AND (r."author" ILIKE '%ajwad%' OR r."author" LIKE '%أجود%')))
   AND NOT EXISTS (SELECT 1 FROM "ImagingStudy" o WHERE o."sourceStudyUid" = s."sourceStudyUid" AND o."id" <> s."id"
                    AND o."sourceHospitalId" = (SELECT "id" FROM "Hospital" WHERE "nameAr" = 'مستشفى الأمل التخصصي' LIMIT 1));
UPDATE "ImagingStudy" s
   SET "sourceHospitalId" = (SELECT "id" FROM "Hospital" WHERE "nameAr" = 'مستشفى الشفاء العام' LIMIT 1)
 WHERE EXISTS (SELECT 1 FROM "Hospital" WHERE "nameAr" = 'مستشفى الشفاء العام')
   AND (s."radiologistName" ILIKE '%lama%' OR s."radiologistName" LIKE '%لمى%'
        OR EXISTS (SELECT 1 FROM "RadiologyReport" r WHERE r."studyId" = s."id" AND (r."author" ILIKE '%lama%' OR r."author" LIKE '%لمى%')))
   AND NOT EXISTS (SELECT 1 FROM "ImagingStudy" o WHERE o."sourceStudyUid" = s."sourceStudyUid" AND o."id" <> s."id"
                    AND o."sourceHospitalId" = (SELECT "id" FROM "Hospital" WHERE "nameAr" = 'مستشفى الشفاء العام' LIMIT 1));

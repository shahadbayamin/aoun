-- Dr. Ajwad works at Al Amal Specialist Hospital and Dr. Lama at Al Shifa General Hospital (they were added the other way round).
UPDATE "ProfessionalAffiliation" a
   SET "hospitalId" = (SELECT "id" FROM "Hospital" WHERE "nameAr" = 'مستشفى الأمل التخصصي' LIMIT 1)
  FROM "HealthcareProfessional" hp JOIN "User" u ON u."id" = hp."userId"
 WHERE a."professionalId" = hp."id" AND u."email" ILIKE 'ajwad@%'
   AND EXISTS (SELECT 1 FROM "Hospital" WHERE "nameAr" = 'مستشفى الأمل التخصصي');
UPDATE "ProfessionalAffiliation" a
   SET "hospitalId" = (SELECT "id" FROM "Hospital" WHERE "nameAr" = 'مستشفى الشفاء العام' LIMIT 1)
  FROM "HealthcareProfessional" hp JOIN "User" u ON u."id" = hp."userId"
 WHERE a."professionalId" = hp."id" AND u."email" ILIKE 'lama@%'
   AND EXISTS (SELECT 1 FROM "Hospital" WHERE "nameAr" = 'مستشفى الشفاء العام');
-- Their current sign-ins carry the old hospital: end them so the next sign-in uses the new one.
DELETE FROM "Session" s USING "User" u WHERE s."userId" = u."id" AND (u."email" ILIKE 'ajwad@%' OR u."email" ILIKE 'lama@%');

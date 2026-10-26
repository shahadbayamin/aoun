-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PATIENT', 'RADIOLOGIST', 'DOCTOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "Portal" AS ENUM ('PATIENT', 'RADIOLOGY', 'ER', 'ADMIN');

-- CreateEnum
CREATE TYPE "IdType" AS ENUM ('NATIONAL_ID', 'IQAMA', 'HOSPITAL_MRN');

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "InfoSource" AS ENUM ('SELF_REPORTED', 'PROVIDER_VERIFIED', 'HOSPITAL_RECORD');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('MILD', 'MODERATE', 'SEVERE', 'LIFE_THREATENING');

-- CreateEnum
CREATE TYPE "HospitalType" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "AffiliationStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "Modality" AS ENUM ('XRAY', 'MRI', 'CT', 'ULTRASOUND', 'OTHER');

-- CreateEnum
CREATE TYPE "FileKind" AS ENUM ('IMAGE', 'REPORT');

-- CreateEnum
CREATE TYPE "FileFormat" AS ENUM ('DICOM', 'JPEG', 'PNG', 'PDF', 'VIDEO');

-- CreateEnum
CREATE TYPE "SourceStudyStatus" AS ENUM ('DRAFT', 'APPROVED');

-- CreateEnum
CREATE TYPE "StudyStatus" AS ENUM ('AVAILABLE', 'QUARANTINED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'SENDING', 'SYNCED', 'FAILED', 'RETRY', 'QUARANTINED');

-- CreateEnum
CREATE TYPE "AccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ConsentDecision" AS ENUM ('GRANTED', 'DENIED', 'REVOKED');

-- CreateEnum
CREATE TYPE "GrantType" AS ENUM ('CONSENT', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING_REVIEW', 'REVIEWED_APPROPRIATE', 'REVIEWED_INAPPROPRIATE');

-- CreateEnum
CREATE TYPE "EncounterType" AS ENUM ('RADIOLOGY', 'EMERGENCY', 'OUTPATIENT', 'INPATIENT');

-- CreateEnum
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCESS', 'DENIED', 'FAILURE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "email" TEXT,
    "username" TEXT,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "locale" TEXT NOT NULL DEFAULT 'ar',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "portal" "Portal" NOT NULL,
    "hospitalId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevIdentityRecord" (
    "id" TEXT NOT NULL,
    "idType" "IdType" NOT NULL,
    "identifierHash" TEXT NOT NULL,
    "maskedId" TEXT NOT NULL,
    "fullNameAr" TEXT NOT NULL,
    "fullNameEn" TEXT NOT NULL,
    "dateOfBirth" DATE NOT NULL,
    "sex" "Sex" NOT NULL,
    "phone" TEXT NOT NULL,

    CONSTRAINT "DevIdentityRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpChallenge" (
    "id" TEXT NOT NULL,
    "identifierHash" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "fullNameAr" TEXT NOT NULL,
    "fullNameEn" TEXT NOT NULL,
    "dateOfBirth" DATE NOT NULL,
    "sex" "Sex" NOT NULL,
    "maskedId" TEXT NOT NULL,
    "identityVerified" BOOLEAN NOT NULL DEFAULT false,
    "identityVerifiedAt" TIMESTAMP(3),
    "identitySource" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdentityMapping" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "idType" "IdType" NOT NULL,
    "identifierHash" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'GLOBAL',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verificationMethod" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdentityMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalProfile" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "bloodType" TEXT,
    "bloodTypeSource" "InfoSource",
    "bloodTypeVerifiedBy" TEXT,
    "noKnownAllergies" BOOLEAN NOT NULL DEFAULT false,
    "medicalAlerts" TEXT[],
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "emergencyContactRel" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicalProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Allergy" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "substance" TEXT NOT NULL,
    "reaction" TEXT,
    "severity" "Severity" NOT NULL DEFAULT 'MODERATE',
    "source" "InfoSource" NOT NULL,
    "hospitalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Allergy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChronicCondition" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icd10" TEXT,
    "sinceYear" INTEGER,
    "source" "InfoSource" NOT NULL,
    "hospitalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChronicCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Medication" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dose" TEXT,
    "frequency" TEXT,
    "highRisk" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "source" "InfoSource" NOT NULL,
    "hospitalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Medication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Surgery" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER,
    "hospitalName" TEXT,
    "source" "InfoSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Surgery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Encounter" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "type" "EncounterType" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Encounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hospital" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "type" "HospitalType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDemo" BOOLEAN NOT NULL DEFAULT true,
    "apiSecretEnc" TEXT NOT NULL,
    "apiKeyRotatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Hospital_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthcareProfessional" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullNameAr" TEXT NOT NULL,
    "fullNameEn" TEXT NOT NULL,
    "licenseNumber" TEXT NOT NULL,
    "profession" TEXT NOT NULL,
    "specialty" TEXT,
    "licenseVerified" BOOLEAN NOT NULL DEFAULT false,
    "licenseVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthcareProfessional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfessionalAffiliation" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "status" "AffiliationStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfessionalAffiliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalPatientIndex" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "mrn" TEXT NOT NULL,
    "idType" "IdType" NOT NULL,
    "nationalIdEnc" TEXT NOT NULL,
    "nationalIdHash" TEXT NOT NULL,
    "fullNameAr" TEXT NOT NULL,
    "fullNameEn" TEXT NOT NULL,
    "dateOfBirth" DATE NOT NULL,
    "sex" "Sex" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HospitalPatientIndex_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceStudy" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "hospitalPatientId" TEXT NOT NULL,
    "accessionNumber" TEXT NOT NULL,
    "studyInstanceUid" TEXT NOT NULL,
    "modality" "Modality" NOT NULL,
    "bodyRegion" TEXT NOT NULL,
    "examDate" TIMESTAMP(3) NOT NULL,
    "radiologistName" TEXT NOT NULL,
    "radiologistUserId" TEXT,
    "reportText" TEXT NOT NULL DEFAULT '',
    "status" "SourceStudyStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceStudy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceFile" (
    "id" TEXT NOT NULL,
    "sourceStudyId" TEXT NOT NULL,
    "kind" "FileKind" NOT NULL,
    "format" "FileFormat" NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImagingStudy" (
    "id" TEXT NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "patientId" TEXT,
    "sourceHospitalId" TEXT NOT NULL,
    "sourceStudyUid" TEXT NOT NULL,
    "accessionNumber" TEXT NOT NULL,
    "modality" "Modality" NOT NULL,
    "bodyRegion" TEXT NOT NULL,
    "examDate" TIMESTAMP(3) NOT NULL,
    "radiologistName" TEXT NOT NULL,
    "status" "StudyStatus" NOT NULL DEFAULT 'AVAILABLE',
    "quarantineReason" TEXT,
    "matchMethod" TEXT,
    "verifiedSource" BOOLEAN NOT NULL DEFAULT true,
    "contentHash" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImagingStudy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImagingFile" (
    "id" TEXT NOT NULL,
    "studyId" TEXT NOT NULL,
    "kind" "FileKind" NOT NULL,
    "format" "FileFormat" NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImagingFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadiologyReport" (
    "id" TEXT NOT NULL,
    "studyId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "finalizedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RadiologyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncJob" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "sourceStudyId" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "simulateFailures" INTEGER NOT NULL DEFAULT 0,
    "tareeStudyId" TEXT,
    "tareeReference" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncEvent" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "hospitalId" TEXT,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationReceipt" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "studyId" TEXT,
    "outcome" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QrSession" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QrSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QrScan" (
    "id" TEXT NOT NULL,
    "qrSessionId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QrScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessRequest" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "scanId" TEXT,
    "purpose" TEXT NOT NULL,
    "note" TEXT,
    "scopes" TEXT[],
    "status" "AccessRequestStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientConsent" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "accessRequestId" TEXT,
    "professionalId" TEXT,
    "hospitalId" TEXT,
    "decision" "ConsentDecision" NOT NULL,
    "scopes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessGrant" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "type" "GrantType" NOT NULL,
    "scopes" TEXT[],
    "accessRequestId" TEXT,
    "emergencyEventId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmergencyAccessEvent" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "scanId" TEXT,
    "purposeCode" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "attested" BOOLEAN NOT NULL,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewedBy" TEXT,
    "reviewNotes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmergencyAccessEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT,
    "actorRole" TEXT,
    "actorLabel" TEXT NOT NULL,
    "hospitalId" TEXT,
    "action" TEXT NOT NULL,
    "outcome" "AuditOutcome" NOT NULL,
    "patientId" TEXT,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "details" JSONB,
    "prevHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "bodyAr" TEXT NOT NULL,
    "bodyEn" TEXT NOT NULL,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DevIdentityRecord_identifierHash_key" ON "DevIdentityRecord"("identifierHash");

-- CreateIndex
CREATE INDEX "OtpChallenge_identifierHash_idx" ON "OtpChallenge"("identifierHash");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_userId_key" ON "Patient"("userId");

-- CreateIndex
CREATE INDEX "IdentityMapping_patientId_idx" ON "IdentityMapping"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "IdentityMapping_idType_identifierHash_scope_key" ON "IdentityMapping"("idType", "identifierHash", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "MedicalProfile_patientId_key" ON "MedicalProfile"("patientId");

-- CreateIndex
CREATE INDEX "Encounter_patientId_date_idx" ON "Encounter"("patientId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Hospital_code_key" ON "Hospital"("code");

-- CreateIndex
CREATE UNIQUE INDEX "HealthcareProfessional_userId_key" ON "HealthcareProfessional"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthcareProfessional_licenseNumber_key" ON "HealthcareProfessional"("licenseNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ProfessionalAffiliation_professionalId_hospitalId_key" ON "ProfessionalAffiliation"("professionalId", "hospitalId");

-- CreateIndex
CREATE INDEX "HospitalPatientIndex_hospitalId_nationalIdHash_idx" ON "HospitalPatientIndex"("hospitalId", "nationalIdHash");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalPatientIndex_hospitalId_mrn_key" ON "HospitalPatientIndex"("hospitalId", "mrn");

-- CreateIndex
CREATE UNIQUE INDEX "SourceStudy_accessionNumber_key" ON "SourceStudy"("accessionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SourceStudy_studyInstanceUid_key" ON "SourceStudy"("studyInstanceUid");

-- CreateIndex
CREATE UNIQUE INDEX "ImagingStudy_referenceNumber_key" ON "ImagingStudy"("referenceNumber");

-- CreateIndex
CREATE INDEX "ImagingStudy_patientId_examDate_idx" ON "ImagingStudy"("patientId", "examDate");

-- CreateIndex
CREATE UNIQUE INDEX "ImagingStudy_sourceHospitalId_sourceStudyUid_key" ON "ImagingStudy"("sourceHospitalId", "sourceStudyUid");

-- CreateIndex
CREATE UNIQUE INDEX "RadiologyReport_studyId_key" ON "RadiologyReport"("studyId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncJob_eventId_key" ON "SyncJob"("eventId");

-- CreateIndex
CREATE INDEX "SyncJob_status_nextAttemptAt_idx" ON "SyncJob"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "SyncEvent_jobId_createdAt_idx" ON "SyncEvent"("jobId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationReceipt_hospitalId_eventId_key" ON "IntegrationReceipt"("hospitalId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "QrSession_tokenHash_key" ON "QrSession"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "AccessGrant_accessRequestId_key" ON "AccessGrant"("accessRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessGrant_emergencyEventId_key" ON "AccessGrant"("emergencyEventId");

-- CreateIndex
CREATE INDEX "AccessGrant_professionalId_expiresAt_idx" ON "AccessGrant"("professionalId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_seq_key" ON "AuditLog"("seq");

-- CreateIndex
CREATE INDEX "AuditLog_patientId_createdAt_idx" ON "AuditLog"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityMapping" ADD CONSTRAINT "IdentityMapping_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalProfile" ADD CONSTRAINT "MedicalProfile_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allergy" ADD CONSTRAINT "Allergy_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChronicCondition" ADD CONSTRAINT "ChronicCondition_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Medication" ADD CONSTRAINT "Medication_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Surgery" ADD CONSTRAINT "Surgery_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthcareProfessional" ADD CONSTRAINT "HealthcareProfessional_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalAffiliation" ADD CONSTRAINT "ProfessionalAffiliation_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "HealthcareProfessional"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalAffiliation" ADD CONSTRAINT "ProfessionalAffiliation_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalPatientIndex" ADD CONSTRAINT "HospitalPatientIndex_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceStudy" ADD CONSTRAINT "SourceStudy_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceStudy" ADD CONSTRAINT "SourceStudy_hospitalPatientId_fkey" FOREIGN KEY ("hospitalPatientId") REFERENCES "HospitalPatientIndex"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceFile" ADD CONSTRAINT "SourceFile_sourceStudyId_fkey" FOREIGN KEY ("sourceStudyId") REFERENCES "SourceStudy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImagingStudy" ADD CONSTRAINT "ImagingStudy_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImagingStudy" ADD CONSTRAINT "ImagingStudy_sourceHospitalId_fkey" FOREIGN KEY ("sourceHospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImagingFile" ADD CONSTRAINT "ImagingFile_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "ImagingStudy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadiologyReport" ADD CONSTRAINT "RadiologyReport_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "ImagingStudy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncJob" ADD CONSTRAINT "SyncJob_sourceStudyId_fkey" FOREIGN KEY ("sourceStudyId") REFERENCES "SourceStudy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncJob" ADD CONSTRAINT "SyncJob_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncEvent" ADD CONSTRAINT "SyncEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "SyncJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncEvent" ADD CONSTRAINT "SyncEvent_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QrSession" ADD CONSTRAINT "QrSession_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QrScan" ADD CONSTRAINT "QrScan_qrSessionId_fkey" FOREIGN KEY ("qrSessionId") REFERENCES "QrSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QrScan" ADD CONSTRAINT "QrScan_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QrScan" ADD CONSTRAINT "QrScan_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "HealthcareProfessional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "HealthcareProfessional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientConsent" ADD CONSTRAINT "PatientConsent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessGrant" ADD CONSTRAINT "AccessGrant_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessGrant" ADD CONSTRAINT "AccessGrant_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "HealthcareProfessional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessGrant" ADD CONSTRAINT "AccessGrant_accessRequestId_fkey" FOREIGN KEY ("accessRequestId") REFERENCES "AccessRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessGrant" ADD CONSTRAINT "AccessGrant_emergencyEventId_fkey" FOREIGN KEY ("emergencyEventId") REFERENCES "EmergencyAccessEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyAccessEvent" ADD CONSTRAINT "EmergencyAccessEvent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyAccessEvent" ADD CONSTRAINT "EmergencyAccessEvent_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "HealthcareProfessional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


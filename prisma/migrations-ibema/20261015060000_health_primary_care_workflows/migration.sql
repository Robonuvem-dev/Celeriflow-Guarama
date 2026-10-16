ALTER TABLE "HealthHousehold" ADD COLUMN "housingDetails" JSONB;
ALTER TABLE "HealthFamily" ADD COLUMN classification TEXT, ADD COLUMN "familyType" TEXT, ADD COLUMN "unitId" TEXT, ADD COLUMN "teamId" TEXT;
ALTER TABLE "HealthHomeVisitParticipant" ADD COLUMN outcome TEXT NOT NULL DEFAULT 'PRESENT', ADD COLUMN "refusalReason" TEXT,
 ADD COLUMN weight DOUBLE PRECISION, ADD COLUMN height DOUBLE PRECISION, ADD COLUMN "bloodPressure" TEXT,
 ADD COLUMN temperature DOUBLE PRECISION, ADD COLUMN "heartRate" INTEGER, ADD COLUMN "bloodGlucose" DOUBLE PRECISION;
CREATE TABLE "HealthFamilyEvent" (
 id TEXT PRIMARY KEY, "familyId" TEXT NOT NULL REFERENCES "HealthFamily"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "eventType" TEXT NOT NULL, "personId" TEXT, "effectiveAt" TIMESTAMP(3) NOT NULL, reason TEXT NOT NULL, snapshot JSONB NOT NULL,
 "actorUsuarioId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "HealthFamilyEvent_familyId_effectiveAt_idx" ON "HealthFamilyEvent"("familyId","effectiveAt");
CREATE TABLE "HealthFamilyDocument" (
 id TEXT PRIMARY KEY, "familyId" TEXT NOT NULL REFERENCES "Family"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "documentId" TEXT NOT NULL REFERENCES "Document"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "actorUsuarioId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("familyId","documentId")
);
CREATE TABLE "HealthHomeCareRequest" (
 id TEXT PRIMARY KEY, "patientId" TEXT NOT NULL REFERENCES "Patient"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "unitId" TEXT NOT NULL, "requestedAt" TIMESTAMP(3) NOT NULL, reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'REQUESTED',
 "createdByUsuarioId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "HealthHomeCareRequest_unitId_status_idx" ON "HealthHomeCareRequest"("unitId",status);
CREATE TABLE "HealthHomeCareAssessment" (
 id TEXT PRIMARY KEY, "requestId" TEXT NOT NULL REFERENCES "HealthHomeCareRequest"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "assessedAt" TIMESTAMP(3) NOT NULL, "professionalId" TEXT NOT NULL, eligible BOOLEAN NOT NULL, modality TEXT NOT NULL,
 "cidReferenceId" TEXT, character TEXT NOT NULL, evaluation TEXT NOT NULL, "actorUsuarioId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "HealthHomeCareAttendance" (
 id TEXT PRIMARY KEY, "requestId" TEXT NOT NULL REFERENCES "HealthHomeCareRequest"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "assessmentId" TEXT NOT NULL REFERENCES "HealthHomeCareAssessment"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "medicalRecordId" TEXT NOT NULL UNIQUE, "performedAt" TIMESTAMP(3) NOT NULL, "actorUsuarioId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "HealthCollectiveActivity" (
 id TEXT PRIMARY KEY, "unitId" TEXT NOT NULL, "teamId" TEXT NOT NULL, "professionalId" TEXT NOT NULL,
 "occurredAt" TIMESTAMP(3) NOT NULL, "activityType" TEXT NOT NULL, themes TEXT[] NOT NULL, practices TEXT[] NOT NULL,
 "participantIds" TEXT[] NOT NULL, "procedureId" TEXT, notes TEXT, "createdByUsuarioId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "HealthCollectiveActivity_unitId_occurredAt_idx" ON "HealthCollectiveActivity"("unitId","occurredAt");
CREATE TABLE "HealthFoodMarker" (
 id TEXT PRIMARY KEY, "patientId" TEXT NOT NULL REFERENCES "Patient"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "unitId" TEXT NOT NULL, "professionalId" TEXT NOT NULL, "recordedAt" TIMESTAMP(3) NOT NULL, "ageGroup" TEXT NOT NULL,
 place TEXT NOT NULL, markers JSONB NOT NULL, "actorUsuarioId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "HealthFoodMarker_patientId_recordedAt_idx" ON "HealthFoodMarker"("patientId","recordedAt");

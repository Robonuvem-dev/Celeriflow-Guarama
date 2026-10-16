ALTER TABLE "Person" ALTER COLUMN "cpf" DROP NOT NULL;
ALTER TABLE "Person" ADD COLUMN "motherUnknown" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "fatherUnknown" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "HealthPatientRegistration" (
 "patientId" TEXT PRIMARY KEY REFERENCES "Patient"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 stage TEXT NOT NULL DEFAULT 'COMPLETE', "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "contactStartTime" TEXT, "contactEndTime" TEXT, workplace TEXT, "socialMotherName" TEXT, "socialFatherName" TEXT,
 "deathRegisteredAt" TIMESTAMP(3), "deathMunicipality" TEXT, "deathCause" TEXT, "deathCidReferenceId" TEXT, "photoDocumentId" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "HealthPatientRegistrationChange" (
 id TEXT PRIMARY KEY, "patientId" TEXT NOT NULL REFERENCES "Patient"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "actorUsuarioId" TEXT NOT NULL, changes JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "HealthPatientRegistrationChange_patientId_createdAt_idx" ON "HealthPatientRegistrationChange"("patientId","createdAt");
CREATE TABLE "HealthPatientContact" (
 id TEXT PRIMARY KEY, "patientId" TEXT NOT NULL REFERENCES "Patient"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 name TEXT NOT NULL, phone TEXT NOT NULL, kinship TEXT NOT NULL, "relationshipKind" TEXT NOT NULL DEFAULT 'BIOLOGICAL',
 "startTime" TEXT, "endTime" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT true, "actorUsuarioId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "HealthPatientContact_patientId_isActive_idx" ON "HealthPatientContact"("patientId","isActive");
CREATE TABLE "HealthPatientDocument" (
 id TEXT PRIMARY KEY, "patientId" TEXT NOT NULL REFERENCES "Patient"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "documentId" TEXT NOT NULL REFERENCES "Document"(id) ON DELETE RESTRICT ON UPDATE CASCADE, kind TEXT NOT NULL,
 "actorUsuarioId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "HealthPatientDocument_patientId_documentId_key" ON "HealthPatientDocument"("patientId","documentId");

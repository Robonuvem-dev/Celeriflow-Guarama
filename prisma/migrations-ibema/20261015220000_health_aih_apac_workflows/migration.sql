CREATE TABLE "HealthAuthorizationIssuer" (
 "id" TEXT PRIMARY KEY, "code" TEXT NOT NULL UNIQUE, "name" TEXT NOT NULL, "typeCode" TEXT NOT NULL,
 "sourceReference" TEXT NOT NULL, "isActive" BOOLEAN NOT NULL DEFAULT true, "createdByUsuarioId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "HealthAuthorizationNumberRange" (
 "id" TEXT PRIMARY KEY, "issuerId" TEXT NOT NULL REFERENCES "HealthAuthorizationIssuer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "kind" TEXT NOT NULL, "firstNumber" TEXT NOT NULL, "lastNumber" TEXT NOT NULL, "nextNumber" TEXT NOT NULL,
 "validFrom" DATE NOT NULL, "validUntil" DATE NOT NULL, "sourceReference" TEXT NOT NULL,
 "createdByUsuarioId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "HealthAuthorizationNumberRange_kind_validFrom_validUntil_idx" ON "HealthAuthorizationNumberRange"("kind", "validFrom", "validUntil");
CREATE TABLE "HealthTreatmentReport" (
 "id" TEXT PRIMARY KEY, "kind" TEXT NOT NULL, "patientId" TEXT NOT NULL REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "unitId" TEXT NOT NULL REFERENCES "HealthUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "professionalId" TEXT NOT NULL REFERENCES "HealthProfessional"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "medicalRecordId" TEXT REFERENCES "MedicalRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "version" INTEGER NOT NULL DEFAULT 1, "status" TEXT NOT NULL DEFAULT 'SOLICITADA',
 "diagnosis" TEXT NOT NULL, "diagnosticCode" TEXT, "clinicalHistory" TEXT NOT NULL, "examinations" TEXT NOT NULL,
 "treatmentJustification" TEXT NOT NULL, "admissionAt" TIMESTAMP(3), "plannedStart" DATE NOT NULL, "plannedEnd" DATE NOT NULL,
 "initialApac" BOOLEAN NOT NULL DEFAULT true, "patientSnapshot" JSONB NOT NULL, "professionalSnapshot" JSONB NOT NULL,
 "renewalOfId" TEXT UNIQUE REFERENCES "HealthTreatmentReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "paidManuallyAt" TIMESTAMP(3), "paidManuallyByUsuarioId" TEXT, "manualPaymentReference" TEXT,
 "dischargedAt" TIMESTAMP(3), "dischargeOutcome" TEXT, "createdByUsuarioId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "HealthTreatmentReport_kind_unitId_status_idx" ON "HealthTreatmentReport"("kind", "unitId", "status");
CREATE INDEX "HealthTreatmentReport_patientId_createdAt_idx" ON "HealthTreatmentReport"("patientId", "createdAt");
CREATE TABLE "HealthTreatmentReportProcedure" (
 "id" TEXT PRIMARY KEY, "reportId" TEXT NOT NULL REFERENCES "HealthTreatmentReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "procedureId" TEXT NOT NULL REFERENCES "HealthSusProcedure"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "role" TEXT NOT NULL, "quantity" INTEGER NOT NULL CHECK ("quantity" > 0), "performerProfessionalId" TEXT REFERENCES "HealthProfessional"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 UNIQUE ("reportId", "procedureId", "role")
);
CREATE TABLE "HealthTreatmentReportRevision" (
 "id" TEXT PRIMARY KEY, "reportId" TEXT NOT NULL REFERENCES "HealthTreatmentReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "version" INTEGER NOT NULL, "snapshot" JSONB NOT NULL, "reason" TEXT NOT NULL, "actorUsuarioId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE ("reportId", "version")
);
CREATE TABLE "HealthTreatmentReportEvent" (
 "id" TEXT PRIMARY KEY, "reportId" TEXT NOT NULL REFERENCES "HealthTreatmentReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "eventType" TEXT NOT NULL, "fromStatus" TEXT, "toStatus" TEXT NOT NULL, "reason" TEXT NOT NULL,
 "actorUsuarioId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "HealthTreatmentReportEvent_reportId_createdAt_idx" ON "HealthTreatmentReportEvent"("reportId", "createdAt");
CREATE TABLE "HealthTreatmentAuthorization" (
 "id" TEXT PRIMARY KEY, "reportId" TEXT NOT NULL UNIQUE REFERENCES "HealthTreatmentReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "rangeId" TEXT NOT NULL REFERENCES "HealthAuthorizationNumberRange"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "kind" TEXT NOT NULL, "number" TEXT NOT NULL, "reportVersion" INTEGER NOT NULL, "validFrom" DATE NOT NULL, "validUntil" DATE NOT NULL,
 "authorizedByUsuarioId" TEXT NOT NULL, "authorizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "status" TEXT NOT NULL DEFAULT 'ATIVA',
 "cancelledAt" TIMESTAMP(3), "cancelledByUsuarioId" TEXT, "cancellationReason" TEXT, UNIQUE ("kind", "number")
);
ALTER TABLE "HealthProductionFact" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
CREATE TABLE "HealthProductionFactRevision" (
 "id" TEXT PRIMARY KEY, "factId" TEXT NOT NULL REFERENCES "HealthProductionFact"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "version" INTEGER NOT NULL, "before" JSONB NOT NULL, "after" JSONB NOT NULL, "reason" TEXT NOT NULL, "actorUsuarioId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE ("factId", "version")
);

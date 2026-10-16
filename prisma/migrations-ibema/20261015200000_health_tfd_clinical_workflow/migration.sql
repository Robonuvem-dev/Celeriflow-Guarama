CREATE TABLE "HealthTfdClinicalReport" (
  "id" TEXT PRIMARY KEY, "requestId" TEXT NOT NULL UNIQUE REFERENCES "HealthTfdRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "version" INTEGER NOT NULL DEFAULT 1, "medicalRecordId" TEXT, "professionalId" TEXT NOT NULL, "procedureId" TEXT,
  "diagnosis" TEXT NOT NULL, "diagnosticCode" TEXT, "clinicalHistory" TEXT NOT NULL, "examinations" TEXT NOT NULL,
  "treatment" TEXT NOT NULL, "localTreatmentUnavailableReason" TEXT NOT NULL, "transportType" TEXT NOT NULL,
  "transportJustification" TEXT NOT NULL, "companionRequired" BOOLEAN NOT NULL DEFAULT false, "companionJustification" TEXT,
  "patientSnapshot" JSONB NOT NULL, "professionalSnapshot" JSONB NOT NULL, "createdByUsuarioId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "HealthTfdClinicalReport_professionalId_procedureId_idx" ON "HealthTfdClinicalReport"("professionalId", "procedureId");
CREATE TABLE "HealthTfdReportRevision" (
  "id" TEXT PRIMARY KEY, "reportId" TEXT NOT NULL REFERENCES "HealthTfdClinicalReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "version" INTEGER NOT NULL, "snapshot" JSONB NOT NULL, "reason" TEXT NOT NULL, "actorUsuarioId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE ("reportId", "version")
);
CREATE TABLE "HealthTfdReportSupplement" (
  "id" TEXT PRIMARY KEY, "reportId" TEXT NOT NULL REFERENCES "HealthTfdClinicalReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "reportVersion" INTEGER NOT NULL, "narrative" TEXT NOT NULL, "actorUsuarioId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "HealthTfdReportSupplement_reportId_createdAt_idx" ON "HealthTfdReportSupplement"("reportId", "createdAt");
CREATE TABLE "HealthTfdRequestEvent" (
  "id" TEXT PRIMARY KEY, "requestId" TEXT NOT NULL REFERENCES "HealthTfdRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "eventType" TEXT NOT NULL, "fromStatus" TEXT, "toStatus" TEXT NOT NULL, "reportVersion" INTEGER,
  "reason" TEXT NOT NULL, "actorUsuarioId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "HealthTfdRequestEvent_requestId_createdAt_idx" ON "HealthTfdRequestEvent"("requestId", "createdAt");
CREATE TABLE "HealthTfdBenefit" (
  "id" TEXT PRIMARY KEY, "requestId" TEXT NOT NULL REFERENCES "HealthTfdRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "reportVersion" INTEGER NOT NULL, "kind" TEXT NOT NULL, "description" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL CHECK ("quantity" > 0), "unitValue" DECIMAL(14,2) CHECK ("unitValue" >= 0),
  "status" TEXT NOT NULL DEFAULT 'SOLICITADO', "createdByUsuarioId" TEXT NOT NULL,
  "authorizedByUsuarioId" TEXT, "authorizedAt" TIMESTAMP(3), "deliveredByUsuarioId" TEXT,
  "deliveredAt" TIMESTAMP(3), "receivedByPersonId" TEXT, "deliveryReceipt" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "HealthTfdBenefit_requestId_status_idx" ON "HealthTfdBenefit"("requestId", "status");
ALTER TABLE "HealthTfdClinicalReport" ADD FOREIGN KEY ("professionalId") REFERENCES "HealthProfessional"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD FOREIGN KEY ("procedureId") REFERENCES "HealthSusProcedure"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD FOREIGN KEY ("medicalRecordId") REFERENCES "MedicalRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthTfdBenefit" ADD FOREIGN KEY ("receivedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

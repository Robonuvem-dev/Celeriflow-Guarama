CREATE TABLE "SstAccessGrant" (
  "id" TEXT NOT NULL, "usuarioId" TEXT NOT NULL, "budgetUnitId" TEXT NOT NULL,
  "canReadClinical" BOOLEAN NOT NULL DEFAULT false, "canAssess" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "SstAccessGrant_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SstCertificateReason" (
  "id" TEXT NOT NULL, "budgetUnitId" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL,
  "dependentPolicy" TEXT NOT NULL DEFAULT 'DISABLED', "restrictedRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "autoProtocol" BOOLEAN NOT NULL DEFAULT true, "autoPresentedAt" BOOLEAN NOT NULL DEFAULT true,
  "printReceipt" BOOLEAN NOT NULL DEFAULT false, "suggestLeave" BOOLEAN NOT NULL DEFAULT false,
  "createLeaveOnApproval" BOOLEAN NOT NULL DEFAULT false, "leaveType" TEXT NOT NULL DEFAULT 'Licença médica',
  "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "SstCertificateReason_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SstMedicalCertificate" (
  "id" TEXT NOT NULL, "budgetUnitId" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "reasonId" TEXT NOT NULL,
  "issuerPersonId" TEXT NOT NULL, "issuerCouncil" TEXT NOT NULL, "dependentId" TEXT, "relationship" TEXT,
  "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL, "presentedAt" TIMESTAMP(3) NOT NULL,
  "protocolNumber" TEXT NOT NULL, "processId" TEXT, "status" TEXT NOT NULL DEFAULT 'RECEIVED', "cidCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "leaveId" TEXT, "roleIdSnapshot" TEXT, "departmentIdSnapshot" TEXT, "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SstMedicalCertificate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SstMedicalCertificate_interval_check" CHECK ("endsAt" > "startsAt")
);
CREATE TABLE "SstMedicalAssessment" (
  "id" TEXT NOT NULL, "certificateId" TEXT NOT NULL, "examinerPersonId" TEXT NOT NULL,
  "examinerCouncil" TEXT NOT NULL, "decision" TEXT NOT NULL, "opinion" TEXT NOT NULL,
  "assessedAt" TIMESTAMP(3) NOT NULL, "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "SstMedicalAssessment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SstAccessGrant_usuarioId_budgetUnitId_key" ON "SstAccessGrant"("usuarioId", "budgetUnitId");
CREATE TABLE "SstCertificateDocument" (
  "id" TEXT NOT NULL, "certificateId" TEXT NOT NULL, "documentId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SstCertificateDocument_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SstCertificateDocument_documentId_key" ON "SstCertificateDocument"("documentId");
CREATE INDEX "SstCertificateDocument_certificateId_idx" ON "SstCertificateDocument"("certificateId");
ALTER TABLE "SstCertificateDocument" ADD CONSTRAINT "SstCertificateDocument_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "SstMedicalCertificate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SstCertificateDocument" ADD CONSTRAINT "SstCertificateDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
INSERT INTO "DocumentClass" ("id", "code", "label", "signaturePolicy", "isActive", "createdAt", "updatedAt")
VALUES ('sst-occupational-document-class', 'SST_OCUPACIONAL', 'Documento ocupacional restrito', 'ICP_REQUIRED', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
CREATE UNIQUE INDEX "SstCertificateReason_budgetUnitId_code_key" ON "SstCertificateReason"("budgetUnitId", "code");
CREATE UNIQUE INDEX "SstMedicalCertificate_budgetUnitId_protocolNumber_key" ON "SstMedicalCertificate"("budgetUnitId", "protocolNumber");
CREATE UNIQUE INDEX "SstMedicalCertificate_leaveId_key" ON "SstMedicalCertificate"("leaveId");
CREATE INDEX "SstMedicalCertificate_budgetUnitId_employeeId_startsAt_idx" ON "SstMedicalCertificate"("budgetUnitId", "employeeId", "startsAt");
CREATE INDEX "SstMedicalCertificate_budgetUnitId_status_presentedAt_idx" ON "SstMedicalCertificate"("budgetUnitId", "status", "presentedAt");
CREATE INDEX "SstMedicalAssessment_certificateId_assessedAt_idx" ON "SstMedicalAssessment"("certificateId", "assessedAt");
ALTER TABLE "SstAccessGrant" ADD CONSTRAINT "SstAccessGrant_budgetUnitId_fkey" FOREIGN KEY ("budgetUnitId") REFERENCES "BudgetUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SstAccessGrant" ADD CONSTRAINT "SstAccessGrant_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SstCertificateReason" ADD CONSTRAINT "SstCertificateReason_budgetUnitId_fkey" FOREIGN KEY ("budgetUnitId") REFERENCES "BudgetUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SstMedicalCertificate" ADD CONSTRAINT "SstMedicalCertificate_budgetUnitId_fkey" FOREIGN KEY ("budgetUnitId") REFERENCES "BudgetUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SstMedicalCertificate" ADD CONSTRAINT "SstMedicalCertificate_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SstMedicalCertificate" ADD CONSTRAINT "SstMedicalCertificate_dependentId_fkey" FOREIGN KEY ("dependentId") REFERENCES "Dependent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SstMedicalCertificate" ADD CONSTRAINT "SstMedicalCertificate_reasonId_fkey" FOREIGN KEY ("reasonId") REFERENCES "SstCertificateReason"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SstMedicalCertificate" ADD CONSTRAINT "SstMedicalCertificate_issuerPersonId_fkey" FOREIGN KEY ("issuerPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SstMedicalCertificate" ADD CONSTRAINT "SstMedicalCertificate_leaveId_fkey" FOREIGN KEY ("leaveId") REFERENCES "Leave"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SstMedicalCertificate" ADD CONSTRAINT "SstMedicalCertificate_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SstMedicalAssessment" ADD CONSTRAINT "SstMedicalAssessment_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "SstMedicalCertificate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SstMedicalAssessment" ADD CONSTRAINT "SstMedicalAssessment_examinerPersonId_fkey" FOREIGN KEY ("examinerPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

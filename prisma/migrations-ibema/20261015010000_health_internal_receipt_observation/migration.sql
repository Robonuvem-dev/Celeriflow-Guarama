ALTER TABLE "HealthStockReceipt"
  ADD COLUMN "donorName" TEXT,
  ADD COLUMN "invoiceIssuedAt" TIMESTAMP(3),
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "approvedByUsuarioId" TEXT;

ALTER TABLE "HealthStockReceiptItem" ADD COLUMN "manufacturerName" TEXT;

ALTER TABLE "HealthObservation" ADD COLUMN "medicalRecordId" TEXT;
CREATE UNIQUE INDEX "HealthObservation_medicalRecordId_key" ON "HealthObservation"("medicalRecordId");
ALTER TABLE "HealthObservation" ADD CONSTRAINT "HealthObservation_medicalRecordId_fkey"
  FOREIGN KEY ("medicalRecordId") REFERENCES "MedicalRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MedicineDispensation"
  ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "prescriptionType" TEXT NOT NULL DEFAULT 'SIMPLE',
  ADD COLUMN "prescriberProfessionalId" TEXT REFERENCES "HealthProfessional"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD COLUMN "receiverPersonId" TEXT REFERENCES "Person"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD COLUMN "receiverRelationship" TEXT,
  ADD COLUMN "cancelledAt" TIMESTAMP(3), ADD COLUMN "cancelledByUsuarioId" TEXT,
  ADD COLUMN "cancellationReason" TEXT, ADD COLUMN "reversalMovementId" TEXT UNIQUE;
CREATE TABLE "HealthDispensationEvent" (
  id TEXT PRIMARY KEY,
  "dispensationId" TEXT NOT NULL REFERENCES "MedicineDispensation"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  kind TEXT NOT NULL, reason TEXT NOT NULL, snapshot JSONB NOT NULL, "actorUsuarioId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "HealthDispensationEvent_dispensationId_createdAt_idx" ON "HealthDispensationEvent"("dispensationId", "createdAt");
UPDATE "MedicineDispensation" d SET "prescriptionType"=p."prescriptionType", "prescriberProfessionalId"=p."professionalId"
FROM "HealthPrescriptionItem" i JOIN "HealthPrescription" p ON p.id=i."prescriptionId"
WHERE d."prescriptionItemId"=i.id;
UPDATE "MedicineDispensation" d SET "prescriptionType"='CONTROLLED'
FROM "Medicine" m WHERE d."medicineId"=m.id AND d."prescriptionItemId" IS NULL AND m."isControlled"=true;

CREATE TABLE "HealthPatientConditionRevision" (
  id TEXT PRIMARY KEY,
  "conditionId" TEXT NOT NULL REFERENCES "HealthPatientCondition"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "medicalRecordId" TEXT NOT NULL,
  "actorUsuarioId" TEXT NOT NULL,
  before JSONB,
  after JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "HealthPatientConditionRevision_conditionId_createdAt_idx" ON "HealthPatientConditionRevision"("conditionId", "createdAt");

CREATE TABLE "PlanningImportBatch" (
  "id" TEXT PRIMARY KEY,
  "sourceInstrumentId" TEXT NOT NULL REFERENCES "PlanningInstrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "targetInstrumentId" TEXT NOT NULL REFERENCES "PlanningInstrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "mode" TEXT NOT NULL CHECK ("mode" IN ('STRUCTURE', 'VALUES')),
  "selectedLineIds" TEXT[] NOT NULL,
  "targetYear" INTEGER NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "submissionKey" TEXT NOT NULL UNIQUE,
  "importedCount" INTEGER NOT NULL CHECK ("importedCount" >= 0),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "planning_import_distinct" CHECK ("sourceInstrumentId" <> "targetInstrumentId")
);
CREATE INDEX "PlanningImportBatch_targetInstrumentId_createdAt_idx" ON "PlanningImportBatch"("targetInstrumentId", "createdAt");

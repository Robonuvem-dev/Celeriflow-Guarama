CREATE TABLE "ConstructionInspectionPlan" (
 "id" TEXT PRIMARY KEY, "caseId" TEXT NOT NULL UNIQUE REFERENCES "ConstructionCase"("id") ON DELETE RESTRICT,
 "requestKey" TEXT NOT NULL UNIQUE, "reviewId" TEXT NOT NULL REFERENCES "ConstructionReview"("id") ON DELETE RESTRICT,
 "inspectionTypes" JSONB NOT NULL, "definitionSnapshot" JSONB NOT NULL, "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "ConstructionLifecycleStart" (
 "id" TEXT PRIMARY KEY, "caseId" TEXT NOT NULL UNIQUE REFERENCES "ConstructionCase"("id") ON DELETE RESTRICT,
 "requestKey" TEXT NOT NULL UNIQUE, "startedAt" DATE NOT NULL, "notes" TEXT NOT NULL, "evidenceSnapshot" JSONB NOT NULL,
 "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "ConstructionInspection" (
 "id" TEXT PRIMARY KEY, "caseId" TEXT NOT NULL REFERENCES "ConstructionCase"("id") ON DELETE RESTRICT,
 "requestKey" TEXT NOT NULL UNIQUE, "inspectionTypeId" TEXT NOT NULL REFERENCES "ConstructionCatalogEntry"("id") ON DELETE RESTRICT,
 "sequence" INTEGER NOT NULL CHECK ("sequence" > 0),
 "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "scheduledAt" DATE, "inspectedAt" DATE,
 "status" TEXT NOT NULL DEFAULT 'REQUESTED' CHECK ("status" IN ('REQUESTED','APPROVED','FAILED')),
 "requestNotes" TEXT NOT NULL, "resultNotes" TEXT, "definitionSnapshot" JSONB NOT NULL, "evidenceSnapshot" JSONB NOT NULL DEFAULT '{}',
 "requestedBy" TEXT NOT NULL, "inspectedBy" TEXT, "resultRequestKey" TEXT UNIQUE,
 CONSTRAINT "ConstructionInspection_caseId_sequence_key" UNIQUE ("caseId", "sequence")
);
CREATE INDEX "ConstructionInspection_caseId_inspectionTypeId_status_idx" ON "ConstructionInspection"("caseId","inspectionTypeId","status");
CREATE TABLE "ConstructionCompletionSequence" ("year" INTEGER PRIMARY KEY, "nextNumber" INTEGER NOT NULL CHECK ("nextNumber" > 0));
CREATE TABLE "ConstructionCompletion" (
 "id" TEXT PRIMARY KEY, "caseId" TEXT NOT NULL REFERENCES "ConstructionCase"("id") ON DELETE RESTRICT,
 "requestKey" TEXT NOT NULL UNIQUE, "number" TEXT NOT NULL UNIQUE, "kind" TEXT NOT NULL CHECK ("kind" IN ('PARTIAL','TOTAL')),
 "completedAt" DATE NOT NULL, "area" DECIMAL(14,4) NOT NULL CHECK ("area" > 0),
 "cumulativeArea" DECIMAL(14,4) NOT NULL, "remainingArea" DECIMAL(14,4) NOT NULL CHECK ("remainingArea" >= 0),
 "notes" TEXT NOT NULL, "evidenceSnapshot" JSONB NOT NULL, "debtSnapshot" JSONB NOT NULL,
 "occupancyDocumentId" TEXT UNIQUE REFERENCES "Document"("id") ON DELETE RESTRICT,
 "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ("cumulativeArea" >= "area"),
 CHECK (("kind" = 'TOTAL' AND "remainingArea" = 0) OR ("kind" = 'PARTIAL' AND "remainingArea" > 0))
);
CREATE INDEX "ConstructionCompletion_caseId_createdAt_idx" ON "ConstructionCompletion"("caseId","createdAt");
CREATE TABLE "ConstructionPropertyUpdate" (
 "id" TEXT PRIMARY KEY, "completionId" TEXT NOT NULL UNIQUE REFERENCES "ConstructionCompletion"("id") ON DELETE RESTRICT,
 "requestKey" TEXT NOT NULL UNIQUE, "processId" TEXT NOT NULL UNIQUE REFERENCES "Process"("id") ON DELETE RESTRICT,
 "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','APPLIED')),
 "proposedSnapshot" JSONB NOT NULL, "beforeSnapshot" JSONB, "afterSnapshot" JSONB,
 "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "appliedBy" TEXT, "appliedAt" TIMESTAMP(3)
);

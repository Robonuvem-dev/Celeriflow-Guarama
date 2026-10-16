ALTER TABLE "ConstructionCase" ADD COLUMN "reviewStatus" TEXT NOT NULL DEFAULT 'SUBMITTED', ADD COLUMN "revisionCount" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "firstAnalystId" TEXT REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE, ADD COLUMN "correctionDeadline" TIMESTAMP(3);
ALTER TABLE "ConstructionCase" ADD CONSTRAINT "ConstructionCase_review_status_check" CHECK ("reviewStatus" IN ('SUBMITTED','CORRECTION_REQUIRED','RESUBMITTED','APPROVED','DENIED')),
 ADD CONSTRAINT "ConstructionCase_revision_count_check" CHECK ("revisionCount" >= 0);
CREATE TABLE "ConstructionReview" (
 "id" TEXT PRIMARY KEY, "caseId" TEXT NOT NULL REFERENCES "ConstructionCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "requestKey" TEXT NOT NULL, "revision" INTEGER NOT NULL CHECK ("revision" >= 0),
 "reviewType" TEXT NOT NULL CHECK ("reviewType" IN ('PREANALYSIS','PROJECT')), "decision" TEXT NOT NULL CHECK ("decision" IN ('CORRECTION_REQUIRED','APPROVED','DENIED')),
 "notes" TEXT NOT NULL, "definitionSnapshot" JSONB NOT NULL, "evidenceSnapshot" JSONB NOT NULL,
 "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ConstructionReview_requestKey_key" ON "ConstructionReview"("requestKey");
CREATE INDEX "ConstructionReview_caseId_createdAt_idx" ON "ConstructionReview"("caseId","createdAt");
CREATE TRIGGER "ConstructionReview_immutable" BEFORE UPDATE OR DELETE ON "ConstructionReview" FOR EACH ROW EXECUTE FUNCTION "construction_config_immutable"();

-- Existing pre-temporal revisions retain their full snapshots. Their validity
-- baseline is the documented admission date; no past payroll is rewritten.
ALTER TABLE "HrEmploymentRevision" ADD COLUMN "effectiveFrom" TIMESTAMP(3);
ALTER TABLE "HrEmploymentRevision" DISABLE TRIGGER hr_revision_immutable;
UPDATE "HrEmploymentRevision"
 SET "effectiveFrom" = COALESCE((snapshot->>'admittedAt')::timestamp, "createdAt");
ALTER TABLE "HrEmploymentRevision" ENABLE TRIGGER hr_revision_immutable;
ALTER TABLE "HrEmploymentRevision" ALTER COLUMN "effectiveFrom" SET NOT NULL;
CREATE INDEX "HrEmploymentRevision_contractId_effectiveFrom_version_idx"
 ON "HrEmploymentRevision"("contractId", "effectiveFrom", version);

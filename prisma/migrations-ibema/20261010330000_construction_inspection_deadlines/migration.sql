ALTER TABLE "ConstructionInspection"
 ADD COLUMN "correctionDeadline" TIMESTAMP(3),
 ADD COLUMN "requirementNote" TEXT,
 ADD COLUMN "correctionSnapshot" JSONB,
 ADD COLUMN "reinspectionOfId" TEXT REFERENCES "ConstructionInspection"("id") ON DELETE RESTRICT;

-- Legacy failures retain their history; no retroactive notification/deadline is fabricated.
UPDATE "ConstructionInspection" SET "requirementNote"="resultNotes",
 "correctionSnapshot"='{"legacy":true,"requiresManagerRegularization":true}'::jsonb WHERE "status"='FAILED';

-- Existing pending reinspections must not hide/renew an unresolved legacy failure.
UPDATE "ConstructionInspection" i SET "reinspectionOfId"=(
 SELECT f."id" FROM "ConstructionInspection" f
 WHERE f."caseId"=i."caseId" AND f."inspectionTypeId"=i."inspectionTypeId" AND f."status"='FAILED' AND f."sequence"<i."sequence"
 AND NOT EXISTS (SELECT 1 FROM "ConstructionInspection" a WHERE a."caseId"=f."caseId" AND a."inspectionTypeId"=f."inspectionTypeId" AND a."status"='APPROVED' AND a."sequence">f."sequence" AND a."sequence"<i."sequence")
 ORDER BY f."sequence" DESC LIMIT 1
) WHERE i."status"='REQUESTED';

ALTER TABLE "ConstructionInspection" ADD CONSTRAINT "ConstructionInspection_failed_requirement_check"
 CHECK ("status" <> 'FAILED' OR COALESCE(("correctionSnapshot"->>'legacy')='true', false)
 OR ("correctionDeadline" IS NOT NULL AND length(btrim(COALESCE("requirementNote",''))) >= 10));

CREATE TABLE "ConstructionInspectionDeadlineExtension" (
 "id" TEXT PRIMARY KEY,
 "requestKey" TEXT NOT NULL UNIQUE,
 "caseId" TEXT NOT NULL REFERENCES "ConstructionCase"("id") ON DELETE RESTRICT,
 "inspectionId" TEXT NOT NULL REFERENCES "ConstructionInspection"("id") ON DELETE RESTRICT,
 "previousDeadline" TIMESTAMP(3), "newDeadline" TIMESTAMP(3) NOT NULL,
 "reason" TEXT NOT NULL CHECK (length(btrim("reason")) >= 10),
 "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ("previousDeadline" IS NULL OR "newDeadline" > "previousDeadline")
);
CREATE INDEX "ConstructionInspectionDeadlineExtension_inspectionId_createdAt_idx" ON "ConstructionInspectionDeadlineExtension"("inspectionId","createdAt");
CREATE FUNCTION "construction_inspection_deadline_history_immutable"() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Histórico de regularização de prazo de vistoria é imutável'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "ConstructionInspectionDeadlineExtension_immutable" BEFORE UPDATE OR DELETE ON "ConstructionInspectionDeadlineExtension"
 FOR EACH ROW EXECUTE FUNCTION "construction_inspection_deadline_history_immutable"();

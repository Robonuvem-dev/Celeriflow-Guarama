CREATE TABLE "ConstructionFederalExport" (
 "id" TEXT PRIMARY KEY, "requestKey" TEXT NOT NULL UNIQUE, "scope" TEXT NOT NULL, "period" TEXT NOT NULL, "version" INTEGER NOT NULL,
 "layout" TEXT NOT NULL DEFAULT 'MUNICIPAL_DEMO_JSON_V1', "payload" TEXT NOT NULL, "hashSha256" TEXT NOT NULL, "validationSnapshot" JSONB NOT NULL,
 "rectifiesId" TEXT REFERENCES "ConstructionFederalExport"("id") ON DELETE RESTRICT, "reason" TEXT, "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("scope", "period", "version")
);
CREATE TABLE "ConstructionFederalExportItem" (
 "id" TEXT PRIMARY KEY, "exportId" TEXT NOT NULL REFERENCES "ConstructionFederalExport"("id") ON DELETE RESTRICT,
 "caseId" TEXT NOT NULL REFERENCES "ConstructionCase"("id") ON DELETE RESTRICT, UNIQUE ("exportId", "caseId")
);
CREATE TABLE "ConstructionFederalExportReceipt" (
 "id" TEXT PRIMARY KEY, "exportId" TEXT NOT NULL REFERENCES "ConstructionFederalExport"("id") ON DELETE RESTRICT,
 "protocol" TEXT NOT NULL, "destination" TEXT NOT NULL, "submittedAt" TIMESTAMP(3) NOT NULL, "evidenceUrl" TEXT NOT NULL, "evidenceHash" TEXT NOT NULL,
 "notes" TEXT NOT NULL, "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE ("exportId", "protocol")
);
CREATE TABLE "ConstructionPlanExtraction" (
 "id" TEXT PRIMARY KEY, "caseId" TEXT NOT NULL REFERENCES "ConstructionCase"("id") ON DELETE RESTRICT, "requestKey" TEXT NOT NULL UNIQUE,
 "filename" TEXT NOT NULL, "sourceUrl" TEXT NOT NULL, "sourceHash" TEXT NOT NULL, "engine" TEXT NOT NULL, "model" TEXT NOT NULL, "status" TEXT NOT NULL,
 "pages" JSONB NOT NULL, "measurements" JSONB NOT NULL, "comparison" JSONB NOT NULL, "limitations" JSONB NOT NULL,
 "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ConstructionPlanExtraction_caseId_createdAt_idx" ON "ConstructionPlanExtraction"("caseId", "createdAt");
-- Export bytes and evidence are append-only, including rectifications and manual receipts.
CREATE FUNCTION construction_export_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Construction export evidence is immutable'; END $$;
CREATE TRIGGER construction_export_immutable BEFORE UPDATE OR DELETE ON "ConstructionFederalExport" FOR EACH ROW EXECUTE FUNCTION construction_export_immutable();
CREATE TRIGGER construction_export_item_immutable BEFORE UPDATE OR DELETE ON "ConstructionFederalExportItem" FOR EACH ROW EXECUTE FUNCTION construction_export_immutable();
CREATE TRIGGER construction_export_receipt_immutable BEFORE UPDATE OR DELETE ON "ConstructionFederalExportReceipt" FOR EACH ROW EXECUTE FUNCTION construction_export_immutable();
CREATE TRIGGER construction_extraction_immutable BEFORE UPDATE OR DELETE ON "ConstructionPlanExtraction" FOR EACH ROW EXECUTE FUNCTION construction_export_immutable();

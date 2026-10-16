-- Does not alter the immutable CAT/evidence migration or its historical rows.
CREATE TABLE "SstCatLayoutVersion" (
 "id" TEXT PRIMARY KEY, "catId" TEXT NOT NULL REFERENCES "SstCat"("id") ON DELETE RESTRICT,
 "version" INTEGER NOT NULL CHECK ("version">0), "mode" TEXT NOT NULL CHECK ("mode" IN ('DRAFT','COMPLETE')),
 "layoutVersion" TEXT NOT NULL, "templateSha256" TEXT NOT NULL CHECK ("templateSha256" ~ '^[a-f0-9]{64}$'),
 "provenance" JSONB NOT NULL, "fields" JSONB NOT NULL, "canonicalSnapshot" JSONB NOT NULL,
 "originalReceipt" TEXT, "createdById" TEXT NOT NULL REFERENCES "Usuario"("id"),
 "submissionKey" TEXT NOT NULL UNIQUE, "requestHash" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE("catId","version")
);
CREATE TABLE "SstCatLayoutMedical" (
 "layoutVersionId" TEXT PRIMARY KEY REFERENCES "SstCatLayoutVersion"("id") ON DELETE RESTRICT,
 "medicalEvidenceId" TEXT NOT NULL REFERENCES "SstCatEvidence"("id") ON DELETE RESTRICT,
 "fields" JSONB NOT NULL, "createdById" TEXT NOT NULL REFERENCES "Usuario"("id")
);
CREATE TRIGGER "sst_cat_layout_immutable" BEFORE UPDATE OR DELETE ON "SstCatLayoutVersion" FOR EACH ROW EXECUTE FUNCTION sst_accident_immutable();
CREATE TRIGGER "sst_cat_layout_medical_immutable" BEFORE UPDATE OR DELETE ON "SstCatLayoutMedical" FOR EACH ROW EXECUTE FUNCTION sst_accident_immutable();
CREATE FUNCTION sst_cat_layout_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "SstCatEvidence" e JOIN "SstCatLayoutVersion" l ON l."id"=NEW."layoutVersionId" WHERE e."id"=NEW."medicalEvidenceId" AND e."catId"=l."catId" AND e."kind"='ATTENDANCE' AND e."clinical") THEN RAISE EXCEPTION 'Medical attendance must belong to the same CAT'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "sst_cat_layout_binding" BEFORE INSERT ON "SstCatLayoutMedical" FOR EACH ROW EXECUTE FUNCTION sst_cat_layout_binding();
CREATE FUNCTION sst_cat_layout_complete_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."mode"='COMPLETE' AND NOT EXISTS (SELECT 1 FROM "SstCatLayoutMedical" WHERE "layoutVersionId"=NEW."id") THEN RAISE EXCEPTION 'Complete CAT layout requires same-transaction medical attendance'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER "sst_cat_layout_complete_guard" AFTER INSERT ON "SstCatLayoutVersion" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sst_cat_layout_complete_guard();
ALTER TABLE "SstRestrictionEmailOutbox" ADD COLUMN "claimedAt" TIMESTAMP(3), ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "nextAttemptAt" TIMESTAMP(3), ADD COLUMN "lastAttemptAt" TIMESTAMP(3);
CREATE INDEX "SstRestrictionEmailOutbox_due_status" ON "SstRestrictionEmailOutbox"("status","dueAt","id");
-- A crash after provider acceptance is intentionally not auto-replayed after the provider's
-- 24-hour idempotency window. SENDING is surfaced for reconciliation, never falsely SENT.

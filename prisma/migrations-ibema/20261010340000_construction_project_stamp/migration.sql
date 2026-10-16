CREATE TABLE "ConstructionProjectStamp" (
 "id" TEXT PRIMARY KEY, "requestKey" TEXT NOT NULL UNIQUE,
 "caseId" TEXT NOT NULL REFERENCES "ConstructionCase"("id") ON DELETE RESTRICT,
 "reviewId" TEXT NOT NULL REFERENCES "ConstructionReview"("id") ON DELETE RESTRICT,
 "templateVersionId" TEXT NOT NULL REFERENCES "ConstructionDocumentTemplateVersion"("id") ON DELETE RESTRICT,
 "sourceDocumentId" TEXT NOT NULL REFERENCES "Document"("id") ON DELETE RESTRICT,
 "sourceVersionId" TEXT NOT NULL REFERENCES "DocumentVersion"("id") ON DELETE RESTRICT,
 "originalHash" TEXT NOT NULL, "originalBackupPath" TEXT NOT NULL,
 "documentId" TEXT NOT NULL UNIQUE REFERENCES "Document"("id") ON DELETE RESTRICT,
 "documentVersionId" TEXT NOT NULL UNIQUE REFERENCES "DocumentVersion"("id") ON DELETE RESTRICT,
 "fileUrl" TEXT NOT NULL, "hashSha256" TEXT NOT NULL, "backupPath" TEXT NOT NULL,
 "validationCode" TEXT NOT NULL UNIQUE, "stampSnapshot" JSONB NOT NULL,
 "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "publishedAt" TIMESTAMP(3),
 UNIQUE("caseId","sourceVersionId","reviewId")
);
CREATE INDEX "ConstructionProjectStamp_caseId_createdAt_idx" ON "ConstructionProjectStamp"("caseId","createdAt");
CREATE FUNCTION construction_document_snapshot_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Construction document snapshot is immutable'; END;
$$;
CREATE TRIGGER construction_template_immutable BEFORE UPDATE OR DELETE ON "ConstructionDocumentTemplateVersion" FOR EACH ROW EXECUTE FUNCTION construction_document_snapshot_immutable();
CREATE TRIGGER construction_pdf_annotation_immutable BEFORE UPDATE OR DELETE ON "ConstructionPdfAnnotation" FOR EACH ROW EXECUTE FUNCTION construction_document_snapshot_immutable();
CREATE FUNCTION construction_issued_document_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Construction issued document cannot be deleted'; END IF;
 IF (to_jsonb(NEW)-'status'-'publishedAt') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'publishedAt') THEN RAISE EXCEPTION 'Construction issued document snapshot is immutable'; END IF;
 IF NOT ((OLD.status='ISSUED' AND NEW.status='PUBLISHED' AND NEW."publishedAt" IS NOT NULL) OR (OLD.status='PUBLISHED' AND NEW.status='SUPERSEDED' AND NEW."publishedAt"=OLD."publishedAt")) THEN RAISE EXCEPTION 'Invalid construction document publication transition'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER construction_issued_document_immutable BEFORE UPDATE OR DELETE ON "ConstructionIssuedDocument" FOR EACH ROW EXECUTE FUNCTION construction_issued_document_immutable();
CREATE FUNCTION construction_project_stamp_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'publishedAt') IS DISTINCT FROM (to_jsonb(OLD)-'publishedAt') OR OLD."publishedAt" IS NOT NULL OR NEW."publishedAt" IS NULL THEN RAISE EXCEPTION 'Construction project stamp is immutable'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER construction_project_stamp_immutable BEFORE UPDATE OR DELETE ON "ConstructionProjectStamp" FOR EACH ROW EXECUTE FUNCTION construction_project_stamp_immutable();

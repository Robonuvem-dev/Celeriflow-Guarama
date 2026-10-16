-- Additive configuration for native accounting/execution. Historical budgets remain in preparation
-- until the responsible actors validate posting rules, opening evidence and quota baselines.
ALTER TABLE "AnnualBudgetLaw" ADD COLUMN "metadata" JSONB;
CREATE TABLE "PlanningDocumentLink" (
  "id" TEXT PRIMARY KEY,
  "instrumentId" TEXT NOT NULL REFERENCES "PlanningInstrument"("id") ON DELETE RESTRICT,
  "hearingId" TEXT REFERENCES "PlanningHearing"("id") ON DELETE RESTRICT,
  "documentId" TEXT NOT NULL REFERENCES "Document"("id") ON DELETE RESTRICT,
  "documentVersionId" TEXT NOT NULL REFERENCES "DocumentVersion"("id") ON DELETE RESTRICT,
  "purpose" TEXT NOT NULL CHECK ("purpose" IN ('ANNEX','LEGAL_ACT','HEARING_MINUTES')),
  "targetKey" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("instrumentId", "documentId", "targetKey")
);
CREATE INDEX "PlanningDocumentLink_hearingId_idx" ON "PlanningDocumentLink"("hearingId");
CREATE FUNCTION planning_document_target_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Vínculo documental preservado não pode ser alterado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "DocumentVersion" v WHERE v.id = NEW."documentVersionId" AND v."documentId" = NEW."documentId") THEN
    RAISE EXCEPTION 'Versão fora do documento vinculado';
  END IF;
  IF NEW.purpose = 'HEARING_MINUTES' AND NEW."hearingId" IS NULL THEN
    RAISE EXCEPTION 'Ata exige audiência vinculada';
  END IF;
  IF NEW."hearingId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "PlanningHearing" h WHERE h.id = NEW."hearingId" AND h."instrumentId" = NEW."instrumentId") THEN
    RAISE EXCEPTION 'Audiência fora da peça do documento';
  END IF;
  IF NEW."targetKey" <> NEW.purpose || ':' || COALESCE(NEW."hearingId", 'instrument') THEN
    RAISE EXCEPTION 'Destino documental inconsistente';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER planning_document_target BEFORE INSERT OR UPDATE ON "PlanningDocumentLink" FOR EACH ROW EXECUTE FUNCTION planning_document_target_guard();

CREATE TABLE "ConstructionAutomaticViabilityRun" (
  "id" TEXT PRIMARY KEY,
  "requestKey" TEXT NOT NULL UNIQUE,
  "caseId" TEXT NOT NULL REFERENCES "ConstructionCase"("id") ON DELETE RESTRICT,
  "identityId" TEXT NOT NULL REFERENCES "ConstructionPortalIdentity"("id") ON DELETE RESTRICT,
  "outcome" TEXT NOT NULL CHECK ("outcome" IN ('APPROVED','DENIED','MANUAL')),
  "calculationSnapshot" JSONB NOT NULL,
  "viabilityResultId" TEXT NOT NULL UNIQUE REFERENCES "ConstructionViabilityResult"("id") ON DELETE RESTRICT,
  "documentId" TEXT UNIQUE REFERENCES "Document"("id") ON DELETE RESTRICT,
  "documentVersionId" TEXT UNIQUE REFERENCES "DocumentVersion"("id") ON DELETE RESTRICT,
  "signatureRoutingStatus" TEXT NOT NULL CHECK ("signatureRoutingStatus" IN ('REQUESTED','AWAITING_SIGNER_CONFIGURATION','NOT_APPLICABLE')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (("documentId" IS NULL) = ("documentVersionId" IS NULL))
);
CREATE INDEX "ConstructionAutomaticViabilityRun_caseId_createdAt_idx" ON "ConstructionAutomaticViabilityRun"("caseId", "createdAt");
CREATE FUNCTION construction_automatic_viability_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Memória de viabilidade automática imutável';
END;
$$;
CREATE TRIGGER construction_automatic_viability_immutable BEFORE UPDATE OR DELETE ON "ConstructionAutomaticViabilityRun"
FOR EACH ROW EXECUTE FUNCTION construction_automatic_viability_immutable();

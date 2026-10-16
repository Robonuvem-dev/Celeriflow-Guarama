CREATE TABLE "CemeteryFeeRuleVersion" (
  "id" TEXT PRIMARY KEY, "ruleId" TEXT NOT NULL UNIQUE REFERENCES "CemeteryFeeRule"("id") ON DELETE RESTRICT,
  "scopeKey" TEXT NOT NULL, "cemeteryId" TEXT REFERENCES "TaxCemetery"("id") ON DELETE RESTRICT,
  "eventType" TEXT NOT NULL, "version" INTEGER NOT NULL CHECK ("version" > 0),
  "label" TEXT NOT NULL, "formula" TEXT NOT NULL CHECK ("formula" IN ('VALOR_FIXO','BASE_X_QUANTIDADE')),
  "baseAmount" DECIMAL(18,2) NOT NULL CHECK ("baseAmount" > 0), "dueDays" INTEGER NOT NULL CHECK ("dueDays" BETWEEN 0 AND 365),
  "taxId" TEXT NOT NULL REFERENCES "Tax"("id") ON DELETE RESTRICT,
  "validFrom" TIMESTAMP(3) NOT NULL, "validUntil" TIMESTAMP(3), "legalBasis" TEXT NOT NULL,
  "publishedBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("scopeKey","eventType","version"), CHECK ("validUntil" IS NULL OR "validUntil" >= "validFrom")
);
CREATE INDEX "CemeteryFeeRuleVersion_eventType_cemeteryId_validFrom_idx" ON "CemeteryFeeRuleVersion"("eventType","cemeteryId","validFrom");
CREATE TABLE "CemeteryFeeEvent" (
  "id" TEXT PRIMARY KEY, "eventKey" TEXT NOT NULL UNIQUE, "eventType" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL, "sourceId" TEXT NOT NULL, "cemeteryId" TEXT REFERENCES "TaxCemetery"("id") ON DELETE RESTRICT,
  "taxpayerId" TEXT REFERENCES "Taxpayer"("id") ON DELETE RESTRICT,
  "occurredAt" TIMESTAMP(3) NOT NULL, "quantity" DECIMAL(18,4) NOT NULL CHECK ("quantity" > 0),
  "ruleVersionId" TEXT REFERENCES "CemeteryFeeRuleVersion"("id") ON DELETE RESTRICT,
  "calculationSnapshot" JSONB, "amount" DECIMAL(18,2), "dueDate" TIMESTAMP(3),
  "assessmentId" TEXT UNIQUE REFERENCES "TaxAssessment"("id") ON DELETE RESTRICT,
  "guideId" TEXT UNIQUE REFERENCES "TaxGuide"("id") ON DELETE RESTRICT,
  "status" TEXT NOT NULL DEFAULT 'AGUARDANDO_CONFIGURACAO', "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "chargedAt" TIMESTAMP(3),
  UNIQUE ("eventType","sourceType","sourceId")
);
CREATE INDEX "CemeteryFeeEvent_status_occurredAt_idx" ON "CemeteryFeeEvent"("status","occurredAt");
CREATE INDEX "CemeteryFeeEvent_cemeteryId_occurredAt_idx" ON "CemeteryFeeEvent"("cemeteryId","occurredAt");
CREATE FUNCTION cemetery_fee_immutable_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Published cemetery fee versions are immutable'; END; $$;
CREATE TRIGGER cemetery_fee_version_immutable BEFORE UPDATE OR DELETE ON "CemeteryFeeRuleVersion" FOR EACH ROW EXECUTE FUNCTION cemetery_fee_immutable_version();
CREATE FUNCTION cemetery_fee_immutable_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Cemetery fee events cannot be deleted'; END IF;
  IF ROW(NEW."eventKey",NEW."eventType",NEW."sourceType",NEW."sourceId",NEW."cemeteryId",NEW."taxpayerId",NEW."occurredAt",NEW."quantity",NEW."createdAt") IS DISTINCT FROM
     ROW(OLD."eventKey",OLD."eventType",OLD."sourceType",OLD."sourceId",OLD."cemeteryId",OLD."taxpayerId",OLD."occurredAt",OLD."quantity",OLD."createdAt") THEN
    RAISE EXCEPTION 'Cemetery fee event facts are immutable';
  END IF;
  IF OLD."ruleVersionId" IS NOT NULL AND ROW(NEW."ruleVersionId",NEW."calculationSnapshot",NEW."amount",NEW."dueDate") IS DISTINCT FROM ROW(OLD."ruleVersionId",OLD."calculationSnapshot",OLD."amount",OLD."dueDate") THEN
    RAISE EXCEPTION 'Cemetery fee calculation snapshot is immutable';
  END IF;
  IF OLD."assessmentId" IS NOT NULL AND ROW(NEW."assessmentId",NEW."guideId",NEW."chargedAt") IS DISTINCT FROM ROW(OLD."assessmentId",OLD."guideId",OLD."chargedAt") THEN
    RAISE EXCEPTION 'Cemetery fee charge links are immutable';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER cemetery_fee_event_immutable BEFORE UPDATE OR DELETE ON "CemeteryFeeEvent" FOR EACH ROW EXECUTE FUNCTION cemetery_fee_immutable_event();

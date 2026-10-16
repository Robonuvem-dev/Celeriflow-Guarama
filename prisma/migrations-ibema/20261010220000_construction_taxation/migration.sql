CREATE TABLE "ConstructionTaxRuleVersion" (
 "id" TEXT NOT NULL PRIMARY KEY, "kind" TEXT NOT NULL, "version" INTEGER NOT NULL,
 "taxId" TEXT NOT NULL REFERENCES "Tax"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "startsAt" DATE NOT NULL, "endsAt" DATE, "fixedAmount" DECIMAL(18,2) NOT NULL,
 "amountPerSquareMeter" DECIMAL(18,4) NOT NULL, "legalBasis" TEXT NOT NULL,
 "guideInstructions" TEXT NOT NULL, "demonstration" BOOLEAN NOT NULL DEFAULT true,
 "publishedBy" TEXT NOT NULL, "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ConstructionTaxRuleVersion_values_check" CHECK ("fixedAmount">=0 AND "amountPerSquareMeter">=0 AND ("endsAt" IS NULL OR "endsAt">="startsAt"))
);
CREATE UNIQUE INDEX "ConstructionTaxRuleVersion_kind_version_key" ON "ConstructionTaxRuleVersion"("kind","version");
CREATE TABLE "ConstructionFee" (
 "id" TEXT NOT NULL PRIMARY KEY, "caseId" TEXT NOT NULL REFERENCES "ConstructionCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "kind" TEXT NOT NULL, "revision" INTEGER NOT NULL DEFAULT 0, "cycleKey" TEXT NOT NULL DEFAULT 'INITIAL', "requestKey" TEXT NOT NULL,
 "ruleId" TEXT NOT NULL REFERENCES "ConstructionTaxRuleVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "taxpayerId" TEXT NOT NULL REFERENCES "Taxpayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "realEstateId" TEXT NOT NULL REFERENCES "RealEstate"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "assessmentId" TEXT REFERENCES "TaxAssessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "amount" DECIMAL(18,2) NOT NULL, "calculationSnapshot" JSONB NOT NULL, "exemptionReason" TEXT,
 "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ConstructionFee_values_check" CHECK (amount>=0 AND revision>=0),
 CONSTRAINT "ConstructionFee_cycle_check" CHECK (
   (kind IN ('CORRECTION','RENEWAL') AND "cycleKey" LIKE 'DOCUMENT_REQUEST:%' AND length("cycleKey")>17 AND revision=0)
   OR (kind NOT IN ('CORRECTION','RENEWAL') AND "cycleKey"='INITIAL')
 )
);
CREATE UNIQUE INDEX "ConstructionFee_requestKey_key" ON "ConstructionFee"("requestKey");
CREATE UNIQUE INDEX "ConstructionFee_assessmentId_key" ON "ConstructionFee"("assessmentId");
CREATE UNIQUE INDEX "ConstructionFee_caseId_kind_cycleKey_revision_key" ON "ConstructionFee"("caseId","kind","cycleKey","revision");
CREATE FUNCTION construction_taxation_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Construction taxation records are immutable'; END;
$$;
CREATE TRIGGER construction_tax_rule_immutable BEFORE UPDATE OR DELETE ON "ConstructionTaxRuleVersion" FOR EACH ROW EXECUTE FUNCTION construction_taxation_immutable();
CREATE FUNCTION construction_fee_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Construction fee cannot be deleted'; END IF;
 IF (to_jsonb(NEW) - 'assessmentId') IS DISTINCT FROM (to_jsonb(OLD) - 'assessmentId') OR OLD."assessmentId" IS NOT NULL THEN RAISE EXCEPTION 'Construction fee evidence is immutable'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER construction_fee_immutable BEFORE UPDATE OR DELETE ON "ConstructionFee" FOR EACH ROW EXECUTE FUNCTION construction_fee_immutable();

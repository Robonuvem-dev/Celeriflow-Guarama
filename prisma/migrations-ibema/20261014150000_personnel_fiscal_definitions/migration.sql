CREATE TABLE "MunicipalPersonnelFiscalDefinition" (
  id TEXT PRIMARY KEY, "financialYearId" TEXT NOT NULL REFERENCES "FinancialYear"(id),
  revision INTEGER NOT NULL CHECK (revision>0), "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "legalReference" TEXT NOT NULL, "legalLimit" DECIMAL(9,4) NOT NULL,
  "prudentialLimit" DECIMAL(9,4) NOT NULL, "alertLimit" DECIMAL(9,4) NOT NULL,
  definition JSONB NOT NULL, reason TEXT NOT NULL, "actorId" TEXT NOT NULL REFERENCES "Usuario"(id),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("legalLimit">0 AND "legalLimit"<=100 AND "prudentialLimit">0 AND "prudentialLimit"<="legalLimit" AND "alertLimit">0 AND "alertLimit"<="prudentialLimit")
);
CREATE UNIQUE INDEX "MunicipalPersonnelFiscalDefinition_financialYearId_revision_key" ON "MunicipalPersonnelFiscalDefinition" ("financialYearId",revision);
CREATE INDEX "MunicipalPersonnelFiscalDefinition_financialYearId_effectiveFrom_idx" ON "MunicipalPersonnelFiscalDefinition" ("financialYearId","effectiveFrom");
CREATE FUNCTION personnel_fiscal_definition_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Composição fiscal de pessoal é aditiva; registre nova revisão'; END $$;
CREATE TRIGGER "MunicipalPersonnelFiscalDefinition_immutable" BEFORE UPDATE OR DELETE ON "MunicipalPersonnelFiscalDefinition" FOR EACH ROW EXECUTE FUNCTION personnel_fiscal_definition_immutable();

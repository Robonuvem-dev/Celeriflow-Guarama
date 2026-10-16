CREATE TABLE "MunicipalFiscalIndexDefinition" (
  "id" TEXT PRIMARY KEY,
  "financialYearId" TEXT NOT NULL REFERENCES "FinancialYear"("id") ON DELETE RESTRICT,
  "code" TEXT NOT NULL CHECK ("code" IN ('HEALTH_MINIMUM','EDUCATION_MINIMUM')),
  "revision" INTEGER NOT NULL CHECK ("revision" > 0),
  "legalReference" TEXT NOT NULL CHECK (BTRIM("legalReference") <> ''),
  "minimumPercentage" NUMERIC(9,4) NOT NULL CHECK ("minimumPercentage" > 0 AND "minimumPercentage" <= 100),
  "effectiveFrom" DATE NOT NULL, "definition" JSONB NOT NULL,
  "reason" TEXT NOT NULL, "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("financialYearId","code","revision")
);
CREATE INDEX "MunicipalFiscalIndexDefinition_scope" ON "MunicipalFiscalIndexDefinition"("financialYearId","code","effectiveFrom");
CREATE FUNCTION municipal_fiscal_definition_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Composição fiscal é versionada; registre nova revisão'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "FinancialYear" WHERE id=NEW."financialYearId" AND "governmentEntityId" IS NOT NULL) THEN RAISE EXCEPTION 'Composição fiscal exige exercício com entidade'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER municipal_fiscal_definition_integrity BEFORE INSERT OR UPDATE OR DELETE ON "MunicipalFiscalIndexDefinition" FOR EACH ROW EXECUTE FUNCTION municipal_fiscal_definition_guard();

-- Keep legacy single-entity exercises (NULL entity) while allowing independent years and closes.
ALTER TABLE "FinancialYear" DROP CONSTRAINT IF EXISTS "FinancialYear_year_key";
DROP INDEX IF EXISTS "FinancialYear_year_key";
ALTER TABLE "FinancialYear" ADD COLUMN "governmentEntityId" TEXT;
ALTER TABLE "FinancialYear"
  ADD CONSTRAINT "FinancialYear_governmentEntityId_fkey"
    FOREIGN KEY ("governmentEntityId") REFERENCES "GovernmentEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "FinancialYear_governmentEntityId_year_key"
  ON "FinancialYear"("governmentEntityId", "year");
CREATE UNIQUE INDEX "FinancialYear_legacy_year_key"
  ON "FinancialYear"("year") WHERE "governmentEntityId" IS NULL;
CREATE INDEX "FinancialYear_year_status_idx"
  ON "FinancialYear"("year", "status");

-- Bind P0-created LDO/LOA instruments to the entity-specific exercise, leaving the global legacy rows intact.
INSERT INTO "FinancialYear" (id, year, "governmentEntityId", status, "startDate", "endDate", "createdAt", "updatedAt")
SELECT 'p0-current-fin-year-' || e.id || '-' || y.year, y.year, e.id, 'Preparação', y."startDate", y."endDate", now(), now()
FROM "GovernmentEntity" e
CROSS JOIN "FinancialYear" y
WHERE e.id IN ('entity_executivo_ibema', 'entity_camara_ibema', 'p0-current-exe', 'p0-current-leg')
  AND y."governmentEntityId" IS NULL
ON CONFLICT ("governmentEntityId", year) DO NOTHING;

UPDATE "BudgetGuideline" g
SET "financialYearId" = scoped.id
FROM "PlanningInstrument" i, "FinancialYear" old_year, "FinancialYear" scoped
WHERE i."budgetGuidelineId" = g.id
  AND old_year.id = g."financialYearId"
  AND scoped.year = old_year.year
  AND scoped."governmentEntityId" = i."governmentEntityId"
  AND i.id LIKE 'p0-current-%-piece-ldo-%';

UPDATE "AnnualBudgetLaw" l
SET "financialYearId" = scoped.id
FROM "PlanningInstrument" i, "BudgetGuideline" g, "FinancialYear" old_year, "FinancialYear" scoped
WHERE i."annualBudgetLawId" = l.id
  AND g.id = l."budgetGuidelineId"
  AND old_year.id = l."financialYearId"
  AND scoped.year = old_year.year
  AND scoped."governmentEntityId" = i."governmentEntityId"
  AND i.id LIKE 'p0-current-%-piece-loa-%';

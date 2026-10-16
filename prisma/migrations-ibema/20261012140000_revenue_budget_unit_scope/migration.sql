ALTER TABLE "Revenue" ADD COLUMN "budgetUnitId" TEXT;
ALTER TABLE "Revenue" ADD CONSTRAINT "Revenue_budgetUnitId_fkey" FOREIGN KEY ("budgetUnitId") REFERENCES "BudgetUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Revenue_budgetUnitId_financialYearId_stage_date_idx" ON "Revenue"("budgetUnitId", "financialYearId", "stage", "date");

-- Preserve legacy rows: only infer the scope where an actual originating account exists.
UPDATE "Revenue" r SET "budgetUnitId" = b."budgetUnitId"
FROM "BankAccount" b WHERE r."bankAccountId" = b.id AND b."budgetUnitId" IS NOT NULL;

CREATE FUNCTION validate_revenue_budget_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE year_entity TEXT; unit_entity TEXT; bank_unit TEXT;
BEGIN
  SELECT "governmentEntityId" INTO year_entity FROM "FinancialYear" WHERE id = NEW."financialYearId";
  IF NEW."budgetUnitId" IS NOT NULL THEN
    SELECT "governmentEntityId" INTO unit_entity FROM "PlanningEntityUnit" WHERE "budgetUnitId" = NEW."budgetUnitId";
  END IF;
  IF year_entity IS NOT NULL AND (unit_entity IS NULL OR unit_entity <> year_entity) THEN
    RAISE EXCEPTION 'Revenue scope must match the entity-scoped financial year';
  END IF;
  IF NEW."bankAccountId" IS NOT NULL AND NEW."budgetUnitId" IS NOT NULL THEN
    SELECT "budgetUnitId" INTO bank_unit FROM "BankAccount" WHERE id = NEW."bankAccountId";
    IF bank_unit IS DISTINCT FROM NEW."budgetUnitId" THEN
      RAISE EXCEPTION 'Revenue collecting bank account must belong to the originating budget unit';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Revenue_validate_budget_scope" BEFORE INSERT OR UPDATE OF "budgetUnitId", "financialYearId", "bankAccountId" ON "Revenue" FOR EACH ROW EXECUTE FUNCTION validate_revenue_budget_scope();

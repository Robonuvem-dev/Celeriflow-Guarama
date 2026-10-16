-- Additive P1 foundation: keep existing ledger rows readable and explicitly unscoped.
ALTER TABLE "AccountingTransaction"
  ADD COLUMN "governmentEntityId" TEXT,
  ADD COLUMN "budgetUnitId" TEXT;

ALTER TABLE "AccountingTransaction"
  ADD CONSTRAINT "AccountingTransaction_governmentEntityId_fkey"
    FOREIGN KEY ("governmentEntityId") REFERENCES "GovernmentEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AccountingTransaction_budgetUnitId_fkey"
    FOREIGN KEY ("budgetUnitId") REFERENCES "BudgetUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AccountingTransaction_scope_pair_check"
    CHECK (("governmentEntityId" IS NULL) = ("budgetUnitId" IS NULL));

CREATE INDEX "AccountingTransaction_governmentEntityId_financialYearId_date_status_idx"
  ON "AccountingTransaction"("governmentEntityId", "financialYearId", "date", "status");
CREATE INDEX "AccountingTransaction_budgetUnitId_financialYearId_date_status_idx"
  ON "AccountingTransaction"("budgetUnitId", "financialYearId", "date", "status");

-- Prevent an entity-scoped posting from naming a unit belonging to another entity.
CREATE FUNCTION accounting_transaction_scope_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."governmentEntityId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "PlanningEntityUnit" u
    WHERE u."governmentEntityId" = NEW."governmentEntityId"
      AND u."budgetUnitId" = NEW."budgetUnitId"
  ) THEN
    RAISE EXCEPTION 'Accounting transaction unit is not bound to its government entity';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "AccountingTransaction_scope_guard"
  BEFORE INSERT OR UPDATE OF "governmentEntityId", "budgetUnitId"
  ON "AccountingTransaction"
  FOR EACH ROW EXECUTE FUNCTION accounting_transaction_scope_guard();

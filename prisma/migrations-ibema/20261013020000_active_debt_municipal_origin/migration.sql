-- Preserve unscoped historical debts; new origins carry explicit municipal ownership.
ALTER TABLE "ActiveDebt" ADD COLUMN "budgetUnitId" TEXT, ADD COLUMN "governmentEntityId" TEXT;
CREATE INDEX "ActiveDebt_budgetUnitId_year_status_idx" ON "ActiveDebt"("budgetUnitId", "year", "status");
CREATE INDEX "ActiveDebt_governmentEntityId_year_status_idx" ON "ActiveDebt"("governmentEntityId", "year", "status");
ALTER TABLE "ActiveDebt" ADD CONSTRAINT "ActiveDebt_budgetUnitId_fkey" FOREIGN KEY ("budgetUnitId") REFERENCES "BudgetUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActiveDebt" ADD CONSTRAINT "ActiveDebt_governmentEntityId_fkey" FOREIGN KEY ("governmentEntityId") REFERENCES "GovernmentEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

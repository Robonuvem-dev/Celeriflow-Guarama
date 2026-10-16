ALTER TABLE "InternalControlPlan" ADD COLUMN "budgetUnitId" TEXT;
ALTER TABLE "InternalControlPlan" ADD CONSTRAINT "InternalControlPlan_budgetUnitId_fkey" FOREIGN KEY ("budgetUnitId") REFERENCES "BudgetUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "InternalControlPlan_budgetUnitId_status_dueAt_idx" ON "InternalControlPlan"("budgetUnitId", status, "dueAt");
-- Legacy plans keep NULL scope until their administrative origin is reconciled.

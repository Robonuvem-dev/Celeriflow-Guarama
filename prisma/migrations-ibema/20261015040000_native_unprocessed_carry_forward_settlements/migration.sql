ALTER TABLE "Settlement" ADD COLUMN IF NOT EXISTS "executionFinancialYearId" TEXT, ADD COLUMN IF NOT EXISTS "payableCarryForwardId" TEXT;
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_executionFinancialYearId_fkey" FOREIGN KEY ("executionFinancialYearId") REFERENCES "FinancialYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_payableCarryForwardId_fkey" FOREIGN KEY ("payableCarryForwardId") REFERENCES "PayableCarryForward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Settlement_payableCarryForwardId_status_idx" ON "Settlement"("payableCarryForwardId", "status");
CREATE INDEX "Settlement_executionFinancialYearId_idx" ON "Settlement"("executionFinancialYearId");
ALTER TABLE "PayableCarryForwardEvent" ADD COLUMN IF NOT EXISTS "settlementId" TEXT;
ALTER TABLE "PayableCarryForwardEvent" ADD CONSTRAINT "PayableCarryForwardEvent_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "PayableCarryForwardEvent_payableCarryForwardId_settlementId_action_key" ON "PayableCarryForwardEvent"("payableCarryForwardId", "settlementId", "action");
-- Legacy settlements retain null execution links; no closed-year history is rewritten.

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "executionFinancialYearId" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "payableCarryForwardId" TEXT;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_executionFinancialYearId_fkey" FOREIGN KEY ("executionFinancialYearId") REFERENCES "FinancialYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_payableCarryForwardId_fkey" FOREIGN KEY ("payableCarryForwardId") REFERENCES "PayableCarryForward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Payment_payableCarryForwardId_status_idx" ON "Payment"("payableCarryForwardId", "status");
DROP INDEX IF EXISTS "PayableCarryForwardEvent_paymentId_key";
CREATE INDEX "PayableCarryForwardEvent_paymentId_idx" ON "PayableCarryForwardEvent"("paymentId");
CREATE UNIQUE INDEX "PayableCarryForwardEvent_payableCarryForwardId_paymentId_action_key" ON "PayableCarryForwardEvent"("payableCarryForwardId", "paymentId", "action");

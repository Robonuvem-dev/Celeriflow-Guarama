-- Additive: historical values and ownership are not inferred or overwritten.
ALTER TABLE "Asset"
  ADD COLUMN "budgetUnitId" TEXT,
  ADD COLUMN "acquisitionValueDecimal" DECIMAL(18,2),
  ADD COLUMN "currentValueDecimal" DECIMAL(18,2);
ALTER TABLE "AssetValueHistory"
  ADD COLUMN "openingValueDecimal" DECIMAL(18,2),
  ADD COLUMN "depreciationDecimal" DECIMAL(18,2),
  ADD COLUMN "closingValueDecimal" DECIMAL(18,2),
  ADD COLUMN "accountingTransactionId" TEXT;
ALTER TABLE "AssetValueAdjustment"
  ADD COLUMN "openingValueDecimal" DECIMAL(18,2),
  ADD COLUMN "adjustmentValueDecimal" DECIMAL(18,2),
  ADD COLUMN "closingValueDecimal" DECIMAL(18,2),
  ADD COLUMN "accountingTransactionId" TEXT;
CREATE INDEX "Asset_budgetUnitId_status_idx" ON "Asset"("budgetUnitId", "status");
CREATE UNIQUE INDEX "AssetValueHistory_accountingTransactionId_key" ON "AssetValueHistory"("accountingTransactionId");
CREATE UNIQUE INDEX "AssetValueAdjustment_accountingTransactionId_key" ON "AssetValueAdjustment"("accountingTransactionId");
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_budgetUnitId_fkey" FOREIGN KEY ("budgetUnitId") REFERENCES "BudgetUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssetValueHistory" ADD CONSTRAINT "AssetValueHistory_accountingTransactionId_fkey" FOREIGN KEY ("accountingTransactionId") REFERENCES "AccountingTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssetValueAdjustment" ADD CONSTRAINT "AssetValueAdjustment_accountingTransactionId_fkey" FOREIGN KEY ("accountingTransactionId") REFERENCES "AccountingTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

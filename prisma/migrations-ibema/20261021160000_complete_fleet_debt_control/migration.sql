-- Financial settlement of fleet obligations is distinct from the existing administrative fulfilment.
CREATE TABLE "FleetDebtPayment" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "paidAt" DATE NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "proofVersionId" TEXT,
  "financialPaymentId" TEXT,
  "reason" TEXT NOT NULL,
  "reversedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "expenseId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FleetDebtPayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FleetDebtPayment_expenseId_key" UNIQUE ("expenseId"),
  CONSTRAINT "FleetDebtPayment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "FleetDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FleetDebtPayment_amount_check" CHECK ("amount" > 0)
);
CREATE INDEX "FleetDebtPayment_documentId_paidAt_id_idx" ON "FleetDebtPayment"("documentId", "paidAt", "id");
CREATE INDEX "FleetDebtPayment_financialPaymentId_idx" ON "FleetDebtPayment"("financialPaymentId");

CREATE TABLE "FleetDebtSettings" (
  "departmentId" TEXT NOT NULL,
  "warningDays" INTEGER NOT NULL DEFAULT 30,
  "criticalDays" INTEGER NOT NULL DEFAULT 7,
  "requireEvidence" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FleetDebtSettings_pkey" PRIMARY KEY ("departmentId"),
  CONSTRAINT "FleetDebtSettings_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FleetDebtSettings_days_check" CHECK ("warningDays" >= 0 AND "criticalDays" >= 0 AND "criticalDays" <= "warningDays")
);

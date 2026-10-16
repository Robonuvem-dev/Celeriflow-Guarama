ALTER TABLE "BankReconciliationSession" ADD COLUMN "bankAccountId" TEXT;
ALTER TABLE "BankReconciliationSession" ADD CONSTRAINT "BankReconciliationSession_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
UPDATE "BankReconciliationSession" s SET "bankAccountId" = a.id
FROM "BankAccount" a
WHERE a."bankName" = s.banco AND a.agency = s.agencia AND a."accountNumber" = s."contaNumero"
AND (SELECT count(*) FROM "BankAccount" candidate WHERE candidate."bankName" = s.banco AND candidate.agency = s.agencia AND candidate."accountNumber" = s."contaNumero") = 1;
DROP INDEX IF EXISTS "BankReconciliationSession_banco_agencia_contaNumero_periodo_key";
CREATE UNIQUE INDEX "BankReconciliationSession_bankAccountId_periodo_key" ON "BankReconciliationSession"("bankAccountId", periodo);
CREATE INDEX "BankReconciliationSession_banco_agencia_contaNumero_periodo_idx" ON "BankReconciliationSession"(banco, agencia, "contaNumero", periodo);

CREATE TABLE "BankReconciliationAllocationGroup" (
  id TEXT PRIMARY KEY, "sessionId" TEXT NOT NULL, "bankAccountId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL, request JSONB NOT NULL, reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'EFETIVADO', "authorUsuarioId" TEXT NOT NULL,
  "reversedByUsuarioId" TEXT, "reversalReason" TEXT, "reversedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BankReconciliationAllocationGroup_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "BankReconciliationSession"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BankReconciliationAllocationGroup_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BankReconciliationAllocationGroup_idempotencyKey_key" ON "BankReconciliationAllocationGroup"("idempotencyKey");
CREATE INDEX "BankReconciliationAllocationGroup_sessionId_status_idx" ON "BankReconciliationAllocationGroup"("sessionId", status);
CREATE INDEX "BankReconciliationAllocationGroup_bankAccountId_status_idx" ON "BankReconciliationAllocationGroup"("bankAccountId", status);
CREATE TABLE "BankReconciliationAllocation" (
  id TEXT PRIMARY KEY, "groupId" TEXT NOT NULL, "statementItemId" TEXT NOT NULL,
  "treasuryMovementId" TEXT NOT NULL, "amountDecimal" DECIMAL(18,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BankReconciliationAllocation_positive" CHECK ("amountDecimal" > 0),
  CONSTRAINT "BankReconciliationAllocation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "BankReconciliationAllocationGroup"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BankReconciliationAllocation_statementItemId_fkey" FOREIGN KEY ("statementItemId") REFERENCES "BankStatementItem"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BankReconciliationAllocation_treasuryMovementId_fkey" FOREIGN KEY ("treasuryMovementId") REFERENCES "TreasuryMovement"(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BankReconciliationAllocation_group_statement_movement_key" ON "BankReconciliationAllocation"("groupId", "statementItemId", "treasuryMovementId");
CREATE INDEX "BankReconciliationAllocation_statementItemId_idx" ON "BankReconciliationAllocation"("statementItemId");
CREATE INDEX "BankReconciliationAllocation_treasuryMovementId_idx" ON "BankReconciliationAllocation"("treasuryMovementId");

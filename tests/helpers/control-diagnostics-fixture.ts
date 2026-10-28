import { createControlWorkforceFixture } from "./control-workforce-fixture";

/** Isolated facts used by the four diagnostic families. Domain calculations and
 * external scope/compensation/fiscal readers are the production implementations. */
export async function createControlDiagnosticsFixture() {
  const fixture = await createControlWorkforceFixture();
  try {
    await fixture.pg.exec(`
      CREATE TABLE "Supplier" (id TEXT PRIMARY KEY, "personId" TEXT, "companyId" TEXT);
      CREATE TABLE "Taxpayer" (id TEXT PRIMARY KEY, "taxpayerType" TEXT NOT NULL, "personId" TEXT, "companyId" TEXT);
      CREATE TABLE "BudgetAppropriation" (id TEXT PRIMARY KEY, "financialYearId" TEXT NOT NULL REFERENCES "FinancialYear"(id), "budgetUnitId" TEXT NOT NULL REFERENCES "BudgetUnit"(id));
      CREATE TABLE "Contract" (id TEXT PRIMARY KEY, number TEXT NOT NULL, "sourceBudgetUnitId" TEXT, "updatedValue" DOUBLE PRECISION NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL);
      CREATE TABLE "Commitment" (id TEXT PRIMARY KEY, "supplierId" TEXT NOT NULL REFERENCES "Supplier"(id), "contractId" TEXT REFERENCES "Contract"(id), "appropriationId" TEXT NOT NULL REFERENCES "BudgetAppropriation"(id), "valueDecimal" NUMERIC(18,2));
      CREATE TABLE "CommitmentMovement" (id TEXT PRIMARY KEY, "commitmentId" TEXT NOT NULL REFERENCES "Commitment"(id), type TEXT NOT NULL, "valueDecimal" NUMERIC(18,2) NOT NULL);
      CREATE TABLE "TaxAssessment" (id TEXT PRIMARY KEY, "taxpayerId" TEXT NOT NULL REFERENCES "Taxpayer"(id), status TEXT NOT NULL, "originalValueDecimal" NUMERIC(18,2), "finalValueDecimal" NUMERIC(18,2), "calculationSnapshot" JSONB);
      CREATE TABLE "ActiveDebt" (id TEXT PRIMARY KEY, "assessmentId" TEXT UNIQUE REFERENCES "TaxAssessment"(id), "taxpayerId" TEXT NOT NULL, "governmentEntityId" TEXT, "budgetUnitId" TEXT, status TEXT NOT NULL);
      CREATE TABLE "TaxGuide" (id TEXT PRIMARY KEY, "assessmentId" TEXT NOT NULL REFERENCES "TaxAssessment"(id));
      CREATE TABLE "TaxPayment" (id TEXT PRIMARY KEY, "guideId" TEXT NOT NULL REFERENCES "TaxGuide"(id), status TEXT NOT NULL, "amountPaidDecimal" NUMERIC(18,2));
      CREATE TABLE "TaxRegistryEntry" (id TEXT PRIMARY KEY, "entityType" TEXT NOT NULL, "entityId" TEXT NOT NULL, category TEXT NOT NULL, title TEXT NOT NULL, data JSONB NOT NULL, status TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'INTERNO', "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "effectiveUntil" TIMESTAMP(3), "processId" TEXT, "documentId" TEXT, "actorUsuarioId" TEXT, "reviewedByUsuarioId" TEXT, "reviewedAt" TIMESTAMP(3), version INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE "TreasuryMovement" (id TEXT PRIMARY KEY, "bankAccountId" TEXT NOT NULL REFERENCES "BankAccount"(id), type TEXT NOT NULL, direction TEXT NOT NULL, "valueDecimal" NUMERIC(18,2) NOT NULL, status TEXT NOT NULL, date TIMESTAMP(3) NOT NULL);
      CREATE TABLE "FinancialAuditLog" (id TEXT PRIMARY KEY, "entityType" TEXT NOT NULL, "entityId" TEXT NOT NULL, action TEXT NOT NULL, payload JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE "MunicipalFiscalIndexDefinition" (id TEXT PRIMARY KEY, "financialYearId" TEXT NOT NULL REFERENCES "FinancialYear"(id), code TEXT NOT NULL, revision INTEGER NOT NULL, "legalReference" TEXT NOT NULL, "minimumPercentage" NUMERIC(9,4) NOT NULL, "effectiveFrom" DATE NOT NULL, definition JSONB NOT NULL, reason TEXT NOT NULL, "actorId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE ("financialYearId", code, revision));
      INSERT INTO "Supplier" VALUES ('supplier', 'person', NULL);
      INSERT INTO "Taxpayer" VALUES ('taxpayer', 'PF', 'person', NULL);
      INSERT INTO "BudgetAppropriation" VALUES ('appropriation', 'ano', 'ug');
      INSERT INTO "Contract" VALUES ('contract', 'CONTRACT-1', 'ug', 100.00, '2026-01-01');
      INSERT INTO "Commitment" VALUES ('commitment', 'supplier', 'contract', 'appropriation', 100.10);
      INSERT INTO "CommitmentMovement" VALUES ('reinforcement', 'commitment', 'Reforço', 0.20), ('cancellation', 'commitment', 'Anulação', 0.05);
      INSERT INTO "TaxAssessment" VALUES ('assessment', 'taxpayer', 'Lançado', 100.10, 120.30, '{"budgetUnitId":"ug","governmentEntityId":"ente"}'), ('cancelled', 'taxpayer', 'CANCELADO', 999.00, NULL, NULL);
      INSERT INTO "TaxGuide" VALUES ('guide', 'assessment');
      INSERT INTO "TaxPayment" VALUES ('payment', 'guide', 'Confirmado', 10.10), ('unconfirmed', 'guide', 'Pendente', 999.00);
      INSERT INTO "TaxRegistryEntry" (id, "entityType", "entityId", category, title, data, status) VALUES ('compensation', 'TAX_ASSESSMENT', 'assessment', 'CREDIT_MOVEMENT', 'Compensação', '{"operation":"COMPENSAR","amount":"20.20"}', 'EFETIVADO');
      INSERT INTO "BankAccount" (id, "budgetUnitId", "resourceSourceId") VALUES ('bank', 'ug', 'source');
      INSERT INTO "TreasuryMovement" VALUES ('opening', 'bank', 'OpeningBalance', 'Entrada', 0.00, 'Confirmado', '2026-01-01'), ('outflow', 'bank', 'Payment', 'Saída', 0.30, 'Confirmado', '2026-01-02');
    `);
    return fixture;
  } catch (error) { await fixture.close(); throw error; }
}

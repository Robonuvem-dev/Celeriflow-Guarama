import { Prisma } from "@prisma/client";
import * as PrismaClientExports from "@prisma/client";
import { createPlanningAccountingFixture } from "./planning-accounting-fixture";
import { configurePlanningInternalAccounting, configurePlanningInternalExecution } from "../../src/lib/planejamento/accounting-bridge";
import { transitionPlanningPiece } from "../../src/lib/planejamento/versions";
import { generatePlanningSchedule } from "../../src/lib/planejamento/scheduling";
import { approveExpenseRequest, createBudgetReservation, createExpenseRequest, type FinanceActor } from "../../src/lib/financeiro";

export async function createPlanningExecutionFixture(year = 2026, periodMonths: 2 | 3 | 6 = 2, jurisdiction: "EXECUTIVE" | "LEGISLATIVE" = "EXECUTIVE", options: { expenseLineAmount?: string } = {}) {
  const f = await createPlanningAccountingFixture(jurisdiction, { year, ...options });
  try {
    const models = ["Expense", "Supplier", "Company", "Creditor", "Commitment", "CommitmentMovement", "Settlement", "Payment", "FinancialDocument", "SettlementRetention", "PaymentRetention", "WithholdingPayable", "RetentionRule", "Revenue", "RevenueReversal", "BankAccount", "TreasuryMovement", "TaxRevenueIntegrationEvent", "RevenueResourceRedistribution", "PurchaseRequest", "PurchaseRequestItem", "PurchaseRequestItemBudgetAllocation", "PurchaseProcess", "PurchaseProcessItem", "PurchaseProcessItemOrigin", "Contract", "ProcurementLifecycleEvent", "TaxFinancialMapping", "TaxAssessment", "TaxGuide", "TaxPayment", "TaxAuditLog", "TaxBenefitRule", "TaxBenefitGrant"];
    models.push("TaxIntegrationEvent", "TaxRegistryEntry", "Taxpayer", "TaxDocumentSequence", "TaxParameter");
    models.push("Address");
    models.push("HealthCbo");
    models.push("Neighborhood", "Street");
    models.push("ActiveDebt", "DebtInstallment", "DebtInstallmentSchedule");
    models.push("TaxCertificateEvaluation", "TaxCertificate");
    models.push("License");
    models.push("TaxpayerPortalAccess");
    models.push("ProcessCitizenAccess", "DigitalCertificate", "DocumentSignature", "DocumentIcpEvidence", "CertificateUseAudit");
    models.push("TaxActiveDebtEvent", "TaxProtestItem", "TaxProtestBatch", "TaxCdaVersion");
    models.push("PurchaseReceipt", "PurchaseReceiptItem", "InstrumentMeasurement", "InstrumentInstallment");
    models.push("PurchaseProcessRequestOrigin");
    models.push("BankStatementImport", "BankStatementItem", "BankReconciliationSession", "BankReconciliationMatch", "BankReconciliationAllocationGroup", "BankReconciliationAllocation", "BankReconciliation");
    models.push("Bank", "BankBranch");
    models.push("Payroll", "HrPayrollRun", "HrIntegrationEvent", "SstBenefitPayrollScope");
    models.push("HrEmploymentContract", "HrRightEntry", "HrPayrollStatement");
    models.push("HrPayrollRuleSet", "HrPayrollRule", "HrEmploymentRegime", "HrEmploymentRevision", "HrPortalRequest", "CostCenter");
    models.push("Role", "LegalText", "LegalTextVersion", "HrRoleLegalHistory");
    models.push("MaterialCategory", "MaterialSubcategory", "Material", "Warehouse", "MaterialStock", "InventorySession");
    models.push("MaterialRequest", "MaterialRequestItem");
    models.push("ProcessType", "Subject", "Process", "ProcessMovement", "ProcessWorkflowStage", "ProcessSequence", "ProcessEvent", "GenericProcessWorkflowDefinition", "GenericProcessWorkflowStage", "GenericProcessWorkflowInstance", "GenericProcessWorkflowEvent", "ProcessDocument", "ConfiguracaoPerfil", "ConfiguracaoModulo", "UsuarioModulo", "ProtocolNotification");
    models.push("TreasuryTransfer", "Asset", "AssetCategory", "AssetMaintenance", "AssetWriteOff", "AssetIntegrationPendingConfiguration", "Department");
    models.push("AssetValueHistory", "AssetValueAdjustment");
    models.push("RealEstate", "PropertyValuation", "ItbiDeclaration", "ItbiParty", "ItbiEvent", "ItbiTransactionType");
    models.push("SimplesImportBatch", "SimplesFiscalRecord", "SimplesOptionPeriod");
     models.push("EconomicRegistration", "TaxServiceActivity", "TaxDeclaration", "Invoice", "NfseInvoiceData", "NfseEvent", "NfseDmsDeclaration", "NfseCredentialRequest", "NfseCredentialEvent", "NfseDeductionCredit", "NfseDeductionConsumption", "NfseOccasionalRequest", "NfseRpsBatch", "NfseRpsItem", "NfseCorrectionLetter", "TaxServiceRequest");
    const enums = new Set<string>();
    for (const name of models) {
      const model = Prisma.dmmf.datamodel.models.find((item) => item.name === name);
      if (!model) throw new Error(`Modelo da fixture não localizado: ${name}`);
      for (const field of model.fields.filter((item) => item.kind === "enum")) {
        if (enums.has(field.type)) continue;
        const definition = (PrismaClientExports as Record<string, unknown>)[field.type];
        if (!definition || typeof definition !== "object") throw new Error(`Enum da fixture não localizado: ${field.type}`);
        const values = Object.values(definition as Record<string, string>).map((value) => `'${value}'`).join(",");
        await f.pg.exec(`DO $$ BEGIN CREATE TYPE "${field.type}" AS ENUM (${values}); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
        enums.add(field.type);
      }
      const columns = model.fields.filter((item) => item.kind !== "object").map((item) => {
        const types: Record<string, string> = { Int: "INTEGER", Float: "DOUBLE PRECISION", Decimal: "NUMERIC(18,6)", DateTime: "TIMESTAMP(3)", Boolean: "BOOLEAN", Json: "JSONB", Bytes: "BYTEA" };
        let fallback = "";
        if (typeof item.default === "string") fallback = ` DEFAULT '${item.default.replaceAll("'", "''")}'`;
        else if (typeof item.default === "boolean" || typeof item.default === "number") fallback = ` DEFAULT ${item.default}`;
        if (item.type === "DateTime" && item.isRequired) fallback = " DEFAULT CURRENT_TIMESTAMP";
        const autoIncrement = typeof item.default === "object" && item.default !== null && "name" in item.default && item.default.name === "autoincrement";
        const sqlType = autoIncrement ? "SERIAL" : item.kind === "enum" ? `"${item.type}"` : types[item.type] ?? "TEXT";
        const primaryKey = item.name === "id" || (name === "ProcessSequence" && item.name === "year");
        return `"${item.name}" ${sqlType}${item.isList ? "[]" : ""}${primaryKey ? " PRIMARY KEY" : ""}${fallback}`;
      });
      await f.pg.exec(`CREATE TABLE IF NOT EXISTS "${name}" (${columns.join(",")})`);
      for (const item of model.fields.filter((field) => field.isUnique && field.name !== "id")) await f.pg.exec(`CREATE UNIQUE INDEX ON "${name}" ("${item.name}")`);
      for (const fields of model.uniqueFields ?? []) await f.pg.exec(`CREATE UNIQUE INDEX ON "${name}" (${fields.map((field) => `"${field}"`).join(",")})`);
    }
    await f.pg.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS "DocumentClass_code_fixture_key" ON "DocumentClass" (code);
      CREATE UNIQUE INDEX ON "BudgetReservation" (number);
      CREATE UNIQUE INDEX ON "Creditor" ("supplierId");
      CREATE UNIQUE INDEX ON "Expense" ("idempotencyKey");
      CREATE UNIQUE INDEX ON "Commitment" (number);
      CREATE UNIQUE INDEX ON "Commitment" ("reservationId");
      CREATE UNIQUE INDEX ON "Payment" ("orderNumber");
      CREATE UNIQUE INDEX ON "Revenue" ("idempotencyKey");
      CREATE UNIQUE INDEX ON "TreasuryMovement" ("idempotencyKey");
      CREATE UNIQUE INDEX ON "TreasuryMovement" ("revenueId");
      CREATE UNIQUE INDEX ON "TreasuryTransfer" ("idempotencyKey");
      CREATE UNIQUE INDEX ON "RevenueReversal" ("revenueId");
      CREATE UNIQUE INDEX ON "RevenueReversal" ("treasuryMovementId");
      CREATE UNIQUE INDEX ON "FinancialDocument" (number);
      CREATE UNIQUE INDEX ON "ProcurementLifecycleEvent" ("idempotencyKey");
      CREATE UNIQUE INDEX ON "TaxFinancialMapping" ("taxId");
      CREATE UNIQUE INDEX ON "TaxPayment" ("idempotencyKey");
      CREATE UNIQUE INDEX ON "TaxIntegrationEvent" ("idempotencyKey");
      CREATE UNIQUE INDEX ON "TaxDocumentSequence" (year, "documentType");
      CREATE UNIQUE INDEX IF NOT EXISTS "PropertyValuation_realEstateId_year_key" ON "PropertyValuation" ("realEstateId", "year");
      CREATE UNIQUE INDEX IF NOT EXISTS "RealEstate_municipalInsc_key" ON "RealEstate" ("municipalInsc");
      CREATE UNIQUE INDEX IF NOT EXISTS "TaxServiceActivity_taxId_code_key" ON "TaxServiceActivity" ("taxId", "code");
      CREATE UNIQUE INDEX IF NOT EXISTS "SimplesOptionPeriod_taxpayerId_regime_startDate_key" ON "SimplesOptionPeriod" ("taxpayerId", "regime", "startDate");
      CREATE UNIQUE INDEX ON "TaxRevenueIntegrationEvent" ("taxPaymentId");
      CREATE UNIQUE INDEX ON "TaxRevenueIntegrationEvent" ("revenueId");
      CREATE UNIQUE INDEX ON "TaxRevenueIntegrationEvent" ("idempotencyKey");
      ALTER TABLE "Expense" ADD FOREIGN KEY ("appropriationId") REFERENCES "BudgetAppropriation"(id);
      ALTER TABLE "BudgetReservation" ADD FOREIGN KEY ("expenseId") REFERENCES "Expense"(id);
      ALTER TABLE "Commitment" ADD FOREIGN KEY ("appropriationId") REFERENCES "BudgetAppropriation"(id);
      ALTER TABLE "Commitment" ADD FOREIGN KEY ("reservationId") REFERENCES "BudgetReservation"(id);
      ALTER TABLE "CommitmentMovement" ADD FOREIGN KEY ("commitmentId") REFERENCES "Commitment"(id);
      ALTER TABLE "Settlement" ADD FOREIGN KEY ("commitmentId") REFERENCES "Commitment"(id);
      ALTER TABLE "Payment" ADD FOREIGN KEY ("commitmentId") REFERENCES "Commitment"(id);
      ALTER TABLE "Payment" ADD FOREIGN KEY ("settlementId") REFERENCES "Settlement"(id);
      ALTER TABLE "TreasuryMovement" ADD FOREIGN KEY ("revenueId") REFERENCES "Revenue"(id);
      ALTER TABLE "RevenueReversal" ADD FOREIGN KEY ("revenueId") REFERENCES "Revenue"(id);
      INSERT INTO "Company" (id,"corporateName",cnpj) VALUES ('empresa','Araucárias Serviços Municipais Ltda.','11222333000181');
      INSERT INTO "Supplier" (id,"companyId",status) VALUES ('fornecedor','empresa','Ativo');
    `);
    await f.db.employee.update({ where: { id: "servidora-ana" }, data: { isActive: true } });
    await f.rules();
    for (const code of ["TAX_COLLECTION_EXCESS", "TAX_CREDIT_REFUNDED", "TAX_CREDIT_COMPENSATED"]) await f.db.accountingEventCatalog.create({ data: { code, name: code, rules: { create: { debitAccountId: code === "TAX_COLLECTION_EXCESS" ? "debito" : "credito", creditAccountId: code === "TAX_COLLECTION_EXCESS" ? "credito" : "debito", isReference: true } } } });
    for (const code of ["EMPENHO_EMITIDO", "LIQUIDACAO_REGISTRADA", "PAGAMENTO_EFETIVADO", "PAGAMENTO_ESTORNADO", "RECEITA_LANCADA", "RECEITA_ARRECADADA", "RECEITA_ESTORNADA", "RECEITA_REDISTRIBUIDA_FONTE"]) await f.db.accountingEventCatalog.create({ data: { id: code, code, name: code, rules: { create: { id: `rule:${code}`, debitAccountId: "debito", creditAccountId: "credito", isReference: true } } } });
    await configurePlanningInternalAccounting(f.context, { instrumentId: f.loa, enabled: "true", reason: "Matriz da base isolada conferida" });
    await transitionPlanningPiece(f.context, { ...f.workflow, stage: "IMPLANT" });
    for (const lineId of [f.e1, f.e2, f.revenue]) await generatePlanningSchedule(f.context, { instrumentId: f.loa, lineId, method: "TWELFTHS", periodMonths, reason: "Programação municipal mensal" });
    await configurePlanningInternalExecution(f.context, { instrumentId: f.loa, enabled: "true", reason: "Conferência da implantação e programação" });
    const line = await f.db.planningBudgetLine.findUniqueOrThrow({ where: { id: f.e1 } });
    const actor: FinanceActor = { usuarioId: "ana", employeeId: "servidora-ana", allowedBudgetUnitIds: ["ug"] };
    const reviewer: FinanceActor = { ...actor, usuarioId: "beatriz" };
    const request = async (key: string, value: string, date = new Date(`${year}-09-01`)) => {
      const expense = await createExpenseRequest(f.db, actor, { date, description: "Solicitação municipal", value, appropriationId: line.appropriationId!, supplierId: "fornecedor", secretariatId: "secretaria", sourceModule: "COMPRAS", sourceType: "PURCHASE_REQUEST", sourceId: key, eventType: "PROCUREMENT_REQUEST", idempotencyKey: `request:${key}` });
      await approveExpenseRequest(f.db, reviewer, expense.id);
      return expense;
    };
    const reserve = async (key: string, value: string, date = new Date(`${year}-09-01`)) => {
      const expense = await request(key, value, date);
      return createBudgetReservation(f.db, reviewer, { number: key, date, value, appropriationId: line.appropriationId!, expenseId: expense.id });
    };
    await f.db.document.create({ data: { id: "documento-fiscal", title: "Documento fiscal municipal", documentType: "FISCAL", fileUrl: "https://arquivos.example.org/fiscal.pdf", status: "Válido" } });
    await f.db.bankAccount.create({ data: { id: "banco", bankName: "Banco Municipal", agency: "0001", accountNumber: "1000-1", accountType: "Corrente", resourceSourceId: "livre", budgetUnitId: "ug", accountingPlanId: "debito", currentBalance: 0, currentBalanceDecimal: 0, isActive: true } });
    return { ...f, year, actor, financeReviewer: reviewer, appropriationId: line.appropriationId!, request, reserve };
  } catch (error) { await f.close(); throw error; }
}

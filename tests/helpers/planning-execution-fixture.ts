import { eq } from "drizzle-orm";
import { Decimal } from "../../src/db/decimal";
import { createId } from "../../src/db/ids";
import { employees } from "../../src/db/schema/administration";
import { accountingEvents, accountingRules as accountingPostingRules } from "../../src/db/schema/finance-accounting";
import { planningLines } from "../../src/db/schema/planning-budget";
import { documents } from "../../src/db/schema/registry";
import { reconciliationBankAccounts as bankAccounts } from "../../src/db/schema/finance-reconciliation";
import { createPlanningAccountingFixture } from "./planning-accounting-fixture";
import { configurePlanningInternalAccounting, configurePlanningInternalExecution } from "../../src/lib/planejamento/accounting-bridge";
import { transitionPlanningPiece } from "../../src/lib/planejamento/versions";
import { generatePlanningSchedule } from "../../src/lib/planejamento/scheduling";
import { approveExpenseRequest, createBudgetReservation, createExpenseRequest, type FinanceActor } from "../../src/lib/financeiro";

export async function createPlanningExecutionFixture(year = 2026, periodMonths: 2 | 3 | 6 = 2, jurisdiction: "EXECUTIVE" | "LEGISLATIVE" = "EXECUTIVE", options: { expenseLineAmount?: string } = {}) {
  const f = await createPlanningAccountingFixture(jurisdiction, { year, ...options });
  try {
    await f.pg.exec(`
      INSERT INTO "Company" (id,"corporateName",cnpj,"updatedAt") VALUES ('empresa','Araucárias Serviços Municipais Ltda.','11222333000181',NOW());
      INSERT INTO "Supplier" (id,"companyId",status,"updatedAt") VALUES ('fornecedor','empresa','Ativo',NOW());
    `);
    await f.db.update(employees).set({ isActive: true }).where(eq(employees.id, "servidora-ana"));
    await f.rules();
    for (const code of ["TAX_COLLECTION_EXCESS", "TAX_CREDIT_REFUNDED", "TAX_CREDIT_COMPENSATED", "EMPENHO_EMITIDO", "LIQUIDACAO_REGISTRADA", "PAGAMENTO_EFETIVADO", "PAGAMENTO_ESTORNADO", "RECEITA_LANCADA", "RECEITA_ARRECADADA", "RECEITA_ESTORNADA", "RECEITA_REDISTRIBUIDA_FONTE"]) {
      const id = code.startsWith("TAX_") ? createId() : code;
      await f.db.insert(accountingEvents).values({ id, code, name: code });
      const reversed = code === "TAX_CREDIT_REFUNDED" || code === "TAX_CREDIT_COMPENSATED";
      await f.db.insert(accountingPostingRules).values({ id: `rule:${id}`, eventId: id, debitAccountId: reversed ? "credito" : "debito", creditAccountId: reversed ? "debito" : "credito", isReference: true });
    }
    await configurePlanningInternalAccounting(f.context, { instrumentId: f.loa, enabled: "true", reason: "Matriz da base isolada conferida" });
    await transitionPlanningPiece(f.context, { ...f.workflow, stage: "IMPLANT" });
    for (const lineId of [f.e1, f.e2, f.revenue]) await generatePlanningSchedule(f.context, { instrumentId: f.loa, lineId, method: "TWELFTHS", periodMonths, reason: "Programação municipal mensal" });
    await configurePlanningInternalExecution(f.context, { instrumentId: f.loa, enabled: "true", reason: "Conferência da implantação e programação" });
    const [line] = await f.db.select().from(planningLines).where(eq(planningLines.id, f.e1));
    const actor: FinanceActor = { usuarioId: "ana", employeeId: "servidora-ana", allowedBudgetUnitIds: ["ug"] };
    const reviewer: FinanceActor = { ...actor, usuarioId: "beatriz" };
    const request = async (key: string, value: string, date = new Date(`${year}-09-01`)) => {
      const expense = await createExpenseRequest(f.connection, actor, { date, description: "Solicitação municipal", value, appropriationId: line.appropriationId!, supplierId: "fornecedor", secretariatId: "secretaria", sourceModule: "COMPRAS", sourceType: "PURCHASE_REQUEST", sourceId: key, eventType: "PROCUREMENT_REQUEST", idempotencyKey: `request:${key}` });
      await approveExpenseRequest(f.connection, reviewer, expense.id);
      return expense;
    };
    const reserve = async (key: string, value: string, date = new Date(`${year}-09-01`)) => {
      const expense = await request(key, value, date);
      return createBudgetReservation(f.connection, reviewer, { number: key, date, value, appropriationId: line.appropriationId!, expenseId: expense.id });
    };
    await f.db.insert(documents).values({ id: "documento-fiscal", title: "Documento fiscal municipal", documentType: "FISCAL", fileUrl: "https://arquivos.example.org/fiscal.pdf", status: "Válido" });
    await f.db.insert(bankAccounts).values({ id: "banco", bankName: "Banco Municipal", agency: "0001", accountNumber: "1000-1", accountType: "Corrente", resourceSourceId: "livre", budgetUnitId: "ug", accountingPlanId: "debito", currentBalance: 0, currentBalanceDecimal: new Decimal(0), isActive: true });
    return { ...f, year, actor, financeReviewer: reviewer, appropriationId: line.appropriationId!, request, reserve };
  } catch (error) { await f.close(); throw error; }
}

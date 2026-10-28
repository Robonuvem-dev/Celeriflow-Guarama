import { approveExpenseRequest, createBudgetReservation, createExpenseRequest, type FinanceActor } from "../../src/lib/financeiro";
import { createAssetsAccountingFixture } from "./assets-accounting-fixture";

/** A preserved, implanted budget is setup state for the stock integration.
 * All constraints/triggers come from the historical migrations. Finance still
 * performs the expense, approval, reservation, commitment and settlement. */
export async function createStockAccountingFixture() {
  const fixture = await createAssetsAccountingFixture("EXECUTIVE");
  try {
    await fixture.database.exec(`
      INSERT INTO "Usuario" (id,nome,email,"perfilId","updatedAt") VALUES ('beatriz','Revisora financeira','stock-review@example.invalid','asset-profile',CURRENT_TIMESTAMP);
      INSERT INTO "UsuarioUnidadeGestora" (id,"usuarioId","budgetUnitId") VALUES ('stock-review-access','beatriz','ug');
      INSERT INTO "Company" (id,"corporateName",cnpj,"updatedAt") VALUES ('empresa','Fornecedor sintético','11222333000181',CURRENT_TIMESTAMP);
      INSERT INTO "Supplier" (id,"companyId",status,"updatedAt") VALUES ('fornecedor','empresa','Ativo',CURRENT_TIMESTAMP);
      INSERT INTO "ResourceSource" (id,code,name,"updatedAt") VALUES ('livre','000','Recursos ordinários',CURRENT_TIMESTAMP);
      INSERT INTO "ExpenseNature" (id,code,name,"updatedAt") VALUES ('despesa','3.3.90.30','Material de consumo',CURRENT_TIMESTAMP);
      INSERT INTO "RevenueNature" (id,code,name,"updatedAt") VALUES ('receita','1.7.1.1.51','Receita sintética',CURRENT_TIMESTAMP);
      INSERT INTO "MultiYearPlan" (id,code,name,"startYear","endYear",status,"updatedAt") VALUES ('stock-ppa','STOCK-2026','PPA sintético',2026,2029,'PUBLISHED',CURRENT_TIMESTAMP);
      INSERT INTO "ProgramPPA" (id,code,name,"multiYearPlanId","updatedAt") VALUES ('stock-program','0001','Serviços municipais','stock-ppa',CURRENT_TIMESTAMP);
      INSERT INTO "ActionPPA" (id,code,name,"programId","updatedAt") VALUES ('stock-action','2001','Material de consumo','stock-program',CURRENT_TIMESTAMP);
      INSERT INTO "BudgetGuideline" (id,"financialYearId","multiYearPlanId",status,"updatedAt") VALUES ('stock-ldo','ano','stock-ppa','PUBLISHED',CURRENT_TIMESTAMP);
      INSERT INTO "AnnualBudgetLaw" (id,"lawNumber","financialYearId","budgetGuidelineId",status,"totalRevenue","totalExpense",metadata,"updatedAt") VALUES ('stock-loa','STOCK-2026','ano','stock-ldo','PUBLISHED',600,600,'{"planningInternalAccounting":true,"planningInternalExecution":true}',CURRENT_TIMESTAMP);
      INSERT INTO "PlanningInstrument" (id,"governmentEntityId",kind,code,title,"startYear","endYear","multiYearPlanId","createdById","updatedAt") VALUES ('stock-ppa-piece','ente','PPA','STOCK-PPA','PPA sintético',2026,2029,'stock-ppa','ana',CURRENT_TIMESTAMP);
      INSERT INTO "PlanningInstrument" (id,"governmentEntityId",kind,code,title,"startYear","endYear","parentId","budgetGuidelineId","createdById","updatedAt") VALUES ('stock-ldo-piece','ente','LDO','STOCK-LDO','LDO sintética',2026,2026,'stock-ppa-piece','stock-ldo','ana',CURRENT_TIMESTAMP);
      INSERT INTO "PlanningInstrument" (id,"governmentEntityId",kind,code,title,"startYear","endYear","parentId","annualBudgetLawId","implantedAt","implantedById","createdById","updatedAt") VALUES ('stock-loa-piece','ente','LOA','STOCK-LOA','LOA sintética',2026,2026,'stock-ldo-piece','stock-loa','2026-01-01','ana','ana',CURRENT_TIMESTAMP);
      INSERT INTO "AnnualBudgetExpenseFixation" (id,"annualBudgetLawId",code,name,"fixedValue") VALUES ('stock-fixation','stock-loa','E1','Material de consumo',600);
      INSERT INTO "AnnualBudgetRevenueForecast" (id,"annualBudgetLawId",code,name,"estimatedValue") VALUES ('stock-forecast','stock-loa','R1','Receita sintética',600);
      INSERT INTO "BudgetAppropriation" (id,code,"financialYearId","budgetUnitId","expenseNatureId","resourceSourceId","annualBudgetExpenseFixationId","programPPAId","actionPPAId","initialValue","initialValueDecimal","updatedValue","updatedValueDecimal","committedValueDecimal","updatedAt") VALUES ('stock-appropriation','STOCK.1','ano','ug','despesa','livre','stock-fixation','stock-program','stock-action',600,600,600,600,0,CURRENT_TIMESTAMP);
      INSERT INTO "PlanningBudgetLine" (id,"instrumentId",kind,code,description,year,"budgetUnitId","resourceSourceId","expenseNatureId","programId","actionId","functionCode","subfunctionCode",product,"productUnit","physicalTarget","originalValue","appropriationId") VALUES ('stock-expense-line','stock-loa-piece','EXPENSE','E1','Material de consumo',2026,'ug','livre','despesa','stock-program','stock-action','04','122','Serviços prestados','serviços',100,600,'stock-appropriation');
      INSERT INTO "PlanningBudgetLine" (id,"instrumentId",kind,code,description,year,"budgetUnitId","resourceSourceId","revenueNatureId","originalValue") VALUES ('stock-revenue-line','stock-loa-piece','REVENUE','R1','Receita sintética',2026,'ug','livre','receita',600);
      INSERT INTO "PlanningQuota" (id,"lineId",month,kind,"periodMonths",planned,"disbursementPlanned",method,calculation) SELECT 'stock-quota-' || m,'stock-expense-line',m,'EXPENSE',2,50,50,'TWELFTHS','{"fixture":"preserved-stock-budget"}'::jsonb FROM generate_series(1,12) m;
      INSERT INTO "Document" (id,title,"documentType","fileUrl",status,"updatedAt") VALUES ('documento-fiscal','Documento fiscal sintético','FISCAL','https://files.example.invalid/fiscal.pdf','Válido',CURRENT_TIMESTAMP);
      INSERT INTO "AccountingEventCatalog" (id,code,name,"updatedAt") VALUES ('EMPENHO_EMITIDO','EMPENHO_EMITIDO','Empenho de referência',CURRENT_TIMESTAMP),('LIQUIDACAO_REGISTRADA','LIQUIDACAO_REGISTRADA','Liquidação de referência',CURRENT_TIMESTAMP);
      INSERT INTO "AccountingPostingRule" (id,"eventId","debitAccountId","creditAccountId","isReference","updatedAt") VALUES ('rule:EMPENHO_EMITIDO','EMPENHO_EMITIDO','debito','credito',true,CURRENT_TIMESTAMP),('rule:LIQUIDACAO_REGISTRADA','LIQUIDACAO_REGISTRADA','debito','credito',true,CURRENT_TIMESTAMP);
    `);
    const financeReviewer: FinanceActor = { ...fixture.actor, usuarioId: "beatriz" };
    const appropriationId = "stock-appropriation";
    async function reserve(key: string, value: string, date: Date) {
      const expense = await createExpenseRequest(fixture.connection, fixture.actor, { date, description: "Solicitação municipal", value, appropriationId, supplierId: "fornecedor", secretariatId: "secretaria", sourceModule: "COMPRAS", sourceType: "PURCHASE_REQUEST", sourceId: key, eventType: "PROCUREMENT_REQUEST", idempotencyKey: `request:${key}` });
      await approveExpenseRequest(fixture.connection, financeReviewer, expense.id);
      return createBudgetReservation(fixture.connection, financeReviewer, { number: key, date, value, appropriationId, expenseId: expense.id });
    }
    return { ...fixture, financeReviewer, appropriationId, reserve };
  } catch (error) { await fixture.close(); throw error; }
}

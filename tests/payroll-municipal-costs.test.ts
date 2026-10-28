import assert from "node:assert/strict";
import test from "node:test";
import { and, count, eq, inArray } from "drizzle-orm";
import type { JsonObject } from "../src/db/json";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { createExpenseRequest, approveExpenseRequest, createBudgetReservation, createCommitment, createSettlement, cancelSettlement } from "../src/lib/financeiro";
import { configureMunicipalCosts, correctMunicipalCost } from "../src/lib/financeiro/cost-ledger";
import { createMunicipalCostObject, saveMunicipalCostItem, linkMunicipalCostItems, createMunicipalCostRule } from "../src/lib/financeiro/cost-catalog";
import { splitPayrollCostStatements, deductPayrollCostReleases, splitPayrollProvisionCosts } from "../src/lib/financeiro/cost-payroll-slices";
import { accountPayrollProvision } from "../src/lib/rh/provision-accounting";
import { reversePayrollProvision } from "../src/lib/rh/payroll-provisions";
import type { AppContext } from "../src/lib/platform/tenant-context";
import { Decimal } from "../src/db/decimal";
import { financialYears } from "../src/db/schema/finance-years";
import { costCenters } from "../src/db/schema/master-data";
import { hrEmploymentContracts, payrolls, hrPayrollRuns, hrPayrollStatements, hrIntegrationEvents, hrRightEntries } from "../src/db/schema/personnel-workforce";
import { accountingPlans, accountingTransactions } from "../src/db/schema/finance-accounting";
import { municipalCostSources, municipalCostMovements } from "../src/db/schema/finance-costs";
import { settlements } from "../src/db/schema/finance-settlements";
import { requiredPersonnelRow, personnelPayrollCostSources } from "./helpers/personnel-financial-regression-queries";

const date = new Date("2026-09-01T12:00:00Z");
const snapshot = (id: string, rows: Array<{ code: string; value: string }>) => ({ contract: { id, employeeId: "servidora-ana", registration: id, workLocation: "LOCAL_FECHADO", costCenterId: "centro-folha" }, items: rows.map(row => ({ ...row, type: "PROVENTO" })) });

async function setup() {
  const previousMode = process.env.CELERIFLOW_ACCOUNTING_MODE;
  process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
  const restoreMode = () => { if (previousMode === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE; else process.env.CELERIFLOW_ACCOUNTING_MODE = previousMode; };
  const f = await createPlanningExecutionFixture(2026, 2, "EXECUTIVE", { expenseLineAmount: "300.00" }).catch(error => { restoreMode(); throw error; });
  try {
    const financeTransport = { connection: f.connection };
    const db = financeTransport.connection.db;
    await db.update(financialYears).set({ status: "Aberto" }).where(eq(financialYears.id, "ano"));
    const actor = { ...f.actor, allowedBudgetUnitIds: ["ug", "ug-restrita"] };
    await db.insert(costCenters).values({ id: "centro-folha", code: "FOLHA", name: "Centro da folha", governmentEntityId: "ente", secretariatId: "secretaria" });
    for (const id of ["vinculo-1", "vinculo-2"]) await db.insert(hrEmploymentContracts).values({ id, employeeId: "servidora-ana", registration: id, regimeId: "regime", roleId: "cargo", costCenterId: "centro-folha", workLocation: "LOCAL_FECHADO", admittedAt: new Date("2020-01-01"), salary: "15.00", details: {} });
    await db.insert(payrolls).values({ id: "folha", competence: "09/2026", type: "Mensal", status: "Fechada", totalValueDecimal: "30.00" });
    await db.insert(hrPayrollRuns).values({ id: "run", payrollId: "folha", requestKey: "run-costs", ruleSetId: "regras", mode: "OFICIAL", scope: "PRODUCAO", status: "FECHADA", gross: "30.00", deductions: "0", net: "30.00", employer: "6.00", actorId: "ana", snapshot: {} });
    await db.insert(hrPayrollStatements).values([
      { id: "stmt-1", runId: "run", contractId: "vinculo-1", gross: "15.00", deductions: "0", net: "15.00", employer: "3.00", snapshot: snapshot("vinculo-1", [{ code: "SALARIO_BASE", value: "10.00" }, { code: "GRATIFICACAO", value: "5.00" }]) },
      { id: "stmt-2", runId: "run", contractId: "vinculo-2", gross: "15.00", deductions: "0", net: "15.00", employer: "3.00", snapshot: snapshot("vinculo-2", [{ code: "SALARIO_BASE", value: "15.00" }]) },
    ]);
    const expense = await createExpenseRequest(financeTransport.connection, f.actor, { date, value: "30.00", description: "Folha individual", appropriationId: f.appropriationId, supplierId: "fornecedor", secretariatId: "secretaria", sourceModule: "RH", sourceType: "PAYROLL_RUN", sourceId: "run", eventType: "FOLHA_FECHADA", idempotencyKey: "payroll-cost-expense" });
    await approveExpenseRequest(financeTransport.connection, f.financeReviewer, expense.id);
    const reservation = await createBudgetReservation(financeTransport.connection, f.financeReviewer, { date, number: "PAYROLL-COST-RES", value: "30.00", appropriationId: f.appropriationId, expenseId: expense.id });
    const commitment = await createCommitment(financeTransport.connection, f.financeReviewer, { date, number: "PAYROLL-COST-EMP", value: "30.00", type: "Ordinário", history: "Folha", appropriationId: f.appropriationId, supplierId: "fornecedor", reservationId: reservation.id });
    await db.insert(hrIntegrationEvents).values({ sourceKey: "FINANCEIRO:DESPESAS:run", domain: "FINANCEIRO", environment: "PRODUCAO", eventType: "SOLICITACOES_DESPESA_FOLHA", status: "CONCLUIDA", payloadHash: "payroll-cost-fixture", payload: { runId: "run", lines: [{ key: "linha", costCenterId: "centro-folha", component: "GROSS", appropriationId: f.appropriationId, supplierId: "fornecedor", secretariatId: "secretaria", value: "30.00" }] }, result: { expenseIds: [expense.id] } });
    await configureMunicipalCosts(financeTransport.connection, actor, { financialYearId: "ano", enabled: true, sourceTypes: ["PAYROLL"], effectiveFrom: new Date("2026-01-01"), reason: "Rateio da folha por memória fechada" });
    const object = await createMunicipalCostObject(financeTransport.connection, actor, { financialYearId: "ano", budgetUnitId: "ug", description: "Serviços", detailedDescription: "Serviços municipais" });
    const item = await saveMunicipalCostItem(financeTransport.connection, actor, { financialYearId: "ano", identifier: "PESSOAL", description: "Pessoal", detailedDescription: "Pessoal municipal", identificationClass: "TEXTO", behavior: "FIXED", isActive: true });
    await linkMunicipalCostItems(financeTransport.connection, actor, { objectIds: [object.id], itemIds: [item.id] });
    const rule = { financialYearId: "ano", budgetUnitId: "ug", title: "Rateio da folha", sourceType: "PAYROLL" as const, selector: { costCenterId: "centro-folha" }, shares: [{ objectId: object.id, itemId: item.id, percentage: "100" }], priority: 1, effectiveFrom: new Date("2026-01-01") };
    await createMunicipalCostRule(financeTransport.connection, actor, rule);
    const input = { date, value: "30.00", commitmentId: commitment.id, documentId: "documento-fiscal", documentRef: "Folha fechada", authorId: "servidora-ana" };
    return { ...f, database: db, actor, rule, input, financeConnection: financeTransport.connection, close: async () => { try { await f.close(); } finally { restoreMode(); } } };
  } catch (error) { try { await f.close(); } finally { restoreMode(); } throw error; }
}

test("folha: liquidação conserva duas matrículas da mesma pessoa, verbas e localização fechada", async () => {
  const f = await setup();
  try {
    const settlement = await createSettlement(f.financeConnection, f.financeReviewer, f.input);
    const sources = await personnelPayrollCostSources(f.database);
    assert.equal(sources.length, 3);
    assert.equal(sources.reduce((sum, source) => sum.plus(source.amount), new Decimal(0)).toFixed(2), "30.00");
    const dimensions = sources.map(source => (source.snapshot as JsonObject).dimensions as JsonObject);
    assert.deepEqual([...new Set(dimensions.map(row => row.contractId))].sort(), ["vinculo-1", "vinculo-2"]);
    assert.deepEqual([...new Set(dimensions.map(row => row.payrollCode))].sort(), ["GRATIFICACAO", "SALARIO_BASE"]);
    await f.database.update(hrEmploymentContracts).set({ workLocation: "LOCAL_ATUAL" }).where(eq(hrEmploymentContracts.id, "vinculo-1"));
    assert.ok(dimensions.every(row => row.workLocation === "LOCAL_FECHADO"));
    await assert.rejects(cancelSettlement(f.financeConnection, f.financeReviewer, settlement.id), /apropriações/);
    for (const source of sources) for (const movement of source.movements) await correctMunicipalCost(f.financeConnection, f.actor, { movementId: movement.id, date: new Date(), reason: "Anulação integral da liquidação da folha", kind: "REVERSAL", idempotencyKey: `reverse:${movement.id}` });
    await cancelSettlement(f.financeConnection, f.financeReviewer, settlement.id);
    assert.equal((await f.database.select({ count: count() }).from(municipalCostSources).where(and(eq(municipalCostSources.sourceType, "PAYROLL"), eq(municipalCostSources.status, "ACTIVE"))))[0].count, 0);
  } finally { await f.close(); }
});

test("folha: regra ambígua do segundo vínculo reverte liquidação e custos já criados do primeiro", async () => {
  const f = await setup();
  try {
    const input = { ...f.rule, selector: { contractId: "vinculo-2" }, priority: 5 };
    await createMunicipalCostRule(f.financeConnection, f.actor, input);
    await createMunicipalCostRule(f.financeConnection, f.actor, { ...input, title: "Concorrência de critérios" });
    await assert.rejects(createSettlement(f.financeConnection, f.financeReviewer, f.input), /regras automáticas concorrentes/);
    assert.equal((await f.database.select({ count: count() }).from(settlements).where(eq(settlements.commitmentId, f.input.commitmentId)))[0].count, 0);
    assert.equal((await f.database.select({ count: count() }).from(municipalCostSources).where(eq(municipalCostSources.sourceType, "PAYROLL")))[0].count, 0);
    assert.equal((await f.database.select({ count: count() }).from(municipalCostMovements))[0].count, 0);
  } finally { await f.close(); }
});

test("folha: baixa provisionada reduz só o vínculo/componente correspondente e conserva centavos", () => {
  const statements = ["vinculo-1", "vinculo-2"].map(id => ({ id: `stmt:${id}`, contractId: id, gross: new Decimal("0.03"), employer: new Decimal("0.01"), snapshot: snapshot(id, [{ code: "A", value: "0.01" }, { code: "B", value: "0.02" }]) }));
  const slices = splitPayrollCostStatements(statements, { component: "GROSS", costCenterId: "centro-folha" });
  const net = deductPayrollCostReleases(slices, [{ contractId: "vinculo-1", component: "GROSS", amount: new Decimal("0.02") }]);
  assert.equal(net.filter(slice => slice.dimensions.contractId === "vinculo-1").reduce((sum, slice) => sum.plus(slice.amount), new Decimal(0)).toFixed(2), "0.01");
  assert.equal(net.filter(slice => slice.dimensions.contractId === "vinculo-2").reduce((sum, slice) => sum.plus(slice.amount), new Decimal(0)).toFixed(2), "0.03");
  assert.throws(() => deductPayrollCostReleases(slices, [{ contractId: "vinculo-1", component: "EMPLOYER", amount: new Decimal("0.01") }]), /componente/);
  const targeted = deductPayrollCostReleases(slices, [{ contractId: "vinculo-1", component: "GROSS", amount: new Decimal("0.01"), payrollCodes: ["B"] }]);
  assert.equal(targeted.find(slice => slice.dimensions.contractId === "vinculo-1" && slice.dimensions.payrollCode === "A")?.amount.toFixed(2), "0.01");
  assert.equal(targeted.find(slice => slice.dimensions.contractId === "vinculo-1" && slice.dimensions.payrollCode === "B")?.amount.toFixed(2), "0.01");
});

test("folha: mudança de localização no mês usa segmentos fechados, sem transferir todo o custo ao centro final", () => {
  const statement = { id: "stmt-rateado", contractId: "vinculo-1", gross: new Decimal("0.03"), employer: new Decimal("0.01"), snapshot: { ...snapshot("vinculo-1", [{ code: "SALARIO_BASE", value: "0.03" }]), proration: { segments: [
    { calendarDays: 15, costCenterId: "centro-inicial", workLocation: "LOCAL_INICIAL", items: [{ code: "SALARIO_BASE", type: "PROVENTO", value: "0.01" }] },
    { calendarDays: 15, costCenterId: "centro-final", workLocation: "LOCAL_FINAL", items: [{ code: "SALARIO_BASE", type: "PROVENTO", value: "0.02" }] },
  ] } } };
  const first = splitPayrollCostStatements([statement], { component: "GROSS", costCenterId: "centro-inicial" });
  const last = splitPayrollCostStatements([statement], { component: "GROSS", costCenterId: "centro-final" });
  assert.equal(first[0].amount.toFixed(2), "0.01"); assert.equal(first[0].dimensions.workLocation, "LOCAL_INICIAL");
  assert.equal(last[0].amount.toFixed(2), "0.02"); assert.equal(last[0].dimensions.workLocation, "LOCAL_FINAL");
  const charges = [...splitPayrollCostStatements([statement], { component: "EMPLOYER", costCenterId: "centro-inicial" }), ...splitPayrollCostStatements([statement], { component: "EMPLOYER", costCenterId: "centro-final" })];
  assert.equal(charges.reduce((sum, slice) => sum.plus(slice.amount), new Decimal(0)).toFixed(2), "0.01");
  assert.ok(charges.every(slice => slice.dimensions.payrollCode === undefined));
});

test("provisão: conserva totais arredondados entre verbas, localizações e encargos", () => {
  const statement = { id: "stmt-provisao", contractId: "vinculo-1", snapshot: { ...snapshot("vinculo-1", [{ code: "A", value: "0.03" }, { code: "B", value: "0.03" }]), proration: { segments: [
    { calendarDays: 15, costCenterId: "centro-inicial", workLocation: "LOCAL_INICIAL", items: [{ code: "A", type: "PROVENTO", value: "0.01" }, { code: "B", type: "PROVENTO", value: "0.02" }] },
    { calendarDays: 15, costCenterId: "centro-final", workLocation: "LOCAL_FINAL", items: [{ code: "A", type: "PROVENTO", value: "0.02" }, { code: "B", type: "PROVENTO", value: "0.01" }] },
  ] } } };
  const details = { statementId: statement.id, memory: { base: "0.06", remuneration: "0.05", employer: "0.01", total: "0.06", items: [{ code: "A", type: "PROVENTO", value: "0.03" }, { code: "B", type: "PROVENTO", value: "0.03" }] } };
  const slices = splitPayrollProvisionCosts(statement, details, "PROVISAO_13");
  assert.equal(slices.reduce((sum, slice) => sum.plus(slice.amount), new Decimal(0)).toFixed(2), "0.06");
  assert.equal(slices.filter(slice => slice.dimensions.payrollComponent === "GROSS").reduce((sum, slice) => sum.plus(slice.amount), new Decimal(0)).toFixed(2), "0.05");
  assert.equal(slices.filter(slice => slice.dimensions.payrollComponent === "EMPLOYER").reduce((sum, slice) => sum.plus(slice.amount), new Decimal(0)).toFixed(2), "0.01");
  assert.ok(slices.filter(slice => slice.dimensions.payrollComponent === "EMPLOYER").every(slice => !slice.dimensions.payrollCode));
  assert.deepEqual([...new Set(slices.map(slice => slice.dimensions.workLocation))].sort(), ["LOCAL_FINAL", "LOCAL_INICIAL"]);
  assert.deepEqual(splitPayrollProvisionCosts(statement, details, "PROVISAO_13"), slices);
  assert.throws(() => splitPayrollProvisionCosts(statement, { ...details, memory: { ...details.memory, base: "0.07" } }, "PROVISAO_13"), /reconciliam/);
  assert.throws(() => splitPayrollProvisionCosts(statement, { ...details, memory: { ...details.memory, items: [{ code: "A", type: "PROVENTO", value: "0.04" }] } }, "PROVISAO_13"), /diverge/);
});

test("provisão: reconhecimento nativo gera verbas individuais e estorno exige desfazer todas as apropriações", async () => {
  const f = await setup();
  try {
    await f.database.update(accountingPlans).set({ code: "3.1.1.1.1.01.00" }).where(eq(accountingPlans.id, "debito"));
    const origin = await requiredPersonnelRow(f.database.insert(hrRightEntries).values({ contractId: "vinculo-1", sourceKey: "cost-provision", kind: "PROVISAO_13", periodStart: new Date("2026-01-01"), periodEnd: new Date("2026-12-31"), quantity: 1, amount: "0.03", actorId: "ana", details: { operation: "APROPRIACAO", scope: "PRODUCAO", runId: "run", statementId: "stmt-1", competence: "09/2026", memory: { base: "15.00", remuneration: "0.03", employer: "0.00", total: "0.03", items: [{ code: "SALARIO_BASE", type: "PROVENTO", value: "10.00" }, { code: "GRATIFICACAO", type: "PROVENTO", value: "5.00" }] } } }).returning());
    const context = { ...f.reviewer, database: f.database } as unknown as AppContext;
    const input = { entryId: origin.id, budgetUnitId: "ug", expenseAccountId: "debito", liabilityAccountId: "credito", date: "2026-09-30", reason: "Reconhecimento da provisão com custo individual" };
    const posted = await accountPayrollProvision(f.financeConnection, context, input);
    assert.deepEqual(await accountPayrollProvision(f.financeConnection, context, input), posted);
    const sources = await personnelPayrollCostSources(f.database, posted.transactionId);
    assert.equal(sources.length, 2);
    assert.equal(sources.reduce((sum, source) => sum.plus(source.amount), new Decimal(0)).toFixed(2), "0.03");
    const reversalInput = { entryId: origin.id, reason: "Estorno fundamentado da provisão reconhecida" };
    const actor = { ...f.financeReviewer };
    await assert.rejects(reversePayrollProvision(f.financeConnection, actor.usuarioId, reversalInput, actor), /apropriações/);
    assert.equal((await f.database.select({ count: count() }).from(accountingTransactions).where(eq(accountingTransactions.reversalOfId, posted.transactionId)))[0].count, 0);
    for (const source of sources) for (const movement of source.movements) await correctMunicipalCost(f.financeConnection, f.actor, { movementId: movement.id, date: new Date(), reason: "Desfazimento do rateio antes do estorno contábil", kind: "REVERSAL", idempotencyKey: `provision-reverse:${movement.id}` });
    await reversePayrollProvision(f.financeConnection, actor.usuarioId, reversalInput, actor);
    assert.equal((await f.database.select({ count: count() }).from(accountingTransactions).where(eq(accountingTransactions.reversalOfId, posted.transactionId)))[0].count, 1);
    assert.equal((await f.database.select({ count: count() }).from(municipalCostSources).where(and(inArray(municipalCostSources.id, sources.map(source => source.id)), eq(municipalCostSources.status, "ACTIVE"))))[0].count, 0);
  } finally { await f.close(); }
});

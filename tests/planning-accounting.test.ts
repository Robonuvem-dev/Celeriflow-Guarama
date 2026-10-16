import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { createPlanningAccountingFixture } from "./helpers/planning-accounting-fixture";
import { configurePlanningInternalAccounting, deliverPlanningAccountingCommand, synchronizePlanningAccounting } from "../src/lib/planejamento/accounting-bridge";
import { transitionPlanningPiece } from "../src/lib/planejamento/versions";
import { registerPlanningMovement } from "../src/lib/planejamento/revisions";
import { addApprovedPlanningLine, addPlanningLine, createPlanningInstrument } from "../src/lib/planejamento/service";
import { reconcilePlanningLegacyAppropriation } from "../src/lib/planejamento/legacy-reconciliation";
import { postAccountingTransaction } from "../src/lib/financeiro";
import { generatePlanningSchedule } from "../src/lib/planejamento/scheduling";
import { createPlanningCreditPreview, transitionPlanningCredit } from "../src/lib/planejamento/credits";

const configuration = (instrumentId: string) => ({ instrumentId, enabled: "true", reason: "Conferência da matriz na base isolada" });
type Fixture = Awaited<ReturnType<typeof createPlanningAccountingFixture>>;
const movement = (f: Fixture, lineId: string, direction = "INCREASE", amount = "10.01") => ({ instrumentId: f.loa, lineId, direction, amount, effectiveAt: "2026-03-01", legalActNumber: "Lei 2/2026", legalText: "Alteração autorizada", reason: "Revisão da previsão", submissionKey: randomUUID() });
async function balance(f: Fixture) {
  const transactions = await f.db.accountingTransaction.findMany({ include: { entries: true } });
  for (const row of transactions) {
    const total = (type: string) => row.entries.filter((entry) => entry.type === type).reduce((sum, entry) => sum.plus(entry.valueDecimal!), new Prisma.Decimal(0));
    assert.equal(row.entries.length, 2);
    assert.equal(total("Débito").toFixed(2), total("Crédito").toFixed(2));
    assert.equal(row.authorEmployeeId, "servidora-ana");
  }
  return transactions;
}
async function position(f: Fixture) {
  return {
    law: await f.db.annualBudgetLaw.findFirstOrThrow({ where: { planningInstrument: { is: { id: f.loa } } } }),
    piece: await f.db.planningInstrument.findUniqueOrThrow({ where: { id: f.loa } }),
    lines: await f.db.planningBudgetLine.findMany({ where: { instrumentId: f.loa }, orderBy: { id: "asc" } }),
    appropriations: await f.db.budgetAppropriation.findMany({ orderBy: { id: "asc" } }),
    quotas: await f.db.planningQuota.findMany({ orderBy: { id: "asc" } }),
    creditLines: await f.db.planningCreditLine.findMany({ orderBy: { id: "asc" } }),
    counts: await Promise.all([f.db.planningLineMovement.count(), f.db.budgetMovement.count(), f.db.planningQuotaEvent.count(), f.db.planningVersion.count(), f.db.planningIntegrationCommand.count(), f.db.accountingTransaction.count(), f.db.accountingEntry.count(), f.db.financialAuditLog.count()]),
  };
}

test("S1 PostgreSQL: abertura e seis eventos reais, replay e autorização nas duas jornadas", async () => {
  const previous = process.env.CELERIFLOW_ACCOUNTING_MODE;
  process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
  try {
    for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) {
      const f = await createPlanningAccountingFixture(jurisdiction);
      try {
        await f.rules();
        await configurePlanningInternalAccounting(f.context, configuration(f.loa));
        await transitionPlanningPiece(f.context, { ...f.workflow, stage: "IMPLANT" });
        await transitionPlanningPiece(f.context, { ...f.workflow, stage: "IMPLANT" });
        assert.equal(await f.db.accountingTransaction.count(), 3, "implantação gera só uma abertura por linha");
        for (const [line, direction] of [[f.revenue, "INCREASE"], [f.revenue, "DECREASE"], [f.e1, "INCREASE"], [f.e1, "DECREASE"]]) {
          const input = movement(f, line, direction);
          const id = await registerPlanningMovement(f.context, input);
          assert.equal(await registerPlanningMovement(f.context, input), id);
          await assert.rejects(registerPlanningMovement(f.context, { ...input, amount: "10.02" }), /outros dados/);
        }
        const rows = await balance(f);
        assert.equal(rows.length, 7);
        assert.equal(new Set(rows.map((row) => row.eventType)).size, 6);
        assert.equal(await f.db.planningIntegrationCommand.count({ where: { status: "PENDING" } }), 0);
        const before = await position(f);
        const noFinance = { ...f.context, user: { ...f.context.user, profileCode: "BUDGET_ANALYST", permissions: JSON.stringify({ modules: { PLANEJAMENTO: { blocked: false, update: true, legalApproval: true }, CAMARA: { blocked: false } } }) } };
        await assert.rejects(registerPlanningMovement(noFinance, movement(f, f.revenue)), /postagem financeira/);
        await assert.rejects(registerPlanningMovement({ ...f.context, user: { ...f.context.user, employeeId: null } }, movement(f, f.revenue)), /servidor responsável/);
        assert.deepEqual(await position(f), before, "recusa de autorização reverte o efeito orçamentário");
        const collision = movement(f, f.revenue);
        await f.db.financialYear.update({ where: { id: "ano" }, data: { status: "Aberto" } });
        await postAccountingTransaction(f.db, { usuarioId: "ana", employeeId: "servidora-ana" }, { financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", date: new Date("2026-03-01"), history: "Origem incompatível da fixture isolada", lines: [{ accountId: "debito", type: "Débito", value: "0.01" }, { accountId: "credito", type: "Crédito", value: "0.01" }], sourceModule: "TEST", sourceType: "FIXTURE_COLLISION", sourceId: "origem-incompativel", eventType: "PLANNING_REVENUE_INCREASE", idempotencyKey: `accounting:${collision.submissionKey}` });
        const beforeCollision = await position(f);
        await assert.rejects(registerPlanningMovement(f.context, collision), /Chave contábil/);
        assert.deepEqual(await position(f), beforeCollision);
        await assert.rejects(configurePlanningInternalAccounting(f.context, { ...configuration(f.loa), enabled: "false" }), /histórico contábil/);
        const opening = await f.db.planningIntegrationCommand.findUniqueOrThrow({ where: { idempotencyKey: `implant:${f.loa}` } });
        await f.db.$transaction((tx) => deliverPlanningAccountingCommand(tx, f.context, opening.id));
        assert.equal(await f.db.accountingTransaction.count(), 8);
        await assert.rejects(f.pg.query('UPDATE "PlanningIntegrationCommand" SET payload=$1 WHERE id=$2', ["{}", opening.id]), /immutable/);
        await assert.rejects(f.pg.query('UPDATE "PlanningIntegrationCommand" SET status=$1 WHERE id=$2', ["PENDING", opening.id]), /Invalid/);
      } finally { await f.close(); }
    }
  } finally { if (previous === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE; else process.env.CELERIFLOW_ACCOUNTING_MODE = previous; }
});

test("S1 PostgreSQL: falha depois da primeira partida reverte implantação e sincronização; baseline preservada", async () => {
  const previous = process.env.CELERIFLOW_ACCOUNTING_MODE;
  process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
  let fixture: Fixture | undefined;
  try {
    const f = await createPlanningAccountingFixture();
    fixture = f;
    await f.rules();
    await configurePlanningInternalAccounting(f.context, configuration(f.loa));
    await f.db.accountingPostingRule.update({ where: { id: "rule:PLANNING_BUDGET_OPENING_REVENUE" }, data: { isActive: false } });
    const beforeImplant = await position(f);
    await assert.rejects(transitionPlanningPiece(f.context, { ...f.workflow, stage: "IMPLANT" }), /exatamente uma regra ativa/);
    assert.deepEqual(await position(f), beforeImplant, "abertura de despesas anterior à falha da receita também deve voltar");
    await configurePlanningInternalAccounting(f.context, { ...configuration(f.loa), enabled: "false" });
    await transitionPlanningPiece(f.context, { ...f.workflow, stage: "IMPLANT" });
    const newLine = await addApprovedPlanningLine(f.context, { instrumentId: f.loa, kind: "REVENUE", code: "R.NOVA", description: "Receita incluída por ato posterior", year: 2026, budgetUnitId: "ug", resourceSourceId: "livre", revenueNatureId: "receita", originalValue: "5.00", effectiveAt: "2026-02-01", legalActNumber: "Lei 2/2026", legalText: "Nova receita autorizada", reason: "Inclusão formal", submissionKey: randomUUID() });
    await registerPlanningMovement(f.context, movement(f, f.revenue));
    await f.db.accountingPostingRule.update({ where: { id: "rule:PLANNING_BUDGET_OPENING_REVENUE" }, data: { isActive: true } });
    await configurePlanningInternalAccounting(f.context, configuration(f.loa));
    await f.db.accountingPostingRule.update({ where: { id: "rule:PLANNING_REVENUE_INCREASE" }, data: { isActive: false } });
    const beforeSync = await position(f);
    await assert.rejects(synchronizePlanningAccounting(f.context, { instrumentId: f.loa }), /exatamente uma regra ativa/);
    assert.deepEqual(await position(f), beforeSync, "falha do comando posterior desfaz abertura, partidas e estados entregues");
    await f.db.accountingPostingRule.update({ where: { id: "rule:PLANNING_REVENUE_INCREASE" }, data: { isActive: true } });
    await synchronizePlanningAccounting(f.context, { instrumentId: f.loa });
    await synchronizePlanningAccounting(f.context, { instrumentId: f.loa });
    const rows = await balance(f);
    assert.equal(rows.length, 5);
    assert.equal(rows.filter((row) => row.eventType.startsWith("PLANNING_BUDGET_OPENING")).length, 3);
    assert.equal(rows.find((row) => row.eventType === "PLANNING_BUDGET_OPENING_REVENUE")!.entries[0].valueDecimal!.toFixed(2), "100.00");
    assert.equal(rows.filter((row) => row.sourceId === newLine).length, 0, "linha posterior não participa da abertura");
    assert.equal(await f.db.planningIntegrationCommand.count({ where: { status: "PENDING" } }), 0);
  } finally { await fixture?.close(); if (previous === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE; else process.env.CELERIFLOW_ACCOUNTING_MODE = previous; }
});

test("S1 PostgreSQL: rollback integral de crédito multifonte, competência fechada e regra ambígua", async () => {
  const previous = process.env.CELERIFLOW_ACCOUNTING_MODE;
  process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
  let fixture: Fixture | undefined;
  try {
    const f = await createPlanningAccountingFixture();
    fixture = f;
    await f.rules();
    await configurePlanningInternalAccounting(f.context, configuration(f.loa));
    await transitionPlanningPiece(f.context, { ...f.workflow, stage: "IMPLANT" });
    for (const id of [f.e1, f.e2]) await generatePlanningSchedule(f.context, { instrumentId: f.loa, lineId: id, method: "TWELFTHS", periodMonths: 2, reason: "Distribuição uniforme" });
    const extra = async (code: string) => addApprovedPlanningLine(f.context, { ...f.expenseInput, code, description: "Dotação de recursos vinculados", resourceSourceId: "vinculada", originalValue: "0", effectiveAt: "2026-02-01", legalActNumber: "Lei 2/2026", legalText: "Classificação de despesa autorizada", reason: "Preparação da dotação", submissionKey: randomUUID() });
    const e3 = await extra("E3");
    await extra("E4");
    await registerPlanningMovement(f.context, movement(f, e3, "INCREASE", "20.00"));
    const batch = await createPlanningCreditPreview(f.context, { instrumentId: f.loa, number: "1", type: "Remanejamento", origin: "CANCELLATION", originEvidence: "Anulação por fonte", originLimit: "0", justification: "Redistribuição das prioridades", items: "E1;-;5.00\nE2;+;5.00\nE3;-;2.00\nE4;+;2.00", submissionKey: randomUUID() });
    const stage = { instrumentId: f.loa, batchId: batch, effectiveAt: "2026-04-01", legalActNumber: "Decreto 4/2026", legalText: "Crédito publicado", reason: "Redistribuição autorizada" };
    for (const step of ["APPROVE", "SANCTION", "PUBLISH"]) await transitionPlanningCredit(step === "APPROVE" ? f.reviewer : f.context, { ...stage, stage: step });
    await f.db.accountingPostingRule.update({ where: { id: "rule:PLANNING_EXPENSE_INCREASE" }, data: { isActive: false } });
    const beforeCredit = await position(f);
    await assert.rejects(transitionPlanningCredit(f.context, { ...stage, stage: "EXECUTE" }), /exatamente uma regra ativa/);
    assert.deepEqual(await position(f), beforeCredit, "anulações e primeiras partidas, cotas, reservas e snapshots não sobrevivem à falha");
    assert.equal((await f.db.planningCreditBatch.findUniqueOrThrow({ where: { id: batch } })).status, "PUBLISHED");
    await f.db.accountingPostingRule.update({ where: { id: "rule:PLANNING_EXPENSE_INCREASE" }, data: { isActive: true } });
    await transitionPlanningCredit(f.context, { ...stage, stage: "EXECUTE" });
    await transitionPlanningCredit(f.context, { ...stage, stage: "EXECUTE" });
    assert.equal((await f.db.planningCreditLine.aggregate({ where: { batchId: batch }, _sum: { reserved: true } }))._sum.reserved!.toFixed(2), "0.00");
    assert.equal((await f.db.annualBudgetLaw.findFirstOrThrow()).totalExpense.toFixed(2), "120.00");
    assert.equal((await balance(f)).length, 8);
    await f.db.monthlyAccountingClose.create({ data: { financialYearId: "ano", competence: new Date("2026-03-01"), status: "FECHADO" } });
    const beforeClosed = await position(f);
    await assert.rejects(registerPlanningMovement(f.context, movement(f, f.revenue)), /competencia contabil/);
    assert.deepEqual(await position(f), beforeClosed);
    await f.db.monthlyAccountingClose.updateMany({ data: { status: "ABERTO" } });
    await f.db.accountingPostingRule.update({ where: { id: "rule:PLANNING_REVENUE_INCREASE" }, data: { creditAccountId: "conta-ausente" } });
    const beforeMissingAccount = await position(f);
    await assert.rejects(registerPlanningMovement(f.context, movement(f, f.revenue)), /contas contabeis nao foram encontradas/);
    assert.deepEqual(await position(f), beforeMissingAccount);
    await f.db.accountingPostingRule.update({ where: { id: "rule:PLANNING_REVENUE_INCREASE" }, data: { creditAccountId: "credito" } });
    await f.db.accountingPostingRule.create({ data: { eventId: "PLANNING_REVENUE_INCREASE", debitAccountId: "credito", creditAccountId: "debito", isReference: true } });
    const beforeAmbiguous = await position(f);
    await assert.rejects(registerPlanningMovement(f.context, movement(f, f.revenue)), /exatamente uma regra ativa/);
    assert.deepEqual(await position(f), beforeAmbiguous);
  } finally { await fixture?.close(); if (previous === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE; else process.env.CELERIFLOW_ACCOUNTING_MODE = previous; }
});

test("S1 PostgreSQL: comando antigo recupera snapshot e abertura reconciliada não duplica partidas", async () => {
  const previous = process.env.CELERIFLOW_ACCOUNTING_MODE;
  process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
  let fixture: Fixture | undefined;
  try {
    const f = await createPlanningAccountingFixture();
    fixture = f;
    await f.rules();
    const legacy = await f.db.budgetAppropriation.create({ data: { code: "VA-2026/LEGADO", financialYearId: "ano", budgetUnitId: "ug", resourceSourceId: "livre", expenseNatureId: "despesa", initialValue: 50, initialValueDecimal: 50, updatedValue: 50, updatedValueDecimal: 50, committedValueDecimal: 0 } });
    await reconcilePlanningLegacyAppropriation(f.context, { instrumentId: f.loa, lineId: f.e1, appropriationId: legacy.id, reason: "Preservação da dotação original", accountingEvidence: "Abertura registrada no Financeiro" });
    await f.db.financialYear.update({ where: { id: "ano" }, data: { status: "Aberto" } });
    const original = await postAccountingTransaction(f.db, { usuarioId: "ana", employeeId: "servidora-ana" }, { financialYearId: "ano", date: new Date("2026-01-01"), history: "Abertura anterior à adoção", lines: [{ accountId: "debito", type: "Débito", value: "50.00" }, { accountId: "credito", type: "Crédito", value: "50.00" }], sourceType: "BUDGET_APPROPRIATION_OPENING", sourceModule: "PLANEJAMENTO", sourceId: legacy.id, eventType: "PLANNING_BUDGET_OPENING_EXPENSE", idempotencyKey: "legacy:opening" });
    await transitionPlanningPiece(f.context, { ...f.workflow, stage: "IMPLANT" });
    const opening = await f.db.planningIntegrationCommand.findUniqueOrThrow({ where: { idempotencyKey: `implant:${f.loa}` } });
    const payload = opening.payload as Prisma.JsonObject;
    // Simulate a persisted pre-S1 command, then restore the new database guard.
    await f.pg.exec('ALTER TABLE "PlanningIntegrationCommand" DISABLE TRIGGER planning_accounting_command_integrity');
    const oldPayload = { ...payload }; delete oldPayload.openingLines;
    await f.db.planningIntegrationCommand.update({ where: { id: opening.id }, data: { payload: oldPayload as Prisma.InputJsonObject } });
    await f.pg.exec('ALTER TABLE "PlanningIntegrationCommand" ENABLE TRIGGER planning_accounting_command_integrity');
    await registerPlanningMovement(f.context, movement(f, f.revenue));
    await configurePlanningInternalAccounting(f.context, configuration(f.loa));
    await f.db.accountingEntry.updateMany({ where: { transactionId: original.id, type: "Crédito" }, data: { valueDecimal: 49 } });
    const beforeMismatch = await position(f);
    await assert.rejects(synchronizePlanningAccounting(f.context, { instrumentId: f.loa }), /Reconcilie a abertura/);
    assert.deepEqual(await position(f), beforeMismatch);
    await f.db.accountingEntry.updateMany({ where: { transactionId: original.id, type: "Crédito" }, data: { valueDecimal: 50 } });
    await synchronizePlanningAccounting(f.context, { instrumentId: f.loa });
    await synchronizePlanningAccounting(f.context, { instrumentId: f.loa });
    assert.equal((await balance(f)).length, 4, "só receita, segunda despesa e alteração são postadas além da abertura legada");
    assert.equal(await f.db.accountingTransaction.count({ where: { sourceType: "BUDGET_APPROPRIATION_OPENING", sourceId: legacy.id } }), 1);
    assert.equal(await f.db.accountingTransaction.count({ where: { sourceId: f.e1 } }), 0);
    assert.equal(await f.db.planningIntegrationCommand.count({ where: { status: "PENDING" } }), 0, "verificação do vínculo legado também deve ser concluída");
  } finally { await fixture?.close(); if (previous === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE; else process.env.CELERIFLOW_ACCOUNTING_MODE = previous; }
});

test("S1 PostgreSQL: configuração recusa matriz incompleta/referencial, servidor e UG; orçamento futuro contabiliza no exercício de destino", async () => {
  const previous = process.env.CELERIFLOW_ACCOUNTING_MODE;
  process.env.CELERIFLOW_ACCOUNTING_MODE = "PRODUCTION";
  let fixture: Fixture | undefined;
  try {
    const f = await createPlanningAccountingFixture();
    fixture = f;
    const before = await position(f);
    await assert.rejects(configurePlanningInternalAccounting(f.context, configuration(f.loa)), /Configure uma regra/);
    assert.deepEqual(await position(f), before);
    await f.rules();
    await assert.rejects(configurePlanningInternalAccounting(f.context, configuration(f.loa)), /Configure uma regra/);
    process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
    await assert.rejects(configurePlanningInternalAccounting({ ...f.context, user: { ...f.context.user, employeeId: null } }, configuration(f.loa)), /cadastro de servidor/);
    await f.db.accountingPostingRule.update({ where: { id: "rule:PLANNING_REVENUE_INCREASE" }, data: { creditAccountId: "inexistente" } });
    await assert.rejects(configurePlanningInternalAccounting(f.context, configuration(f.loa)), /contas existentes/);
    await f.db.accountingPostingRule.update({ where: { id: "rule:PLANNING_REVENUE_INCREASE" }, data: { creditAccountId: "credito" } });
    await addApprovedPlanningLine(f.context, { ...f.expenseInput, code: "E.RESTRITA", description: "Dotação de outra unidade", budgetUnitId: "ug-restrita", originalValue: "0", effectiveAt: "2026-02-01", legalActNumber: "Lei 2/2026", legalText: "Classificação autorizada", reason: "Nova unidade", submissionKey: randomUUID() });
    await assert.rejects(configurePlanningInternalAccounting({ ...f.context, user: { ...f.context.user, profileCode: "BUDGET_ANALYST" } }, configuration(f.loa)), /todas as unidades/);
    await assert.rejects(configurePlanningInternalAccounting({ ...f.context, jurisdiction: "LEGISLATIVE" }, configuration(f.loa)));

    await f.db.financialYear.create({ data: { id: "futuro", governmentEntityId: "ente", year: 2027, status: "Preparação", startDate: new Date("2027-01-01"), endDate: new Date("2027-12-31") } });
    const common = { governmentEntityId: "ente", code: "2027", startYear: 2027, endYear: 2027, revenueDegree: 6, expenseLevel: "ELEMENT_SOURCE" };
    const ldo = await createPlanningInstrument(f.context, { ...common, kind: "LDO", title: "Diretrizes do exercício seguinte", parentId: f.ppa });
    const loa = await createPlanningInstrument(f.context, { ...common, kind: "LOA", title: "Orçamento do exercício seguinte", parentId: ldo });
    const revenue = await addPlanningLine(f.context, { instrumentId: loa, kind: "REVENUE", code: "R", description: "Receita prevista", year: 2027, budgetUnitId: "ug", resourceSourceId: "livre", revenueNatureId: "receita", originalValue: "100.00" });
    await addPlanningLine(f.context, { ...f.expenseInput, instrumentId: loa, year: 2027, code: "E", description: "Despesa prevista", originalValue: "100.00" });
    const workflow = { ...f.workflow, instrumentId: loa, date: "2026-09-01", legalActNumber: "Lei 9/2026" };
    for (const stage of ["SUBMIT", "APPROVE", "SANCTION", "PUBLISH"]) await transitionPlanningPiece(stage === "APPROVE" ? f.reviewer : f.context, { ...workflow, stage });
    await configurePlanningInternalAccounting(f.context, configuration(loa));
    await transitionPlanningPiece(f.context, { ...workflow, stage: "IMPLANT" });
    await registerPlanningMovement(f.context, { ...movement(f, revenue), instrumentId: loa, effectiveAt: "2026-09-02" });
    const rows = await balance(f);
    assert.equal(rows.length, 3);
    assert.ok(rows.every((row) => row.financialYearId === "futuro" && row.date.toISOString().slice(0, 10) === "2027-01-01"));
    assert.equal((await f.db.financialYear.findUniqueOrThrow({ where: { id: "futuro" } })).status, "Preparação", "postagem orçamentária não abre o exercício para empenhamento");
  } finally { await fixture?.close(); if (previous === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE; else process.env.CELERIFLOW_ACCOUNTING_MODE = previous; }
});

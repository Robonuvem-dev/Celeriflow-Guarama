import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { configureBankResourceSources } from "../src/lib/financeiro/bank-resource-sources";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { approveExpenseRequest, cancelBudgetReservation, cancelCommitment, cancelSettlement, createBudgetReservation, createCommitment, createCommitmentMovement, createPayment, createRevenue, createSettlement, getBudgetAvailability, launchRevenue, collectLaunchedRevenue, redistributeRevenueResourceSource, reversePayment, reverseRevenue, updatePaymentStatus } from "../src/lib/financeiro";
import { createCommitmentFromExpenseAuthorization, deriveExpenseAuthorizationsForContract } from "../src/lib/compras/procurement-finance-bridge";
import { contingencyPlanningBudget, generatePlanningSchedule } from "../src/lib/planejamento/scheduling";
import { lockPlanningBudgetForAppropriation, readPlanningFinancialExecution } from "../src/lib/planejamento/execution-bridge";
import { readPlanningMonthlyExecution } from "../src/lib/planejamento/monthly-execution";
import { addApprovedPlanningLine, addPlanningLine } from "../src/lib/planejamento/service";
import { configurePlanningInternalExecution } from "../src/lib/planejamento/accounting-bridge";
import { createPlanningCreditPreview } from "../src/lib/planejamento/credits";
import { confirmTaxPayment, createTaxAssessment, generateTaxGuide } from "../src/lib/tributacao";
import { processCollectionReturn, sendAccountingReference } from "../src/lib/tributacao/s2-service";

type Fixture = Awaited<ReturnType<typeof createPlanningExecutionFixture>>;

test("P1: constituição e guia preservam o exercício e a UG tributária após mudança do mapeamento", async () => scenario(async (f) => {
  await f.db.financialYear.update({ where: { id: "ano" }, data: { status: "Aberto" } });
  await f.db.tax.create({ data: { id: "tributo-escopo", name: "Tributo de ensaio", taxType: "Taxa", isActive: true } });
  await f.db.taxpayer.create({ data: { id: "contribuinte-escopo", taxpayerType: "PJ", companyId: "empresa", status: "Ativo" } });
  await f.db.taxFinancialMapping.create({ data: { taxId: "tributo-escopo", revenueNatureId: "receita", resourceSourceId: "livre", defaultBankAccountId: "banco", isActive: true } });
  const assessment = await createTaxAssessment(f.db, f.actor, { year: 2026, taxId: "tributo-escopo", taxpayerId: "contribuinte-escopo", taxableBase: "100.00", rate: "4" });
  const snapshot = assessment.calculationSnapshot as Prisma.JsonObject;
  assert.equal(snapshot.financialYearId, "ano");
  assert.equal(snapshot.governmentEntityId, "ente");
  assert.equal(snapshot.budgetUnitId, "ug");
  await f.db.bankAccount.create({ data: { id: "banco-mapeamento-alterado", budgetUnitId: "ug-restrita", bankName: "Outra unidade", agency: "0001", accountNumber: "1234" } });
  await f.db.taxFinancialMapping.update({ where: { taxId: "tributo-escopo" }, data: { defaultBankAccountId: "banco-mapeamento-alterado" } });
  const guide = await generateTaxGuide(f.db, f.actor, { assessmentId: assessment.id, dueDate: new Date("2026-03-31") });
  const payment = { guideId: guide.id, amountPaid: "4.00", paymentDate: new Date("2026-03-01"), paymentMethod: "PIX", idempotencyKey: "scope-tax-payment" };
  await assert.rejects(confirmTaxPayment(f.db, f.actor, payment), /diverge da unidade gestora/i);
  assert.equal(await f.db.taxPayment.count(), 0);
  await confirmTaxPayment(f.db, f.actor, { ...payment, bankAccountId: "banco" });
  assert.equal((await f.db.revenue.findFirstOrThrow()).budgetUnitId, "ug");
}));

test("P1: retorno tributário referencia a partida canônica sem duplicar receita ou contabilidade", async () => scenario(async (f) => {
  await f.db.financialYear.update({ where: { id: "ano" }, data: { status: "Aberto" } });
  await f.pg.exec(`INSERT INTO "Tax" (id,name,"taxType","isActive") VALUES ('tributo-ref','Taxa de ensaio','Taxa',true);
    INSERT INTO "TaxFinancialMapping" (id,"taxId","revenueNatureId","resourceSourceId","defaultBankAccountId","isActive") VALUES ('mapa-ref','tributo-ref','receita','livre','banco',true);
    INSERT INTO "TaxAssessment" (id,year,"originalValue","originalValueDecimal","finalValueDecimal","taxId","taxpayerId",status) VALUES ('lancamento-ref',2026,4,4,4,'tributo-ref','contribuinte','Lançado');
    INSERT INTO "TaxGuide" (id,"guideNumber","totalValue","totalValueDecimal","dueDate","assessmentId",status) VALUES ('guia-ref','DAM-REF',4,4,'2026-03-31','lancamento-ref','Emitida');`);
  const occurredAt = new Date("2026-03-01T12:00:00Z");
  const returned = await processCollectionReturn(f.db, f.actor, { idempotencyKey: "ref-return", guideNumber: "DAM-REF", amount: "5.00", occurredAt, status: "CONFIRMADO" });
  const before = await f.db.accountingTransaction.count();
  const input = { sourceType: "ARRECADACAO", sourceId: returned.id, amount: "5.00", competence: occurredAt };
  const reference = await sendAccountingReference(f.db, f.actor, input);
  assert.equal(reference.status, "PROCESSADO");
  assert.equal((await sendAccountingReference(f.db, f.actor, input)).id, reference.id);
  assert.equal(await f.db.accountingTransaction.count(), before);
  assert.equal(await f.db.revenue.count(), 1);
  assert.equal((await f.db.revenue.findFirstOrThrow()).valueDecimal!.toFixed(2), "4.00");
  const result = reference.result as Prisma.JsonObject;
  assert.equal(result.mode, "CANONICAL_REFERENCE");
  const transaction = await f.db.accountingTransaction.findUniqueOrThrow({ where: { id: String(result.accountingTransactionId) } });
  assert.equal(transaction.budgetUnitId, "ug");
  assert.equal(transaction.governmentEntityId, "ente");
  await assert.rejects(sendAccountingReference(f.db, f.actor, { ...input, amount: "4.00" }), /outros dados/i);
  await assert.rejects(sendAccountingReference(f.db, { ...f.actor, allowedBudgetUnitIds: ["ug-restrita"] }, input), /autorizadas/i);
  const pending = await sendAccountingReference(f.db, f.actor, { ...input, sourceId: "origem-inexistente" });
  assert.equal(pending.status, "PENDENTE");
  assert.equal(await f.db.accountingTransaction.count(), before);
}));
const commitInput = (f: Fixture, reservationId: string, value: string) => ({ number: `NE-${randomUUID()}`, date: new Date(`${f.year}-09-01`), value, type: "Ordinário", history: "Manutenção dos serviços municipais", appropriationId: f.appropriationId, supplierId: "fornecedor", reservationId });
async function financeState(f: Fixture) {
  return { quotas: await f.db.planningQuota.findMany({ orderBy: { id: "asc" } }), appropriation: await f.db.budgetAppropriation.findUniqueOrThrow({ where: { id: f.appropriationId } }), expenses: await f.db.expense.findMany({ orderBy: { id: "asc" } }), reservations: await f.db.budgetReservation.findMany({ orderBy: { id: "asc" } }), payments: await f.db.payment.findMany({ orderBy: { id: "asc" } }), counts: await Promise.all([f.db.expense.count(), f.db.budgetReservation.count(), f.db.commitment.count(), f.db.commitmentMovement.count(), f.db.payment.count(), f.db.treasuryMovement.count(), f.db.revenue.count(), f.db.planningQuotaEvent.count(), f.db.accountingTransaction.count(), f.db.accountingEntry.count(), f.db.financialDocument.count(), f.db.financialAuditLog.count()]) };
}
async function scenario(body: (f: Fixture) => Promise<void>, year = 2026, periodMonths: 2 | 3 | 6 = 2) {
  const previous = process.env.CELERIFLOW_ACCOUNTING_MODE;
  process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
  let f: Fixture | undefined;
  try { f = await createPlanningExecutionFixture(year, periodMonths); await body(f); }
  finally { await f?.close(); if (previous === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE; else process.env.CELERIFLOW_ACCOUNTING_MODE = previous; }
}

test("S2: reserva de Compras no exercício futuro exige implantação/cotas e não autoriza empenho", async () => scenario(async (f) => {
  await f.pg.exec(`INSERT INTO "PurchaseRequest" (id,number,object,justification,"secretariatId","departmentId","requesterId") VALUES ('solicitacao','SC-2027','Serviços municipais','Necessidade municipal','secretaria','departamento','servidora-ana');
    INSERT INTO "PurchaseRequestItem" (id,"purchaseRequestId","customName",quantity) VALUES ('item-solicitacao','solicitacao','Serviço municipal',1);
    INSERT INTO "PurchaseRequestItemBudgetAllocation" (id,"purchaseRequestItemId","budgetAppropriationId",quantity,"valueDecimal") VALUES ('alocacao','item-solicitacao','${f.appropriationId}',1,6);
    INSERT INTO "PurchaseProcess" (id,number,object,type,"secretariatId","purchaseRequestId") VALUES ('processo','PC-2027','Serviços municipais','Comum','secretaria','solicitacao');
    INSERT INTO "PurchaseProcessItem" (id,"purchaseProcessId","customName",quantity) VALUES ('item-processo','processo','Serviço municipal',1);
    INSERT INTO "Contract" (id,number,object,"initialValue","updatedValue","startDate","endDate",status,"processId","supplierId","secretariatId","sourceBudgetUnitId") VALUES ('contrato','CT-2027','Serviços municipais',6,6,'2027-01-01','2027-12-31','Vigente','processo','fornecedor','secretaria','ug');`);
  const authorization = await deriveExpenseAuthorizationsForContract(f.db, f.actor, "contrato", new Date("2027-09-01"));
  assert.equal((await deriveExpenseAuthorizationsForContract(f.db, f.actor, "contrato", new Date("2027-09-01")))[0].expenseId, authorization[0].expenseId);
  await approveExpenseRequest(f.db, f.financeReviewer, authorization[0].expenseId);
  const reservation = await createBudgetReservation(f.db, f.financeReviewer, { number: "RF-2027", date: new Date("2027-09-01"), value: "6.00", appropriationId: f.appropriationId, expenseId: authorization[0].expenseId });
  assert.equal(reservation.status, "Ativa");
  assert.equal((await getBudgetAvailability(f.db, f.appropriationId)).reserved.toFixed(2), "6.00");
  const before = await financeState(f);
  await assert.rejects(createCommitment(f.db, f.actor, commitInput(f, reservation.id, "6.00")), /não está aberto/);
  await assert.rejects(createCommitmentFromExpenseAuthorization(f.db, f.actor, { expenseId: authorization[0].expenseId, reservationId: reservation.id, reservationNumber: "RF-2027", commitmentNumber: "NE-2027", date: new Date("2027-09-01"), type: "Ordinário" }), /não está aberto/);
  assert.deepEqual(await financeState(f), before);
  const expense = await f.request("excesso", "3.00");
  await assert.rejects(createBudgetReservation(f.db, f.actor, { number: "RF-EXCESSO", date: new Date("2027-09-01"), value: "3.00", appropriationId: f.appropriationId, expenseId: expense.id }), /excede a cota/);
  await assert.rejects(cancelBudgetReservation(f.db, { ...f.actor, allowedBudgetUnitIds: [] }, reservation.id), /unidades autorizadas/);
  await cancelBudgetReservation(f.db, f.actor, reservation.id);
  assert.equal((await getBudgetAvailability(f.db, f.appropriationId)).reserved.toFixed(2), "0.00");
}, 2027));

test("S2: serviços reais de empenho/reforço/anulação, liquidação, pagamento e estorno conservam cotas e partidas", async () => scenario(async (f) => {
  await f.db.financialYear.update({ where: { id: "ano" }, data: { status: "Aberto" } });
  const receipt = { date: new Date("2026-01-01"), value: "100.00", revenueNatureId: "receita", resourceSourceId: "livre", bankAccountId: "banco", sourceModule: "FINANCEIRO", sourceType: "REVENUE", sourceId: "entrada", eventType: "RECEIPT", idempotencyKey: "receipt:entrada" };
  await createRevenue(f.db, f.actor, receipt);
  const reservation = await f.reserve("R-1", "2.00");
  const commitment = await createCommitment(f.db, f.actor, commitInput(f, reservation.id, "2.00"));
  await createCommitmentMovement(f.db, f.actor, { commitmentId: commitment.id, date: new Date("2026-09-02"), type: "Reforço", value: "0.50", justification: "Ampliação de serviços" });
  await createCommitmentMovement(f.db, f.actor, { commitmentId: commitment.id, date: new Date("2026-09-03"), type: "Anulação", value: "0.25", justification: "Redução do saldo" });
  assert.equal((await getBudgetAvailability(f.db, f.appropriationId)).committed.toFixed(2), "2.25");
  await f.db.retentionRule.create({ data: { id: "retencao", code: "ISOLATED.RET", type: "IRRF", description: "Retenção da fixture isolada", calculationBasePercentage: 100, ratePercentage: 20, beneficiaryName: "Ente Municipal", financialYearId: "ano", effectiveFrom: new Date("2026-01-01"), isActive: true } });
  const settlement = await createSettlement(f.db, f.actor, { date: new Date("2026-09-04"), value: "2.25", commitmentId: commitment.id, authorId: "servidora-ana", documentId: "documento-fiscal", retentionRuleIds: ["retencao"] });
  const payment = await createPayment(f.db, f.actor, { orderNumber: "OP-1", date: new Date("2026-09-05"), value: "2.25", commitmentId: commitment.id, settlementId: settlement.id, bankAccountId: "banco", supplierId: "fornecedor", paymentMethod: "Transferência" });
  await updatePaymentStatus(f.db, f.actor, payment.id, "Paga");
  await updatePaymentStatus(f.db, f.actor, payment.id, "Paga");
  assert.equal((await f.db.planningQuota.aggregate({ where: { lineId: f.e1 }, _sum: { disbursementPaid: true } }))._sum.disbursementPaid!.toFixed(2), "2.25");
  assert.equal(payment.netValueDecimal!.toFixed(2), "1.80");
  const monthly = await readPlanningMonthlyExecution(f.context, f.loa, 2026, "2026-09-06");
  assert.equal(monthly.rows.find((row) => row.lineId === f.e1 && row.month === 9)?.paidGross, "2.25");
  const ppaLine = await addPlanningLine(f.context, { ...f.expenseInput, instrumentId: f.ppa, code: "E1", description: "Meta anual de serviços", originalValue: "50.00" });
  const unmapped = await addPlanningLine(f.context, { ...f.expenseInput, instrumentId: f.ppa, code: "SEM-LOA", resourceSourceId: "vinculada", description: "Meta sem dotação anual", originalValue: "10.00" });
  const references = await f.db.planningBudgetLine.findMany({ where: { id: { in: [ppaLine, unmapped] } } });
  const evaluation = await readPlanningFinancialExecution(f.context, references, new Date("2026-09-06T23:59:59.999Z"));
  assert.equal(evaluation.rows.find((row) => row.lineId === ppaLine)?.committed, "2.25");
  assert.equal(evaluation.rows.find((row) => row.lineId === ppaLine)?.paidNet, "1.80");
  assert.equal(evaluation.rows.find((row) => row.lineId === unmapped)?.status, "UNMAPPED");
  assert.equal(evaluation.rows.find((row) => row.lineId === unmapped)?.committed, null);
  const originalPosting = await f.db.accountingTransaction.findFirstOrThrow({ where: { sourceType: "PAYMENT", sourceId: payment.id, eventType: "PAGAMENTO_EFETIVADO" }, include: { entries: true } });
  // A revisão da matriz depois do pagamento não pode mudar seu estorno histórico.
  await f.db.accountingPostingRule.update({ where: { id: "rule:PAGAMENTO_ESTORNADO" }, data: { isActive: false } });
  await f.db.accountingPostingRule.update({ where: { id: "rule:PAGAMENTO_EFETIVADO" }, data: { debitAccountId: "credito", creditAccountId: "debito" } });
  await reversePayment(f.db, f.actor, payment.id, "Estorno autorizado");
  const reversedPosting = await f.db.accountingTransaction.findUniqueOrThrow({ where: { reversalOfId: originalPosting.id }, include: { entries: true } });
  assert.equal(reversedPosting.eventType, "PAGAMENTO_ESTORNADO");
  assert.equal(reversedPosting.governmentEntityId, originalPosting.governmentEntityId);
  assert.equal(reversedPosting.budgetUnitId, originalPosting.budgetUnitId);
  for (const original of originalPosting.entries) {
    const reversed = reversedPosting.entries.find(row => row.accountId === original.accountId && row.type !== original.type);
    assert.ok(reversed);
    assert.equal(reversed.valueDecimal!.toFixed(2), original.valueDecimal!.toFixed(2));
  }
  const treasuryReversal = await f.db.treasuryMovement.findFirstOrThrow({ where: { sourceType: "PAYMENT", sourceId: payment.id, eventType: "PAYMENT_REVERSED" } });
  assert.equal(treasuryReversal.valueDecimal!.toFixed(2), "1.80");
  assert.equal(await f.db.withholdingPayable.count({ where: { retention: { paymentId: payment.id }, status: "Cancelada" } }), 1);
  await assert.rejects(reversePayment(f.db, f.actor, payment.id, "Estorno duplicado"), /Somente pagamentos efetivados/);
  await cancelSettlement(f.db, f.actor, settlement.id);
  await cancelCommitment(f.db, f.actor, commitment.id);
  assert.equal((await getBudgetAvailability(f.db, f.appropriationId)).committed.toFixed(2), "0.00");
  assert.equal((await f.db.planningQuota.aggregate({ where: { lineId: f.e1 }, _sum: { consumed: true, disbursementPaid: true } }))._sum.consumed!.toFixed(2), "0.00");
  const entries = await f.db.accountingEntry.findMany({ where: { accountId: "debito", transaction: { sourceType: { in: ["COMMITMENT", "COMMITMENT_MOVEMENT", "COMMITMENT_REVERSAL"] } } } });
  assert.equal(entries.reduce((sum, row) => row.type === "Débito" ? sum.plus(row.valueDecimal!) : sum.minus(row.valueDecimal!), new Prisma.Decimal(0)).toFixed(2), "0.00", "cancelamento estorna o saldo vigente, incluindo reforços e anulações parciais");
}));

test("S2: arrecadação direta/lançada, replay e estorno alimentam metas uma única vez e falha contábil reverte tudo", async () => scenario(async (f) => {
  await f.db.financialYear.update({ where: { id: "ano" }, data: { status: "Aberto" } });
  const input = { date: new Date("2026-03-01"), value: "12.00", revenueNatureId: "receita", resourceSourceId: "livre", bankAccountId: "banco", sourceModule: "FINANCEIRO", sourceType: "REVENUE", sourceId: "pagamento-origem", eventType: "RECEIPT", idempotencyKey: "direct:receipt" };
  const first = await createRevenue(f.db, f.actor, input);
  assert.equal(first.budgetUnitId, "ug");
  assert.equal((await createRevenue(f.db, f.actor, input)).id, first.id);
  await assert.rejects(createRevenue(f.db, f.actor, { ...input, value: "13.00" }), /outros dados/);
  assert.equal((await f.db.planningQuota.aggregate({ where: { lineId: f.revenue }, _sum: { consumed: true } }))._sum.consumed!.toFixed(2), "12.00");
  const launched = await launchRevenue(f.db, f.actor, { ...input, budgetUnitId: "ug", sourceModule: "FINANCEIRO", sourceType: "REVENUE", sourceId: "lancamento", idempotencyKey: "launched:receipt", value: "5.00" });
  assert.equal(launched.budgetUnitId, "ug");
  assert.equal(launched.bankAccountId, null);
  await f.db.bankAccount.create({ data: { id: "banco-outra-ug", budgetUnitId: "ug-restrita", bankName: "Outra UG", agency: "0001", accountNumber: "9999" } });
  const bothUnitsActor = { ...f.actor, allowedBudgetUnitIds: ["ug", "ug-restrita"] };
  await assert.rejects(collectLaunchedRevenue(f.db, bothUnitsActor, { revenueId: launched.id, date: new Date("2026-03-02"), bankAccountId: "banco-outra-ug", idempotencyKey: "collect:wrong-unit" }), /unidade gestora do lançamento/i);
  await assert.rejects(collectLaunchedRevenue(f.db, { ...f.actor, allowedBudgetUnitIds: ["ug-restrita"] }, { revenueId: launched.id, date: new Date("2026-03-02"), bankAccountId: "banco", idempotencyKey: "collect:unauthorized" }), /unidades autorizadas/i);
  await assert.rejects(launchRevenue(f.db, bothUnitsActor, { ...input, budgetUnitId: "ug-restrita", sourceModule: "FINANCEIRO", sourceType: "REVENUE", sourceId: "lancamento", idempotencyKey: "launched:receipt", value: "5.00" }), /outros dados/i);
  await collectLaunchedRevenue(f.db, f.actor, { revenueId: launched.id, date: new Date("2026-03-02"), bankAccountId: "banco", idempotencyKey: "collect:receipt" });
  assert.equal((await f.db.planningQuota.aggregate({ where: { lineId: f.revenue }, _sum: { consumed: true } }))._sum.consumed!.toFixed(2), "17.00");
  await reverseRevenue(f.db, f.actor, { revenueId: launched.id, date: new Date("2026-04-01"), justification: "Estorno autorizado" });
  assert.equal((await f.db.planningQuota.aggregate({ where: { lineId: f.revenue }, _sum: { consumed: true } }))._sum.consumed!.toFixed(2), "12.00");
  await f.db.accountingPostingRule.update({ where: { id: "rule:RECEITA_ARRECADADA" }, data: { isActive: false } });
  const before = await financeState(f);
  await assert.rejects(createRevenue(f.db, f.actor, { ...input, idempotencyKey: "receipt:falha" }), /regra ativa/);
  assert.deepEqual(await financeState(f), before);
  await f.db.accountingPostingRule.update({ where: { id: "rule:RECEITA_ARRECADADA" }, data: { isActive: true } });
  const destination = await addApprovedPlanningLine(f.context, { instrumentId: f.loa, kind: "REVENUE", code: "R.VINC", description: "Receita de fonte vinculada", year: 2026, budgetUnitId: "ug", resourceSourceId: "vinculada", revenueNatureId: "receita", originalValue: "0.00", effectiveAt: "2026-04-01", legalActNumber: "Lei 4/2026", legalText: "Nova fonte autorizada", reason: "Classificação da fonte", submissionKey: randomUUID() });
  await generatePlanningSchedule(f.context, { instrumentId: f.loa, lineId: destination, method: "TWELFTHS", periodMonths: 2, reason: "Metas da nova fonte" });
  await configureBankResourceSources(f.db, f.actor, "banco", ["livre", "vinculada"]);
  const redistribution = { revenueId: first.id, date: new Date("2026-04-02"), value: "3.00", destinationResourceSourceId: "vinculada", history: "Reclassificação por fonte", idempotencyKey: "redistribution:1" };
  const adjustment = await redistributeRevenueResourceSource(f.db, f.actor, redistribution);
  assert.equal((await redistributeRevenueResourceSource(f.db, f.actor, redistribution)).id, adjustment.id);
  const realized = await readPlanningMonthlyExecution(f.context, f.loa, 2026, "2026-04-03");
  assert.equal(realized.rows.find((row) => row.lineId === f.revenue && row.month === 3)?.realized, "9.00");
  assert.equal(realized.rows.find((row) => row.lineId === destination && row.month === 3)?.realized, "3.00");
  const financial = await readPlanningFinancialExecution(f.context, await f.db.planningBudgetLine.findMany({ where: { id: { in: [f.revenue, destination] } } }), new Date("2026-04-03T23:59:59.999Z"));
  assert.equal(financial.rows.find((row) => row.lineId === destination)?.collected, "3.00");
  assert.equal(financial.rows.find((row) => row.lineId === f.revenue)?.collected, "9.00");
}));

test("S2 PostgreSQL real: sessões disputam reserva e contingenciamento sem ultrapassar o saldo", { skip: !process.env.CELERIFLOW_PLANNING_TEST_POSTGRES_URL }, async () => scenario(async (f) => {
  const expenseA = await f.request("disputa-a", "6.00"), expenseB = await f.request("disputa-b", "6.00");
  let ready!: () => void, release!: () => void;
  const readyPromise = new Promise<void>((resolve) => { ready = resolve; });
  const released = new Promise<void>((resolve) => { release = resolve; });
  const holder = f.db.$transaction(async (tx) => { await lockPlanningBudgetForAppropriation(tx, f.appropriationId); ready(); await released; });
  await readyPromise;
  const requests = [expenseA, expenseB].map((expense, index) => createBudgetReservation(f.db, f.actor, { number: `DISPUTA-${index}`, date: new Date("2026-09-01"), value: "6.00", appropriationId: f.appropriationId, expenseId: expense.id }));
  const progress = await Promise.race([requests[0].then(() => "completed", () => "rejected"), new Promise<string>((resolve) => setTimeout(() => resolve("blocked"), 100))]);
  release();
  await holder;
  const outcomes = await Promise.allSettled(requests);
  assert.equal(progress, "blocked", "requisição em outra conexão aguarda o lock do instrumento");
  assert.equal(outcomes.filter((row) => row.status === "fulfilled").length, 1);
  assert.equal((await getBudgetAvailability(f.db, f.appropriationId)).reserved.toFixed(2), "6.00");
  const [first, second] = await Promise.all([f.db.$transaction(async (tx) => { const [row] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`; await tx.$executeRaw`SELECT pg_sleep(0.05)`; return row.pid; }), f.db.$transaction(async (tx) => { const [row] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`; return row.pid; })]);
  assert.notEqual(first, second, "servidor usa sessões PostgreSQL distintas");
  await contingencyPlanningBudget(f.context, { instrumentId: f.loa, lineId: f.e1, percentage: "10", reason: "Limitação de empenho", submissionKey: randomUUID() });
  const blocked = await f.db.planningQuota.aggregate({ where: { lineId: f.e1 }, _sum: { blocked: true } });
  assert.equal(blocked._sum.blocked!.toFixed(2), "5.00");
  await assert.rejects(contingencyPlanningBudget(f.context, { instrumentId: f.loa, lineId: f.e1, percentage: "90", reason: "Limitação acima do saldo reservado", submissionKey: randomUUID() }), /reservas de compra/);
}));

test("S2: falhas contábeis de empenho e pagamento revertem documentos, reservas, cotas e tesouraria", async () => scenario(async (f) => {
  await f.db.financialYear.update({ where: { id: "ano" }, data: { status: "Aberto" } });
  await createRevenue(f.db, f.actor, { date: new Date("2026-01-01"), value: "100.00", revenueNatureId: "receita", resourceSourceId: "livre", bankAccountId: "banco", sourceModule: "FINANCEIRO", sourceType: "REVENUE", eventType: "COLLECT", idempotencyKey: "rollback:income" });
  const reservation = await f.reserve("ROLLBACK-RES", "2.00");
  await f.db.accountingPostingRule.update({ where: { id: "rule:EMPENHO_EMITIDO" }, data: { isActive: false } });
  const beforeCommit = await financeState(f);
  await assert.rejects(createCommitment(f.db, f.actor, commitInput(f, reservation.id, "2.00")), /regra ativa/);
  assert.deepEqual(await financeState(f), beforeCommit);
  await f.db.accountingPostingRule.update({ where: { id: "rule:EMPENHO_EMITIDO" }, data: { isActive: true } });
  const commitment = await createCommitment(f.db, f.actor, commitInput(f, reservation.id, "2.00"));
  const settlement = await createSettlement(f.db, f.actor, { date: new Date("2026-09-02"), value: "2.00", commitmentId: commitment.id, authorId: "servidora-ana", documentId: "documento-fiscal" });
  const payment = await createPayment(f.db, f.actor, { orderNumber: "OP-ROLLBACK", date: new Date("2026-09-03"), value: "2.00", commitmentId: commitment.id, settlementId: settlement.id, bankAccountId: "banco", supplierId: "fornecedor", paymentMethod: "Transferência" });
  await f.db.accountingPostingRule.update({ where: { id: "rule:PAGAMENTO_EFETIVADO" }, data: { isActive: false } });
  const beforePayment = await financeState(f);
  await assert.rejects(updatePaymentStatus(f.db, f.actor, payment.id, "Paga"), /regra ativa/);
  assert.deepEqual(await financeState(f), beforePayment);
  assert.equal((await f.db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status, "Emitida");
  await f.db.accountingPostingRule.update({ where: { id: "rule:PAGAMENTO_EFETIVADO" }, data: { isActive: true } });
  await updatePaymentStatus(f.db, f.actor, payment.id, "Paga");
}));

test("S2: confirmação tributária gera um único realizado; falta de mapeamento reverte a baixa inteira", async () => scenario(async (f) => {
  await f.db.financialYear.update({ where: { id: "ano" }, data: { status: "Aberto" } });
  await f.pg.exec(`INSERT INTO "Tax" (id,name,"taxType","isActive") VALUES ('tributo','Taxa Municipal','Taxa',true);
    INSERT INTO "TaxFinancialMapping" (id,"taxId","revenueNatureId","resourceSourceId","defaultBankAccountId","isActive") VALUES ('mapa-tributario','tributo','receita','livre','banco',true);
    INSERT INTO "TaxAssessment" (id,year,"originalValue","originalValueDecimal","finalValueDecimal","taxId","taxpayerId",status) VALUES ('lancamento',2026,4,4,4,'tributo','contribuinte','Lançado'),('lancamento-2',2026,3,3,3,'tributo','contribuinte','Lançado');
    INSERT INTO "TaxGuide" (id,"guideNumber","totalValue","totalValueDecimal","dueDate","assessmentId",status) VALUES ('guia','DAM-1',4,4,'2026-03-31','lancamento','Emitida'),('guia-2','DAM-2',3,3,'2026-03-31','lancamento-2','Emitida');`);
  const input = { guideId: "guia", amountPaid: "4.00", paymentDate: new Date("2026-03-01"), paymentMethod: "PIX", idempotencyKey: "tax:confirmation" };
  await confirmTaxPayment(f.db, f.actor, input);
  await confirmTaxPayment(f.db, f.actor, input);
  assert.equal(await f.db.taxPayment.count(), 1);
  assert.equal(await f.db.revenue.count(), 1);
  assert.equal(await f.db.taxRevenueIntegrationEvent.count(), 1);
  assert.equal((await f.db.planningQuota.aggregate({ where: { lineId: f.revenue }, _sum: { consumed: true } }))._sum.consumed!.toFixed(2), "4.00");
  const revenue = await f.db.revenue.findFirstOrThrow();
  await assert.rejects(reverseRevenue(f.db, f.actor, { revenueId: revenue.id, date: new Date("2026-03-02"), justification: "Tentativa pelo fluxo financeiro" }), /fluxo tributario proprio/);
  await f.db.taxFinancialMapping.update({ where: { id: "mapa-tributario" }, data: { resourceSourceId: "vinculada" } });
  await configureBankResourceSources(f.db, f.actor, "banco", ["livre", "vinculada"]);
  const before = await financeState(f);
  await assert.rejects(confirmTaxPayment(f.db, f.actor, { ...input, guideId: "guia-2", amountPaid: "3.00", idempotencyKey: "tax:missing-source" }), /Mapeie uma única previsão/);
  assert.deepEqual(await financeState(f), before);
  assert.equal(await f.db.taxPayment.count(), 1);
  assert.equal((await f.db.taxGuide.findUniqueOrThrow({ where: { id: "guia-2" } })).status, "Emitida");
}));

test("S2: orçamento adotado sem conexão não usa CMD legado; ativação recusa fatos antigos com saldo zero", async () => scenario(async (f) => {
  await configurePlanningInternalExecution(f.context, { instrumentId: f.loa, enabled: "false", reason: "Preparação antes da execução" });
  const before = await financeState(f);
  await assert.rejects(f.request("desconectada", "2.00"), /Conecte a execução/);
  assert.deepEqual(await financeState(f), before);
  await f.db.commitment.create({ data: { id: "empenho-antigo", number: "NE-ANTIGA", date: new Date("2026-01-01"), value: 2, valueDecimal: 2, type: "Ordinário", history: "Execução anterior à conexão", appropriationId: f.appropriationId, supplierId: "fornecedor", status: "Anulado" } });
  await f.db.commitmentMovement.create({ data: { commitmentId: "empenho-antigo", date: new Date("2026-02-01"), type: "Anulação", valueDecimal: 2, justification: "Anulação anterior" } });
  await assert.rejects(configurePlanningInternalExecution(f.context, { instrumentId: f.loa, enabled: "true", reason: "Tentativa sem reconciliação" }), /fatos financeiros anteriores/);
}));

test("S2 PostgreSQL real: anulação de crédito e reserva de compra disputam a mesma disponibilidade", { skip: !process.env.CELERIFLOW_PLANNING_TEST_POSTGRES_URL }, async () => scenario(async (f) => {
  const expense = await f.request("reserva-semestre", "20.00");
  const outcomes = await Promise.allSettled([
    createBudgetReservation(f.db, f.actor, { number: "RES-SEMESTRE", date: new Date("2026-09-01"), value: "20.00", appropriationId: f.appropriationId, expenseId: expense.id }),
    createPlanningCreditPreview(f.context, { instrumentId: f.loa, number: "CREDITO-DISPUTA", type: "Remanejamento", origin: "CANCELLATION", originEvidence: "Redistribuição municipal", originLimit: "0", justification: "Revisão de prioridades", items: "E1;-;35.00\nE2;+;35.00", submissionKey: randomUUID() }),
  ]);
  assert.equal(outcomes.filter((row) => row.status === "fulfilled").length, 1);
  assert.ok((await getBudgetAvailability(f.db, f.appropriationId)).available.greaterThanOrEqualTo(0));
}, 2026, 6));

test("S2 PostgreSQL real: cancelamento de reserva e empenhamento não sobrescrevem o estado vencedor", { skip: !process.env.CELERIFLOW_PLANNING_TEST_POSTGRES_URL }, async () => scenario(async (f) => {
  await f.db.financialYear.update({ where: { id: "ano" }, data: { status: "Aberto" } });
  const reservation = await f.reserve("RES-CANCELAMENTO", "2.00");
  const outcomes = await Promise.allSettled([createCommitment(f.db, f.actor, commitInput(f, reservation.id, "2.00")), cancelBudgetReservation(f.db, f.actor, reservation.id)]);
  assert.equal(outcomes.filter((row) => row.status === "fulfilled").length, 1);
  const state = await f.db.budgetReservation.findUniqueOrThrow({ where: { id: reservation.id } });
  const committed = (await getBudgetAvailability(f.db, f.appropriationId)).committed;
  assert.equal(committed.toFixed(2), state.status === "Empenhada" ? "2.00" : "0.00");
  assert.ok(["Empenhada", "Cancelada"].includes(state.status));
}));

import { Prisma, type PrismaClient } from "@prisma/client";
import { assertAccountingPeriodOpen, postAccountingTransactionInTransaction } from "@/lib/financeiro";
import { TaxError, type TaxActor } from "./index";
import { assertTaxCreditScope } from "./credit-finance";
import { reclassifyRestoredTaxReceivable } from "./accrual-accounting";
import { resolveTaxAssessmentScope, resolveTaxFinancialYear, synchronizeAssessmentDebt, taxScopeSnapshot, taxAssessmentCompensatedValue } from "./scope";

export async function reverseTaxCreditMovement(db: PrismaClient, actor: TaxActor, input: {
  movementId: string; date: Date; reason: string; idempotencyKey: string; proofDocumentId?: string;
}) {
  if (!input.reason.trim() || !input.idempotencyKey.trim() || !Number.isFinite(input.date.getTime())) throw new TaxError("Informe fundamento, chave e data válidos para reversão do crédito.");
  return db.$transaction(async (tx) => {
    const key = `TAX_CREDIT_REVERSAL:${input.idempotencyKey.trim()}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
    const movement = await tx.taxRegistryEntry.findUniqueOrThrow({ where: { id: input.movementId } });
    const data = taxScopeSnapshot(movement.data);
    const scope = await assertTaxCreditScope(tx, actor, movement.data);
    const prior = await tx.taxIntegrationEvent.findUnique({ where: { idempotencyKey: key } });
    if (prior) {
      const payload = taxScopeSnapshot(prior.payload);
      if (payload.movementId !== movement.id || payload.date !== input.date.toISOString() || payload.reason !== input.reason.trim() || (payload.proofDocumentId ?? null) !== (input.proofDocumentId?.trim() || null)) throw new TaxError("Movimento já revertido com outros dados.");
      return prior;
    }
    const year = await resolveTaxFinancialYear(tx, input.date.getUTCFullYear(), scope);
    if (input.date < year.startDate || input.date > year.endDate) throw new TaxError("Reversão fora da vigência do exercício.");
    await assertAccountingPeriodOpen(tx, year.id, input.date);
    if (typeof data.sourceCreditId !== "string") throw new TaxError("Movimento sem crédito de origem conciliado.");
    await tx.$queryRaw`SELECT id FROM "TaxRegistryEntry" WHERE id = ${data.sourceCreditId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "TaxRegistryEntry" WHERE id = ${movement.id} FOR UPDATE`;
    const current = await tx.taxRegistryEntry.findUniqueOrThrow({ where: { id: movement.id } });
    if (current.status !== movement.status) throw new TaxError("Movimento alterado; atualize antes de reverter.");
    if (!((movement.category === "CREDIT_MOVEMENT" && movement.status === "EFETIVADO" && ["COMPENSAR", "TRANSFERIR"].includes(String(data.operation))) || (movement.category === "REFUND_REQUEST" && ["PENDENTE_APROVACAO", "APROVADA_AGUARDANDO_TESOURARIA", "RESTITUIDA"].includes(movement.status)))) throw new TaxError("Movimento não está disponível para reversão.");
    const credit = await tx.taxRegistryEntry.findUniqueOrThrow({ where: { id: data.sourceCreditId } });
    await assertTaxCreditScope(tx, actor, credit.data);
    const origin = taxScopeSnapshot(credit.data);
    const amount = new Prisma.Decimal(String(data.amount));
    const available = new Prisma.Decimal(String(origin.available));
    const total = new Prisma.Decimal(String(origin.amount));
    if (!amount.isFinite() || amount.lte(0) || !available.isFinite() || !total.isFinite() || available.plus(amount).gt(total) || credit.status === "ESTORNADO") throw new TaxError("Saldo de origem incompatível com a reversão do movimento.");
    let transactionId: string | null = null;
    let treasuryMovementId: string | null = null;
    if (movement.category === "REFUND_REQUEST" && movement.status === "RESTITUIDA") {
      const document = input.proofDocumentId?.trim() ? await tx.document.findUnique({ where: { id: input.proofDocumentId.trim() } }) : null;
      if (!document || document.status !== "Válido") throw new TaxError("Vincule comprovante GED válido do retorno dos recursos da restituição paga.");
      if (typeof data.transactionId !== "string" || typeof data.treasuryMovementId !== "string") throw new TaxError("Restituição paga sem partida e saída de tesouraria conciliadas.");
      const original = await tx.accountingTransaction.findUniqueOrThrow({ where: { id: data.transactionId }, include: { entries: true } });
      const outgoing = await tx.treasuryMovement.findUniqueOrThrow({ where: { id: data.treasuryMovementId } });
      const debit = original.entries.filter((entry) => entry.type === "Débito").reduce((sum, entry) => sum.plus(entry.valueDecimal ?? 0), new Prisma.Decimal(0));
      const creditValue = original.entries.filter((entry) => entry.type === "Crédito").reduce((sum, entry) => sum.plus(entry.valueDecimal ?? 0), new Prisma.Decimal(0));
      if (!debit.eq(amount) || !creditValue.eq(amount) || outgoing.financialYearId !== original.financialYearId) throw new TaxError("Partida e tesouraria da restituição não conciliam o valor original.");
      if (original.sourceModule !== "TRIBUTACAO" || original.sourceType !== "TAX_REFUND" || original.sourceId !== movement.id || original.budgetUnitId !== scope.budgetUnitId || original.governmentEntityId !== scope.governmentEntityId || outgoing.sourceModule !== "TRIBUTACAO" || outgoing.sourceType !== "TAX_REFUND" || outgoing.sourceId !== movement.id || outgoing.direction !== "Saída" || outgoing.status !== "Confirmado" || !outgoing.valueDecimal.eq(amount) || input.date < original.date || input.date < outgoing.date) throw new TaxError("Origem, valor ou data incompatível com o estorno da restituição paga.");
      await tx.$queryRaw`SELECT id FROM "BankAccount" WHERE id = ${outgoing.bankAccountId} FOR UPDATE`;
      const account = await tx.bankAccount.findUniqueOrThrow({ where: { id: outgoing.bankAccountId } });
      if (account.budgetUnitId !== scope.budgetUnitId || outgoing.resourceSourceId !== origin.resourceSourceId) throw new TaxError("Conta original da restituição diverge da UG/fonte do crédito.");
      const transaction = await postAccountingTransactionInTransaction(tx, actor, {
        financialYearId: year.id, ...scope, date: input.date, history: `Estorno de restituição paga ${movement.id}: ${input.reason.trim()}`,
        sourceModule: "TRIBUTACAO", sourceType: "TAX_REFUND_REVERSAL", sourceId: movement.id, eventType: "TAX_REFUND_REVERSED", idempotencyKey: `${key}:ACCOUNTING`, reversalOfId: original.id,
        lines: original.entries.map((entry) => { if (!entry.valueDecimal) throw new TaxError("Partida original sem Decimal conciliado."); return { originalEntryId: entry.id, accountId: entry.accountId, type: entry.type === "Débito" ? "Crédito" as const : "Débito" as const, value: entry.valueDecimal }; }),
      });
      transactionId = transaction.id;
      const incoming = await tx.treasuryMovement.create({ data: { date: input.date, type: "ExtraBudgetRefundReversal", resourceSourceId: outgoing.resourceSourceId, direction: "Entrada", valueDecimal: amount, bankAccountId: account.id, financialYearId: year.id, history: transaction.history, sourceModule: "TRIBUTACAO", sourceType: "TAX_REFUND_REVERSAL", sourceId: movement.id, eventType: "TAX_REFUND_REVERSED", idempotencyKey: `${key}:TREASURY` } });
      treasuryMovementId = incoming.id;
    }
    if (data.operation === "COMPENSAR") {
      if (typeof data.accountingTransactionId !== "string" || movement.entityType !== "TAX_ASSESSMENT") throw new TaxError("Compensação sem partida ou débito conciliado.");
      await tx.$queryRaw`SELECT id FROM "TaxAssessment" WHERE id = ${movement.entityId} FOR UPDATE`;
      const assessment = await tx.taxAssessment.findUniqueOrThrow({ where: { id: movement.entityId } });
      const destination = await resolveTaxAssessmentScope(tx, actor, assessment.taxId, assessment.calculationSnapshot);
      if (destination.budgetUnitId !== scope.budgetUnitId || destination.governmentEntityId !== scope.governmentEntityId || (assessment.taxpayerId !== credit.entityId && (typeof data.authorizationDocumentId !== "string" || data.sourceTaxpayerId !== credit.entityId || data.destinationId !== assessment.id))) throw new TaxError("Destino da compensação diverge da origem ou não possui autorização registrada.");
      const original = await tx.accountingTransaction.findUniqueOrThrow({ where: { id: data.accountingTransactionId }, include: { entries: true } });
      if (input.date < original.date) throw new TaxError("A reversão não pode anteceder a compensação.");
      const transaction = await postAccountingTransactionInTransaction(tx, actor, {
        financialYearId: year.id, ...scope, date: input.date, history: `Reversão da compensação ${movement.id}: ${input.reason.trim()}`,
        sourceModule: "TRIBUTACAO", sourceType: "TAX_CREDIT_COMPENSATION_REVERSAL", sourceId: movement.id, eventType: "TAX_CREDIT_COMPENSATION_REVERSED", idempotencyKey: `${key}:ACCOUNTING`, reversalOfId: original.id,
        lines: original.entries.map((entry) => { if (!entry.valueDecimal) throw new TaxError("Partida original sem Decimal conciliado."); return { originalEntryId: entry.id, accountId: entry.accountId, type: entry.type === "Débito" ? "Crédito" as const : "Débito" as const, value: entry.valueDecimal }; }),
      });
      transactionId = transaction.id;
      await reclassifyRestoredTaxReceivable(tx, actor, { assessmentId: assessment.id, originalTransactionId: original.id, amount, date: input.date, idempotencyKey: `${key}:DA_RESTORATION`, reason: `Recomposição do direito em dívida ativa após estorno da compensação ${movement.id}` });
      await tx.taxRegistryEntry.update({ where: { id: movement.id }, data: { status: "ESTORNADO" } });
      const payments = await tx.taxPayment.findMany({ where: { guide: { assessmentId: assessment.id }, status: "Confirmado" }, select: { amountPaidDecimal: true } });
      const extinguished = payments.reduce((sum, payment) => { if (!payment.amountPaidDecimal) throw new TaxError("Pagamento sem Decimal conciliado."); return sum.plus(payment.amountPaidDecimal); }, await taxAssessmentCompensatedValue(tx, assessment.id));
      const assessmentTotal = assessment.finalValueDecimal ?? assessment.originalValueDecimal;
      if (!assessmentTotal) throw new TaxError("Débito sem Decimal conciliado.");
      await tx.taxAssessment.update({ where: { id: assessment.id }, data: { status: extinguished.gte(assessmentTotal) ? "Pago" : extinguished.gt(0) ? "Parcial" : "Lançado" } });
      await synchronizeAssessmentDebt(tx, actor, assessment.id);
    } else if (data.operation === "TRANSFERIR") {
      const destinations = await tx.taxRegistryEntry.findMany({ where: { category: "TAX_CREDIT", source: "TRANSFERENCIA", data: { path: ["movementId"], equals: movement.id } } });
      if (destinations.length !== 1) throw new TaxError("Transferência sem crédito de destino único.");
      const destination = destinations[0];
      await tx.$queryRaw`SELECT id FROM "TaxRegistryEntry" WHERE id = ${destination.id} FOR UPDATE`;
      const currentDestination = await tx.taxRegistryEntry.findUniqueOrThrow({ where: { id: destination.id } });
      await assertTaxCreditScope(tx, actor, currentDestination.data);
      const balance = taxScopeSnapshot(currentDestination.data);
      if (currentDestination.status !== "DISPONIVEL" || !new Prisma.Decimal(String(balance.available)).eq(amount) || !new Prisma.Decimal(String(balance.amount)).eq(amount)) throw new TaxError("Crédito transferido já utilizado; reverta primeiro os movimentos do destino.");
      await tx.taxRegistryEntry.update({ where: { id: destination.id }, data: { status: "ESTORNADO", data: { ...balance, available: "0.00", reversedAt: input.date.toISOString() } } });
    }
    await tx.taxRegistryEntry.update({ where: { id: movement.id }, data: { status: "ESTORNADO", data: { ...data, status: "ESTORNADO", reversedAt: input.date.toISOString(), reversalTransactionId: transactionId, reversalTreasuryMovementId: treasuryMovementId, reversalProofDocumentId: input.proofDocumentId?.trim() || null, reversalReason: input.reason.trim() } } });
    await tx.taxRegistryEntry.update({ where: { id: credit.id }, data: { status: "DISPONIVEL", data: { ...origin, available: available.plus(amount).toFixed(2) } } });
    const event = await tx.taxIntegrationEvent.create({ data: { integrationCode: "TAX_CREDIT", eventType: "CREDIT_MOVEMENT_REVERSED", idempotencyKey: key, status: "PROCESSADO", evidenceLevel: "L1", taxpayerId: credit.entityId, payload: { movementId: movement.id, creditId: credit.id, date: input.date.toISOString(), reason: input.reason.trim(), proofDocumentId: input.proofDocumentId?.trim() || null, ...scope }, result: { transactionId, treasuryMovementId, restored: amount.toFixed(2) }, processedAt: new Date() } });
    await tx.taxAuditLog.create({ data: { action: "REVERSE_CREDIT_MOVEMENT", entityType: "TaxRegistryEntry", entityId: movement.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { eventId: event.id, restored: amount.toFixed(2), transactionId } } });
    return event;
  }, { timeout: 60000 });
}

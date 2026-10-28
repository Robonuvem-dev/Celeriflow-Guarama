import "server-only";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import { withDatabaseTransaction } from "@/db/transaction";
import { planningAppropriations, planningCreditBatches, planningCreditLines, planningLines } from "@/db/schema/planning-budget";
import { planningReservations } from "@/db/schema/planning-financial-sources";
import { financeCreditItems, financeCreditRequests } from "@/db/schema/finance-legacy-budget";
import { financialAuditLogs } from "@/db/schema/finance-identity";
import { governmentEntities } from "@/db/schema/master-data";
import { planningLineScope } from "@/db/repositories/planning/scope";
import { planningConnection } from "./database";
import { z } from "zod";
import { assertPlanningLegalAuthority, assertPlanningOperation, type PlanningContext } from "./access";
import { parsePlanningItems } from "./amendments";
import { applyLineDelta, assertWholePiece, canonicalPiece, contentHash, finalizeLegalRevision, linePosition, lockLegalInstrument, planningAudit, snapshotVersion } from "./operations-core";
import { moneySchema } from "./policy";
import { planningDateSchema } from "./revisions";

export async function createPlanningCreditPreview(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "create");
  const input = z.object({ instrumentId: z.string().min(1), number: z.string().trim().min(1).max(80), type: z.enum(["Suplementar", "Especial", "Extraordinário", "Remanejamento", "Transposição", "Transferência"]), origin: z.enum(["CANCELLATION", "SURPLUS", "EXCESS", "LOAN"]), originEvidence: z.string().trim().min(1).max(4000), originLimit: moneySchema, justification: z.string().trim().min(1).max(4000), items: z.string().min(1), submissionKey: z.string().uuid() }).parse(raw);
  const items = parsePlanningItems(input.items);
  return withDatabaseTransaction(planningConnection(context), async (tx) => {
    const piece = await lockLegalInstrument(tx, context, input.instrumentId);
    if (piece.kind !== "LOA" || !piece.annualBudgetLaw || !["SANCTIONED", "PUBLISHED"].includes(piece.annualBudgetLaw.status)) throw new Error("Prévia de crédito exige LOA sancionada/publicada.");
    const [prior] = await tx.select().from(planningCreditBatches).where(eq(planningCreditBatches.submissionKey, input.submissionKey)).limit(1);
    if (prior) {
      const [audit] = await tx.select({ payload: financialAuditLogs.payload }).from(financialAuditLogs).where(and(eq(financialAuditLogs.entityId, piece.id), eq(financialAuditLogs.action, "PLANNING_CREDIT_CREATE"), sql`${financialAuditLogs.payload}->>'submissionKey' = ${input.submissionKey}`)).limit(1);
      if (prior.instrumentId !== piece.id || !audit || contentHash(audit.payload) !== contentHash(input)) throw new Error("Solicitação repetida com dados diferentes.");
      return prior.id;
    }
    const lines = await tx.select().from(planningLines).where(and(eq(planningLines.instrumentId, piece.id), eq(planningLines.kind, "EXPENSE"), inArray(planningLines.code, items.map(row => row.code)), planningLineScope(context))).orderBy(asc(planningLines.id));
    if (lines.length !== items.length) throw new Error("Uma dotação não pertence à peça ou ao escopo autorizado.");
    const increases = items.filter((row) => row.value.isPositive()).reduce((sum, row) => sum.plus(row.value), new Decimal(0));
    const decreases = items.filter((row) => row.value.isNegative()).reduce((sum, row) => sum.plus(row.value.abs()), new Decimal(0));
    if (!increases.greaterThan(0)) throw new Error("A prévia exige ao menos um acréscimo.");
    if (input.origin === "CANCELLATION") {
      if (!increases.equals(decreases)) throw new Error("Acréscimos e anulações devem ter o mesmo total.");
      for (const sourceId of new Set(lines.map((row) => row.resourceSourceId))) {
        const sum = items.filter((row) => lines.find((line) => line.code === row.code)?.resourceSourceId === sourceId).reduce((total, row) => total.plus(row.value), new Decimal(0));
        if (!sum.isZero()) throw new Error("Origem por anulação deve conservar o saldo de cada fonte.");
      }
    } else {
      if (!decreases.isZero() || new Set(lines.map((line) => line.resourceSourceId)).size !== 1) throw new Error("Origem externa exige um lote por fonte e sem itens de anulação.");
      const allocated = await tx.select({ id: planningCreditBatches.id }).from(planningCreditBatches).where(and(eq(planningCreditBatches.instrumentId, piece.id), eq(planningCreditBatches.origin, input.origin), eq(planningCreditBatches.originEvidence, input.originEvidence), ne(planningCreditBatches.status, "CANCELLED")));
      const batches = await Promise.all(allocated.map(async batch => ({ items: await tx.select({ value: planningCreditLines.value }).from(planningCreditLines).where(eq(planningCreditLines.batchId, batch.id)) })));
      const used = batches.reduce((sum, batch) => sum.plus(batch.items.reduce((value, row) => value.plus(row.value), new Decimal(0))), new Decimal(0));
      if (used.plus(increases).greaterThan(input.originLimit)) throw new Error("Valor excede o limite documentado disponível da origem.");
    }
    for (const line of lines) {
      const item = items.find((row) => row.code === line.code)!;
      if (item.value.isNegative()) {
        const [reserved] = await tx.select({ value: sql<string | null>`sum(${planningCreditLines.reserved})::text` }).from(planningCreditLines).innerJoin(planningCreditBatches, eq(planningCreditBatches.id, planningCreditLines.batchId)).where(and(eq(planningCreditLines.lineId, line.id), inArray(planningCreditBatches.status, ["DRAFT", "APPROVED", "SANCTIONED", "PUBLISHED"])));
        let available = (await linePosition(tx, line.id)).minus(new Decimal(reserved.value ?? "0"));
        if (line.appropriationId) {
          const [appropriation] = await tx.select().from(planningAppropriations).where(eq(planningAppropriations.id, line.appropriationId)).for("update");
          if (!appropriation) throw new Error("Dotação implantada não encontrada.");
          const reservations = await tx.select().from(planningReservations).where(and(eq(planningReservations.appropriationId, line.appropriationId), eq(planningReservations.status, "Ativa")));
          available = available.minus(appropriation.committedValueDecimal ?? new Decimal(appropriation.committedValue)).minus(reservations.reduce((sum, row) => sum.plus(row.valueDecimal ?? new Decimal(row.value)), new Decimal(0)));
        }
        if (item.value.abs().greaterThan(available)) throw new Error(`Saldo insuficiente para reservar anulação em ${line.code}.`);
      }
    }
    const [entity] = await tx.select({ code: governmentEntities.code }).from(governmentEntities).where(eq(governmentEntities.id, piece.governmentEntityId)).limit(1);
    if (!entity) throw new Error("Entidade orçamentária não encontrada.");
    const [request] = await tx.insert(financeCreditRequests).values({ number: `${entity.code}-${piece.startYear}/${input.number}`, financialYearId: piece.annualBudgetLaw.financialYearId, type: input.type, justification: input.justification, totalValue: increases, requestedById: context.user.id, fundingSourceId: input.origin !== "CANCELLATION" ? lines[0].resourceSourceId : null, status: "DRAFT" }).returning();
    const [batch] = await tx.insert(planningCreditBatches).values({ instrumentId: piece.id, creditRequestId: request.id, origin: input.origin, originEvidence: input.originEvidence, originLimit: new Decimal(input.originLimit), createdById: context.user.id, submissionKey: input.submissionKey }).returning();
    await tx.insert(planningCreditLines).values(items.map(row => ({ batchId: batch.id, lineId: lines.find(line => line.code === row.code)!.id, value: row.value, reserved: row.value.isNegative() ? row.value.abs() : new Decimal(0) })));
    await planningAudit(tx, context, piece.id, "PLANNING_CREDIT_CREATE", input);
    return batch.id;
  });
}

export async function transitionPlanningCredit(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "update");
  const input = z.object({ instrumentId: z.string().min(1), batchId: z.string().min(1), stage: z.enum(["APPROVE", "SANCTION", "PUBLISH", "EXECUTE", "CANCEL"]), effectiveAt: planningDateSchema, legalActNumber: z.string().trim().min(1).max(100), legalText: z.string().trim().min(1).max(20000), reason: z.string().trim().min(1).max(4000) }).parse(raw);
  if (input.stage !== "CANCEL") assertPlanningLegalAuthority(context);
  return withDatabaseTransaction(planningConnection(context), async (tx) => {
    const piece = await lockLegalInstrument(tx, context, input.instrumentId);
    const [record] = await tx.select({ batch: planningCreditBatches, creditRequest: financeCreditRequests }).from(planningCreditBatches).innerJoin(financeCreditRequests, eq(financeCreditRequests.id, planningCreditBatches.creditRequestId)).where(and(eq(planningCreditBatches.id, input.batchId), eq(planningCreditBatches.instrumentId, piece.id))).limit(1);
    if (!record) throw new Error("Lote de crédito não encontrado nesta peça.");
    const rows = await tx.select({ item: planningCreditLines, line: planningLines }).from(planningCreditLines).innerJoin(planningLines, eq(planningLines.id, planningCreditLines.lineId)).where(eq(planningCreditLines.batchId, record.batch.id));
    const batch = { ...record.batch, creditRequest: record.creditRequest, items: rows.map(row => ({ ...row.item, line: row.line })) };
    for (const item of batch.items) if (!(await tx.select({ id: planningLines.id }).from(planningLines).where(and(planningLineScope(context), eq(planningLines.id, item.lineId))).limit(1)).length) throw new Error("Operação exige acesso a todas as dotações do lote.");
    const [prior] = await tx.select({ payload: financialAuditLogs.payload }).from(financialAuditLogs).where(and(eq(financialAuditLogs.entityId, piece.id), eq(financialAuditLogs.action, "PLANNING_CREDIT_TRANSITION"), sql`${financialAuditLogs.payload}->>'batchId' = ${batch.id}`, sql`${financialAuditLogs.payload}->>'stage' = ${input.stage}`)).limit(1);
    if (prior) { if (contentHash(prior.payload) !== contentHash(input)) throw new Error("Etapa já registrada com outros dados legais."); return batch.id; }
    if (["EXECUTED", "CANCELLED"].includes(batch.status)) throw new Error("O lote já foi encerrado.");
    const dates = new Date(input.effectiveAt);
    if (input.effectiveAt > new Date().toISOString().slice(0, 10) || dates.getUTCFullYear() > piece.endYear || (canonicalPiece(piece)?.sanctionedAt && dates < canonicalPiece(piece)!.sanctionedAt!)) throw new Error("Data incompatível com a vigência legal da LOA e do ato.");
    const states = { APPROVE: ["DRAFT", "APPROVED"], SANCTION: ["APPROVED", "SANCTIONED"], PUBLISH: ["SANCTIONED", "PUBLISHED"], EXECUTE: ["PUBLISHED", "EXECUTED"], CANCEL: [batch.status, "CANCELLED"] };
    const [expected, status] = states[input.stage];
    if (batch.status !== expected) throw new Error(`O lote deve estar em ${expected}.`);
    if (["PUBLISH", "EXECUTE"].includes(input.stage) && (batch.creditRequest.legalActNumber !== input.legalActNumber || batch.creditRequest.legalActDate?.toISOString().slice(0, 10) !== input.effectiveAt)) throw new Error("Publicação e efetivação devem usar o mesmo ato sancionado.");
    if (input.stage === "APPROVE" && batch.createdById === context.user.id || input.stage === "SANCTION" && batch.creditRequest.approvedById === context.user.id) throw new Error("A etapa exige responsável distinto da etapa anterior.");
    if (input.stage === "EXECUTE") {
      await assertWholePiece(tx, context, piece.id);
      await snapshotVersion(tx, context, piece.id, canonicalPiece(piece)!.sanctionedAt!, canonicalPiece(piece)!.legalActNumber ?? input.legalActNumber, "Antes do crédito adicional");
      for (const item of [...batch.items].sort((a, b) => a.value.comparedTo(b.value) || a.lineId.localeCompare(b.lineId))) {
        await applyLineDelta(tx, context, piece, { lineId: item.lineId, value: item.value, effectiveAt: dates, reason: input.reason, legalText: input.legalText, legalActNumber: input.legalActNumber, key: `credit:${batch.id}:${item.id}`, allowBlocked: true, reservationBatchId: batch.id });
        if (item.line.appropriationId) await tx.insert(financeCreditItems).values({ creditRequestId: batch.creditRequestId, appropriationId: item.line.appropriationId, type: item.value.isPositive() ? "Acréscimo" : "Anulação", value: item.value.abs() });
      }
      await finalizeLegalRevision(tx, context, piece, dates, input.legalActNumber, input.reason);
    }
    if (["EXECUTE", "CANCEL"].includes(input.stage)) await tx.update(planningCreditLines).set({ reserved: new Decimal(0) }).where(eq(planningCreditLines.batchId, batch.id));
    await tx.update(planningCreditBatches).set({ status, effectiveAt: dates }).where(eq(planningCreditBatches.id, batch.id));
    await tx.update(financeCreditRequests).set({ status, legalActNumber: input.legalActNumber, legalActDate: dates, ...(input.stage === "APPROVE" ? { approvedById: context.user.id, approvedAt: dates } : input.stage === "SANCTION" ? { sanctionedById: context.user.id, sanctionedAt: dates } : input.stage === "PUBLISH" ? { publishedById: context.user.id, publishedAt: dates, publicationReference: input.legalText, publicationDate: dates } : input.stage === "EXECUTE" ? { executedById: context.user.id, executedAt: new Date() } : {}) }).where(eq(financeCreditRequests.id, batch.creditRequestId));
    await planningAudit(tx, context, piece.id, "PLANNING_CREDIT_TRANSITION", input);
    return batch.id;
  });
}

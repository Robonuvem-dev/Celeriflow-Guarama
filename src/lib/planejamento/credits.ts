import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { assertPlanningLegalAuthority, assertPlanningOperation, planningLineWhere, type PlanningContext } from "./access";
import { parsePlanningItems } from "./amendments";
import { applyLineDelta, assertWholePiece, canonicalPiece, contentHash, finalizeLegalRevision, linePosition, lockLegalInstrument, planningAudit, snapshotVersion } from "./operations-core";
import { moneySchema } from "./policy";
import { planningDateSchema } from "./revisions";

export async function createPlanningCreditPreview(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "create");
  const input = z.object({ instrumentId: z.string().min(1), number: z.string().trim().min(1).max(80), type: z.enum(["Suplementar", "Especial", "Extraordinário", "Remanejamento", "Transposição", "Transferência"]), origin: z.enum(["CANCELLATION", "SURPLUS", "EXCESS", "LOAN"]), originEvidence: z.string().trim().min(1).max(4000), originLimit: moneySchema, justification: z.string().trim().min(1).max(4000), items: z.string().min(1), submissionKey: z.string().uuid() }).parse(raw);
  const items = parsePlanningItems(input.items);
  return context.prisma.$transaction(async (tx) => {
    const piece = await lockLegalInstrument(tx, context, input.instrumentId);
    if (piece.kind !== "LOA" || !piece.annualBudgetLaw || !["SANCTIONED", "PUBLISHED"].includes(piece.annualBudgetLaw.status)) throw new Error("Prévia de crédito exige LOA sancionada/publicada.");
    const prior = await tx.planningCreditBatch.findUnique({ where: { submissionKey: input.submissionKey } });
    if (prior) {
      const audit = await tx.financialAuditLog.findFirst({ where: { entityId: piece.id, action: "PLANNING_CREDIT_CREATE", payload: { path: ["submissionKey"], equals: input.submissionKey } } });
      if (prior.instrumentId !== piece.id || !audit || contentHash(audit.payload) !== contentHash(input)) throw new Error("Solicitação repetida com dados diferentes.");
      return prior.id;
    }
    const lines = await tx.planningBudgetLine.findMany({ where: { instrumentId: piece.id, kind: "EXPENSE", code: { in: items.map((row) => row.code) }, ...planningLineWhere(context) }, orderBy: { id: "asc" } });
    if (lines.length !== items.length) throw new Error("Uma dotação não pertence à peça ou ao escopo autorizado.");
    const increases = items.filter((row) => row.value.isPositive()).reduce((sum, row) => sum.plus(row.value), new Prisma.Decimal(0));
    const decreases = items.filter((row) => row.value.isNegative()).reduce((sum, row) => sum.plus(row.value.abs()), new Prisma.Decimal(0));
    if (!increases.greaterThan(0)) throw new Error("A prévia exige ao menos um acréscimo.");
    if (input.origin === "CANCELLATION") {
      if (!increases.equals(decreases)) throw new Error("Acréscimos e anulações devem ter o mesmo total.");
      for (const sourceId of new Set(lines.map((row) => row.resourceSourceId))) {
        const sum = items.filter((row) => lines.find((line) => line.code === row.code)?.resourceSourceId === sourceId).reduce((total, row) => total.plus(row.value), new Prisma.Decimal(0));
        if (!sum.isZero()) throw new Error("Origem por anulação deve conservar o saldo de cada fonte.");
      }
    } else {
      if (!decreases.isZero() || new Set(lines.map((line) => line.resourceSourceId)).size !== 1) throw new Error("Origem externa exige um lote por fonte e sem itens de anulação.");
      const allocated = await tx.planningCreditBatch.findMany({ where: { instrumentId: piece.id, origin: input.origin, originEvidence: input.originEvidence, status: { not: "CANCELLED" } }, include: { items: true } });
      const used = allocated.reduce((sum, batch) => sum.plus(batch.items.reduce((value, row) => value.plus(row.value), new Prisma.Decimal(0))), new Prisma.Decimal(0));
      if (used.plus(increases).greaterThan(input.originLimit)) throw new Error("Valor excede o limite documentado disponível da origem.");
    }
    for (const line of lines) {
      const item = items.find((row) => row.code === line.code)!;
      if (item.value.isNegative()) {
        const reserved = await tx.planningCreditLine.aggregate({ where: { lineId: line.id, batch: { status: { in: ["DRAFT", "APPROVED", "SANCTIONED", "PUBLISHED"] } } }, _sum: { reserved: true } });
        let available = (await linePosition(tx, line.id)).minus(reserved._sum.reserved ?? 0);
        if (line.appropriationId) {
          await tx.$queryRaw`SELECT id FROM "BudgetAppropriation" WHERE id = ${line.appropriationId} FOR UPDATE`;
          const appropriation = await tx.budgetAppropriation.findUniqueOrThrow({ where: { id: line.appropriationId } });
          const reservations = await tx.budgetReservation.findMany({ where: { appropriationId: line.appropriationId, status: "Ativa" } });
          available = available.minus(appropriation.committedValueDecimal ?? new Prisma.Decimal(appropriation.committedValue)).minus(reservations.reduce((sum, row) => sum.plus(row.valueDecimal ?? new Prisma.Decimal(row.value)), new Prisma.Decimal(0)));
        }
        if (item.value.abs().greaterThan(available)) throw new Error(`Saldo insuficiente para reservar anulação em ${line.code}.`);
      }
    }
    const entity = await tx.governmentEntity.findUniqueOrThrow({ where: { id: piece.governmentEntityId }, select: { code: true } });
    const request = await tx.creditRequest.create({ data: { number: `${entity.code}-${piece.startYear}/${input.number}`, financialYearId: piece.annualBudgetLaw.financialYearId, type: input.type, justification: input.justification, totalValue: increases, requestedById: context.user.id, fundingSourceId: input.origin !== "CANCELLATION" ? lines[0].resourceSourceId : null, status: "DRAFT" } });
    const batch = await tx.planningCreditBatch.create({ data: { instrumentId: piece.id, creditRequestId: request.id, origin: input.origin, originEvidence: input.originEvidence, originLimit: input.originLimit, createdById: context.user.id, submissionKey: input.submissionKey, items: { create: items.map((row) => ({ lineId: lines.find((line) => line.code === row.code)!.id, value: row.value, reserved: row.value.isNegative() ? row.value.abs() : new Prisma.Decimal(0) })) } } });
    await planningAudit(tx, context, piece.id, "PLANNING_CREDIT_CREATE", input);
    return batch.id;
  });
}

export async function transitionPlanningCredit(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "update");
  const input = z.object({ instrumentId: z.string().min(1), batchId: z.string().min(1), stage: z.enum(["APPROVE", "SANCTION", "PUBLISH", "EXECUTE", "CANCEL"]), effectiveAt: planningDateSchema, legalActNumber: z.string().trim().min(1).max(100), legalText: z.string().trim().min(1).max(20000), reason: z.string().trim().min(1).max(4000) }).parse(raw);
  if (input.stage !== "CANCEL") assertPlanningLegalAuthority(context);
  return context.prisma.$transaction(async (tx) => {
    const piece = await lockLegalInstrument(tx, context, input.instrumentId);
    const batch = await tx.planningCreditBatch.findFirstOrThrow({ where: { id: input.batchId, instrumentId: piece.id }, include: { items: { include: { line: true } }, creditRequest: true } });
    for (const item of batch.items) if (!await tx.planningBudgetLine.findFirst({ where: { AND: [planningLineWhere(context), { id: item.lineId }] } })) throw new Error("Operação exige acesso a todas as dotações do lote.");
    const prior = await tx.financialAuditLog.findFirst({ where: { entityId: piece.id, action: "PLANNING_CREDIT_TRANSITION", AND: [{ payload: { path: ["batchId"], equals: batch.id } }, { payload: { path: ["stage"], equals: input.stage } }] } });
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
        if (item.line.appropriationId) await tx.creditRequestItem.create({ data: { creditRequestId: batch.creditRequestId, appropriationId: item.line.appropriationId, type: item.value.isPositive() ? "Acréscimo" : "Anulação", value: item.value.abs() } });
      }
      await finalizeLegalRevision(tx, context, piece, dates, input.legalActNumber, input.reason);
    }
    if (["EXECUTE", "CANCEL"].includes(input.stage)) await tx.planningCreditLine.updateMany({ where: { batchId: batch.id }, data: { reserved: 0 } });
    await tx.planningCreditBatch.update({ where: { id: batch.id }, data: { status, effectiveAt: dates } });
    await tx.creditRequest.update({ where: { id: batch.creditRequestId }, data: { status, legalActNumber: input.legalActNumber, legalActDate: dates, ...(input.stage === "APPROVE" ? { approvedById: context.user.id, approvedAt: dates } : input.stage === "SANCTION" ? { sanctionedById: context.user.id, sanctionedAt: dates } : input.stage === "PUBLISH" ? { publishedById: context.user.id, publishedAt: dates, publicationReference: input.legalText, publicationDate: dates } : input.stage === "EXECUTE" ? { executedById: context.user.id, executedAt: new Date() } : {}) } });
    await planningAudit(tx, context, piece.id, "PLANNING_CREDIT_TRANSITION", input);
    return batch.id;
  });
}

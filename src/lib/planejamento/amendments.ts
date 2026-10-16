import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { assertPlanningLegalAuthority, assertPlanningOperation, planningLineWhere, type PlanningContext } from "./access";
import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import { applyLineDelta, canonicalPiece, finalizeLegalRevision, lockLegalInstrument, planningAudit, snapshotVersion } from "./operations-core";
import { planningDateSchema } from "./revisions";

/** Public forms use reduced line codes, never SQL or arbitrary classification IDs. */
export function parsePlanningItems(value: string) {
  const rows = value.split(/\r?\n/).map((row) => row.trim()).filter(Boolean).map((row) => {
    const [code, direction, amount, ...extra] = row.split(";").map((cell) => cell.trim());
    if (!code || !["+", "-"].includes(direction) || !/^\d{1,15}(\.\d{1,2})?$/.test(amount ?? "") || extra.length) throw new Error("Informe um item por linha: código; + ou -; valor com ponto decimal.");
    const value = new Prisma.Decimal(amount).mul(direction === "-" ? -1 : 1);
    if (value.isZero()) throw new Error("Cada item deve ter valor maior que zero.");
    return { code, value };
  });
  if (!rows.length || rows.length > 200 || new Set(rows.map((row) => row.code)).size !== rows.length) throw new Error("Informe de 1 a 200 códigos distintos.");
  return rows;
}

export async function setPlanningAmendmentBlock(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "update");
  const input = z.object({ instrumentId: z.string().min(1), lineId: z.string().min(1), blocked: z.enum(["true", "false"]), reason: z.string().trim().min(1).max(4000) }).parse(raw);
  return context.prisma.$transaction(async (tx) => {
    const piece = await lockLegalInstrument(tx, context, input.instrumentId);
    const line = await tx.planningBudgetLine.findFirstOrThrow({ where: { AND: [planningLineWhere(context), { id: input.lineId, instrumentId: piece.id, kind: "EXPENSE" }] } });
    await tx.planningBudgetLine.update({ where: { id: line.id }, data: { amendmentBlocked: input.blocked === "true", amendmentBlockReason: input.reason, amendmentBlockedById: context.user.id, amendmentBlockedAt: new Date() } });
    await planningAudit(tx, context, piece.id, "PLANNING_AMENDMENT_BLOCK", input);
    return line.id;
  });
}

export async function createLegislativePlanningAmendment(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "create");
  const input = z.object({ instrumentId: z.string().min(1), number: z.string().trim().min(1).max(100), date: planningDateSchema, objective: z.string().trim().min(1).max(4000), justification: z.string().trim().min(1).max(4000), councilorId: z.string().min(1), legalText: z.string().trim().min(1).max(20000), items: z.string().min(1) }).parse(raw);
  const items = parsePlanningItems(input.items);
  return context.prisma.$transaction(async (tx) => {
    const piece = await lockLegalInstrument(tx, context, input.instrumentId);
    const councilor = await tx.camVereador.findUnique({ where: { id: input.councilorId } });
    if (!councilor?.active) throw new Error("Selecione vereador ativo no cadastro canônico.");
    const lines = await tx.planningBudgetLine.findMany({ where: { instrumentId: piece.id, code: { in: items.map((row) => row.code) }, kind: "EXPENSE", ...planningLineWhere(context) } });
    if (lines.length !== items.length || lines.some((line) => line.amendmentBlocked)) throw new Error("Uma dotação está bloqueada, não existe ou não pertence ao escopo autorizado.");
    const amendment = await tx.planningLegislativeAmendment.create({ data: { instrumentId: piece.id, number: input.number, date: new Date(input.date), objective: input.objective, justification: input.justification, councilorId: councilor.id, legalText: input.legalText, versionNumber: piece.revision, createdById: context.user.id, items: { create: items.map((row) => ({ lineId: lines.find((line) => line.code === row.code)!.id, value: row.value })) } } });
    await planningAudit(tx, context, piece.id, "PLANNING_AMENDMENT_CREATE", { amendmentId: amendment.id, number: input.number, versionNumber: piece.revision });
    return amendment.id;
  });
}

export async function decideLegislativePlanningAmendment(context: PlanningContext, raw: unknown) {
  assertPlanningLegalAuthority(context);
  const input = z.object({ instrumentId: z.string().min(1), amendmentId: z.string().min(1), decision: z.enum(["APPROVED", "REJECTED", "PARTIAL"]), selectedCodes: z.string().default(""), reason: z.string().trim().min(1).max(4000), effectiveAt: planningDateSchema, legalActNumber: z.string().trim().min(1).max(100) }).parse(raw);
  return context.prisma.$transaction(async (tx) => {
    const piece = await lockLegalInstrument(tx, context, input.instrumentId);
    const amendment = await tx.planningLegislativeAmendment.findFirstOrThrow({ where: { id: input.amendmentId, instrumentId: piece.id }, include: { items: { include: { line: true } } } });
    const selection = new Set(input.selectedCodes.split(/[,;\s]+/).filter(Boolean));
    const selected = amendment.items.filter((item) => input.decision === "APPROVED" || input.decision === "PARTIAL" && selection.has(item.line.code));
    if (input.decision === "PARTIAL" && (selected.length === 0 || selected.length === amendment.items.length || selected.length !== selection.size)) throw new Error("Sanção parcial exige seleção explícita de parte das dotações da emenda.");
    if (amendment.status !== "DRAFT") {
      if (amendment.status === input.decision && amendment.decisionReason === input.reason && amendment.legalActNumber === input.legalActNumber && amendment.effectiveAt?.toISOString().slice(0, 10) === input.effectiveAt && amendment.items.every((item) => item.sanctioned === selected.some((row) => row.id === item.id))) return amendment.id;
      throw new Error("A emenda já foi decidida; a proposta e decisão são preservadas.");
    }
    if (context.user.id === amendment.createdById) throw new Error("A decisão legal exige responsável distinto do proponente.");
    if (amendment.versionNumber !== piece.revision) throw new Error("A versão da peça mudou. Registre nova proposta sobre a versão atual.");
    if (amendment.items.some((item) => !context.user.allowedBudgetUnitIds.includes(item.line.budgetUnitId)) && !isSystemAdministrator(context.user)) throw new Error("A decisão exige acesso a todas as dotações da emenda.");
    if (selected.some((item) => item.line.amendmentBlocked)) throw new Error("Uma dotação sancionada está bloqueada para emendas.");
    const canonical = canonicalPiece(piece)!;
    if (selected.length && !["APPROVED", "SANCTIONED", "PUBLISHED"].includes(canonical.status)) throw new Error("A peça deve estar aprovada para efetivar os itens sancionados.");
    const date = new Date(input.effectiveAt);
    if (input.effectiveAt > new Date().toISOString().slice(0, 10) || date < amendment.date || (canonical.sanctionedAt && date < canonical.sanctionedAt)) throw new Error("Data da decisão incompatível com proposta, sanção ou vigência atual.");
    if (selected.length) {
      await snapshotVersion(tx, context, piece.id, canonical.sanctionedAt ?? date, canonical.legalActNumber ?? input.legalActNumber, "Antes da emenda legislativa");
      // Reductions first; the transaction reverts all effects if any item fails.
      for (const item of [...selected].sort((a, b) => a.value.comparedTo(b.value) || a.lineId.localeCompare(b.lineId))) await applyLineDelta(tx, context, piece, { lineId: item.lineId, value: item.value, effectiveAt: date, reason: input.reason, legalText: amendment.legalText, legalActNumber: input.legalActNumber, key: `amendment:${amendment.id}:${item.id}` });
      await finalizeLegalRevision(tx, context, piece, date, input.legalActNumber, input.reason);
    }
    for (const item of amendment.items) await tx.planningAmendmentItem.update({ where: { id: item.id }, data: { sanctioned: selected.some((row) => row.id === item.id) } });
    await tx.planningLegislativeAmendment.update({ where: { id: amendment.id }, data: { status: input.decision, decisionReason: input.reason, decidedById: context.user.id, decidedAt: new Date(), effectiveAt: date, legalActNumber: input.legalActNumber, appliedAt: selected.length ? new Date() : null } });
    await planningAudit(tx, context, piece.id, "PLANNING_AMENDMENT_DECISION", { ...input, selectedItemIds: selected.map((row) => row.id) });
    return amendment.id;
  });
}

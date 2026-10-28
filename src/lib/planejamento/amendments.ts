import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import { withDatabaseTransaction } from "@/db/transaction";
import { planningLines } from "@/db/schema/planning-budget";
import { catalogAmendmentItems, catalogLegislativeAmendments } from "@/db/schema/planning-catalog-operations";
import { councilors } from "@/db/schema/chamber";
import { planningLineScope } from "@/db/repositories/planning/scope";
import { requireCatalogLine } from "@/db/repositories/planning-catalog-operations/records";
import { planningConnection } from "./database";
import { z } from "zod";
import { assertPlanningLegalAuthority, assertPlanningOperation, type PlanningContext } from "./access";
import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import { applyLineDelta, canonicalPiece, finalizeLegalRevision, lockLegalInstrument, planningAudit, snapshotVersion } from "./operations-core";
import { planningDateSchema } from "./revisions";

/** Public forms use reduced line codes, never SQL or arbitrary classification IDs. */
export function parsePlanningItems(value: string) {
  const rows = value.split(/\r?\n/).map((row) => row.trim()).filter(Boolean).map((row) => {
    const [code, direction, amount, ...extra] = row.split(";").map((cell) => cell.trim());
    if (!code || !["+", "-"].includes(direction) || !/^\d{1,15}(\.\d{1,2})?$/.test(amount ?? "") || extra.length) throw new Error("Informe um item por linha: código; + ou -; valor com ponto decimal.");
    const value = new Decimal(amount).mul(direction === "-" ? -1 : 1);
    if (value.isZero()) throw new Error("Cada item deve ter valor maior que zero.");
    return { code, value };
  });
  if (!rows.length || rows.length > 200 || new Set(rows.map((row) => row.code)).size !== rows.length) throw new Error("Informe de 1 a 200 códigos distintos.");
  return rows;
}

export async function setPlanningAmendmentBlock(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "update");
  const input = z.object({ instrumentId: z.string().min(1), lineId: z.string().min(1), blocked: z.enum(["true", "false"]), reason: z.string().trim().min(1).max(4000) }).parse(raw);
  return withDatabaseTransaction(planningConnection(context), async (tx) => {
    const piece = await lockLegalInstrument(tx, context, input.instrumentId);
    const line = await requireCatalogLine(tx, context, and(eq(planningLines.id, input.lineId), eq(planningLines.instrumentId, piece.id), eq(planningLines.kind, "EXPENSE"))!);
    await tx.update(planningLines).set({ amendmentBlocked: input.blocked === "true", amendmentBlockReason: input.reason, amendmentBlockedById: context.user.id, amendmentBlockedAt: new Date() }).where(eq(planningLines.id, line.id));
    await planningAudit(tx, context, piece.id, "PLANNING_AMENDMENT_BLOCK", input);
    return line.id;
  });
}

export async function createLegislativePlanningAmendment(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "create");
  const input = z.object({ instrumentId: z.string().min(1), number: z.string().trim().min(1).max(100), date: planningDateSchema, objective: z.string().trim().min(1).max(4000), justification: z.string().trim().min(1).max(4000), councilorId: z.string().min(1), legalText: z.string().trim().min(1).max(20000), items: z.string().min(1) }).parse(raw);
  const items = parsePlanningItems(input.items);
  return withDatabaseTransaction(planningConnection(context), async (tx) => {
    const piece = await lockLegalInstrument(tx, context, input.instrumentId);
    const [councilor] = await tx.select().from(councilors).where(eq(councilors.id, input.councilorId)).limit(1);
    if (!councilor?.active) throw new Error("Selecione vereador ativo no cadastro canônico.");
    const lines = await tx.select().from(planningLines).where(and(eq(planningLines.instrumentId, piece.id), inArray(planningLines.code, items.map(row => row.code)), eq(planningLines.kind, "EXPENSE"), planningLineScope(context)));
    if (lines.length !== items.length || lines.some((line) => line.amendmentBlocked)) throw new Error("Uma dotação está bloqueada, não existe ou não pertence ao escopo autorizado.");
    const [amendment] = await tx.insert(catalogLegislativeAmendments).values({ instrumentId: piece.id, number: input.number, date: new Date(input.date), objective: input.objective, justification: input.justification, councilorId: councilor.id, legalText: input.legalText, versionNumber: piece.revision, createdById: context.user.id }).returning();
    await tx.insert(catalogAmendmentItems).values(items.map(row => ({ amendmentId: amendment.id, lineId: lines.find(line => line.code === row.code)!.id, value: row.value })));
    await planningAudit(tx, context, piece.id, "PLANNING_AMENDMENT_CREATE", { amendmentId: amendment.id, number: input.number, versionNumber: piece.revision });
    return amendment.id;
  });
}

export async function decideLegislativePlanningAmendment(context: PlanningContext, raw: unknown) {
  assertPlanningLegalAuthority(context);
  const input = z.object({ instrumentId: z.string().min(1), amendmentId: z.string().min(1), decision: z.enum(["APPROVED", "REJECTED", "PARTIAL"]), selectedCodes: z.string().default(""), reason: z.string().trim().min(1).max(4000), effectiveAt: planningDateSchema, legalActNumber: z.string().trim().min(1).max(100) }).parse(raw);
  return withDatabaseTransaction(planningConnection(context), async (tx) => {
    const piece = await lockLegalInstrument(tx, context, input.instrumentId);
    const [record] = await tx.select().from(catalogLegislativeAmendments).where(and(eq(catalogLegislativeAmendments.id, input.amendmentId), eq(catalogLegislativeAmendments.instrumentId, piece.id))).limit(1);
    if (!record) throw new Error("Emenda não encontrada nesta peça.");
    const rows = await tx.select({ item: catalogAmendmentItems, line: planningLines }).from(catalogAmendmentItems).innerJoin(planningLines, eq(planningLines.id, catalogAmendmentItems.lineId)).where(eq(catalogAmendmentItems.amendmentId, record.id));
    const amendment = { ...record, items: rows.map(row => ({ ...row.item, line: row.line })) };
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
    for (const item of amendment.items) await tx.update(catalogAmendmentItems).set({ sanctioned: selected.some(row => row.id === item.id) }).where(eq(catalogAmendmentItems.id, item.id));
    await tx.update(catalogLegislativeAmendments).set({ status: input.decision, decisionReason: input.reason, decidedById: context.user.id, decidedAt: new Date(), effectiveAt: date, legalActNumber: input.legalActNumber, appliedAt: selected.length ? new Date() : null }).where(eq(catalogLegislativeAmendments.id, amendment.id));
    await planningAudit(tx, context, piece.id, "PLANNING_AMENDMENT_DECISION", { ...input, selectedItemIds: selected.map((row) => row.id) });
    return amendment.id;
  });
}

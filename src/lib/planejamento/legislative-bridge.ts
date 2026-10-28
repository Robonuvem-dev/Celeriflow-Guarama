import "server-only";
import { z } from "zod";
import { and, desc, eq, notInArray, sql } from "drizzle-orm";
import { withDatabaseTransaction } from "@/db/transaction";
import { laws, propositions } from "@/db/schema/chamber";
import { financialAuditLogs } from "@/db/schema/finance-identity";
import { planningLegislativeLinks } from "@/db/schema/planning-legal";
import { planningInstrumentScope } from "@/db/repositories/planning/scope";
import { legislativeTransitionDate } from "@/lib/contracts/planning-execution-operations";
import { assertPlanningLegalAuthority, assertPlanningOperation, type PlanningContext } from "./access";
import { planningConnection } from "./database";
import { AccessError, canPerformModuleOperation } from "@/lib/platform/tenant-context";
import { assertWholePiece, canonicalPiece, contentHash, finalizeLegalRevision, lockLegalInstrument, planningAudit, snapshotVersion } from "./operations-core";
import { planningDateSchema } from "./revisions";

export async function linkPlanningLegislativeProcedure(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "update");
  if (!canPerformModuleOperation(context.user, "CAMARA", "update")) throw new AccessError("Vínculo legislativo exige autorização na Câmara.", 403);
  const input = z.object({ instrumentId: z.string().min(1), propositionId: z.string().optional(), lawId: z.string().optional(), reference: z.string().trim().min(1) }).parse(raw);
  if (!input.propositionId && !input.lawId) throw new Error("Selecione proposição ou ato legislativo.");
  return withDatabaseTransaction(planningConnection(context), async (tx) => {
    const piece = await lockLegalInstrument(tx, context, input.instrumentId); await assertWholePiece(tx, context, piece.id);
    const [previous] = await tx.select().from(planningLegislativeLinks).where(and(eq(planningLegislativeLinks.instrumentId, piece.id), eq(planningLegislativeLinks.reference, input.reference))).limit(1);
    if (previous) { if (previous.propositionId !== (input.propositionId ?? null) || previous.lawId !== (input.lawId ?? null)) throw new Error("Referência já vinculada a outro ato."); return previous.id; }
    if (input.propositionId) { const [proposal] = await tx.select({ id: propositions.id }).from(propositions).where(and(eq(propositions.id, input.propositionId), notInArray(propositions.status, ["Arquivada", "Rejeitada"]))).limit(1); if (!proposal) throw new Error("Proposição não disponível para vínculo."); }
    if (input.lawId) { const [law] = await tx.select().from(laws).where(and(eq(laws.id, input.lawId), eq(laws.status, "Vigente"))).limit(1); if (!law) throw new Error("Lei vigente não encontrada."); if (input.propositionId && law.proposicaoId && law.proposicaoId !== input.propositionId) throw new Error("Lei e proposição não correspondem."); const number = canonicalPiece(piece)?.legalActNumber; if (number && number.replace(/\D/g, "") !== law.numero.replace(/\D/g, "")) throw new Error("O ato legislativo não corresponde ao número sancionado da peça."); }
    await snapshotVersion(tx, context, piece.id, new Date(), canonicalPiece(piece)?.legalActNumber ?? input.reference, "Antes do vínculo legislativo");
    const [link] = await tx.insert(planningLegislativeLinks).values({ ...input, createdById: context.user.id }).returning({ id: planningLegislativeLinks.id });
    await finalizeLegalRevision(tx, context, piece, new Date(), canonicalPiece(piece)?.legalActNumber ?? input.reference, "Vínculo à proposição/lei canônica");
    await planningAudit(tx, context, piece.id, "PLANNING_LEGISLATIVE_LINK", { linkId: link.id, ...input });
    return link.id;
  });
}

export async function advancePlanningLegislativeProcedure(context: PlanningContext, raw: unknown) {
  assertPlanningLegalAuthority(context);
  if (!canPerformModuleOperation(context.user, "CAMARA", "update")) throw new AccessError("Tramitação exige autorização da Câmara.", 403);
  const input = z.object({ linkId: z.string().min(1), stage: z.enum(["ANALYZE", "AGENDA", "APPROVE", "REJECT", "SANCTION", "PUBLISH"]), date: planningDateSchema, reason: z.string().trim().min(3), lawNumber: z.string().optional(), lawType: z.enum(["Lei Ordinária", "Lei Complementar", "Decreto Legislativo", "Resolução"]).default("Lei Ordinária"), legalText: z.string().optional() }).parse(raw);
  if (input.date > new Date().toISOString().slice(0, 10)) throw new Error("Não registre tramitação futura como concluída.");
  return withDatabaseTransaction(planningConnection(context), async (tx) => {
    const [visible] = await tx.select().from(planningLegislativeLinks).where(and(eq(planningLegislativeLinks.id, input.linkId), planningInstrumentScope(context, planningLegislativeLinks.instrumentId))).limit(1);
    if (!visible) throw new Error("Vínculo legislativo não encontrado neste escopo.");
    const piece = await lockLegalInstrument(tx, context, visible.instrumentId); await assertWholePiece(tx, context, piece.id);
    if (!visible.propositionId) throw new Error("Vincule a proposição para tramitar.");
    const [proposal] = await tx.select().from(propositions).where(eq(propositions.id, visible.propositionId)).for("update");
    if (!proposal) throw new Error("Proposição não encontrada.");
    const transitionScope = and(eq(financialAuditLogs.entityId, piece.id), eq(financialAuditLogs.action, "PLANNING_LEGISLATIVE_TRANSITION"), sql`${financialAuditLogs.payload}->'linkId' = ${JSON.stringify(visible.id)}::jsonb`);
    const [previous] = await tx.select().from(financialAuditLogs).where(and(transitionScope, sql`${financialAuditLogs.payload}->'stage' = ${JSON.stringify(input.stage)}::jsonb`)).limit(1);
    if (previous) { if (contentHash(previous.payload) !== contentHash(input)) throw new Error("Etapa já registrada com outros dados."); return visible.id; }
    const stages = { ANALYZE: ["Protocolada", "Em Análise"], AGENDA: ["Em Análise", "Em Pauta"], APPROVE: ["Em Pauta", "Aprovada"], REJECT: ["Em Pauta", "Rejeitada"], SANCTION: ["Aprovada", "Sancionada"], PUBLISH: ["Sancionada", "Sancionada"] };
    if (proposal.status !== stages[input.stage][0]) throw new Error(`Proposição deve estar ${stages[input.stage][0]}.`);
    if (["APPROVE", "SANCTION"].includes(input.stage) && visible.createdById === context.user.id) throw new Error("Decisão exige responsável distinto do vinculador da proposta.");
    const [last] = await tx.select().from(financialAuditLogs).where(transitionScope).orderBy(desc(financialAuditLogs.createdAt)).limit(1);
    if (last && legislativeTransitionDate.parse(last.payload).date > input.date) throw new Error("A etapa não pode anteceder a tramitação registrada.");
    if (input.stage === "SANCTION") { const [approval] = await tx.select().from(financialAuditLogs).where(and(transitionScope, sql`${financialAuditLogs.payload}->'stage' = '"APPROVE"'::jsonb`)).limit(1); if (approval?.authorUsuarioId === context.user.id) throw new Error("Sanção exige responsável distinto da aprovação."); }
    await snapshotVersion(tx, context, piece.id, new Date(input.date), canonicalPiece(piece)?.legalActNumber ?? proposal.numero, "Antes da tramitação legislativa");
    if (input.stage === "SANCTION") {
      if (!input.lawNumber || !input.legalText?.trim()) throw new Error("Informe número e texto da lei sancionada.");
      const number = canonicalPiece(piece)?.legalActNumber;
      if (number && number.replace(/\D/g, "") !== input.lawNumber.replace(/\D/g, "")) throw new Error("Lei informada diverge do ato legal da peça.");
      const [law] = await tx.insert(laws).values({ numero: input.lawNumber, tipo: input.lawType, ementa: proposal.ementa, texto: input.legalText, dataVigor: new Date(input.date), proposicaoId: proposal.id, status: "Vigente" }).returning({ id: laws.id });
      await tx.update(planningLegislativeLinks).set({ lawId: law.id }).where(eq(planningLegislativeLinks.id, visible.id));
    }
    if (input.stage === "PUBLISH") { const [link] = await tx.select({ lawId: planningLegislativeLinks.lawId }).from(planningLegislativeLinks).where(eq(planningLegislativeLinks.id, visible.id)).limit(1); if (!link?.lawId) throw new Error("Ato sancionado não vinculado."); const changed = await tx.update(laws).set({ dataPublicacao: new Date(input.date) }).where(eq(laws.id, link.lawId)).returning({ id: laws.id }); if (!changed.length) throw new Error("Ato sancionado não encontrado."); }
    await tx.update(propositions).set({ status: stages[input.stage][1] }).where(eq(propositions.id, proposal.id));
    await finalizeLegalRevision(tx, context, piece, new Date(input.date), input.lawNumber ?? canonicalPiece(piece)?.legalActNumber ?? proposal.numero, input.reason);
    await planningAudit(tx, context, piece.id, "PLANNING_LEGISLATIVE_TRANSITION", input);
    return visible.id;
  });
}

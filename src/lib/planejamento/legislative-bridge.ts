import "server-only";
import { z } from "zod";
import { assertPlanningLegalAuthority, assertPlanningOperation, planningInstrumentWhere, type PlanningContext } from "./access";
import { AccessError, canPerformModuleOperation } from "@/lib/platform/tenant-context";
import { assertWholePiece, canonicalPiece, contentHash, finalizeLegalRevision, lockLegalInstrument, planningAudit, snapshotVersion } from "./operations-core";
import { planningDateSchema } from "./revisions";

export async function linkPlanningLegislativeProcedure(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "update");
  if (!canPerformModuleOperation(context.user, "CAMARA", "update")) throw new AccessError("Vínculo legislativo exige autorização na Câmara.", 403);
  const input = z.object({ instrumentId: z.string().min(1), propositionId: z.string().optional(), lawId: z.string().optional(), reference: z.string().trim().min(1) }).parse(raw);
  if (!input.propositionId && !input.lawId) throw new Error("Selecione proposição ou ato legislativo.");
  return context.prisma.$transaction(async (tx) => {
    const piece = await lockLegalInstrument(tx, context, input.instrumentId); await assertWholePiece(tx, context, piece.id);
    const previous = await tx.planningLegislativeLink.findUnique({ where: { instrumentId_reference: { instrumentId: piece.id, reference: input.reference } } });
    if (previous) { if (previous.propositionId !== (input.propositionId ?? null) || previous.lawId !== (input.lawId ?? null)) throw new Error("Referência já vinculada a outro ato."); return previous.id; }
    if (input.propositionId) await tx.camProposicao.findFirstOrThrow({ where: { id: input.propositionId, status: { notIn: ["Arquivada", "Rejeitada"] } } });
    if (input.lawId) { const law = await tx.camLei.findFirstOrThrow({ where: { id: input.lawId, status: "Vigente" } }); if (input.propositionId && law.proposicaoId && law.proposicaoId !== input.propositionId) throw new Error("Lei e proposição não correspondem."); const number = canonicalPiece(piece)?.legalActNumber; if (number && number.replace(/\D/g, "") !== law.numero.replace(/\D/g, "")) throw new Error("O ato legislativo não corresponde ao número sancionado da peça."); }
    await snapshotVersion(tx, context, piece.id, new Date(), canonicalPiece(piece)?.legalActNumber ?? input.reference, "Antes do vínculo legislativo");
    const link = await tx.planningLegislativeLink.create({ data: { ...input, createdById: context.user.id } });
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
  return context.prisma.$transaction(async (tx) => {
    const visible = await tx.planningLegislativeLink.findFirstOrThrow({ where: { id: input.linkId, instrument: planningInstrumentWhere(context) } });
    const piece = await lockLegalInstrument(tx, context, visible.instrumentId); await assertWholePiece(tx, context, piece.id);
    if (!visible.propositionId) throw new Error("Vincule a proposição para tramitar.");
    await tx.$queryRaw`SELECT id FROM "CamProposicao" WHERE id=${visible.propositionId} FOR UPDATE`;
    const proposal = await tx.camProposicao.findUniqueOrThrow({ where: { id: visible.propositionId } });
    const previous = await tx.financialAuditLog.findFirst({ where: { entityId: piece.id, action: "PLANNING_LEGISLATIVE_TRANSITION", AND: [{ payload: { path: ["linkId"], equals: visible.id } }, { payload: { path: ["stage"], equals: input.stage } }] } });
    if (previous) { if (contentHash(previous.payload) !== contentHash(input)) throw new Error("Etapa já registrada com outros dados."); return visible.id; }
    const stages = { ANALYZE: ["Protocolada", "Em Análise"], AGENDA: ["Em Análise", "Em Pauta"], APPROVE: ["Em Pauta", "Aprovada"], REJECT: ["Em Pauta", "Rejeitada"], SANCTION: ["Aprovada", "Sancionada"], PUBLISH: ["Sancionada", "Sancionada"] };
    if (proposal.status !== stages[input.stage][0]) throw new Error(`Proposição deve estar ${stages[input.stage][0]}.`);
    if (["APPROVE", "SANCTION"].includes(input.stage) && visible.createdById === context.user.id) throw new Error("Decisão exige responsável distinto do vinculador da proposta.");
    const last = await tx.financialAuditLog.findFirst({ where: { entityId: piece.id, action: "PLANNING_LEGISLATIVE_TRANSITION", payload: { path: ["linkId"], equals: visible.id } }, orderBy: { createdAt: "desc" } });
    if (last && (last.payload as { date: string }).date > input.date) throw new Error("A etapa não pode anteceder a tramitação registrada.");
    if (input.stage === "SANCTION") { const approval = await tx.financialAuditLog.findFirst({ where: { entityId: piece.id, action: "PLANNING_LEGISLATIVE_TRANSITION", AND: [{ payload: { path: ["linkId"], equals: visible.id } }, { payload: { path: ["stage"], equals: "APPROVE" } }] } }); if (approval?.authorUsuarioId === context.user.id) throw new Error("Sanção exige responsável distinto da aprovação."); }
    await snapshotVersion(tx, context, piece.id, new Date(input.date), canonicalPiece(piece)?.legalActNumber ?? proposal.numero, "Antes da tramitação legislativa");
    if (input.stage === "SANCTION") {
      if (!input.lawNumber || !input.legalText?.trim()) throw new Error("Informe número e texto da lei sancionada.");
      const number = canonicalPiece(piece)?.legalActNumber;
      if (number && number.replace(/\D/g, "") !== input.lawNumber.replace(/\D/g, "")) throw new Error("Lei informada diverge do ato legal da peça.");
      const law = await tx.camLei.create({ data: { numero: input.lawNumber, tipo: input.lawType, ementa: proposal.ementa, texto: input.legalText, dataVigor: new Date(input.date), proposicaoId: proposal.id, status: "Vigente" } });
      await tx.planningLegislativeLink.update({ where: { id: visible.id }, data: { lawId: law.id } });
    }
    if (input.stage === "PUBLISH") { const link = await tx.planningLegislativeLink.findUniqueOrThrow({ where: { id: visible.id } }); if (!link.lawId) throw new Error("Ato sancionado não vinculado."); await tx.camLei.update({ where: { id: link.lawId }, data: { dataPublicacao: new Date(input.date) } }); }
    await tx.camProposicao.update({ where: { id: proposal.id }, data: { status: stages[input.stage][1] } });
    await finalizeLegalRevision(tx, context, piece, new Date(input.date), input.lawNumber ?? canonicalPiece(piece)?.legalActNumber ?? proposal.numero, input.reason);
    await planningAudit(tx, context, piece.id, "PLANNING_LEGISLATIVE_TRANSITION", input);
    return visible.id;
  });
}

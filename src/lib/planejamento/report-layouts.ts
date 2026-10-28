import "server-only";
import { z } from "zod";
import { assertPlanningLegalAuthority, type PlanningContext } from "./access";
import { assertWholePiece, canonicalPiece, finalizeLegalRevision, lockLegalInstrument, planningAudit, snapshotVersion } from "./operations-core";
import { readPlanningDocument } from "./documents";
import { planningReportCatalog } from "./report-catalog";
import { withDatabaseTransaction } from "@/db/transaction";
import { planningConnection } from "./database";
import { planningFiscalRules } from "@/db/schema/planning-legal";

export async function configurePlanningReportLayout(context: PlanningContext, raw: unknown) {
  assertPlanningLegalAuthority(context);
  const input = z.object({ instrumentId: z.string().min(1), type: z.enum(planningReportCatalog.map((report) => report.type) as [string, ...string[]]), linkId: z.string().min(1), normativeReference: z.string().trim().min(3), title: z.string().trim().min(3), footnotes: z.string().max(20000).default("") }).parse(raw);
  return withDatabaseTransaction(planningConnection(context), async (tx) => {
    const piece = await lockLegalInstrument(tx, context, input.instrumentId); await assertWholePiece(tx, context, piece.id);
    const document = await readPlanningDocument({ ...context, database: tx }, input.linkId);
    if (document.instrumentId !== piece.id) throw new Error("Modelo documental deve estar vinculado à peça selecionada.");
    const canonical = canonicalPiece(piece);
    if (["SANCTIONED", "PUBLISHED"].includes(canonical?.status ?? "")) await snapshotVersion(tx, context, piece.id, new Date(), canonical?.legalActNumber ?? "Modelo documental", "Antes da configuração do modelo");
    const definition = { linkId: input.linkId, versionId: document.version.id, fileHash: document.version.hashSha256, title: input.title, footnotes: input.footnotes, configuredById: context.user.id, requirementItems: planningReportCatalog.find((report) => report.type === input.type)!.items };
    const [rule] = await tx.insert(planningFiscalRules).values({ instrumentId: piece.id, type: `LAYOUT:${input.type}`, normativeReference: input.normativeReference, definition, updatedById: context.user.id }).onConflictDoUpdate({ target: [planningFiscalRules.instrumentId, planningFiscalRules.type], set: { normativeReference: input.normativeReference, definition, updatedById: context.user.id } }).returning();
    if (["SANCTIONED", "PUBLISHED"].includes(canonical?.status ?? "")) await finalizeLegalRevision(tx, context, piece, new Date(), canonical?.legalActNumber ?? "Modelo documental", "Modelo e referência documental preservados");
    await planningAudit(tx, context, piece.id, "PLANNING_LAYOUT_CONFIGURATION", { type: input.type, versionId: document.version.id, hash: document.version.hashSha256, normativeReference: input.normativeReference });
    return rule.id;
  });
}

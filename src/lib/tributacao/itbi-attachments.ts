import type { Prisma } from "@prisma/client";
import type { TaxActor } from "./index";
import { taxScopeSnapshot } from "./scope";

/** Shared GED references keep the original file and its process provenance. */
export async function linkItbiPropertyAttachments(tx: Prisma.TransactionClient, actor: TaxActor, declarationId: string, documentIds: string[]) {
  const declaration = await tx.itbiDeclaration.findUniqueOrThrow({ where: { id: declarationId } });
  const scope = taxScopeSnapshot(declaration.calculationSnapshot);
  if (actor.allowedBudgetUnitIds && (typeof scope.budgetUnitId !== "string" || !actor.allowedBudgetUnitIds.includes(scope.budgetUnitId))) throw new Error("Anexos ITBI fora da UG autorizada.");
  for (const documentId of [...new Set(documentIds)].sort()) {
    if (!await tx.document.findFirst({ where: { id: documentId, status: "Válido" } })) throw new Error("Anexo GED inválido.");
    if (declaration.processId) {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ITBI_PROCESS_ATTACHMENT:${declaration.processId}:${documentId}`},0))::text`;
      if (!await tx.processDocument.findFirst({ where: { processId: declaration.processId, documentId } })) await tx.processDocument.create({ data: { processId: declaration.processId, documentId, purpose: "Documento compartilhado com o processo de transmissão ITBI", employeeId: actor.employeeId } });
    }
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ITBI_ATTACHMENT:${declaration.realEstateId}:${declaration.processId}:${documentId}`},0))::text`;
    const existing = await tx.taxRegistryEntry.findFirst({ where: { entityType: "REAL_ESTATE", entityId: declaration.realEstateId, category: "DOCUMENTO", documentId, processId: declaration.processId } });
    if (!existing) await tx.taxRegistryEntry.create({ data: { entityType: "REAL_ESTATE", entityId: declaration.realEstateId, category: "DOCUMENTO", title: "Anexo do ITBI", documentId, processId: declaration.processId, actorUsuarioId: actor.usuarioId, data: { governmentEntityId: scope.governmentEntityId, budgetUnitId: scope.budgetUnitId, declarationId, details: "Documento compartilhado com o processo de transmissão." } } });
  }
}

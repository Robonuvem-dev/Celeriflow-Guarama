import { and, eq, isNull } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import { taxRegistryEntries } from "@/db/schema/taxation-registry";
import { firstItbiRegistryEntry, insertItbiProcessDocument, insertItbiRegistryEntry, itbiRegistryPosition, lockItbiKey, readItbiDeclaration, readItbiProcessDocuments, readValidItbiDocuments } from "@/db/repositories/tax-itbi/records";
import type { TaxActor } from "./index";
import { taxScopeSnapshot } from "./scope";

/** Shared GED references keep the original file and its process provenance. */
export async function linkItbiPropertyAttachments(tx: DatabaseTransaction, actor: TaxActor, declarationId: string, documentIds: string[]) {
  const declaration = await readItbiDeclaration(tx, declarationId);
  const scope = taxScopeSnapshot(declaration.calculationSnapshot);
  if (actor.allowedBudgetUnitIds && (typeof scope.budgetUnitId !== "string" || !actor.allowedBudgetUnitIds.includes(scope.budgetUnitId))) throw new Error("Anexos ITBI fora da UG autorizada.");
  for (const documentId of [...new Set(documentIds)].sort()) {
    if (!(await readValidItbiDocuments(tx, [documentId])).length) throw new Error("Anexo GED inválido.");
    if (declaration.processId) {
      await lockItbiKey(tx, `ITBI_PROCESS_ATTACHMENT:${declaration.processId}:${documentId}`);
      if (!(await readItbiProcessDocuments(tx, declaration.processId, [documentId])).length) await insertItbiProcessDocument(tx, { processId: declaration.processId, documentId, purpose: "Documento compartilhado com o processo de transmissão ITBI", employeeId: actor.employeeId });
    }
    await lockItbiKey(tx, `ITBI_ATTACHMENT:${declaration.realEstateId}:${declaration.processId}:${documentId}`);
    const existing = await firstItbiRegistryEntry(tx, and(itbiRegistryPosition("REAL_ESTATE", declaration.realEstateId, "DOCUMENTO"), eq(taxRegistryEntries.documentId, documentId), declaration.processId === null ? isNull(taxRegistryEntries.processId) : eq(taxRegistryEntries.processId, declaration.processId))!);
    if (!existing) await insertItbiRegistryEntry(tx, { entityType: "REAL_ESTATE", entityId: declaration.realEstateId, category: "DOCUMENTO", title: "Anexo do ITBI", documentId, processId: declaration.processId, actorUsuarioId: actor.usuarioId, data: { governmentEntityId: scope.governmentEntityId, budgetUnitId: scope.budgetUnitId, declarationId, details: "Documento compartilhado com o processo de transmissão." } });
  }
}

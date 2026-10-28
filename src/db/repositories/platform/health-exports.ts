import { and, eq } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { diagnosticEsusBatches } from "../../schema/health-diagnostics";
import { healthFollowupBatches, healthFollowupBindings } from "../../schema/health-followup";
import { healthPharmacyJudicialCases, healthPharmacyJudicialDocuments } from "../../schema/health-pharmacy";
import { documents } from "../../schema/registry";
import { PersistenceError } from "../../errors";

export async function findSisabBatchExport(database: DatabaseExecutor, id: string) {
  const [batch] = await database.select({
    fileContent: diagnosticEsusBatches.fileContent,
    competence: diagnosticEsusBatches.competence,
    hash: diagnosticEsusBatches.hash,
  }).from(diagnosticEsusBatches).where(eq(diagnosticEsusBatches.id, id)).limit(1);
  return batch ?? null;
}

export async function findFollowupBatchReceiver(database: DatabaseExecutor, id: string) {
  const [batch] = await database.select({ contractName: healthFollowupBatches.contractName, binding: { unitId: healthFollowupBindings.unitId } })
    .from(healthFollowupBatches).innerJoin(healthFollowupBindings, eq(healthFollowupBindings.id, healthFollowupBatches.bindingId))
    .where(eq(healthFollowupBatches.id, id)).limit(1);
  return batch ?? null;
}

export async function readPharmacyJudicialCaseUnit(database: DatabaseExecutor, id: string) {
  const [current] = await database.select({ unitId: healthPharmacyJudicialCases.unitId }).from(healthPharmacyJudicialCases)
    .where(eq(healthPharmacyJudicialCases.id, id)).limit(1);
  if (!current) throw new PersistenceError("not-found", "Processo farmacêutico não encontrado.");
  return current;
}

export async function findPharmacyJudicialAttachment(database: DatabaseExecutor, caseId: string, documentId: string) {
  const [link] = await database.select({ document: { title: documents.title, fileUrl: documents.fileUrl } })
    .from(healthPharmacyJudicialDocuments).innerJoin(documents, eq(documents.id, healthPharmacyJudicialDocuments.documentId))
    .where(and(eq(healthPharmacyJudicialDocuments.caseId, caseId), eq(healthPharmacyJudicialDocuments.documentId, documentId))).limit(1);
  return link ?? null;
}

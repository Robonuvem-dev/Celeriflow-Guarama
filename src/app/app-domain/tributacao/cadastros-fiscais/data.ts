import type { DatabaseExecutor } from "@/db/transaction";
import { actionWorkspaceData } from "@/db/repositories/tax-actions/registry";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";

export async function getFiscalRegistryWorkspaceData(database: DatabaseExecutor, entityType: string, entityId: string) {
  const { user } = await getTenantContextForModule("TRIBUTACAO");
  const { entries, processes, documents } = await actionWorkspaceData(database, entityType, entityId, isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds);
  return {
    entries: entries.map((entry) => ({
      id: entry.id,
      category: entry.category,
      title: entry.title,
      data: entry.data,
      status: entry.status,
      source: entry.source,
      effectiveFrom: entry.effectiveFrom.toISOString(),
      effectiveUntil: entry.effectiveUntil?.toISOString() ?? null,
      processId: entry.processId,
      documentId: entry.documentId,
      version: entry.version,
      createdAt: entry.createdAt.toISOString(),
    })),
    processes: processes.map((process) => ({ id: process.id, label: `${process.protocolNumber} · ${process.status}` })),
    documents: documents.map((document) => ({ id: document.id, label: `${document.title} · ${document.documentType}` })),
  };
}

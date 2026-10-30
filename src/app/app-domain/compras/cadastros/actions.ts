"use server";
import { revalidatePath } from "next/cache";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { assertBudgetUnitAccess, getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { eq } from "drizzle-orm";
import { procurementContracts } from "@/db/schema/procurement-core";
import { isProcurementAuxiliaryCatalog, type ProcurementAuxiliaryRecord } from "@/lib/compras/auxiliary-catalogs";
import { listProcurementAuxiliaryRecords, saveProcurementAuxiliaryRecord } from "@/db/repositories/procurement/auxiliary-catalogs";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { auditEventTypes } from "@/lib/contracts/audit";
export async function saveAuxiliaryCatalog(catalog: string, input: Omit<ProcurementAuxiliaryRecord, "id"> & { id?: string }) {
  try {
    if (!isProcurementAuxiliaryCatalog(catalog)) throw new Error("Cadastro inválido.");
    const context = await getTenantContextForModuleOperation("COMPRAS", input.id ? "update" : "create");
    if (["usuarios-unidades", "requisitantes-finais"].includes(catalog) && !isSystemAdministrator(context.user)) throw new Error("A parametrização de usuários e acessos exige administrador do sistema.");
    const previous = input.id ? (await listProcurementAuxiliaryRecords(databaseConnection.db, catalog)).find(record => record.id === input.id) : null;
    for (const contractId of new Set([input.fields.contratoId, previous?.fields.contratoId].filter((id): id is string => Boolean(id)))) {
      const [contract] = await databaseConnection.db.select().from(procurementContracts).where(eq(procurementContracts.id, contractId)).limit(1);
      if (!contract) throw new Error("Contrato não encontrado.");
      if (contract.sourceBudgetUnitId) assertBudgetUnitAccess(context.user, contract.sourceBudgetUnitId);
    }
    await withDatabaseTransaction(databaseConnection, async tx => {
      const targetId = await saveProcurementAuxiliaryRecord(tx, catalog, input.id || null, input);
      await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.instanceConfigurationChanged, targetType: "PROCUREMENT_AUXILIARY_CATALOG", targetId });
    });
    revalidatePath(`/compras/cadastros/${catalog}`);
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Não foi possível salvar." }; }
}

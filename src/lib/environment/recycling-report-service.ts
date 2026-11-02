import "server-only";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { findOperationalInstance } from "@/db/repositories/platform/instance-configuration";
import { hasRecyclingStockSchema } from "@/db/repositories/environment/recycling-stock";
import { loadRecyclingReport } from "@/db/repositories/environment/recycling-reports";
import { parseRecyclingEntries } from "./recycling-catalog";
import { RecyclingReportError, type RecyclingReportFilters } from "./recycling-reports";

/** Authentication/issueReports is required at both HTTP entry points before calling. */
export async function readRecyclingReport(connection: DatabaseConnection, filters: RecyclingReportFilters, page?: string, all = false) {
  return withDatabaseTransaction(connection, async tx => {
    const instance = await findOperationalInstance(tx);
    if (!instance || !await hasRecyclingStockSchema(tx)) throw new RecyclingReportError("O controle de recicláveis ainda não está disponível nesta instância.", 503);
    const data = await loadRecyclingReport(tx, instance.id, filters, page, all);
    const entries = parseRecyclingEntries(instance.parametros.filter(p => p.chave.startsWith("RECYCLING_CATALOG:")).map(p => p.valor));
    const institution = { name: instance.nomePrefeitura, legalName: null, cnpj: instance.cnpj, city: instance.municipio, state: instance.uf, address: null };
    return { data, entries, instanceId: instance.id, institution };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

import { and, asc, eq, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { assetCatalogRecords } from "@/db/schema/assets-catalogs";
import { departments, employees } from "@/db/schema/administration";
import { assets, assetCategories } from "@/db/schema/assets";
import { materials } from "@/db/schema/assets-stock";
import type { PermissionUser } from "@/lib/contracts/identity";
import { canPerformModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { catalogDefinition, catalogRecordInput, validateCatalogDetails } from "./catalog-definitions";

export function authorizeAssetCatalog(user: PermissionUser, kind: string, departmentId: string, operation: "create" | "update") {
  const definition = catalogDefinition(kind);
  if (!canPerformModuleOperation(user, definition.module, operation) || !isSystemAdministrator(user) && user.departmentId !== departmentId) throw new Error("Cadastro fora do seu escopo autorizado.");
}
export async function saveAssetCatalog(connection: DatabaseConnection, user: PermissionUser, raw: unknown) {
  const input = catalogRecordInput.parse(raw);
  authorizeAssetCatalog(user, input.kind, input.departmentId, input.id ? "update" : "create");
  const details = validateCatalogDetails(input.kind, input.details);
  return withDatabaseTransaction(connection, async tx => {
    const [department] = await tx.select({ id: departments.id }).from(departments).where(and(eq(departments.id, input.departmentId), eq(departments.isActive, true))).limit(1);
    if (!department) throw new Error("Setor inexistente ou inativo.");
    if (details.employeeId && !(await tx.select({ id: employees.id }).from(employees).where(and(eq(employees.id, details.employeeId), eq(employees.departmentId, input.departmentId), eq(employees.isActive, true))).limit(1)).length) throw new Error("Servidor inexistente, inativo ou de outro setor.");
    if (details.assetId && !(await tx.select({ id: assets.id }).from(assets).where(and(eq(assets.id, details.assetId), eq(assets.departmentId, input.departmentId))).limit(1)).length) throw new Error("Bem fora do setor informado.");
    if (input.kind === "depreciacao") {
      if (!isSystemAdministrator(user)) throw new Error("Categorias de depreciação compartilhadas exigem administrador.");
      await tx.insert(assetCategories).values({ code: input.code, name: input.name, lifeSpan: Number(details.months), isActive: true }).onConflictDoUpdate({ target: assetCategories.code, set: { name: input.name, lifeSpan: Number(details.months) } });
    }
    if (input.kind === "niveis") {
      if (!(await tx.select({ id: materials.id }).from(materials).where(and(eq(materials.id, details.materialId), eq(materials.isActive, true))).limit(1)).length) throw new Error("Material inexistente ou inativo.");
      // The operational stock screens use these same thresholds.
      if (!isSystemAdministrator(user)) throw new Error("Níveis do catálogo compartilhado exigem administrador.");
      await tx.update(materials).set({ minStock: Number(details.minimum), maxStock: Number(details.maximum) }).where(eq(materials.id, details.materialId));
    }
    const values = { code: input.code, name: input.name, details, updatedAt: new Date() };
    let id: string;
    if (input.id) {
      const [updated] = await tx.update(assetCatalogRecords).set(values).where(and(eq(assetCatalogRecords.id, input.id), eq(assetCatalogRecords.kind, input.kind), eq(assetCatalogRecords.departmentId, input.departmentId), eq(assetCatalogRecords.year, input.year), eq(assetCatalogRecords.updatedAt, new Date(input.version)))).returning({ id: assetCatalogRecords.id });
      if (!updated) throw new Error("Registro alterado por outra sessão; recarregue antes de editar.");
      id = updated.id;
    } else {
      const [created] = await tx.insert(assetCatalogRecords).values({ ...values, kind: input.kind, year: input.year, departmentId: input.departmentId, createdBy: user.id }).returning({ id: assetCatalogRecords.id });
      id = created.id;
    }
    await insertAuditEvent(tx, { actorUsuarioId: user.id, eventType: "ADMINISTRATIVE_MUTATION", targetType: "AssetCatalogRecord", targetId: id });
    return id;
  });
}

export async function copyAssetRequesters(connection: DatabaseConnection, user: PermissionUser, departmentId: string, sourceYear: number) {
  authorizeAssetCatalog(user, "requisitantes", departmentId, "create");
  if (!Number.isInteger(sourceYear) || sourceYear < 1900 || sourceYear >= 2200) throw new Error("Exercício inválido.");
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`ASSET_REQUESTERS:${departmentId}:${sourceYear}`}))`);
    const source = await tx.select().from(assetCatalogRecords).where(and(eq(assetCatalogRecords.kind, "requisitantes"), eq(assetCatalogRecords.year, sourceYear), eq(assetCatalogRecords.departmentId, departmentId), eq(assetCatalogRecords.active, true))).orderBy(asc(assetCatalogRecords.code));
    let copied = 0;
    for (const record of source) {
      const rows = await tx.insert(assetCatalogRecords).values({ kind: record.kind, code: record.code, name: record.name, year: sourceYear + 1, departmentId, details: record.details, createdBy: user.id }).onConflictDoNothing().returning({ id: assetCatalogRecords.id });
      copied += rows.length;
    }
    await insertAuditEvent(tx, { actorUsuarioId: user.id, eventType: "ADMINISTRATIVE_MUTATION", targetType: "AssetRequesterYearCopy", targetId: `${departmentId}:${sourceYear + 1}` });
    return copied;
  });
}

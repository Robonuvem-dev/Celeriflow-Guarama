import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { findModuleActivation } from "@/db/repositories/platform/identity";
import { AccessError, canPerformModuleOperation, canViewModule, getCurrentTenantContext, getTenantContextForModule, getTenantContextForModuleOperation, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import type { GedCapability } from "./ged-policy";
import type { ObjectOperation } from "./ged-admin-policy";
import type { DatabaseExecutor } from "@/db/transaction";

export function canUseGed(user: AppContext["user"], capability: GedCapability = "read"): boolean {
  if (isSystemAdministrator(user)) return true;
  // Additional profiles are evaluated independently, just like module RBAC.
  if (user.additionalProfiles?.length) return [user.permissions, ...user.additionalProfiles.map(p => p.permissions)].some(permissions => canUseGed({ ...user, permissions, additionalProfiles: undefined }, capability));
  let explicit: Record<string, unknown> | undefined;
  try { explicit = JSON.parse(user.permissions || "{}").modules?.ASSINATURA_DIGITAL?.ged; } catch { /* restrictive fallback */ }
  if (explicit && typeof explicit === "object") return canViewModule(user, "ASSINATURA_DIGITAL") && explicit[capability] === true
    && (capability === "read" || !user.modulePermissions.length || user.modulePermissions.some(p => p.code === "ASSINATURA_DIGITAL" && p.canEdit));
  // Central-only access never grants access to the documentary collection.
  if (!canViewModule(user, "DOCUMENTOS")) return false;
  if (capability === "read") return true;
  if (capability === "configure" || capability === "share" || capability === "delete") return false;
  return canPerformModuleOperation(user, "DOCUMENTOS", capability === "import" || capability === "models" ? "create" : "update");
}
export async function getGedContext(capability: GedCapability = "read") {
  const context = await getCurrentTenantContext();
  const database = context.database ?? db;
  const activation = await findModuleActivation(database, "ASSINATURA_DIGITAL") ?? await findModuleActivation(database, "DOCUMENTOS");
  if (activation?.ativo === false) throw new AccessError("O módulo documental está inativo.", 423);
  if (!canUseGed(context.user, capability)) throw new AccessError("Sem permissão para esta operação no acervo GED.", 403);
  return context;
}
export function gedEntryScope(context: AppContext) {
  if (isSystemAdministrator(context.user)) return sql`TRUE`;
  return gedObjectScope(context, "document", sql`e."documentId"`, "read");
}

export function gedObjectScope(context: AppContext, kind: "document" | "folder", id: ReturnType<typeof sql>, operation: ObjectOperation) {
  if (isSystemAdministrator(context.user)) return sql`TRUE`;
  const profiles = [context.user.profileCode, ...(context.user.additionalProfiles ?? []).map(p => p.code)];
  return sql`ged_access(${kind},${id},${context.user.id},${context.user.departmentId},${JSON.stringify(profiles)}::jsonb,${operation})`;
}

export async function requireGedObject(context: AppContext, kind: "document" | "folder", id: string, operation: ObjectOperation, database: DatabaseExecutor = context.database ?? db) {
  if (!canUseGed(context.user, operation)) throw new AccessError("Sem capacidade para esta operação documental.", 403);
  const exists = kind === "document" ? sql`EXISTS(SELECT 1 FROM "GedEntry" WHERE "documentId"=${id})` : sql`EXISTS(SELECT 1 FROM "GedFolderAccess" WHERE "folderId"=${id})`;
  const result = await database.execute<{ allowed: boolean }>(sql`SELECT (${exists} AND ${gedObjectScope(context, kind, sql`${id}`, operation)}) AS allowed`);
  if (!result.rows[0]?.allowed) throw new AccessError("Objeto não encontrado ou operação fora do seu acesso.", 403);
}

export async function getUnifiedSignatureContext(create = false) {
  const context = await getCurrentTenantContext();
  if (canViewModule(context.user, "ASSINATURA_DIGITAL") && (!create || canPerformModuleOperation(context.user, "ASSINATURA_DIGITAL", "create"))) {
    return create ? getTenantContextForModuleOperation("ASSINATURA_DIGITAL", "create") : getTenantContextForModule("ASSINATURA_DIGITAL");
  }
  return create ? getTenantContextForModuleOperation("DOCUMENTOS", "create") : getTenantContextForModule("DOCUMENTOS");
}

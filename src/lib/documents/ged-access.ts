import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { findModuleActivation } from "@/db/repositories/platform/identity";
import { AccessError, canPerformModuleOperation, canViewModule, getCurrentTenantContext, getTenantContextForModule, getTenantContextForModuleOperation, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import type { GedCapability } from "./ged-policy";

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
  if (capability === "configure") return false;
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
  return sql`(e."ownerId"=${context.user.id} OR (e."departmentId" IS NOT NULL AND e."departmentId"=${context.user.departmentId}) OR EXISTS (
    SELECT 1 FROM "GedReview" r WHERE r."documentId"=e."documentId" AND r.status='ACTIVE'
      AND r.assignments::jsonb @> jsonb_build_object((ARRAY['ELABORACAO','CONSENSO','APROVACAO','HOMOLOGACAO'])[r.stage+1], jsonb_build_array(${context.user.id}::text))
  ))`;
}

export async function getUnifiedSignatureContext(create = false) {
  const context = await getCurrentTenantContext();
  if (canViewModule(context.user, "ASSINATURA_DIGITAL") && (!create || canPerformModuleOperation(context.user, "ASSINATURA_DIGITAL", "create"))) {
    return create ? getTenantContextForModuleOperation("ASSINATURA_DIGITAL", "create") : getTenantContextForModule("ASSINATURA_DIGITAL");
  }
  return create ? getTenantContextForModuleOperation("DOCUMENTOS", "create") : getTenantContextForModule("DOCUMENTOS");
}

import type { DatabaseExecutor } from "@/db/transaction";
import { findIdentityByFirebaseUid, repairTechnicalAdministrator } from "@/db/repositories/platform/identity";
import { isSystemAdministratorEmail, SYSTEM_ADMIN_PROFILE_CODE } from "@/lib/administration/c3-policy";
import type { PermissionUser } from "@/lib/contracts/identity";
import { getCurrentHealthUnitIds } from "@/lib/saude/health-access-policy";
import { AccessError } from "./access-error";
import type { SessionPrincipal } from "./session";

export async function resolveIdentityUser(db: DatabaseExecutor, principal: SessionPrincipal | null): Promise<PermissionUser> {
  if (!principal) throw new AccessError("Sessao invalida ou expirada.", 401);
  let usuario = await findIdentityByFirebaseUid(db, principal.firebaseUid);
  if (isSystemAdministratorEmail(principal.email)) {
    usuario = await repairTechnicalAdministrator(db, principal, SYSTEM_ADMIN_PROFILE_CODE);
  }
  if (!usuario || !usuario.ativo || !usuario.perfil.ativo) {
    throw new AccessError("Usuario sem acesso ao sistema.", 403);
  }
  const healthAccessScopes = usuario.healthAccessScopes;
  return {
    id: usuario.id,
    firebaseUid: principal.firebaseUid,
    email: usuario.email,
    name: usuario.nome || principal.name,
    role: usuario.perfil.nome,
    profileCode: usuario.perfil.codigo,
    permissions: usuario.perfil.permissoes ?? null,
    modulePermissions: usuario.modulePermissions.map(permission => ({ ...permission, code: permission.code.toUpperCase() })),
    allowedBudgetUnitIds: usuario.allowedBudgetUnitIds,
    allowedHealthUnitIds: getCurrentHealthUnitIds(healthAccessScopes),
    hasHealthAccessScope: healthAccessScopes.length > 0,
    employeeId: usuario.employee?.id ?? null,
    departmentId: usuario.employee?.departmentId ?? null,
    secretariatId: usuario.employee?.secretariatId ?? null,
  };
}

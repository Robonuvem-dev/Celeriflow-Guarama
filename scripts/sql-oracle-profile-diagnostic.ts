import type { PermissionUser } from "../src/lib/contracts/identity";

type DiagnosticUser = Pick<PermissionUser, "profileCode" | "permissions" | "modulePermissions">;
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

/** Frozen CONFIGURACOES policy for the standalone pseudo-page diagnostic.
 * Does not initialize the application's cookies/session/admin SDK dependencies. */
export function capturedProfileAccess(user: DiagnosticUser, moduleActive: boolean | undefined) {
  let permissions: Record<string, unknown> = {};
  try { const parsed: unknown = JSON.parse(user.permissions || "null"); if (record(parsed)) permissions = parsed; } catch { /* Invalid permission JSON falls back to individual grants. */ }
  const admin = user.profileCode === "SYSTEM_ADMINISTRATOR", code = "CONFIGURACOES";
  const grants = user.modulePermissions, matching = grants.filter(row => row.code === code);
  const includes = (value: unknown) => Array.isArray(value) && value.includes(code);
  let view: boolean, create: boolean, update: boolean, remove: boolean;
  if (admin) view = create = update = remove = true;
  else if (record(permissions.modules)) {
    const raw = permissions.modules[code];
    const granular = record(raw) ? raw : null;
    const allowed = granular !== null && granular.blocked !== true;
    view = allowed && (!grants.length || matching.some(row => row.canView || row.canEdit));
    const editable = allowed && (!grants.length || matching.some(row => row.canEdit));
    create = editable && granular?.create === true;
    update = editable && granular?.update === true;
    remove = editable && granular?.delete === true;
  } else {
    const blocked = includes(permissions.modulosBloqueados), allowed = !Array.isArray(permissions.modulosPermitidos) || includes(permissions.modulosPermitidos);
    view = !blocked && (Array.isArray(permissions.modulosPermitidos) ? allowed : matching.some(row => row.canView || row.canEdit));
    create = update = remove = !blocked && allowed && !includes(permissions.modulosSomenteLeitura) && matching.some(row => row.canEdit);
  }
  return { canViewProfiles: moduleActive !== false && view, canCreateProfiles: create, canUpdateProfiles: update, canDeleteProfiles: remove };
}

export function profileDiagnosticError(error: unknown) {
  const detail = record(error) ? error : {};
  const token = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9_]{1,60}$/.test(value) ? value : undefined;
  const message = typeof detail.message === "string" ? detail.message : "";
  return { query: "FAILED", name: token(detail.name), code: token(detail.code), missingColumn: message.match(/column [`'"]?([A-Za-z0-9_.]+)[`'"]?/i)?.[1], inconsistentRelation: message.match(/Field ([A-Za-z0-9_]+) is required/)?.[1] };
}

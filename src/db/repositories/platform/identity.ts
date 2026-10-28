import { eq } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { accessProfiles, modules, userBudgetUnits, userModulePermissions, users } from "../../schema/identity";
import { employees } from "../../schema/administration";
import { healthUserAccessScopes } from "../../schema/health-access";
import type { HealthAccessScopeRecord, IdentityRecord } from "@/lib/contracts/identity";

async function loadIdentity(db: DatabaseExecutor, field: "firebaseUid" | "email", value: string, includeBudgetUnits: boolean): Promise<IdentityRecord | null> {
  const [record] = await db.select({
    id: users.id, nome: users.nome, email: users.email, ativo: users.ativo,
    perfil: { id: accessProfiles.id, nome: accessProfiles.nome, codigo: accessProfiles.codigo, ativo: accessProfiles.ativo, permissoes: accessProfiles.permissoes },
    employee: { id: employees.id, departmentId: employees.departmentId, secretariatId: employees.secretariatId },
  }).from(users)
    .innerJoin(accessProfiles, eq(users.perfilId, accessProfiles.id))
    .leftJoin(employees, eq(users.employeeId, employees.id))
    .where(eq(users[field], value)).limit(1);
  if (!record) return null;
  const [modulePermissions, healthAccessScopes, budgetUnits] = await Promise.all([
    db.select({ code: modules.codigo, canView: userModulePermissions.canView, canEdit: userModulePermissions.canEdit })
      .from(userModulePermissions).innerJoin(modules, eq(userModulePermissions.moduloId, modules.id)).where(eq(userModulePermissions.usuarioId, record.id)),
    db.select({
      unitId: healthUserAccessScopes.unitId, validFrom: healthUserAccessScopes.validFrom, validUntil: healthUserAccessScopes.validUntil,
      weekdays: healthUserAccessScopes.weekdays, startTime: healthUserAccessScopes.startTime, endTime: healthUserAccessScopes.endTime, isActive: healthUserAccessScopes.isActive,
    }).from(healthUserAccessScopes).where(eq(healthUserAccessScopes.usuarioId, record.id)),
    includeBudgetUnits ? db.select({ budgetUnitId: userBudgetUnits.budgetUnitId }).from(userBudgetUnits).where(eq(userBudgetUnits.usuarioId, record.id)) : Promise.resolve([]),
  ]);
  const scopes: HealthAccessScopeRecord[] = healthAccessScopes;
  return { ...record, modulePermissions, healthAccessScopes: scopes, allowedBudgetUnitIds: budgetUnits.map(unit => unit.budgetUnitId) };
}

export async function findIdentityByFirebaseUid(db: DatabaseExecutor, firebaseUid: string): Promise<IdentityRecord | null> {
  try {
    return await loadIdentity(db, "firebaseUid", firebaseUid, true);
  } catch {
    // Preserve the legacy login fallback for installations predating UG links.
    return loadIdentity(db, "firebaseUid", firebaseUid, false);
  }
}

export async function repairTechnicalAdministrator(
  db: DatabaseExecutor,
  principal: { firebaseUid: string; email: string; name: string },
  profileCode: string,
): Promise<IdentityRecord> {
  const profile = {
    codigo: profileCode, nome: "Administrador", descricao: "Acesso administrativo inicial do sistema.",
    permissoes: JSON.stringify({ acesso: "total" }), ativo: true,
  };
  const [persistedProfile] = await db.insert(accessProfiles).values({ id: "system-administrator", ...profile })
    .onConflictDoUpdate({ target: accessProfiles.codigo, set: { ...profile, updatedAt: new Date() } }).returning({ id: accessProfiles.id });
  if (!persistedProfile) throw new Error("Não foi possível preparar o perfil administrativo.");
  const user = { nome: principal.name, firebaseUid: principal.firebaseUid, ativo: true, perfilId: persistedProfile.id };
  await db.insert(users).values({ ...user, email: principal.email, senha: "firebase" })
    .onConflictDoUpdate({ target: users.email, set: { ...user, updatedAt: new Date() } });
  const identity = await loadIdentity(db, "email", principal.email, true);
  if (!identity) throw new Error("Não foi possível carregar o usuário administrativo.");
  return identity;
}

export async function findModuleActivation(db: DatabaseExecutor, code: string): Promise<{ ativo: boolean } | null> {
  const [module] = await db.select({ ativo: modules.ativo }).from(modules).where(eq(modules.codigo, code)).limit(1);
  return module ?? null;
}

export async function listModuleActivations(db: DatabaseExecutor): Promise<{ codigo: string; ativo: boolean }[]> {
  return db.select({ codigo: modules.codigo, ativo: modules.ativo }).from(modules);
}

import { and, asc, eq, ilike, inArray, ne, sql } from "drizzle-orm";
import type { AccessProfileRecord, ManagedUserCandidate, ManagedUserInput, ProfileInput, ProfileWithLegacyUsers, SystemModuleRecord, UserAdministrationData } from "@/lib/contracts/system-administration";
import { auditEventTypes } from "@/lib/contracts/audit";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { accessProfiles, modules, userModulePermissions, users } from "../../schema/identity";
import { departments, employees, secretariats } from "../../schema/administration";
import { PersistenceError } from "../../errors";
import { insertAuditEvent } from "./audit";

function requireRecord<T>(rows: T[]): T {
  if (!rows.length) throw new PersistenceError("not-found", "Registro não encontrado.");
  return rows[0];
}

export async function loadUserAdministration(db: DatabaseExecutor, excludedEmail: string, administratorCode: string): Promise<UserAdministrationData> {
  const [userRows, perfis, employeeRows] = await Promise.all([
    db.select({ record: users, perfil: accessProfiles, employee: employees, department: departments, secretariat: secretariats }).from(users)
      .innerJoin(accessProfiles, eq(users.perfilId, accessProfiles.id)).leftJoin(employees, eq(users.employeeId, employees.id)).leftJoin(departments, eq(employees.departmentId, departments.id)).leftJoin(secretariats, eq(employees.secretariatId, secretariats.id))
      .where(and(ne(users.email, excludedEmail), ne(accessProfiles.codigo, administratorCode))).orderBy(asc(users.nome)),
    db.select().from(accessProfiles).where(and(eq(accessProfiles.ativo, true), ne(accessProfiles.codigo, administratorCode))).orderBy(asc(accessProfiles.nome)),
    db.select({ record: employees, department: departments, secretariat: secretariats }).from(employees).leftJoin(departments, eq(employees.departmentId, departments.id)).leftJoin(secretariats, eq(employees.secretariatId, secretariats.id)).where(eq(employees.isActive, true)).orderBy(asc(employees.name)),
  ]);
  return { usuarios: userRows.map(row => ({ ...row.record, perfil: row.perfil, employee: row.employee ? { ...row.employee, department: row.department, secretariat: row.secretariat } : null })), perfis, servidores: employeeRows.map(row => ({ ...row.record, department: row.department, secretariat: row.secretariat })) };
}

export async function listProfilesWithLegacyUsers(db: DatabaseExecutor, administratorCode: string): Promise<ProfileWithLegacyUsers[]> {
  const profiles = await db.select().from(accessProfiles).where(ne(accessProfiles.codigo, administratorCode)).orderBy(asc(accessProfiles.createdAt));
  if (!profiles.length) return [];
  const members = await db.select({ id: users.id, perfilId: users.perfilId }).from(users).where(inArray(users.perfilId, profiles.map(row => row.id)));
  const grants = members.length ? await db.select({ record: userModulePermissions, codigo: modules.codigo }).from(userModulePermissions).innerJoin(modules, eq(userModulePermissions.moduloId, modules.id)).where(inArray(userModulePermissions.usuarioId, members.map(row => row.id))) : [];
  return profiles.map(profile => ({ ...profile, usuarios: members.filter(user => user.perfilId === profile.id).map(user => ({ permissoesModulo: grants.filter(grant => grant.record.usuarioId === user.id).map(grant => ({ ...grant.record, modulo: { codigo: grant.codigo } })) })) }));
}

export async function findAccessProfile(db: DatabaseExecutor, id: string, activeOnly = false): Promise<AccessProfileRecord | null> {
  const [profile] = await db.select().from(accessProfiles).where(and(eq(accessProfiles.id, id), activeOnly ? eq(accessProfiles.ativo, true) : undefined)).limit(1);
  return profile ?? null;
}

export async function findDuplicateProfileName(db: DatabaseExecutor, name: string, exceptId?: string): Promise<{ id: string } | null> {
  const [profile] = await db.select({ id: accessProfiles.id }).from(accessProfiles).where(and(ilike(accessProfiles.nome, name), exceptId ? ne(accessProfiles.id, exceptId) : undefined)).limit(1);
  return profile ?? null;
}

export async function findManagedUser(db: DatabaseExecutor, id: string): Promise<ManagedUserCandidate | null> {
  const [row] = await db.select({ record: users, codigo: accessProfiles.codigo }).from(users).innerJoin(accessProfiles, eq(users.perfilId, accessProfiles.id)).where(eq(users.id, id)).limit(1);
  return row ? { ...row.record, perfil: { codigo: row.codigo } } : null;
}

export async function findManagedUserLink(db: DatabaseExecutor, field: "email" | "employeeId", value: string): Promise<{ id: string } | null> {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users[field], value)).limit(1);
  return user ?? null;
}

export async function findActiveUserEmployee(db: DatabaseExecutor, id: string): Promise<{ id: string; secretariatId: string | null } | null> {
  const [employee] = await db.select({ id: employees.id, secretariatId: employees.secretariatId }).from(employees).where(and(eq(employees.id, id), eq(employees.isActive, true))).limit(1);
  return employee ?? null;
}

export async function countSystemAdministrators(db: DatabaseExecutor, profileCode: string): Promise<number> {
  const [count] = await db.select({ value: sql<number>`count(*)::int` }).from(users).innerJoin(accessProfiles, eq(users.perfilId, accessProfiles.id)).where(and(eq(users.ativo, true), eq(accessProfiles.codigo, profileCode)));
  return count.value;
}

export async function countProfileUsers(db: DatabaseExecutor, profileId: string): Promise<number> {
  const [count] = await db.select({ value: sql<number>`count(*)::int` }).from(users).where(eq(users.perfilId, profileId));
  return count.value;
}

export async function saveManagedUser(tx: DatabaseTransaction, input: ManagedUserInput, actorId: string, id?: string): Promise<string> {
  const user = id ? requireRecord(await tx.update(users).set(input).where(eq(users.id, id)).returning({ id: users.id })) : requireRecord(await tx.insert(users).values(input).returning({ id: users.id }));
  if (id) await tx.delete(userModulePermissions).where(eq(userModulePermissions.usuarioId, id));
  await insertAuditEvent(tx, { actorUsuarioId: actorId, eventType: auditEventTypes.administrativeMutation, targetType: "USUARIO", targetId: user.id });
  return user.id;
}

export async function setManagedUserStatus(tx: DatabaseTransaction, id: string, ativo: boolean, firebaseUid: string, actorId: string): Promise<void> {
  requireRecord(await tx.update(users).set({ ativo, firebaseUid }).where(eq(users.id, id)).returning({ id: users.id }));
  await insertAuditEvent(tx, { actorUsuarioId: actorId, eventType: auditEventTypes.administrativeMutation, targetType: "USUARIO", targetId: id });
}

export async function deleteManagedUser(tx: DatabaseTransaction, id: string, actorId: string): Promise<void> {
  requireRecord(await tx.delete(users).where(eq(users.id, id)).returning({ id: users.id }));
  await insertAuditEvent(tx, { actorUsuarioId: actorId, eventType: auditEventTypes.administrativeMutation, targetType: "USUARIO", targetId: id });
}

export async function saveAccessProfile(tx: DatabaseTransaction, input: ProfileInput, actorId: string, id?: string): Promise<string> {
  const data = { nome: input.nome, descricao: input.descricao, permissoes: input.permissoes, ativo: input.ativo };
  if (!id && !input.codigo) throw new Error("Código do perfil obrigatório.");
  const profile = id ? requireRecord(await tx.update(accessProfiles).set(data).where(eq(accessProfiles.id, id)).returning({ id: accessProfiles.id })) : requireRecord(await tx.insert(accessProfiles).values({ ...data, codigo: input.codigo! }).returning({ id: accessProfiles.id }));
  await insertAuditEvent(tx, { actorUsuarioId: actorId, eventType: auditEventTypes.administrativeMutation, targetType: "PROFILE", targetId: profile.id });
  return profile.id;
}

export async function setAccessProfileStatus(tx: DatabaseTransaction, id: string, ativo: boolean, actorId: string): Promise<void> {
  requireRecord(await tx.update(accessProfiles).set({ ativo }).where(eq(accessProfiles.id, id)).returning({ id: accessProfiles.id }));
  await insertAuditEvent(tx, { actorUsuarioId: actorId, eventType: auditEventTypes.administrativeMutation, targetType: "PROFILE", targetId: id });
}

export async function deleteAccessProfile(tx: DatabaseTransaction, id: string, actorId: string): Promise<void> {
  requireRecord(await tx.delete(accessProfiles).where(eq(accessProfiles.id, id)).returning({ id: accessProfiles.id }));
  await insertAuditEvent(tx, { actorUsuarioId: actorId, eventType: auditEventTypes.administrativeMutation, targetType: "PROFILE", targetId: id });
}

export async function listSystemModules(db: DatabaseExecutor): Promise<SystemModuleRecord[]> {
  return db.select().from(modules).where(and(ne(modules.codigo, "DOCUMENTOS"), ne(modules.codigo, "AUDITORIA"))).orderBy(asc(modules.nome));
}

import { and, eq, exists, inArray, sql } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import { users, accessProfiles, userModulePermissions, modules } from "@/db/schema/identity";
import { employees, departments } from "@/db/schema/administration";
import { constructionCases } from "@/db/schema/construction-core";
import { constructionStaffRoles } from "@/db/schema/construction-portal";
import { processes } from "@/db/schema/processes";
import { internalNotifications } from "@/db/schema/notifications";
import { canViewModule, type AppContext } from "@/lib/platform/tenant-context";

// External authors have no Usuario: their identity remains in the message.
export async function notifyConstructionMessageDepartment(tx: DatabaseTransaction, caseId: string, messageId: string) {
  const [item] = await tx.select({ process: { currentDepartmentId: processes.currentDepartmentId, protocolNumber: processes.protocolNumber } }).from(constructionCases).innerJoin(processes, eq(processes.id, constructionCases.processId)).where(eq(constructionCases.id, caseId)).limit(1);
  if (!item) throw new Error("ConstructionCase não encontrado.");
  const departmentId = item.process.currentDepartmentId;
  if (!departmentId) return;
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const recipients = await tx.select({ id: users.id, perfil: { nome: accessProfiles.nome, codigo: accessProfiles.codigo, permissoes: accessProfiles.permissoes } }).from(users).innerJoin(accessProfiles, eq(accessProfiles.id, users.perfilId)).innerJoin(employees, eq(employees.id, users.employeeId)).innerJoin(departments, eq(departments.id, employees.departmentId)).where(and(eq(users.ativo, true), eq(accessProfiles.ativo, true), eq(employees.isActive, true), eq(employees.departmentId, departmentId), eq(departments.isActive, true), exists(tx.select({ id: constructionStaffRoles.id }).from(constructionStaffRoles).where(and(eq(constructionStaffRoles.employeeId, employees.id), eq(constructionStaffRoles.departmentId, departmentId), eq(constructionStaffRoles.isActive, true), sql`${constructionStaffRoles.startsAt}<=${today.toISOString().slice(0, 10)}::date`, sql`(${constructionStaffRoles.endsAt} IS NULL OR ${constructionStaffRoles.endsAt}>=${today.toISOString().slice(0, 10)}::date)`)))));
  const permissions = recipients.length ? await tx.select({ usuarioId: userModulePermissions.usuarioId, codigo: modules.codigo, canView: userModulePermissions.canView, canEdit: userModulePermissions.canEdit }).from(userModulePermissions).innerJoin(modules, eq(modules.id, userModulePermissions.moduloId)).where(inArray(userModulePermissions.usuarioId, recipients.map(row => row.id))) : [];
  const dedupeKey = `OBRAS:CONSTRUCTION_CASE:${caseId}:PROFESSIONAL_MESSAGE:${messageId}`;
  for (const recipient of recipients) {
    const user: AppContext["user"] = { id: recipient.id, firebaseUid: "", email: "", name: "", role: recipient.perfil.nome, profileCode: recipient.perfil.codigo, permissions: recipient.perfil.permissoes, modulePermissions: permissions.filter(permission => permission.usuarioId === recipient.id).map((permission) => ({ code: permission.codigo.toUpperCase(), canView: permission.canView, canEdit: permission.canEdit })), allowedBudgetUnitIds: [], employeeId: null, departmentId, secretariatId: null };
    if (!canViewModule(user, "OBRAS")) continue;
    if ((await tx.select({ id: internalNotifications.id }).from(internalNotifications).where(and(eq(internalNotifications.userId, recipient.id), eq(internalNotifications.dedupeKey, dedupeKey))).limit(1)).length) continue;
    await tx.insert(internalNotifications).values({ userId: recipient.id, sourceModule: "OBRAS", entityType: "CONSTRUCTION_CASE", entityId: caseId, type: "PROFESSIONAL_MESSAGE", title: `Comunicação profissional — ${item.process.protocolNumber}`, message: `Há nova comunicação em /obras/construcao-civil/${caseId}.`, priority: "NORMAL", dedupeKey });
  }
}

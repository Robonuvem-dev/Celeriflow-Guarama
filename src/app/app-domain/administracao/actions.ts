"use server";

import { assertLifecycleCanDeactivate } from "@/lib/administration/c3-policy";
import { assertManagerEmployeeChange, resolveSecretariatManager, validateEmployeeRelations } from "@/db/repositories/administration/leadership";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { databaseConnection, db } from "@/db/client";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import * as structure from "@/db/repositories/administration/structure";
import { getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { calendarEventSchema } from "@/lib/administration/calendar-event";
import { secretariatInputSchema } from "@/lib/administration/secretariat-input";

type ActionResult = { error: string | null };

async function runAdministrativeMutation(targetType: string, targetId: string, mutate: (context: Awaited<ReturnType<typeof getTenantContextForSystemAdministration>>) => Promise<void>): Promise<ActionResult> {
  try {
    const context = await getTenantContextForSystemAdministration();
    await mutate(context);
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível concluir a alteração administrativa." };
  }
}

async function auditMutation(context: Awaited<ReturnType<typeof getTenantContextForSystemAdministration>>, targetType: string, targetId: string, mutation: (tx: DatabaseTransaction) => Promise<void>) {
  await withDatabaseTransaction(databaseConnection, async tx => {
    await mutation(tx);
    await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType, targetId });
  });
}

export async function deactivateSecretariat(id: string) {
  const result = await runAdministrativeMutation("SECRETARIAT", id, async (context) => {
    const children = await structure.countSecretariatActiveChildren(context.database ?? db, id);
    assertLifecycleCanDeactivate({ entity: "a secretaria", activeChildrenOrReferences: children });
    await auditMutation(context, "SECRETARIAT", id, tx => structure.setSecretariatActive(tx, id, false));
  });
  if (!result.error) revalidatePath("/administracao/secretarias");
  return result;
}

export async function activateSecretariat(id: string) {
  const result = await runAdministrativeMutation("SECRETARIAT", id, context => auditMutation(context, "SECRETARIAT", id, tx => structure.setSecretariatActive(tx, id, true)));
  if (!result.error) revalidatePath("/administracao/secretarias");
  return result;
}

export async function updateSecretariat(id: string, data: { name: string; acronym: string; managerId: string | null }) {
  const parsed = secretariatInputSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const result = await runAdministrativeMutation("SECRETARIAT", id, (context) => auditMutation(context, "SECRETARIAT", id, async (tx) => {
    const manager = await resolveSecretariatManager(tx, id, parsed.data.managerId);
    await structure.updateSecretariat(tx, id, { ...parsed.data, ...manager });
  }));
  if (!result.error) {
    revalidatePath("/administracao", "layout");
    revalidatePath("/app-domain/administracao", "layout");
  }
  return result;
}

export async function deactivateDepartment(id: string) {
  const result = await runAdministrativeMutation("DEPARTMENT", id, async (context) => {
    const employees = await structure.countDepartmentEmployees(context.database ?? db, id, true);
    assertLifecycleCanDeactivate({ entity: "o departamento", activeChildrenOrReferences: employees });
    await auditMutation(context, "DEPARTMENT", id, tx => structure.setDepartmentActive(tx, id, false));
  });
  if (!result.error) revalidatePath("/administracao/departamentos");
  return result;
}

export async function activateDepartment(id: string) {
  const result = await runAdministrativeMutation("DEPARTMENT", id, async (context) => {
    const department = await structure.findDepartmentHierarchy(context.database ?? db, id);
    if (!department?.secretariat.isActive) throw new Error("Ative a secretaria antes de ativar o departamento.");
    await auditMutation(context, "DEPARTMENT", id, tx => structure.setDepartmentActive(tx, id, true));
  });
  if (!result.error) revalidatePath("/administracao/departamentos");
  return result;
}

export async function updateDepartment(id: string, data: { name: string; description: string; secretariatId: string }) {
  const result = await runAdministrativeMutation("DEPARTMENT", id, async (context) => {
    const [department, secretariat, employeeCount] = await Promise.all([
      structure.findDepartmentHierarchy(context.database ?? db, id),
      structure.findSecretariatActivation(context.database ?? db, data.secretariatId),
      structure.countDepartmentEmployees(context.database ?? db, id),
    ]);
    if (!department || !secretariat?.isActive) throw new Error("A secretaria selecionada deve estar ativa.");
    if (department.secretariatId !== data.secretariatId && employeeCount > 0) throw new Error("Não é possível mover um departamento que possui servidores vinculados.");
    await auditMutation(context, "DEPARTMENT", id, tx => structure.updateDepartment(tx, id, data));
  });
  if (!result.error) revalidatePath("/administracao/departamentos");
  return result;
}

// Role.canSign remains informational; document signing has its own authorization flow.
export async function deactivateRole(id: string) {
  const result = await runAdministrativeMutation("ROLE", id, (context) => auditMutation(context, "ROLE", id, async (tx) => {
    if (await structure.countManagersByRole(tx, id)) throw new Error("Substitua os responsáveis das secretarias antes de inativar este cargo.");
    await structure.setRoleActive(tx, id, false);
  }));
  if (!result.error) revalidatePath("/administracao/cargos");
  return result;
}

export async function activateRole(id: string) {
  const result = await runAdministrativeMutation("ROLE", id, context => auditMutation(context, "ROLE", id, tx => structure.setRoleActive(tx, id, true)));
  if (!result.error) revalidatePath("/administracao/cargos");
  return result;
}

export async function updateRole(id: string, data: { name: string; description: string; level: string; canSign: boolean }) {
  const result = await runAdministrativeMutation("ROLE", id, (context) => auditMutation(context, "ROLE", id, async (tx) => {
    const name = data.name.trim();
    if (!name) throw new Error("O nome do cargo ou função é obrigatório.");
    const duplicate = await structure.findRoleDuplicate(tx, id, name);
    if (duplicate) throw new Error("Já existe um cargo ou função com este nome. Edite ou reative o registro existente.");
    await structure.updateRole(tx, id, { name, description: data.description.trim() || null, level: data.level.trim() || null, canSign: data.canSign });
  }));
  if (!result.error) revalidatePath("/administracao/cargos");
  return result;
}

export async function deactivateEmployee(id: string) {
  const result = await runAdministrativeMutation("EMPLOYEE", id, (context) => auditMutation(context, "EMPLOYEE", id, async (tx) => {
    await assertManagerEmployeeChange(tx, id, { isActive: false });
    await structure.setEmployeeActive(tx, id, false);
  }));
  if (!result.error) revalidatePath("/administracao/servidores");
  return result;
}

export async function activateEmployee(id: string) {
  const result = await runAdministrativeMutation("EMPLOYEE", id, context => auditMutation(context, "EMPLOYEE", id, tx => structure.setEmployeeActive(tx, id, true)));
  if (!result.error) revalidatePath("/administracao/servidores");
  return result;
}

export async function updateEmployee(id: string, data: { name: string; email: string; cpf: string; roleId: string | null; secretariatId: string | null; departmentId: string | null }) {
  const result = await runAdministrativeMutation("EMPLOYEE", id, async (context) => {
    const hierarchy = await validateEmployeeRelations(context.database ?? db, data);
    await auditMutation(context, "EMPLOYEE", id, async (tx) => {
      await assertManagerEmployeeChange(tx, id, { ...data, secretariatId: hierarchy.secretariatId });
      await structure.updateEmployee(tx, id, { ...data, secretariatId: hierarchy.secretariatId });
    });
  });
  if (!result.error) revalidatePath("/administracao/servidores");
  return result;
}

export async function deactivateAdministrativeUnit(id: string) {
  const result = await runAdministrativeMutation("ADMINISTRATIVE_UNIT", id, async (context) => {
    const employees = await structure.countUnitEmployees(context.database ?? db, id, true);
    assertLifecycleCanDeactivate({ entity: "a unidade administrativa", activeChildrenOrReferences: employees });
    await auditMutation(context, "ADMINISTRATIVE_UNIT", id, tx => structure.setUnitActive(tx, id, false));
  });
  if (!result.error) revalidatePath("/administracao/unidades");
  return result;
}

export async function activateAdministrativeUnit(id: string) {
  const result = await runAdministrativeMutation("ADMINISTRATIVE_UNIT", id, async (context) => {
    const unit = await structure.findUnitHierarchy(context.database ?? db, id);
    if (!unit?.secretariat.isActive) throw new Error("Ative a secretaria antes de ativar a unidade.");
    await auditMutation(context, "ADMINISTRATIVE_UNIT", id, tx => structure.setUnitActive(tx, id, true));
  });
  if (!result.error) revalidatePath("/administracao/unidades");
  return result;
}

export async function updateAdministrativeUnit(id: string, data: { name: string; type: string; address: string; managerName: string; secretariatId: string }) {
  const result = await runAdministrativeMutation("ADMINISTRATIVE_UNIT", id, async (context) => {
    const [unit, secretariat, employeeCount] = await Promise.all([
      structure.findUnitHierarchy(context.database ?? db, id),
      structure.findSecretariatActivation(context.database ?? db, data.secretariatId),
      structure.countUnitEmployees(context.database ?? db, id),
    ]);
    if (!unit || !secretariat?.isActive) throw new Error("A secretaria selecionada deve estar ativa.");
    if (unit.secretariatId !== data.secretariatId && employeeCount > 0) throw new Error("Não é possível mover uma unidade que possui servidores vinculados.");
    await auditMutation(context, "ADMINISTRATIVE_UNIT", id, tx => structure.updateUnit(tx, id, data));
  });
  if (!result.error) revalidatePath("/administracao/unidades");
  return result;
}

export async function updateInternalDemand(id: string, data: { title: string; status: string; priority: string; assigneeId: string | null; secretariatId: string | null; departmentId: string | null }) {
  const result = await runAdministrativeMutation("INTERNAL_DEMAND", id, context => auditMutation(context, "INTERNAL_DEMAND", id, tx => structure.updateInternalDemand(tx, id, data)));
  if (!result.error) revalidatePath("/administracao/demandas");
  return result;
}

export async function deleteCalendarEvent(id: string) {
  const result = await runAdministrativeMutation("CALENDAR_EVENT", id, context => auditMutation(context, "CALENDAR_EVENT", id, tx => structure.deleteCalendarEvent(tx, id)));
  if (!result.error) revalidatePath("/administracao/calendario");
  return result;
}

export async function updateCalendarEvent(id: string, data: { title: string; description: string; date: Date; type: string; isHoliday: boolean }) {
  const parsed = calendarEventSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const result = await runAdministrativeMutation("CALENDAR_EVENT", id, context => auditMutation(context, "CALENDAR_EVENT", id, tx => structure.updateCalendarEvent(tx, id, parsed.data)));
  if (!result.error) revalidatePath("/administracao/calendario");
  return result;
}

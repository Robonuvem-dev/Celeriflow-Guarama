"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AccessError, getTenantContextForModuleOperation, getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { HealthOperationError, runHealthTransaction } from "@/lib/saude/health-transaction";
import { db } from "@/db/client";
import type { DatabaseExecutor } from "@/db/transaction";
import { and, eq, inArray, isNull, ne, notInArray, sql } from "drizzle-orm";
import { getPostgresError } from "@/db/errors";
import { calendarEvents, employees } from "@/db/schema/administration";
import { people } from "@/db/schema/people";
import { addresses } from "@/db/schema/registry";
import { healthCbos } from "@/db/schema/master-data";
import { accessProfiles, modules, users, userModulePermissions } from "@/db/schema/identity";
import { healthUserAccessScopes } from "@/db/schema/health-access";
import { healthProfessionalAssignments, healthProfessionals, healthUnits } from "@/db/schema/health-workforce";
import { healthHabilitations, healthRegistrationStatusHistory, healthSchedulingGroups, healthServiceAssignments, healthServices, healthSpecialties, healthSpecialtyGroupMembers, healthSpecialtyGroups, healthSpecialtyGroupServices, healthUnitShifts, healthUnitSpecialties } from "@/db/schema/health-administration";
import { adminAuth } from "@/lib/firebase/server";
import { createFirebaseUserProvisioner } from "@/lib/firebase/user-provisioning";
import { isSystemAdministratorEmail, isSystemAdministratorProfileCode } from "@/lib/administration/c3-policy";
import {
  healthCatalogInputSchema,
  healthHabilitationInputSchema,
  healthHolidayInputSchema,
  healthProfessionalAdministrationInputSchema,
  healthProfessionalAssignmentInputSchema,
  healthSchedulingGroupInputSchema,
  healthServiceAssignmentInputSchema,
  healthSpecialtyGroupInputSchema,
  healthStatusChangeSchema,
  healthUnitAdministrationInputSchema,
  healthUnitShiftInputSchema,
  healthUnitSpecialtyInputSchema,
  healthUserAccessInputSchema,
  optionalHealthEntityIdSchema,
  type HealthCatalogInput,
  type HealthHabilitationInput,
  type HealthHolidayInput,
  type HealthProfessionalAdministrationInput,
  type HealthProfessionalAssignmentInput,
  type HealthSchedulingGroupInput,
  type HealthServiceAssignmentInput,
  type HealthSpecialtyGroupInput,
  type HealthUnitAdministrationInput,
  type HealthUnitShiftInput,
  type HealthUnitSpecialtyInput,
  type HealthUserAccessInput,
} from "@/lib/saude/admin-contract";

type ActionResult = { success: true } | { error: string };

function revalidateHealthAdministration() {
  for (const path of [
    "/app-domain/saude",
    "/app-domain/saude/administracao",
    "/app-domain/saude/unidades",
    "/app-domain/saude/profissionais",
    "/app-domain/saude/agenda",
    "/app-domain/saude/relatorios",
  ]) {
    revalidatePath(path);
  }
}

function hasErrorCode(error: unknown, code: string) {
  return getPostgresError(error)?.code === code;
}

function actionError(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) return error.issues[0]?.message || "Revise os campos informados.";
  if (error instanceof AccessError || error instanceof HealthOperationError) return error.message;
  if (hasErrorCode(error, "23505")) return "Já existe um registro com essa identificação.";
  return fallback;
}

async function requireActiveUnit(database: DatabaseExecutor, unitId: string) {
  const [unit] = await database.select({ id: healthUnits.id }).from(healthUnits).where(and(eq(healthUnits.id, unitId), eq(healthUnits.isActive, true))).limit(1);
  if (!unit) throw new HealthOperationError("A unidade selecionada deve estar ativa para receber vínculos administrativos.");
}

async function requireActiveProfessional(database: DatabaseExecutor, professionalId: string) {
  const [professional] = await database.select({ id: healthProfessionals.id }).from(healthProfessionals).where(and(eq(healthProfessionals.id, professionalId), eq(healthProfessionals.isActive, true))).limit(1);
  if (!professional) throw new HealthOperationError("O profissional selecionado deve estar ativo para receber vínculos administrativos.");
}

async function requireActiveSpecialty(database: DatabaseExecutor, specialtyId: string) {
  const [specialty] = await database.select({ id: healthSpecialties.id, name: healthSpecialties.name }).from(healthSpecialties).where(and(eq(healthSpecialties.id, specialtyId), eq(healthSpecialties.isActive, true))).limit(1);
  if (!specialty) throw new HealthOperationError("A especialidade selecionada deve estar ativa.");
  return specialty;
}

async function requireActiveService(database: DatabaseExecutor, serviceId: string) {
  const [service] = await database.select({ id: healthServices.id }).from(healthServices).where(and(eq(healthServices.id, serviceId), eq(healthServices.isActive, true))).limit(1);
  if (!service) throw new HealthOperationError("O serviço selecionado deve estar ativo.");
}

export async function saveHealthCbo(id: string | null, data: HealthCatalogInput): Promise<ActionResult> {
  try {
    const cboId = optionalHealthEntityIdSchema.parse(id);
    const input = healthCatalogInputSchema.parse(data);
    const context = await getTenantContextForModuleOperation("SAUDE", cboId ? "update" : "create");
    await runHealthTransaction(context, async tx => {
      const values = { code: input.code, description: input.name, isActive: input.isActive };
      const [cbo] = cboId ? await tx.update(healthCbos).set(values).where(eq(healthCbos.id, cboId)).returning({ id: healthCbos.id }) : await tx.insert(healthCbos).values(values).returning({ id: healthCbos.id });
      if (!cbo) throw new HealthOperationError("CBO não encontrado.");
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HEALTH_CBO", targetId: cbo.id });
    });
    revalidateHealthAdministration();
    return { success: true };
  } catch (error) {
    return { error: actionError(error, "Não foi possível salvar o CBO.") };
  }
}

export async function saveHealthSpecialty(id: string | null, data: HealthCatalogInput): Promise<ActionResult> {
  try {
    const specialtyId = optionalHealthEntityIdSchema.parse(id);
    const input = healthCatalogInputSchema.parse(data);
    const context = await getTenantContextForModuleOperation("SAUDE", specialtyId ? "update" : "create");
    await runHealthTransaction(context, async tx => {
      const values = { code: input.code, name: input.name, isActive: input.isActive };
      const [specialty] = specialtyId ? await tx.update(healthSpecialties).set(values).where(eq(healthSpecialties.id, specialtyId)).returning({ id: healthSpecialties.id }) : await tx.insert(healthSpecialties).values(values).returning({ id: healthSpecialties.id });
      if (!specialty) throw new HealthOperationError("Especialidade não encontrada.");
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HEALTH_SPECIALTY", targetId: specialty.id });
    });
    revalidateHealthAdministration();
    return { success: true };
  } catch (error) {
    return { error: actionError(error, "Não foi possível salvar a especialidade.") };
  }
}

export async function saveHealthService(id: string | null, data: HealthCatalogInput): Promise<ActionResult> {
  try {
    const serviceId = optionalHealthEntityIdSchema.parse(id);
    const input = healthCatalogInputSchema.parse(data);
    const context = await getTenantContextForModuleOperation("SAUDE", serviceId ? "update" : "create");
    await runHealthTransaction(context, async tx => {
      const values = { code: input.code, name: input.name, classification: input.classification, isActive: input.isActive };
      const [service] = serviceId ? await tx.update(healthServices).set(values).where(eq(healthServices.id, serviceId)).returning({ id: healthServices.id }) : await tx.insert(healthServices).values(values).returning({ id: healthServices.id });
      if (!service) throw new HealthOperationError("Serviço não encontrado.");
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HEALTH_SERVICE", targetId: service.id });
    });
    revalidateHealthAdministration();
    return { success: true };
  } catch (error) {
    return { error: actionError(error, "Não foi possível salvar o serviço SUS.") };
  }
}

export async function saveHealthSpecialtyGroup(id: string | null, data: HealthSpecialtyGroupInput): Promise<ActionResult> {
  try {
    const groupId = optionalHealthEntityIdSchema.parse(id);
    const input = healthSpecialtyGroupInputSchema.parse(data);
    const context = await getTenantContextForModuleOperation("SAUDE", groupId ? "update" : "create");
    await runHealthTransaction(context, async tx => {
      for (const specialtyId of input.specialtyIds) await requireActiveSpecialty(tx, specialtyId);
      for (const serviceId of input.serviceIds) await requireActiveService(tx, serviceId);
      const values = { name: input.name, isActive: input.isActive };
      const [group] = groupId ? await tx.update(healthSpecialtyGroups).set(values).where(eq(healthSpecialtyGroups.id, groupId)).returning({ id: healthSpecialtyGroups.id }) : await tx.insert(healthSpecialtyGroups).values(values).returning({ id: healthSpecialtyGroups.id });
      if (!group) throw new HealthOperationError("Grupo não encontrado.");
      await tx.delete(healthSpecialtyGroupMembers).where(eq(healthSpecialtyGroupMembers.groupId, group.id));
      await tx.delete(healthSpecialtyGroupServices).where(eq(healthSpecialtyGroupServices.groupId, group.id));
      if (input.specialtyIds.length) await tx.insert(healthSpecialtyGroupMembers).values(input.specialtyIds.map(specialtyId => ({ groupId: group.id, specialtyId })));
      if (input.serviceIds.length) await tx.insert(healthSpecialtyGroupServices).values(input.serviceIds.map(serviceId => ({ groupId: group.id, serviceId })));
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HEALTH_SPECIALTY_GROUP", targetId: group.id });
    });
    revalidateHealthAdministration();
    return { success: true };
  } catch (error) {
    return { error: actionError(error, "Não foi possível salvar o grupo de especialidades.") };
  }
}

export async function saveHealthUnitAdministration(id: string | null, data: HealthUnitAdministrationInput): Promise<ActionResult> {
  try {
    const unitId = optionalHealthEntityIdSchema.parse(id);
    const input = healthUnitAdministrationInputSchema.parse(data);
    const context = await getTenantContextForModuleOperation("SAUDE", unitId ? "update" : "create");
    await runHealthTransaction(context, async tx => {
      const [unit] = unitId ? await tx.update(healthUnits).set(input).where(eq(healthUnits.id, unitId)).returning({ id: healthUnits.id }) : await tx.insert(healthUnits).values({ ...input, isActive: true }).returning({ id: healthUnits.id });
      if (!unit) throw new HealthOperationError("Unidade de saúde não encontrada.");
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HEALTH_UNIT", targetId: unit.id });
    });
    revalidateHealthAdministration();
    return { success: true };
  } catch (error) {
    return { error: actionError(error, "Não foi possível salvar a unidade de saúde.") };
  }
}

export async function changeHealthUnitStatus(data: { id: string; isActive: boolean; reason?: string | null }): Promise<ActionResult> {
  try {
    const input = healthStatusChangeSchema.parse(data);
    const context = await getTenantContextForModuleOperation("SAUDE", "update");
    await runHealthTransaction(context, async tx => {
      const [current] = await tx.select({ id: healthUnits.id, isActive: healthUnits.isActive }).from(healthUnits).where(eq(healthUnits.id, input.id)).limit(1);
      if (!current) throw new HealthOperationError("Unidade de saúde não encontrada.");
      if (current.isActive !== input.isActive) {
        await tx.update(healthUnits).set(input.isActive
            ? { isActive: true, inactivatedAt: null, inactivationReason: null }
            : { isActive: false, inactivatedAt: new Date(), inactivationReason: input.reason }).where(eq(healthUnits.id, current.id));
        await tx.insert(healthRegistrationStatusHistory).values({ unitId: current.id, isActive: input.isActive, reason: input.reason });
        await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HEALTH_UNIT_STATUS", targetId: current.id });
      }
    });
    revalidateHealthAdministration();
    return { success: true };
  } catch (error) {
    return { error: actionError(error, "Não foi possível alterar a situação da unidade.") };
  }
}

export async function saveHealthUnitShift(id: string | null, data: HealthUnitShiftInput): Promise<ActionResult> {
  try {
    const shiftId = optionalHealthEntityIdSchema.parse(id);
    const input = healthUnitShiftInputSchema.parse(data);
    const context = await getTenantContextForModuleOperation("SAUDE", shiftId ? "update" : "create");
    await runHealthTransaction(context, async tx => {
      await requireActiveUnit(tx, input.unitId);
      const [shift] = shiftId ? await tx.update(healthUnitShifts).set(input).where(eq(healthUnitShifts.id, shiftId)).returning({ id: healthUnitShifts.id }) : await tx.insert(healthUnitShifts).values(input).returning({ id: healthUnitShifts.id });
      if (!shift) throw new HealthOperationError("Turno não encontrado.");
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HEALTH_UNIT_SHIFT", targetId: shift.id });
    });
    revalidateHealthAdministration();
    return { success: true };
  } catch (error) {
    return { error: actionError(error, "Não foi possível salvar o turno de atendimento.") };
  }
}

export async function saveHealthUnitSpecialty(id: string | null, data: HealthUnitSpecialtyInput): Promise<ActionResult> {
  try {
    const linkId = optionalHealthEntityIdSchema.parse(id);
    const input = healthUnitSpecialtyInputSchema.parse(data);
    const context = await getTenantContextForModuleOperation("SAUDE", linkId ? "update" : "create");
    await runHealthTransaction(context, async tx => {
      await requireActiveUnit(tx, input.unitId);
      await requireActiveSpecialty(tx, input.specialtyId);
      const [link] = linkId ? await tx.update(healthUnitSpecialties).set(input).where(eq(healthUnitSpecialties.id, linkId)).returning({ id: healthUnitSpecialties.id }) : await tx.insert(healthUnitSpecialties).values(input).onConflictDoUpdate({ target: [healthUnitSpecialties.unitId, healthUnitSpecialties.specialtyId], set: { isActive: input.isActive } }).returning({ id: healthUnitSpecialties.id });
      if (!link) throw new HealthOperationError("Vínculo não encontrado.");
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HEALTH_UNIT_SPECIALTY", targetId: link.id });
    });
    revalidateHealthAdministration();
    return { success: true };
  } catch (error) {
    return { error: actionError(error, "Não foi possível salvar a especialidade da unidade.") };
  }
}

export async function saveHealthServiceAssignment(id: string | null, data: HealthServiceAssignmentInput): Promise<ActionResult> {
  try {
    const assignmentId = optionalHealthEntityIdSchema.parse(id);
    const input = healthServiceAssignmentInputSchema.parse(data);
    const context = await getTenantContextForModuleOperation("SAUDE", assignmentId ? "update" : "create");
    await runHealthTransaction(context, async tx => {
      await requireActiveService(tx, input.serviceId);
      if (input.unitId) await requireActiveUnit(tx, input.unitId);
      if (input.professionalId) await requireActiveProfessional(tx, input.professionalId);
      const [assignment] = assignmentId ? await tx.update(healthServiceAssignments).set(input).where(eq(healthServiceAssignments.id, assignmentId)).returning({ id: healthServiceAssignments.id }) : await tx.insert(healthServiceAssignments).values(input).onConflictDoUpdate({ target: input.unitId ? [healthServiceAssignments.serviceId, healthServiceAssignments.unitId] : [healthServiceAssignments.serviceId, healthServiceAssignments.professionalId], set: { isActive: input.isActive } }).returning({ id: healthServiceAssignments.id });
      if (!assignment) throw new HealthOperationError("Vínculo de serviço não encontrado.");
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HEALTH_SERVICE_ASSIGNMENT", targetId: assignment.id });
    });
    revalidateHealthAdministration();
    return { success: true };
  } catch (error) {
    return { error: actionError(error, "Não foi possível salvar o vínculo de serviço.") };
  }
}

export async function saveHealthHabilitation(id: string | null, data: HealthHabilitationInput): Promise<ActionResult> {
  try {
    const habilitationId = optionalHealthEntityIdSchema.parse(id);
    const input = healthHabilitationInputSchema.parse(data);
    const context = await getTenantContextForModuleOperation("SAUDE", habilitationId ? "update" : "create");
    await runHealthTransaction(context, async tx => {
      if (input.unitId) await requireActiveUnit(tx, input.unitId);
      if (input.professionalId) await requireActiveProfessional(tx, input.professionalId);
      const [habilitation] = habilitationId ? await tx.update(healthHabilitations).set(input).where(eq(healthHabilitations.id, habilitationId)).returning({ id: healthHabilitations.id }) : await tx.insert(healthHabilitations).values(input).onConflictDoUpdate({ target: input.unitId ? [healthHabilitations.code, healthHabilitations.unitId] : [healthHabilitations.code, healthHabilitations.professionalId], set: { description: input.description, isActive: input.isActive } }).returning({ id: healthHabilitations.id });
      if (!habilitation) throw new HealthOperationError("Habilitação não encontrada.");
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HEALTH_HABILITATION", targetId: habilitation.id });
    });
    revalidateHealthAdministration();
    return { success: true };
  } catch (error) {
    return { error: actionError(error, "Não foi possível salvar a habilitação.") };
  }
}

export async function saveHealthProfessionalAdministration(id: string | null, data: HealthProfessionalAdministrationInput): Promise<ActionResult> {
  try {
    const professionalId = optionalHealthEntityIdSchema.parse(id);
    const input = healthProfessionalAdministrationInputSchema.parse(data);
    const context = await getTenantContextForModuleOperation("SAUDE", professionalId ? "update" : "create");
    await runHealthTransaction(context, async tx => {
      const [employee] = await tx.select({ id: employees.id }).from(employees).where(and(eq(employees.id, input.employeeId), eq(employees.isActive, true))).limit(1);
      if (!employee) throw new HealthOperationError("Selecione um profissional vinculado a uma pessoa ativa.");
      if (input.cbo) {
        const [cbo] = await tx.select({ id: healthCbos.id }).from(healthCbos).where(and(eq(healthCbos.code, input.cbo), eq(healthCbos.isActive, true))).limit(1);
        if (!cbo) throw new HealthOperationError("Selecione um CBO ativo cadastrado na referência de saúde.");
      }
      const specialty = input.specialtyId ? await requireActiveSpecialty(tx, input.specialtyId) : null;
      if (input.unitId) await requireActiveUnit(tx, input.unitId);
      if (input.cns) {
        const [duplicateCns] = await tx.select({ id: healthProfessionals.id }).from(healthProfessionals).where(and(eq(healthProfessionals.cns, input.cns), professionalId ? ne(healthProfessionals.id, professionalId) : undefined)).limit(1);
        if (duplicateCns) throw new HealthOperationError("Já existe um profissional de saúde com este CNS.");
      }
      if (!professionalId) {
        const [duplicateEmployee] = await tx.select({ id: healthProfessionals.id }).from(healthProfessionals).where(eq(healthProfessionals.employeeId, input.employeeId)).limit(1);
        if (duplicateEmployee) throw new HealthOperationError("Este profissional já possui cadastro de saúde.");
      }
      const dataToSave = {
        cns: input.cns,
        treatment: input.treatment,
        cbo: input.cbo,
        councilName: input.councilName,
        councilNumber: input.councilNumber,
        specialty: specialty?.name || null,
        isAuditor: input.isAuditor,
        consultationIntervalMinutes: input.consultationIntervalMinutes,
        unitId: input.unitId,
      };
      const [professional] = professionalId ? await tx.update(healthProfessionals).set(dataToSave).where(eq(healthProfessionals.id, professionalId)).returning({ id: healthProfessionals.id }) : await tx.insert(healthProfessionals).values({ employeeId: input.employeeId, ...dataToSave, isActive: true }).returning({ id: healthProfessionals.id });
      if (!professional) throw new HealthOperationError("Profissional de saúde não encontrado.");
      if (input.unitId) {
        if (input.specialtyId) {
          await tx.insert(healthProfessionalAssignments).values({ professionalId: professional.id, unitId: input.unitId, specialtyId: input.specialtyId, weeklyHours: input.weeklyHours, isActive: true }).onConflictDoUpdate({ target: [healthProfessionalAssignments.professionalId, healthProfessionalAssignments.unitId, healthProfessionalAssignments.specialtyId], set: { weeklyHours: input.weeklyHours, isActive: true } });
        } else {
          const [existingAssignment] = await tx.select({ id: healthProfessionalAssignments.id }).from(healthProfessionalAssignments).where(and(eq(healthProfessionalAssignments.professionalId, professional.id), eq(healthProfessionalAssignments.unitId, input.unitId), isNull(healthProfessionalAssignments.specialtyId))).limit(1);
          if (existingAssignment) {
            await tx.update(healthProfessionalAssignments).set({ weeklyHours: input.weeklyHours, isActive: true }).where(eq(healthProfessionalAssignments.id, existingAssignment.id));
          } else {
            await tx.insert(healthProfessionalAssignments).values({ professionalId: professional.id, unitId: input.unitId, specialtyId: null, weeklyHours: input.weeklyHours, isActive: true });
          }
        }
      }
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HEALTH_PROFESSIONAL", targetId: professional.id });
    });
    revalidateHealthAdministration();
    return { success: true };
  } catch (error) {
    return { error: actionError(error, "Não foi possível salvar o profissional de saúde.") };
  }
}

export async function changeHealthProfessionalStatus(data: { id: string; isActive: boolean; reason?: string | null }): Promise<ActionResult> {
  try {
    const input = healthStatusChangeSchema.parse(data);
    const context = await getTenantContextForModuleOperation("SAUDE", "update");
    await runHealthTransaction(context, async tx => {
      const [current] = await tx.select({ id: healthProfessionals.id, isActive: healthProfessionals.isActive, employee: { isActive: employees.isActive } }).from(healthProfessionals).innerJoin(employees, eq(employees.id, healthProfessionals.employeeId)).where(eq(healthProfessionals.id, input.id)).limit(1);
      if (!current) throw new HealthOperationError("Profissional de saúde não encontrado.");
      if (input.isActive && !current.employee.isActive) throw new HealthOperationError("Não é possível ativar um profissional vinculado a uma pessoa inativa.");
      if (!input.isActive && current.isActive) {
        const pendingAppointment = (await tx.execute(sql`SELECT id FROM "HealthAppointment" WHERE "professionalId"=${current.id} AND status NOT IN ('Atendido','Faltou','Cancelado') LIMIT 1`)).rows[0];
        if (pendingAppointment) throw new HealthOperationError("Não é possível inativar este profissional enquanto houver agendamentos pendentes.");
      }
      if (current.isActive !== input.isActive) {
        await tx.update(healthProfessionals).set(input.isActive
            ? { isActive: true, inactivatedAt: null, inactivationReason: null }
            : { isActive: false, inactivatedAt: new Date(), inactivationReason: input.reason }).where(eq(healthProfessionals.id, current.id));
        await tx.insert(healthRegistrationStatusHistory).values({ professionalId: current.id, isActive: input.isActive, reason: input.reason });
        await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HEALTH_PROFESSIONAL_STATUS", targetId: current.id });
      }
    });
    revalidateHealthAdministration();
    return { success: true };
  } catch (error) {
    return { error: actionError(error, "Não foi possível alterar a situação do profissional.") };
  }
}

export async function saveHealthProfessionalAssignment(id: string | null, data: HealthProfessionalAssignmentInput): Promise<ActionResult> {
  try {
    const assignmentId = optionalHealthEntityIdSchema.parse(id);
    const input = healthProfessionalAssignmentInputSchema.parse(data);
    const context = await getTenantContextForModuleOperation("SAUDE", assignmentId ? "update" : "create");
    await runHealthTransaction(context, async tx => {
      await requireActiveProfessional(tx, input.professionalId);
      await requireActiveUnit(tx, input.unitId);
      if (input.specialtyId) await requireActiveSpecialty(tx, input.specialtyId);
      let assignment: { id: string } | undefined;
      if (assignmentId) {
        [assignment] = await tx.update(healthProfessionalAssignments).set(input).where(eq(healthProfessionalAssignments.id, assignmentId)).returning({ id: healthProfessionalAssignments.id });
      } else if (input.specialtyId) {
        [assignment] = await tx.insert(healthProfessionalAssignments).values(input).onConflictDoUpdate({ target: [healthProfessionalAssignments.professionalId, healthProfessionalAssignments.unitId, healthProfessionalAssignments.specialtyId], set: { weeklyHours: input.weeklyHours, isActive: input.isActive } }).returning({ id: healthProfessionalAssignments.id });
      } else {
        const [existingAssignment] = await tx.select({ id: healthProfessionalAssignments.id }).from(healthProfessionalAssignments).where(and(eq(healthProfessionalAssignments.professionalId, input.professionalId), eq(healthProfessionalAssignments.unitId, input.unitId), isNull(healthProfessionalAssignments.specialtyId))).limit(1);
        [assignment] = existingAssignment ? await tx.update(healthProfessionalAssignments).set(input).where(eq(healthProfessionalAssignments.id, existingAssignment.id)).returning({ id: healthProfessionalAssignments.id }) : await tx.insert(healthProfessionalAssignments).values(input).returning({ id: healthProfessionalAssignments.id });
      }
      if (!assignment) throw new HealthOperationError("Vínculo profissional não encontrado.");
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HEALTH_PROFESSIONAL_ASSIGNMENT", targetId: assignment.id });
    });
    revalidateHealthAdministration();
    return { success: true };
  } catch (error) {
    return { error: actionError(error, "Não foi possível salvar o vínculo do profissional.") };
  }
}

export async function saveHealthSchedulingGroup(id: string | null, data: HealthSchedulingGroupInput): Promise<ActionResult> {
  try {
    const schedulingGroupId = optionalHealthEntityIdSchema.parse(id);
    const input = healthSchedulingGroupInputSchema.parse(data);
    const context = await getTenantContextForModuleOperation("SAUDE", schedulingGroupId ? "update" : "create");
    await runHealthTransaction(context, async tx => {
      await requireActiveUnit(tx, input.unitId);
      const [specialtyGroup] = await tx.select({ id: healthSpecialtyGroups.id }).from(healthSpecialtyGroups).where(and(eq(healthSpecialtyGroups.id, input.specialtyGroupId), eq(healthSpecialtyGroups.isActive, true))).limit(1);
      if (!specialtyGroup) throw new HealthOperationError("O grupo de especialidades selecionado deve estar ativo.");
      const [group] = schedulingGroupId ? await tx.update(healthSchedulingGroups).set(input).where(eq(healthSchedulingGroups.id, schedulingGroupId)).returning({ id: healthSchedulingGroups.id }) : await tx.insert(healthSchedulingGroups).values(input).returning({ id: healthSchedulingGroups.id });
      if (!group) throw new HealthOperationError("Grupo de agendamento não encontrado.");
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HEALTH_SCHEDULING_GROUP", targetId: group.id });
    });
    revalidateHealthAdministration();
    return { success: true };
  } catch (error) {
    return { error: actionError(error, "Não foi possível salvar o grupo de agendamento.") };
  }
}

export async function saveHealthHoliday(id: string | null, data: HealthHolidayInput): Promise<ActionResult> {
  try {
    const holidayId = optionalHealthEntityIdSchema.parse(id);
    const input = healthHolidayInputSchema.parse(data);
    const context = await getTenantContextForModuleOperation("SAUDE", holidayId ? "update" : "create");
    const date = new Date(`${input.date}T12:00:00.000Z`);
    await runHealthTransaction(context, async tx => {
      const values = { title: input.title, description: input.description, date, type: input.type, isHoliday: true };
      const [holiday] = holidayId ? await tx.update(calendarEvents).set(values).where(eq(calendarEvents.id, holidayId)).returning({ id: calendarEvents.id }) : await tx.insert(calendarEvents).values(values).returning({ id: calendarEvents.id });
      if (!holiday) throw new HealthOperationError("Feriado não encontrado.");
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HEALTH_HOLIDAY", targetId: holiday.id });
    });
    revalidateHealthAdministration();
    revalidatePath("/app-domain/administracao/calendario");
    return { success: true };
  } catch (error) {
    return { error: actionError(error, "Não foi possível salvar o feriado.") };
  }
}

export async function saveHealthUserAccess(data: HealthUserAccessInput): Promise<ActionResult> {
  try {
    const input = healthUserAccessInputSchema.parse(data);
    const context = await getTenantContextForSystemAdministration();
    const database = context.database ?? db;
    const [user, profile, employee, healthModule, units] = await Promise.all([
      database.select({ id: users.id, email: users.email, nome: users.nome, firebaseUid: users.firebaseUid, perfil: { codigo: accessProfiles.codigo } }).from(users).innerJoin(accessProfiles, eq(accessProfiles.id, users.perfilId)).where(eq(users.id, input.usuarioId)).limit(1).then(rows => rows[0]),
      database.select({ id: accessProfiles.id, codigo: accessProfiles.codigo }).from(accessProfiles).where(and(eq(accessProfiles.id, input.perfilId), eq(accessProfiles.ativo, true))).limit(1).then(rows => rows[0]),
      database.select({ id: employees.id, usuario: { id: users.id }, person: people }).from(employees).leftJoin(people, eq(people.id, employees.personId)).leftJoin(users, eq(users.employeeId, employees.id)).where(and(eq(employees.id, input.employeeId), eq(employees.isActive, true))).limit(1).then(rows => rows[0]),
      database.select({ id: modules.id, ativo: modules.ativo }).from(modules).where(eq(modules.codigo, "SAUDE")).limit(1).then(rows => rows[0]),
      database.select({ id: healthUnits.id }).from(healthUnits).where(and(inArray(healthUnits.id, input.unitIds), eq(healthUnits.isActive, true))),
    ]);
    if (!user) throw new HealthOperationError("Usuário não encontrado.");
    if (!profile) throw new HealthOperationError("Selecione um perfil de acesso ativo.");
    if (isSystemAdministratorEmail(user.email) || isSystemAdministratorProfileCode(user.perfil.codigo) || isSystemAdministratorProfileCode(profile.codigo)) throw new HealthOperationError("A conta técnica do administrador do sistema não pode ser alterada nesta rotina.");
    if (!employee?.person || employee.person.status !== "Ativo") throw new HealthOperationError("Selecione um servidor vinculado a uma pessoa física ativa.");
    if (employee.usuario && employee.usuario.id !== user.id) throw new HealthOperationError("Esta pessoa já está vinculada a outro usuário.");
    const employeeAddresses = await database.select({ id: addresses.id }).from(addresses).where(eq(addresses.personId, employee.person.id)).limit(1);
    if (!employee.person.fullName || !employee.person.cpf || !employee.person.birthDate || !employee.person.gender || !employee.person.raceColor || !employee.person.motherName || !employeeAddresses.length) {
      throw new HealthOperationError("Complete nome, CPF, sexo, raça/cor, nascimento, nome da mãe e endereço residencial da pessoa antes de liberar o acesso à Saúde.");
    }
    if (!healthModule?.ativo) throw new HealthOperationError("O módulo Saúde deve estar ativo para conceder acesso.");
    if (units.length !== input.unitIds.length) throw new HealthOperationError("Uma ou mais unidades selecionadas não estão ativas.");

    const provisioner = createFirebaseUserProvisioner(adminAuth);
    const { firebaseUid } = await provisioner.provision({
      email: user.email,
      displayName: user.nome,
      disabled: !input.ativo,
      firebaseUid: user.firebaseUid,
    });
    const weekdays = [...input.weekdays].sort().join(",");
    await runHealthTransaction(context, async tx => {
      await tx.update(users).set({ perfilId: input.perfilId, employeeId: employee.id, ativo: input.ativo, firebaseUid }).where(eq(users.id, user.id));
      await tx.insert(userModulePermissions).values({ usuarioId: user.id, moduloId: healthModule.id, canView: input.canView, canEdit: input.canEdit }).onConflictDoUpdate({ target: [userModulePermissions.usuarioId, userModulePermissions.moduloId], set: { canView: input.canView, canEdit: input.canEdit } });
      await tx.delete(healthUserAccessScopes).where(and(eq(healthUserAccessScopes.usuarioId, user.id), notInArray(healthUserAccessScopes.unitId, input.unitIds)));
      for (const unitId of input.unitIds) {
        const values = { validFrom: input.validFrom, validUntil: input.validUntil, weekdays, startTime: input.startTime, endTime: input.endTime, isActive: true };
        await tx.insert(healthUserAccessScopes).values({ usuarioId: user.id, unitId, ...values }).onConflictDoUpdate({ target: [healthUserAccessScopes.usuarioId, healthUserAccessScopes.unitId], set: values });
      }
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HEALTH_USER_ACCESS", targetId: user.id });
    });
    revalidateHealthAdministration();
    revalidatePath("/app-domain/configuracoes/usuarios");
    return { success: true };
  } catch (error) {
    return { error: actionError(error, "Não foi possível salvar o acesso do usuário à Saúde.") };
  }
}

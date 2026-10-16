"use server";

import type { Prisma } from "@prisma/client";
import { requireValidCpf } from "@/lib/identifiers/brazilian-identifiers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AccessError, assertHealthUnitAccess, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";
import { HealthOperationError, runHealthTransaction } from "@/lib/saude/appointment-service";
import { healthEntityIdSchema, patientInputSchema, type PatientInput } from "@/lib/saude/contract";
import { validateRegistrationIdentity } from "@/lib/saude/patient-registration-service";

function hasErrorCode(error: unknown, code: string) {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

type PatientValues = ReturnType<typeof patientInputSchema.parse>;

function revalidatePatients() {
  for (const path of ["/saude", "/saude/pacientes", "/saude/agenda", "/saude/atendimentos", "/cadastros/pessoas-fisicas", "/social"]) {
    revalidatePath(path);
  }
}

function actionError(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) return error.issues[0]?.message || "Revise os campos informados.";
  if (error instanceof AccessError || error instanceof HealthOperationError) return error.message;
  if (error instanceof Error && error.message === "CPF inválido.") return error.message;
  if (hasErrorCode(error, "P2002")) return "Ja existe um paciente cadastrado com este CNS ou CPF.";
  return fallback;
}

async function requireActivePatientReferences(tx: Prisma.TransactionClient, input: PatientValues) {
  if (input.referenceUnitId) {
    const unit = await tx.healthUnit.findFirst({ where: { id: input.referenceUnitId, isActive: true }, select: { id: true } });
    if (!unit) throw new HealthOperationError("Selecione uma unidade de referencia ativa.");
  }
  if (input.teamId) {
    const team = await tx.healthTeam.findFirst({ where: { id: input.teamId, isActive: true }, select: { unitId: true } });
    if (!team) throw new HealthOperationError("Selecione uma equipe ESF ativa.");
    if (!input.referenceUnitId || team.unitId !== input.referenceUnitId) {
      throw new HealthOperationError("A equipe ESF deve pertencer a unidade de referencia selecionada.");
    }
  }
}

export async function createPatient(data: PatientInput) {
  try {
    const input = patientInputSchema.parse(data);
    const context = await getTenantContextForModuleOperation("SAUDE", "create");
    if (input.referenceUnitId) assertHealthUnitAccess(context.user, input.referenceUnitId);
    else if (context.user.hasHealthAccessScope) throw new HealthOperationError("Selecione uma unidade de referência autorizada.");
    await runHealthTransaction(context, async tx => {
      await requireActivePatientReferences(tx, input);
      let personId = input.personId;
      if (!personId) {
        if (!input.fullName) throw new HealthOperationError("Informe o nome completo.");
        const identity = await validateRegistrationIdentity(tx, input.referenceUnitId, { stage: input.registrationStage, fullName: input.fullName, cpf: input.cpf, birthDate: input.birthDate, gender: input.gender, raceColor: input.raceColor, motherName: input.motherName, fatherName: input.fatherName, motherUnknown: input.motherUnknown, fatherUnknown: input.fatherUnknown });
        const person = await tx.person.create({
          data: {
            fullName: input.fullName,
            cpf: identity.cpf,
            birthDate: input.birthDate ? new Date(`${input.birthDate}T12:00:00.000Z`) : null,
            gender: input.gender, raceColor: input.raceColor, motherName: input.motherName, fatherName: input.fatherName,
            phonePrimary: input.phonePrimary, whatsapp: input.whatsapp, email: input.email, profession: input.profession,
            motherUnknown: input.motherUnknown, fatherUnknown: input.fatherUnknown,
          },
        });
        personId = person.id;
      } else {
        const person = await tx.person.findFirst({ where: { id: personId, status: "Ativo" } });
        if (!person) throw new HealthOperationError("A pessoa selecionada nao foi encontrada ou esta inativa.");
        const existing = await tx.patient.findUnique({ where: { personId }, select: { id: true } });
        if (existing) throw new HealthOperationError("Esta pessoa ja possui um registro de paciente.");
        await validateRegistrationIdentity(tx, input.referenceUnitId, { stage: input.registrationStage, fullName: person.fullName, cpf: person.cpf, birthDate: person.birthDate?.toISOString().slice(0, 10) || null, gender: person.gender, raceColor: person.raceColor, motherName: person.motherName, fatherName: person.fatherName, motherUnknown: person.motherUnknown, fatherUnknown: person.fatherUnknown });
      }

      const patient = await tx.patient.create({
        data: {
          personId,
          cns: input.cns,
          bloodType: input.bloodType,
          bloodDonor: input.bloodDonor ?? null,
          referenceUnitId: input.referenceUnitId,
          teamId: input.teamId,
          status: "Ativo",
          registrationProfile: { create: { stage: input.registrationStage } },
        },
      });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "PATIENT", targetId: patient.id });
      await tx.healthPatientRegistrationChange.create({ data: { patientId: patient.id, actorUsuarioId: context.user.id, changes: JSON.parse(JSON.stringify({ field: "CREATED", before: null, after: { personId, cns: patient.cns, unitId: patient.referenceUnitId, stage: input.registrationStage } })) } });
    });
    revalidatePatients();
    return { success: true };
  } catch (error) {
    return { error: actionError(error, "Nao foi possivel criar o paciente. Os dados foram preservados.") };
  }
}

export async function updatePatient(id: string, data: PatientInput) {
  try {
    const patientId = healthEntityIdSchema.parse(id);
    const input = patientInputSchema.parse(data);
    const context = await getTenantContextForModuleOperation("SAUDE", "update");
    await runHealthTransaction(context, async tx => {
      const existing = await tx.patient.findUnique({ where: { id: patientId }, select: { personId: true, referenceUnitId: true } });
      if (!existing) throw new HealthOperationError("Paciente não encontrado.");
      if (existing.referenceUnitId) assertHealthUnitAccess(context.user, existing.referenceUnitId);
      if (input.referenceUnitId) assertHealthUnitAccess(context.user, input.referenceUnitId);
      if (input.personId && input.personId !== existing.personId) throw new HealthOperationError("A pessoa vinculada ao paciente deve ser preservada.");
      await requireActivePatientReferences(tx, input);
      const personData: Prisma.PersonUpdateInput = {};
      if (data.fullName !== undefined) { if (!input.fullName) throw new HealthOperationError("Informe o nome completo."); personData.fullName = input.fullName; }
      if (data.cpf !== undefined) { if (!input.cpf) throw new HealthOperationError("O CPF deste cadastro deve ser preservado."); personData.cpf = requireValidCpf(input.cpf); }
      if (data.birthDate !== undefined) personData.birthDate = input.birthDate ? new Date(`${input.birthDate}T12:00:00.000Z`) : null;
      for (const field of ["gender", "raceColor", "motherName", "fatherName", "phonePrimary", "whatsapp", "email", "profession"] as const) if (data[field] !== undefined) personData[field] = input[field];
      if (Object.keys(personData).length) await tx.person.update({ where: { id: existing.personId }, data: personData });
      const patient = await tx.patient.update({
        where: { id: patientId },
        data: {
          cns: input.cns,
          bloodType: input.bloodType,
          bloodDonor: input.bloodDonor ?? null,
          referenceUnitId: input.referenceUnitId,
          teamId: input.teamId,
        },
      });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "PATIENT", targetId: patient.id });
    });
    revalidatePatients();
    return { success: true };
  } catch (error) {
    return { error: actionError(error, "Nao foi possivel atualizar o paciente. Os dados foram preservados.") };
  }
}

export async function togglePatientStatus(id: string, currentStatus: string) {
  try {
    const input = z.object({ id: healthEntityIdSchema, currentStatus: z.enum(["Ativo", "Inativo"]) }).parse({ id, currentStatus });
    const context = await getTenantContextForModuleOperation("SAUDE", "update");
    await runHealthTransaction(context, async tx => {
      const nextStatus = input.currentStatus === "Ativo" ? "Inativo" : "Ativo";
      const updated = await tx.patient.updateMany({
        where: { id: input.id, status: input.currentStatus },
        data: { status: nextStatus },
      });
      if (updated.count === 1) {
        await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "PATIENT", targetId: input.id });
        return;
      }

      const patient = await tx.patient.findUnique({ where: { id: input.id }, select: { id: true, status: true } });
      if (!patient) throw new HealthOperationError("Paciente nao encontrado.");
      if (!["Ativo", "Inativo"].includes(patient.status)) {
        throw new HealthOperationError("O status deste paciente nao pode ser alterado por esta acao.");
      }
      if (patient.status !== nextStatus) {
        throw new HealthOperationError("O status do paciente foi alterado por outro usuario. Atualize a lista e tente novamente.");
      }
    });
    revalidatePatients();
    return { success: true };
  } catch (error) {
    return { error: actionError(error, "Nao foi possivel alterar o status do paciente.") };
  }
}

export async function deletePatient(id: string) {
  try {
    const patientId = healthEntityIdSchema.parse(id);
    const context = await getTenantContextForModuleOperation("SAUDE", "delete");
    await runHealthTransaction(context, async tx => {
      await tx.patient.delete({ where: { id: patientId } });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "PATIENT", targetId: patientId });
    });
    revalidatePatients();
    return { success: true };
  } catch (error) {
    if (hasErrorCode(error, "P2003")) return { error: "Nao e possivel excluir este paciente pois ele possui prontuarios, agendamentos ou outros vinculos." };
    return { error: actionError(error, "Nao foi possivel excluir este paciente.") };
  }
}

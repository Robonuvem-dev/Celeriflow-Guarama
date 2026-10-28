import { z } from "zod";
import { randomUUID } from "node:crypto";
import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { families, familyMembers } from "@/db/schema/master-data";
import { people } from "@/db/schema/people";
import { patients } from "@/db/schema/health-registration";
import { healthProfessionals, healthProfessionalAssignments } from "@/db/schema/health-workforce";
import { healthFamilies, healthFamilyMembers, healthTerritoryAreas, healthMicroareas, healthHouseholds, healthHomeVisits, healthHomeVisitParticipants, healthEsusForms } from "@/db/schema/health-territory";
import { medicalRecords } from "@/db/schema/health-care";
import { healthProductionFacts } from "@/db/schema/health-production";
import { runHealthTransaction } from "./health-transaction";
import type { AppContext } from "@/lib/platform/tenant-context";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import { registerProductionFactTx } from "./production-service";

export class TerritoryError extends Error {}

export async function saveArea(context: AppContext, input: { code: string; name: string; unitId?: string | null; teamId?: string | null }) {
  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  if (!code || name.length < 2) throw new TerritoryError("Informe código e nome da área.");
  if (input.unitId) assertHealthUnitAccess(context.user, input.unitId);
  else if (context.user.hasHealthAccessScope) throw new TerritoryError("Informe a unidade da área.");
  const [area] = await (context.database ?? db).insert(healthTerritoryAreas).values({ code, name, unitId: input.unitId || null, teamId: input.teamId || null }).onConflictDoUpdate({ target: healthTerritoryAreas.code, set: { name, unitId: input.unitId || null, teamId: input.teamId || null, isActive: true } }).returning({ id: healthTerritoryAreas.id });
  return area;
}

export async function saveMicroarea(context: AppContext, input: { code: string; areaId: string; agentProfessionalId?: string | null }) {
  const code = input.code.trim().toUpperCase();
  if (!code) throw new TerritoryError("Informe o código da microárea.");
  const database = context.database ?? db;
  const [area] = await database.select({ id: healthTerritoryAreas.id, unitId: healthTerritoryAreas.unitId }).from(healthTerritoryAreas).where(eq(healthTerritoryAreas.id, input.areaId)).limit(1);
  if (!area) throw new TerritoryError("Área não encontrada.");
  if (area.unitId) assertHealthUnitAccess(context.user, area.unitId);
  const [microarea] = await database.insert(healthMicroareas).values({ code, areaId: input.areaId, agentProfessionalId: input.agentProfessionalId || null }).onConflictDoUpdate({ target: [healthMicroareas.areaId, healthMicroareas.code], set: { agentProfessionalId: input.agentProfessionalId || null, isActive: true } }).returning({ id: healthMicroareas.id });
  return microarea;
}

export async function saveHousehold(context: AppContext, input: { householdCode?: string | null; microareaId?: string | null }) {
  const database = context.database ?? db;
  if (input.microareaId) {
    const [micro] = await database.select({ id: healthMicroareas.id, area: { unitId: healthTerritoryAreas.unitId } }).from(healthMicroareas).innerJoin(healthTerritoryAreas, eq(healthTerritoryAreas.id, healthMicroareas.areaId)).where(eq(healthMicroareas.id, input.microareaId)).limit(1);
    if (!micro) throw new TerritoryError("Microárea não encontrada.");
    if (micro.area.unitId) assertHealthUnitAccess(context.user, micro.area.unitId);
  }
  const code = input.householdCode?.trim() || null;
  if (code) {
    const [household] = await database.insert(healthHouseholds).values({ householdCode: code, microareaId: input.microareaId || null }).onConflictDoUpdate({ target: healthHouseholds.householdCode, set: { microareaId: input.microareaId || null, isActive: true } }).returning({ id: healthHouseholds.id });
    return household;
  }
  const [household] = await database.insert(healthHouseholds).values({ householdCode: code, microareaId: input.microareaId || null }).returning({ id: healthHouseholds.id });
  return household;
}

export async function saveFamily(context: AppContext, input: { familyCode?: string | null; householdId?: string | null; responsiblePersonId?: string | null }) {
  const database = context.database ?? db;
  if (input.householdId && !(await database.select({ id: healthHouseholds.id }).from(healthHouseholds).where(eq(healthHouseholds.id, input.householdId)).limit(1)).length) throw new TerritoryError("Domicílio não encontrado.");
  if (input.responsiblePersonId && !(await database.select({ id: people.id }).from(people).where(eq(people.id, input.responsiblePersonId)).limit(1)).length) throw new TerritoryError("Responsável não encontrado.");
  const familyCode = input.familyCode?.trim() || null;
  return runHealthTransaction(context, async (tx) => {
    const codeCandidate = familyCode ? (await tx.select().from(families).where(eq(families.code, familyCode)).limit(1))[0] : null;
    if (codeCandidate && (await tx.select({ id: healthFamilies.id }).from(healthFamilies).where(eq(healthFamilies.masterFamilyId, codeCandidate.id)).limit(1)).length) throw new TerritoryError("O código familiar já está vinculado a outra família da Saúde.");
    if (codeCandidate?.responsiblePersonId && input.responsiblePersonId && codeCandidate.responsiblePersonId !== input.responsiblePersonId) throw new TerritoryError("O código familiar pertence a outro responsável.");
    const masterFamilyId = codeCandidate?.id || null;
    const responsiblePersonId = input.responsiblePersonId || codeCandidate?.responsiblePersonId || null;
    const [masterFamily] = masterFamilyId
      ? await tx.update(families).set({ code: familyCode || undefined, responsiblePersonId: input.responsiblePersonId || undefined, status: "ATIVA" }).where(eq(families.id, masterFamilyId)).returning()
      : await tx.insert(families).values({ code: familyCode, responsiblePersonId: input.responsiblePersonId || null }).returning();
    if (input.responsiblePersonId) {
      await tx.insert(familyMembers).values({ familyId: masterFamily.id, personId: input.responsiblePersonId, kinship: "RESPONSAVEL", isRepresentative: true }).onConflictDoUpdate({ target: [familyMembers.familyId, familyMembers.personId], set: { isRepresentative: true, status: "ATIVO", leftAt: null } });
    }
    const [family] = await tx.insert(healthFamilies).values({ familyCode, householdId: input.householdId || null, responsiblePersonId, masterFamilyId: masterFamily.id }).returning({ id: healthFamilies.id });
    return family;
  });
}

export async function addFamilyMember(context: AppContext, input: { familyId: string; personId: string; kinship?: string | null }) {
  return runHealthTransaction(context, async (tx) => {
    const [family] = await tx.select({ id: healthFamilies.id, masterFamilyId: healthFamilies.masterFamilyId }).from(healthFamilies).where(eq(healthFamilies.id, input.familyId)).limit(1);
    if (!family) throw new TerritoryError("Família não encontrada.");
    if (!(await tx.select({ id: people.id }).from(people).where(eq(people.id, input.personId)).limit(1)).length) throw new TerritoryError("Pessoa não encontrada.");
    const [existing] = await tx.select({ id: healthFamilyMembers.id, familyId: healthFamilyMembers.familyId }).from(healthFamilyMembers).where(eq(healthFamilyMembers.personId, input.personId)).limit(1);
    if (existing && existing.familyId !== input.familyId) throw new TerritoryError("Pessoa já vinculada a outra família.");
    const member = existing || (await tx.insert(healthFamilyMembers).values({ familyId: input.familyId, personId: input.personId, kinship: input.kinship?.trim() || null }).returning({ id: healthFamilyMembers.id }))[0];
    if (family.masterFamilyId) await tx.insert(familyMembers).values({ familyId: family.masterFamilyId, personId: input.personId, kinship: input.kinship?.trim() || null }).onConflictDoUpdate({ target: [familyMembers.familyId, familyMembers.personId], set: { kinship: input.kinship?.trim() || null, status: "ATIVO", leftAt: null } });
    return member;
  });
}

const visitSchema = z.object({
  unitId: z.string().min(1).nullable().optional(),
  householdId: z.string().min(1).nullable().optional(),
  familyId: z.string().min(1).nullable().optional(),
  teamId: z.string().min(1).nullable().optional(),
  professionalId: z.string().min(1),
  areaId: z.string().min(1).nullable().optional(),
  microareaId: z.string().min(1).nullable().optional(),
  visitedAt: z.coerce.date(),
  actions: z.string().trim().min(3).max(2000),
  observations: z.string().trim().max(2000).nullable().optional(),
}).strict();

export async function createVisit(context: AppContext, raw: unknown) {
  const input = visitSchema.parse(raw);
  if (!input.householdId && !input.familyId) throw new TerritoryError("Informe o domicílio ou a família visitada.");
  const database = context.database ?? db;
  const [professional] = await database.select({ id: healthProfessionals.id, unitId: healthProfessionals.unitId }).from(healthProfessionals).where(eq(healthProfessionals.id, input.professionalId)).limit(1);
  if (!professional) throw new TerritoryError("Agente/profissional não encontrado.");
  const unitId = input.unitId || professional.unitId;
  if (unitId) assertHealthUnitAccess(context.user, unitId);
  else if (context.user.hasHealthAccessScope) throw new TerritoryError("Informe a unidade responsável pela visita.");
  if (unitId && professional.unitId !== unitId && !(await database.select({ id: healthProfessionalAssignments.id }).from(healthProfessionalAssignments).where(and(eq(healthProfessionalAssignments.professionalId, professional.id), eq(healthProfessionalAssignments.unitId, unitId), eq(healthProfessionalAssignments.isActive, true), or(isNull(healthProfessionalAssignments.validFrom), lte(healthProfessionalAssignments.validFrom, input.visitedAt)), or(isNull(healthProfessionalAssignments.validUntil), gte(healthProfessionalAssignments.validUntil, input.visitedAt)))).limit(1)).length) throw new TerritoryError("Profissional sem vínculo vigente na unidade da visita.");
  const [visit] = await database.insert(healthHomeVisits).values({ ...input, unitId, householdId: input.householdId || null, familyId: input.familyId || null, teamId: input.teamId || null, areaId: input.areaId || null, microareaId: input.microareaId || null, observations: input.observations || null, createdByUsuarioId: context.user.id }).returning({ id: healthHomeVisits.id });
  return visit;
}

export async function addVisitParticipant(context: AppContext, input: { visitId: string; personId: string }) {
  const database = context.database ?? db;
  const [visit] = await database.select({ id: healthHomeVisits.id, status: healthHomeVisits.status }).from(healthHomeVisits).where(eq(healthHomeVisits.id, input.visitId)).limit(1);
  if (!visit) throw new TerritoryError("Visita não encontrada.");
  if (visit.status === "CANCELADA") throw new TerritoryError("Visita cancelada não aceita participantes.");
  const [person] = await database.select({ id: people.id }).from(people).where(eq(people.id, input.personId)).limit(1);
  if (!person) throw new TerritoryError("Pessoa não encontrada.");
  const [patient] = await database.select({ id: patients.id }).from(patients).where(eq(patients.personId, input.personId)).limit(1);
  const [existing] = await database.select({ id: healthHomeVisitParticipants.id }).from(healthHomeVisitParticipants).where(and(eq(healthHomeVisitParticipants.visitId, input.visitId), eq(healthHomeVisitParticipants.personId, input.personId))).limit(1);
  if (existing) return existing;
  const [participant] = await database.insert(healthHomeVisitParticipants).values({ visitId: input.visitId, personId: input.personId, patientId: patient?.id || null }).returning({ id: healthHomeVisitParticipants.id });
  return participant;
}

const formSchema = z.object({
  kind: z.enum(["INDIVIDUAL","DOMICILIAR","VISITA","ATENDIMENTO_INDIVIDUAL","ODONTO","ATIVIDADE_COLETIVA","PROCEDIMENTOS","CONSUMO_ALIMENTAR","ATENDIMENTO_DOMICILIAR","OUTRO"]),
  householdId: z.string().min(1).nullable().optional(),
  familyId: z.string().min(1).nullable().optional(),
  personId: z.string().min(1).nullable().optional(),
  patientId: z.string().min(1).nullable().optional(),
  professionalId: z.string().min(1).nullable().optional(),
  teamId: z.string().min(1).nullable().optional(),
  unitId: z.string().min(1).nullable().optional(),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  details: z.string().trim().max(4000).nullable().optional(),
  fields: z.record(z.string(), z.unknown()).nullable().optional(),
  originMedicalRecordId: z.string().min(1).nullable().optional(),
}).strict();

function validateFormLinks(input: z.infer<typeof formSchema>) {
  // Ficha vinculada a atendimento existente não duplica: exige originMedicalRecordId apenas como vínculo
  if (["ATENDIMENTO_INDIVIDUAL","ODONTO","ATENDIMENTO_DOMICILIAR","PROCEDIMENTOS"].includes(input.kind) && !input.originMedicalRecordId && !input.patientId && !input.personId) {
    throw new TerritoryError("Ficha de atendimento exige paciente/pessoa ou vínculo com o prontuário existente.");
  }
  if (input.kind === "DOMICILIAR" && !input.householdId && !input.familyId) throw new TerritoryError("Ficha domiciliar exige domicílio ou família.");
  if (input.kind === "ATIVIDADE_COLETIVA" && !input.teamId) throw new TerritoryError("Atividade coletiva exige equipe responsável.");
  if (!input.professionalId) throw new TerritoryError("Informe o profissional responsável pela ficha.");
  if (!input.unitId) throw new TerritoryError("Informe a unidade da ficha.");
}

export async function saveForm(context: AppContext, raw: unknown) {
  const input = formSchema.parse(raw);
  validateFormLinks(input);
  const { validateEsusFields } = await import("./sisab-form-config");
  const typedError = validateEsusFields(input.kind, input.fields || {});
  if (typedError) throw new TerritoryError(typedError);
  assertHealthUnitAccess(context.user, input.unitId!);
  if (input.originMedicalRecordId) {
    const [record] = await (context.database ?? db).select({ id: medicalRecords.id, unitId: medicalRecords.unitId }).from(medicalRecords).where(eq(medicalRecords.id, input.originMedicalRecordId)).limit(1);
    if (!record) throw new TerritoryError("Prontuário de origem não encontrado.");
    assertHealthUnitAccess(context.user, record.unitId);
  }
  const [form] = await (context.database ?? db).insert(healthEsusForms).values({
      kind: input.kind,
      householdId: input.householdId || null,
      familyId: input.familyId || null,
      personId: input.personId || null,
      patientId: input.patientId || null,
      professionalId: input.professionalId || null,
      teamId: input.teamId || null,
      unitId: input.unitId || null,
      period: input.period,
      payload: { ...(input.details ? { details: input.details } : {}), ...(input.fields || {}) },
      originMedicalRecordId: input.originMedicalRecordId || null,
      idempotencyKey: randomUUID(),
      createdByUsuarioId: context.user.id,
  }).returning({ id: healthEsusForms.id });
  return form;
}

export async function finalizeForm(context: AppContext, formId: string) {
  return runHealthTransaction(context, async tx => {
    await tx.execute(sql`SELECT id FROM "HealthEsusForm" WHERE id=${formId} FOR UPDATE`);
    const [form] = await tx.select().from(healthEsusForms).where(eq(healthEsusForms.id, formId)).limit(1);
    if (!form) throw new TerritoryError("Ficha não encontrada.");
    if (form.unitId) assertHealthUnitAccess(context.user, form.unitId);
    if (form.status === "FINALIZADA") return { id: form.id };
    await tx.update(healthEsusForms).set({ status: "FINALIZADA", finalizedAt: new Date() }).where(eq(healthEsusForms.id, form.id));
    // Produção automática idempotente a partir da ficha (reutiliza a origem)
    const key = `ESUS_FORM:${form.id}`;
    const [exists] = await tx.select({ id: healthProductionFacts.id }).from(healthProductionFacts).where(eq(healthProductionFacts.idempotencyKey, key)).limit(1);
    if (!exists) {
      let patientId = form.patientId;
      if (!patientId && form.personId) {
        const [patient] = await tx.select({ id: patients.id }).from(patients).where(eq(patients.personId, form.personId)).limit(1);
        patientId = patient?.id || null;
      }
      await registerProductionFactTx(tx, { originType: "ESUS_FORM", originId: form.id, patientId, unitId: form.unitId, professionalId: form.professionalId, quantity: 1, occurredAt: new Date(), period: form.period, idempotencyKey: key });
    }
    return { id: form.id };
  });
}

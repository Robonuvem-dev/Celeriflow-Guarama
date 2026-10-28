import { z } from "zod";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { DatabaseExecutor } from "@/db/transaction";
import { employees } from "@/db/schema/administration";
import { addresses } from "@/db/schema/registry";
import { people } from "@/db/schema/people";
import { families, familyMembers } from "@/db/schema/master-data";
import { socialFamilies, socialFamilyMembers } from "@/db/schema/social";
import { patients } from "@/db/schema/health-registration";
import { healthProfessionals, healthProfessionalAssignments, healthUnits, healthTeams } from "@/db/schema/health-workforce";
import { healthSusReferences, healthSusProcedures } from "@/db/schema/health-catalogs";
import { medicalRecords, healthPerformedProcedures } from "@/db/schema/health-care";
import { healthFamilies, healthFamilyMembers, healthFamilyEvents, healthTerritoryAreas, healthMicroareas, healthHouseholds, healthHomeVisits, healthHomeVisitParticipants, healthHomeCareRequests, healthHomeCareAssessments, healthHomeCareAttendances, healthCollectiveActivities, healthFoodMarkers } from "@/db/schema/health-territory";
import { runHealthTransaction } from "./health-transaction";
import type { AppContext } from "@/lib/platform/tenant-context";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import { collectiveActivityTypes, collectivePractices, collectiveThemes, householdDetailsSchema, validateFoodMarkers } from "./primary-care-contract";
import { registerProductionFactTx } from "./production-service";
import { captureCareIndicatorContext } from "./indicator-context";
type Tx = DatabaseExecutor;

async function householdWithArea(tx: Tx, householdId: string) {
  const [row] = await tx.select({ household: healthHouseholds, microarea: healthMicroareas, area: healthTerritoryAreas, address: addresses }).from(healthHouseholds).leftJoin(healthMicroareas, eq(healthMicroareas.id, healthHouseholds.microareaId)).leftJoin(healthTerritoryAreas, eq(healthTerritoryAreas.id, healthMicroareas.areaId)).leftJoin(addresses, eq(addresses.id, healthHouseholds.addressId)).where(eq(healthHouseholds.id, householdId)).limit(1);
  if (!row) throw new Error("Domicílio não encontrado.");
  return { ...row.household, microarea: row.microarea && row.area ? { ...row.microarea, area: row.area } : null, address: row.address };
}

async function familyForAccess(tx: Tx, context: AppContext, familyId: string) {
  const [row] = await tx.select().from(healthFamilies).where(eq(healthFamilies.id, familyId)).limit(1);
  if (!row) throw new Error("Família não encontrada.");
  const household = row.householdId ? await householdWithArea(tx, row.householdId) : null;
  const [master] = row.masterFamilyId ? await tx.select().from(families).where(eq(families.id, row.masterFamilyId)).limit(1) : [];
  const members = master ? await tx.select().from(familyMembers).where(eq(familyMembers.familyId, master.id)) : [];
  const [socialProfile] = master ? await tx.select().from(socialFamilies).where(eq(socialFamilies.masterFamilyId, master.id)).limit(1) : [];
  const family = { ...row, household, masterFamily: master ? { ...master, members, socialProfile: socialProfile ?? null } : null };
  const unitId = family.unitId || family.household?.microarea?.area.unitId;
  if (unitId) assertHealthUnitAccess(context.user, unitId);
  else if (context.user.hasHealthAccessScope) throw new Error("Família sem unidade de abrangência autorizada.");
  if (!family.masterFamilyId || !family.masterFamily) throw new Error("Vincule a família ao cadastro comum antes de alterar a composição.");
  return { ...family, masterFamily: family.masterFamily };
}

async function professionalInUnit(tx: Tx, context: AppContext, unitId: string) {
  assertHealthUnitAccess(context.user, unitId);
  const [professional] = await tx.select({ id: healthProfessionals.id, unitId: healthProfessionals.unitId }).from(healthProfessionals).innerJoin(employees, eq(employees.id, healthProfessionals.employeeId)).where(and(eq(healthProfessionals.employeeId, context.user.employeeId || "__SEM_PROFISSIONAL__"), eq(healthProfessionals.isActive, true), eq(employees.isActive, true))).limit(1);
  if (!professional || professional.unitId !== unitId && !(await tx.select({ id: healthProfessionalAssignments.id }).from(healthProfessionalAssignments).where(and(eq(healthProfessionalAssignments.professionalId, professional.id), eq(healthProfessionalAssignments.unitId, unitId), eq(healthProfessionalAssignments.isActive, true))).limit(1)).length) throw new Error("Profissional autenticado sem vínculo ativo com a unidade.");
  return professional;
}

export async function savePrimaryHousehold(context: AppContext, raw: unknown) {
  const input = z.object({ id: z.string().optional(), householdCode: z.string().trim().min(1), microareaId: z.string().min(1), addressId: z.string().min(1), housingDetails: householdDetailsSchema }).strict().parse(raw);
  return runHealthTransaction(context, async tx => {
    const [row] = await tx.select({ microarea: healthMicroareas, area: healthTerritoryAreas }).from(healthMicroareas).innerJoin(healthTerritoryAreas, eq(healthTerritoryAreas.id, healthMicroareas.areaId)).where(eq(healthMicroareas.id, input.microareaId)).limit(1);
    if (!row) throw new Error("Microárea não encontrada.");
    const microarea = { ...row.microarea, area: row.area };
    if (microarea.area.unitId) assertHealthUnitAccess(context.user, microarea.area.unitId);
    else if (context.user.hasHealthAccessScope) throw new Error("Microárea sem unidade de abrangência autorizada.");
    if (!microarea.isActive || !microarea.area.isActive) throw new Error("Selecione uma área e microárea ativas.");
    if (input.id) {
      const current = await householdWithArea(tx, input.id);
      if (current.microarea?.area.unitId) assertHealthUnitAccess(context.user, current.microarea.area.unitId);
      else if (context.user.hasHealthAccessScope) throw new Error("Domicílio sem abrangência autorizada.");
    }
    if (!(await tx.select({ id: addresses.id }).from(addresses).where(eq(addresses.id, input.addressId)).limit(1)).length) throw new Error("Selecione endereço do cadastro comum.");
    const data = { householdCode: input.householdCode, microareaId: input.microareaId, addressId: input.addressId, housingDetails: input.housingDetails, isActive: true };
    const [household] = input.id ? await tx.update(healthHouseholds).set(data).where(eq(healthHouseholds.id, input.id)).returning() : await tx.insert(healthHouseholds).values(data).returning();
    return household;
  });
}

export async function savePrimaryFamily(context: AppContext, raw: unknown) {
  const input = z.object({ id: z.string().optional(), masterFamilyId: z.string().nullable(), familyCode: z.string().trim().min(1), responsiblePersonId: z.string().min(1), householdId: z.string().min(1), unitId: z.string().min(1), teamId: z.string().nullable(), classification: z.string().trim().min(1), familyType: z.string().trim().min(1) }).strict().parse(raw);
  assertHealthUnitAccess(context.user, input.unitId);
  return runHealthTransaction(context, async tx => {
    const household = await householdWithArea(tx, input.householdId);
    if (!household.addressId) throw new Error("Complete o endereço do domicílio.");
    if (!household.isActive || household.microarea?.area.unitId !== input.unitId) throw new Error("O domicílio deve pertencer à unidade de abrangência da família.");
    if (!(await tx.select({ id: people.id }).from(people).where(and(eq(people.id, input.responsiblePersonId), eq(people.status, "Ativo"))).limit(1)).length) throw new Error("Selecione uma pessoa responsável ativa.");
    if (input.teamId && !(await tx.select({ id: healthTeams.id }).from(healthTeams).where(and(eq(healthTeams.id, input.teamId), eq(healthTeams.unitId, input.unitId), eq(healthTeams.isActive, true))).limit(1)).length) throw new Error("A equipe deve pertencer à unidade de abrangência.");
    const existing = input.id ? await familyForAccess(tx, context, input.id) : null;
    if (existing && input.masterFamilyId && existing.masterFamilyId !== input.masterFamilyId) throw new Error("Preserve o cadastro familiar comum de origem.");
    const master = existing?.masterFamily || (await tx.select().from(families).where(input.masterFamilyId ? eq(families.id, input.masterFamilyId) : eq(families.code, input.familyCode)).limit(1))[0];
    if (!master && input.masterFamilyId) throw new Error("Cadastro familiar comum não encontrado.");
    const masterFamily = master || (await tx.insert(families).values({ code: input.familyCode, responsiblePersonId: input.responsiblePersonId }).returning())[0];
    const [linked] = await tx.select().from(healthFamilies).where(eq(healthFamilies.masterFamilyId, masterFamily.id)).limit(1);
    if (linked) await familyForAccess(tx, context, linked.id);
    if (linked && input.id && linked.id !== input.id) throw new Error("A família comum já possui outro perfil da Saúde.");
    await tx.update(families).set({ responsiblePersonId: input.responsiblePersonId, status: "ATIVA" }).where(eq(families.id, masterFamily.id));
    await tx.update(familyMembers).set({ isRepresentative: false }).where(and(eq(familyMembers.familyId, masterFamily.id), eq(familyMembers.isRepresentative, true)));
    await tx.insert(familyMembers).values({ familyId: masterFamily.id, personId: input.responsiblePersonId, kinship: "RESPONSAVEL", isRepresentative: true, joinedAt: new Date() }).onConflictDoUpdate({ target: [familyMembers.familyId, familyMembers.personId], set: { isRepresentative: true, status: "ATIVO", leftAt: null } });
    const data = { masterFamilyId: masterFamily.id, familyCode: input.familyCode, householdId: input.householdId, responsiblePersonId: input.responsiblePersonId, unitId: input.unitId, teamId: input.teamId, classification: input.classification, familyType: input.familyType, isActive: true };
    const [family] = linked ? await tx.update(healthFamilies).set(data).where(eq(healthFamilies.id, linked.id)).returning() : await tx.insert(healthFamilies).values(data).returning();
    const [social] = await tx.select().from(socialFamilies).where(eq(socialFamilies.masterFamilyId, masterFamily.id)).limit(1);
    if (social) {
      await tx.update(socialFamilies).set({ representativeId: input.responsiblePersonId, addressId: household.addressId }).where(eq(socialFamilies.id, social.id));
      const members = await tx.select().from(socialFamilyMembers).where(eq(socialFamilyMembers.familyId, social.id));
      for (const member of members) await tx.insert(familyMembers).values({ familyId: masterFamily.id, personId: member.personId, kinship: member.kinship, joinedAt: member.createdAt }).onConflictDoNothing({ target: [familyMembers.familyId, familyMembers.personId] });
    }
    const commonMembers = await tx.select().from(familyMembers).where(and(eq(familyMembers.familyId, masterFamily.id), eq(familyMembers.status, "ATIVO")));
    for (const member of commonMembers) {
      const [oldHealthLink] = await tx.select().from(healthFamilyMembers).where(eq(healthFamilyMembers.personId, member.personId)).limit(1);
      if (oldHealthLink && oldHealthLink.familyId !== family.id) throw new Error("Um integrante possui outro perfil familiar da Saúde. Concilie a composição antes de vincular.");
      await tx.insert(healthFamilyMembers).values({ familyId: family.id, personId: member.personId, kinship: member.kinship }).onConflictDoUpdate({ target: healthFamilyMembers.personId, set: { kinship: member.kinship } });
      if (social) {
        const [oldSocialLink] = await tx.select().from(socialFamilyMembers).where(eq(socialFamilyMembers.personId, member.personId)).limit(1);
        if (oldSocialLink && oldSocialLink.familyId !== social.id) throw new Error("Um integrante pertence a outra família social. Concilie a composição.");
        await tx.insert(socialFamilyMembers).values({ familyId: social.id, personId: member.personId, kinship: member.kinship || "Integrante", isDependent: !member.isRepresentative }).onConflictDoUpdate({ target: socialFamilyMembers.personId, set: { kinship: member.kinship || "Integrante", isDependent: !member.isRepresentative } });
      }
    }
    await tx.insert(healthFamilyEvents).values({ familyId: family.id, eventType: existing ? "UPDATED" : "CREATED", effectiveAt: new Date(), reason: "Cadastro familiar", actorUsuarioId: context.user.id, snapshot: JSON.parse(JSON.stringify({ before: existing, after: data })) });
    return family;
  });
}

export async function changePrimaryFamilyMember(context: AppContext, raw: unknown) {
  const input = z.object({ familyId: z.string().min(1), personId: z.string().min(1), kinship: z.string().trim().min(1), operation: z.enum(["JOIN", "LEAVE"]), effectiveAt: z.coerce.date(), reason: z.string().trim().min(1).max(4000) }).strict().parse(raw);
  return runHealthTransaction(context, async tx => {
    await tx.execute(sql`SELECT id FROM "HealthFamily" WHERE id=${input.familyId} FOR UPDATE`);
    const family = await familyForAccess(tx, context, input.familyId), masterFamilyId = family.masterFamily.id;
    const [before] = await tx.select().from(familyMembers).where(and(eq(familyMembers.familyId, masterFamilyId), eq(familyMembers.personId, input.personId))).limit(1);
    if (input.operation === "LEAVE") {
      if (!before || before.status !== "ATIVO") throw new Error("Integrante ativo não encontrado.");
      if (before.isRepresentative) throw new Error("Defina outro responsável antes de retirar o atual.");
      if (before.joinedAt && input.effectiveAt < before.joinedAt) throw new Error("A saída não pode anteceder a entrada na família.");
      await tx.update(familyMembers).set({ status: "INATIVO", leftAt: input.effectiveAt }).where(eq(familyMembers.id, before.id));
      await tx.delete(healthFamilyMembers).where(and(eq(healthFamilyMembers.familyId, family.id), eq(healthFamilyMembers.personId, input.personId)));
      if (family.masterFamily.socialProfile) await tx.delete(socialFamilyMembers).where(and(eq(socialFamilyMembers.familyId, family.masterFamily.socialProfile.id), eq(socialFamilyMembers.personId, input.personId)));
    } else {
      if (!(await tx.select({ id: people.id }).from(people).where(and(eq(people.id, input.personId), eq(people.status, "Ativo"))).limit(1)).length) throw new Error("Selecione uma pessoa ativa para compor a família.");
      await tx.insert(familyMembers).values({ familyId: masterFamilyId, personId: input.personId, kinship: input.kinship, joinedAt: input.effectiveAt }).onConflictDoUpdate({ target: [familyMembers.familyId, familyMembers.personId], set: { kinship: input.kinship, status: "ATIVO", joinedAt: input.effectiveAt, leftAt: null } });
      const [healthLink] = await tx.select().from(healthFamilyMembers).where(eq(healthFamilyMembers.personId, input.personId)).limit(1);
      if (healthLink && healthLink.familyId !== family.id) throw new Error("Registre a saída da outra família antes da entrada.");
      await tx.insert(healthFamilyMembers).values({ personId: input.personId, familyId: family.id, kinship: input.kinship }).onConflictDoUpdate({ target: healthFamilyMembers.personId, set: { kinship: input.kinship } });
      if (family.masterFamily?.socialProfile) {
        const [socialLink] = await tx.select().from(socialFamilyMembers).where(eq(socialFamilyMembers.personId, input.personId)).limit(1);
        if (socialLink && socialLink.familyId !== family.masterFamily.socialProfile.id) throw new Error("A pessoa pertence a outra família no perfil social. Concilie a saída.");
        await tx.insert(socialFamilyMembers).values({ personId: input.personId, familyId: family.masterFamily.socialProfile.id, kinship: input.kinship }).onConflictDoUpdate({ target: socialFamilyMembers.personId, set: { kinship: input.kinship } });
      }
    }
    await tx.insert(healthFamilyEvents).values({ familyId: family.id, eventType: input.operation, personId: input.personId, effectiveAt: input.effectiveAt, reason: input.reason, actorUsuarioId: context.user.id, snapshot: JSON.parse(JSON.stringify({ before, operation: input.operation, kinship: input.kinship })) });
    return { familyId: family.id };
  });
}

export async function movePrimaryFamily(context: AppContext, raw: unknown) {
  const input = z.object({ familyId: z.string().min(1), householdId: z.string().nullable(), outsideMunicipality: z.boolean(), effectiveAt: z.coerce.date(), reason: z.string().trim().min(1) }).strict().parse(raw);
  return runHealthTransaction(context, async tx => {
    await tx.execute(sql`SELECT id FROM "HealthFamily" WHERE id=${input.familyId} FOR UPDATE`);
    const family = await familyForAccess(tx, context, input.familyId);
    const destination = input.householdId ? await householdWithArea(tx, input.householdId) : null;
    if (!input.outsideMunicipality && !destination) throw new Error("Informe o domicílio de destino.");
    if (input.outsideMunicipality && destination) throw new Error("Para saída do município, não selecione um domicílio local.");
    if (destination && (!destination.isActive || !destination.microarea?.area.unitId)) throw new Error("Selecione domicílio ativo com unidade de abrangência.");
    if (destination?.microarea?.area.unitId) assertHealthUnitAccess(context.user, destination.microarea.area.unitId);
    await tx.update(healthFamilies).set({ householdId: input.outsideMunicipality ? null : destination?.id, ...(destination ? { unitId: destination.microarea?.area.unitId, teamId: destination.microarea?.area.teamId } : {}), isActive: !input.outsideMunicipality }).where(eq(healthFamilies.id, family.id));
    if (destination && family.masterFamily.socialProfile) await tx.update(socialFamilies).set({ addressId: destination.addressId }).where(eq(socialFamilies.id, family.masterFamily.socialProfile.id));
    const [event] = await tx.insert(healthFamilyEvents).values({ familyId: family.id, eventType: input.outsideMunicipality ? "OUTSIDE_MUNICIPALITY" : "HOUSEHOLD_TRANSFER", effectiveAt: input.effectiveAt, reason: input.reason, actorUsuarioId: context.user.id, snapshot: JSON.parse(JSON.stringify({ previousHousehold: family.household, destination })) }).returning();
    return event;
  });
}

export async function recordVisitOutcome(context: AppContext, raw: unknown) {
  const input = z.object({ visitId: z.string().min(1), personId: z.string().min(1), outcome: z.enum(["PRESENT", "ABSENT", "REFUSED"]), refusalReason: z.string().trim().max(2000).nullable(), weight: z.number().positive().max(500).nullable(), height: z.number().positive().max(3).nullable(), bloodPressure: z.string().max(30).nullable(), temperature: z.number().min(25).max(45).nullable(), heartRate: z.number().int().min(1).max(300).nullable(), bloodGlucose: z.number().min(1).max(1000).nullable() }).strict().parse(raw);
  return runHealthTransaction(context, async tx => {
    const [row] = await tx.select({ visit: healthHomeVisits, professional: healthProfessionals }).from(healthHomeVisits).innerJoin(healthProfessionals, eq(healthProfessionals.id, healthHomeVisits.professionalId)).where(eq(healthHomeVisits.id, input.visitId)).limit(1);
    if (!row) throw new Error("Visita não encontrada.");
    const visit = { ...row.visit, professional: row.professional };
    if (visit.status !== "REALIZADA" || visit.professional.employeeId !== context.user.employeeId || !visit.professional.isActive) throw new Error("A participação exige visita realizada pelo profissional autenticado.");
    const visitUnitId = visit.unitId || visit.professional.unitId;
    if (visitUnitId) assertHealthUnitAccess(context.user, visitUnitId);
    else if (context.user.hasHealthAccessScope) throw new Error("Visita sem unidade responsável acessível.");
    if (input.outcome === "REFUSED" && !input.refusalReason) throw new Error("Informe o motivo da recusa.");
    if (input.outcome !== "PRESENT" && [input.weight, input.height, input.bloodPressure, input.temperature, input.heartRate, input.bloodGlucose].some(value => value !== null)) throw new Error("Ausência ou recusa não permitem registrar medidas não coletadas.");
    if (visit.familyId && !(await tx.select({ id: healthFamilyMembers.id }).from(healthFamilyMembers).where(and(eq(healthFamilyMembers.familyId, visit.familyId), eq(healthFamilyMembers.personId, input.personId))).limit(1)).length) throw new Error("Inclua a pessoa na composição familiar antes de registrar a participação.");
    const [patient] = await tx.select({ id: patients.id }).from(patients).where(eq(patients.personId, input.personId)).limit(1);
    const data = { ...input, patientId: patient?.id || null };
    const [participant] = await tx.insert(healthHomeVisitParticipants).values(data).onConflictDoUpdate({ target: [healthHomeVisitParticipants.visitId, healthHomeVisitParticipants.personId], set: data }).returning();
    return participant;
  });
}

export async function createHomeCareRequest(context: AppContext, raw: unknown) {
  const input = z.object({ patientId: z.string().min(1), unitId: z.string().min(1), requestedAt: z.coerce.date(), reason: z.string().trim().min(1) }).strict().parse(raw);
  assertHealthUnitAccess(context.user, input.unitId);
  const database = context.database ?? db;
  if (!(await database.select({ id: patients.id }).from(patients).where(and(eq(patients.id, input.patientId), eq(patients.status, "Ativo"))).limit(1)).length || !(await database.select({ id: healthUnits.id }).from(healthUnits).where(and(eq(healthUnits.id, input.unitId), eq(healthUnits.isActive, true))).limit(1)).length) throw new Error("Selecione paciente e unidade ativos.");
  const [request] = await database.insert(healthHomeCareRequests).values({ ...input, createdByUsuarioId: context.user.id }).returning();
  return request;
}

export async function assessHomeCare(context: AppContext, raw: unknown) {
  const input = z.object({ requestId: z.string().min(1), assessedAt: z.coerce.date(), eligible: z.boolean(), modality: z.enum(["AD1", "AD2", "AD3"]), cidReferenceId: z.string().nullable(), character: z.enum(["ELETIVO", "URGENCIA"]), evaluation: z.string().trim().min(1) }).strict().parse(raw);
  return runHealthTransaction(context, async tx => {
    await tx.execute(sql`SELECT id FROM "HealthHomeCareRequest" WHERE id=${input.requestId} FOR UPDATE`);
    const [request] = await tx.select().from(healthHomeCareRequests).where(eq(healthHomeCareRequests.id, input.requestId)).limit(1);
    if (!request) throw new Error("Solicitação domiciliar não encontrada.");
    const professional = await professionalInUnit(tx, context, request.unitId);
    if (input.assessedAt < request.requestedAt) throw new Error("A avaliação deve ocorrer após a solicitação.");
    if (input.cidReferenceId && !(await tx.select({ id: healthSusReferences.id }).from(healthSusReferences).where(and(eq(healthSusReferences.id, input.cidReferenceId), eq(healthSusReferences.kind, "CID"))).limit(1)).length) throw new Error("CID não encontrado.");
    const [assessment] = await tx.insert(healthHomeCareAssessments).values({ ...input, professionalId: professional.id, actorUsuarioId: context.user.id }).returning();
    await tx.update(healthHomeCareRequests).set({ status: input.eligible ? "ELIGIBLE" : "INELIGIBLE" }).where(eq(healthHomeCareRequests.id, request.id));
    return assessment;
  });
}

export async function performHomeCare(context: AppContext, raw: unknown) {
  const input = z.object({ requestId: z.string().min(1), assessmentId: z.string().min(1), performedAt: z.coerce.date(), narrative: z.string().trim().min(1), procedureId: z.string().nullable() }).strict().parse(raw);
  return runHealthTransaction(context, async tx => {
    await tx.execute(sql`SELECT id FROM "HealthHomeCareRequest" WHERE id=${input.requestId} FOR UPDATE`);
    const [request] = await tx.select().from(healthHomeCareRequests).where(eq(healthHomeCareRequests.id, input.requestId)).limit(1);
    if (!request) throw new Error("Solicitação domiciliar não encontrada.");
    const [assessment] = await tx.select().from(healthHomeCareAssessments).where(and(eq(healthHomeCareAssessments.id, input.assessmentId), eq(healthHomeCareAssessments.requestId, request.id))).limit(1);
    if (!assessment) throw new Error("Avaliação não pertence à solicitação.");
    const [latest] = await tx.select({ id: healthHomeCareAssessments.id }).from(healthHomeCareAssessments).where(eq(healthHomeCareAssessments.requestId, request.id)).orderBy(desc(healthHomeCareAssessments.assessedAt), desc(healthHomeCareAssessments.createdAt)).limit(1);
    const professional = await professionalInUnit(tx, context, request.unitId);
    if (!assessment.eligible || latest?.id !== assessment.id || request.status !== "ELIGIBLE" || input.performedAt < assessment.assessedAt) throw new Error("O atendimento domiciliar exige a última avaliação de elegibilidade anterior e favorável.");
    if (input.procedureId && !(await tx.select({ id: healthSusProcedures.id }).from(healthSusProcedures).where(and(eq(healthSusProcedures.id, input.procedureId), eq(healthSusProcedures.isActive, true), eq(healthSusProcedures.isCurrent, true))).limit(1)).length) throw new Error("Selecione procedimento ativo.");
    const [record] = await tx.insert(medicalRecords).values({ type: "Atendimento domiciliar", date: input.performedAt, patientId: request.patientId, professionalId: professional.id, unitId: request.unitId, careContextSnapshot: await captureCareIndicatorContext(tx, professional.id, request.unitId), evolution: input.narrative, outcome: "Alta", completedAt: input.performedAt }).returning({ id: medicalRecords.id });
    if (input.procedureId) await tx.insert(healthPerformedProcedures).values({ medicalRecordId: record.id, procedureId: input.procedureId, professionalId: professional.id, performedAt: input.performedAt, quantity: 1 });
    const [attendance] = await tx.insert(healthHomeCareAttendances).values({ requestId: request.id, assessmentId: assessment.id, medicalRecordId: record.id, performedAt: input.performedAt, actorUsuarioId: context.user.id }).returning();
    return attendance;
  });
}

export async function recordCollectiveActivity(context: AppContext, raw: unknown) {
  const input = z.object({ unitId: z.string().min(1), teamId: z.string().min(1), occurredAt: z.preprocess(value => typeof value === "string" && z.iso.date().safeParse(value).success ? `${value}T12:00:00-03:00` : value, z.coerce.date()), activityType: z.enum(collectiveActivityTypes), themes: z.array(z.enum(collectiveThemes)), practices: z.array(z.enum(collectivePractices)), participantIds: z.array(z.string().min(1)), procedureId: z.string().nullable(), notes: z.string().max(4000).nullable() }).strict().parse(raw);
  return runHealthTransaction(context, async tx => {
    const professional = await professionalInUnit(tx, context, input.unitId);
    if (new Set(input.participantIds).size !== input.participantIds.length || (await tx.select({ id: people.id }).from(people).where(and(inArray(people.id, input.participantIds), eq(people.status, "Ativo")))).length !== input.participantIds.length) throw new Error("Selecione participantes ativos sem duplicação.");
    if (input.procedureId && !(await tx.select({ id: healthSusProcedures.id }).from(healthSusProcedures).where(and(eq(healthSusProcedures.id, input.procedureId), eq(healthSusProcedures.isActive, true), eq(healthSusProcedures.isCurrent, true))).limit(1)).length) throw new Error("Selecione procedimento ativo para a produção coletiva.");
    const [team] = await tx.select({ id: healthTeams.id, name: healthTeams.name, unitId: healthTeams.unitId, classification: healthTeams.classification }).from(healthTeams).where(and(eq(healthTeams.id, input.teamId), eq(healthTeams.unitId, input.unitId), eq(healthTeams.isActive, true))).limit(1);
    if (!team) throw new Error("Equipe incompatível com a unidade.");
    if (input.activityType === "EDUCATION" && !input.themes.length) throw new Error("Selecione os temas da educação em saúde.");
    if (["GROUP_CARE", "ASSESSMENT"].includes(input.activityType) && (!input.practices.length || !input.participantIds.length)) throw new Error("Atividade assistencial exige práticas e participantes.");
    if (["TEAM_MEETING", "COMMUNITY_MEETING"].includes(input.activityType) && input.procedureId) throw new Error("Reunião não gera procedimento assistencial.");
    if (input.occurredAt > new Date()) throw new Error("Atividade realizada não pode ter data futura.");
    const [activity] = await tx.insert(healthCollectiveActivities).values({ ...input, teamSnapshot: team, professionalId: professional.id, createdByUsuarioId: context.user.id }).returning();
    if (input.procedureId) await registerProductionFactTx(tx, { originType: "COLLECTIVE_ACTIVITY", originId: activity.id, unitId: input.unitId, professionalId: professional.id, procedureId: input.procedureId, quantity: 1, occurredAt: input.occurredAt, idempotencyKey: `COLLECTIVE_ACTIVITY:${activity.id}` });
    return activity;
  });
}

export async function recordFoodMarkers(context: AppContext, raw: unknown) {
  const input = z.object({ patientId: z.string().min(1), unitId: z.string().min(1), recordedAt: z.coerce.date(), ageGroup: z.enum(["UNDER_6_MONTHS", "SIX_TO_23_MONTHS", "TWO_YEARS_PLUS"]), place: z.string().trim().min(1), markers: z.unknown() }).strict().parse(raw);
  const markers = validateFoodMarkers(input.ageGroup, input.markers);
  return runHealthTransaction(context, async tx => {
    const professional = await professionalInUnit(tx, context, input.unitId);
    const [patient] = await tx.select({ person: { birthDate: people.birthDate } }).from(patients).innerJoin(people, eq(people.id, patients.personId)).where(eq(patients.id, input.patientId)).limit(1);
    if (!patient) throw new Error("Paciente não encontrado.");
    if (!patient.person.birthDate) throw new Error("Complete o nascimento antes de selecionar os marcadores por faixa etária.");
    const months = (input.recordedAt.getUTCFullYear() - patient.person.birthDate.getUTCFullYear()) * 12 + input.recordedAt.getUTCMonth() - patient.person.birthDate.getUTCMonth() - (input.recordedAt.getUTCDate() < patient.person.birthDate.getUTCDate() ? 1 : 0);
    const expected = months < 6 ? "UNDER_6_MONTHS" : months < 24 ? "SIX_TO_23_MONTHS" : "TWO_YEARS_PLUS";
    if (months < 0 || expected !== input.ageGroup) throw new Error("Os marcadores devem corresponder à idade na data da coleta.");
    const [marker] = await tx.insert(healthFoodMarkers).values({ ...input, markers, professionalId: professional.id, actorUsuarioId: context.user.id }).returning();
    return marker;
  });
}

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { AppContext } from "@/lib/platform/tenant-context";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import { collectiveActivityTypes, collectivePractices, collectiveThemes, householdDetailsSchema, validateFoodMarkers } from "./primary-care-contract";
import { registerProductionFactTx } from "./production-service";
import { captureCareIndicatorContext } from "./indicator-context";
type Tx = Prisma.TransactionClient;

async function familyForAccess(tx: Tx, context: AppContext, familyId: string) {
  const family = await tx.healthFamily.findUniqueOrThrow({ where: { id: familyId }, include: { masterFamily: { include: { members: true, socialProfile: true } }, household: { include: { microarea: { include: { area: true } }, address: true } } } });
  const unitId = family.unitId || family.household?.microarea?.area.unitId;
  if (unitId) assertHealthUnitAccess(context.user, unitId);
  else if (context.user.hasHealthAccessScope) throw new Error("Família sem unidade de abrangência autorizada.");
  if (!family.masterFamilyId || !family.masterFamily) throw new Error("Vincule a família ao cadastro comum antes de alterar a composição.");
  return family;
}

async function professionalInUnit(tx: Tx, context: AppContext, unitId: string) {
  assertHealthUnitAccess(context.user, unitId);
  const professional = await tx.healthProfessional.findFirst({ where: { employeeId: context.user.employeeId || "__SEM_PROFISSIONAL__", isActive: true, employee: { isActive: true } }, include: { assignments: { where: { isActive: true } } } });
  if (!professional || professional.unitId !== unitId && !professional.assignments.some(link => link.unitId === unitId)) throw new Error("Profissional autenticado sem vínculo ativo com a unidade.");
  return professional;
}

export async function savePrimaryHousehold(context: AppContext, raw: unknown) {
  const input = z.object({ id: z.string().optional(), householdCode: z.string().trim().min(1), microareaId: z.string().min(1), addressId: z.string().min(1), housingDetails: householdDetailsSchema }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    const microarea = await tx.healthMicroarea.findUniqueOrThrow({ where: { id: input.microareaId }, include: { area: true } });
    if (microarea.area.unitId) assertHealthUnitAccess(context.user, microarea.area.unitId);
    else if (context.user.hasHealthAccessScope) throw new Error("Microárea sem unidade de abrangência autorizada.");
    if (!microarea.isActive || !microarea.area.isActive) throw new Error("Selecione uma área e microárea ativas.");
    if (input.id) {
      const current = await tx.healthHousehold.findUniqueOrThrow({ where: { id: input.id }, include: { microarea: { include: { area: true } } } });
      if (current.microarea?.area.unitId) assertHealthUnitAccess(context.user, current.microarea.area.unitId);
      else if (context.user.hasHealthAccessScope) throw new Error("Domicílio sem abrangência autorizada.");
    }
    if (!await tx.address.count({ where: { id: input.addressId } })) throw new Error("Selecione endereço do cadastro comum.");
    const data = { householdCode: input.householdCode, microareaId: input.microareaId, addressId: input.addressId, housingDetails: input.housingDetails, isActive: true };
    return input.id ? tx.healthHousehold.update({ where: { id: input.id }, data }) : tx.healthHousehold.create({ data });
  });
}

export async function savePrimaryFamily(context: AppContext, raw: unknown) {
  const input = z.object({ id: z.string().optional(), masterFamilyId: z.string().nullable(), familyCode: z.string().trim().min(1), responsiblePersonId: z.string().min(1), householdId: z.string().min(1), unitId: z.string().min(1), teamId: z.string().nullable(), classification: z.string().trim().min(1), familyType: z.string().trim().min(1) }).strict().parse(raw);
  assertHealthUnitAccess(context.user, input.unitId);
  return context.prisma.$transaction(async tx => {
    const household = await tx.healthHousehold.findUniqueOrThrow({ where: { id: input.householdId }, include: { microarea: { include: { area: true } } } });
    if (!household.addressId) throw new Error("Complete o endereço do domicílio.");
    if (!household.isActive || household.microarea?.area.unitId !== input.unitId) throw new Error("O domicílio deve pertencer à unidade de abrangência da família.");
    if (!await tx.person.count({ where: { id: input.responsiblePersonId, status: "Ativo" } })) throw new Error("Selecione uma pessoa responsável ativa.");
    if (input.teamId && !await tx.healthTeam.count({ where: { id: input.teamId, unitId: input.unitId, isActive: true } })) throw new Error("A equipe deve pertencer à unidade de abrangência.");
    const existing = input.id ? await familyForAccess(tx, context, input.id) : null;
    if (existing && input.masterFamilyId && existing.masterFamilyId !== input.masterFamilyId) throw new Error("Preserve o cadastro familiar comum de origem.");
    const master = existing?.masterFamily || (input.masterFamilyId ? await tx.family.findUniqueOrThrow({ where: { id: input.masterFamilyId }, include: { healthProfile: true } }) : await tx.family.findUnique({ where: { code: input.familyCode }, include: { healthProfile: true } }));
    const masterFamily = master || await tx.family.create({ data: { code: input.familyCode, responsiblePersonId: input.responsiblePersonId } });
    const linked = await tx.healthFamily.findUnique({ where: { masterFamilyId: masterFamily.id } });
    if (linked) await familyForAccess(tx, context, linked.id);
    if (linked && input.id && linked.id !== input.id) throw new Error("A família comum já possui outro perfil da Saúde.");
    await tx.family.update({ where: { id: masterFamily.id }, data: { responsiblePersonId: input.responsiblePersonId, status: "ATIVA" } });
    await tx.familyMember.updateMany({ where: { familyId: masterFamily.id, isRepresentative: true }, data: { isRepresentative: false } });
    await tx.familyMember.upsert({ where: { familyId_personId: { familyId: masterFamily.id, personId: input.responsiblePersonId } }, create: { familyId: masterFamily.id, personId: input.responsiblePersonId, kinship: "RESPONSAVEL", isRepresentative: true, joinedAt: new Date() }, update: { isRepresentative: true, status: "ATIVO", leftAt: null } });
    const data = { masterFamilyId: masterFamily.id, familyCode: input.familyCode, householdId: input.householdId, responsiblePersonId: input.responsiblePersonId, unitId: input.unitId, teamId: input.teamId, classification: input.classification, familyType: input.familyType, isActive: true };
    const family = linked ? await tx.healthFamily.update({ where: { id: linked.id }, data }) : await tx.healthFamily.create({ data });
    const social = await tx.socialFamily.findUnique({ where: { masterFamilyId: masterFamily.id }, include: { members: true } });
    if (social) {
      await tx.socialFamily.update({ where: { id: social.id }, data: { representativeId: input.responsiblePersonId, addressId: household.addressId } });
      for (const member of social.members) if (!await tx.familyMember.findUnique({ where: { familyId_personId: { familyId: masterFamily.id, personId: member.personId } } })) await tx.familyMember.create({ data: { familyId: masterFamily.id, personId: member.personId, kinship: member.kinship, joinedAt: member.createdAt } });
    }
    const commonMembers = await tx.familyMember.findMany({ where: { familyId: masterFamily.id, status: "ATIVO" } });
    for (const member of commonMembers) {
      const oldHealthLink = await tx.healthFamilyMember.findUnique({ where: { personId: member.personId } });
      if (oldHealthLink && oldHealthLink.familyId !== family.id) throw new Error("Um integrante possui outro perfil familiar da Saúde. Concilie a composição antes de vincular.");
      await tx.healthFamilyMember.upsert({ where: { personId: member.personId }, create: { familyId: family.id, personId: member.personId, kinship: member.kinship }, update: { kinship: member.kinship } });
      if (social) {
        const oldSocialLink = await tx.socialFamilyMember.findUnique({ where: { personId: member.personId } });
        if (oldSocialLink && oldSocialLink.familyId !== social.id) throw new Error("Um integrante pertence a outra família social. Concilie a composição.");
        await tx.socialFamilyMember.upsert({ where: { personId: member.personId }, create: { familyId: social.id, personId: member.personId, kinship: member.kinship || "Integrante", isDependent: !member.isRepresentative }, update: { kinship: member.kinship || "Integrante", isDependent: !member.isRepresentative } });
      }
    }
    await tx.healthFamilyEvent.create({ data: { familyId: family.id, eventType: existing ? "UPDATED" : "CREATED", effectiveAt: new Date(), reason: "Cadastro familiar", actorUsuarioId: context.user.id, snapshot: JSON.parse(JSON.stringify({ before: existing, after: data })) } });
    return family;
  });
}

export async function changePrimaryFamilyMember(context: AppContext, raw: unknown) {
  const input = z.object({ familyId: z.string().min(1), personId: z.string().min(1), kinship: z.string().trim().min(1), operation: z.enum(["JOIN", "LEAVE"]), effectiveAt: z.coerce.date(), reason: z.string().trim().min(1).max(4000) }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "HealthFamily" WHERE id=${input.familyId} FOR UPDATE`;
    const family = await familyForAccess(tx, context, input.familyId), masterFamilyId = family.masterFamilyId!;
    const before = await tx.familyMember.findUnique({ where: { familyId_personId: { familyId: masterFamilyId, personId: input.personId } } });
    if (input.operation === "LEAVE") {
      if (!before || before.status !== "ATIVO") throw new Error("Integrante ativo não encontrado.");
      if (before.isRepresentative) throw new Error("Defina outro responsável antes de retirar o atual.");
      if (before.joinedAt && input.effectiveAt < before.joinedAt) throw new Error("A saída não pode anteceder a entrada na família.");
      await tx.familyMember.update({ where: { id: before.id }, data: { status: "INATIVO", leftAt: input.effectiveAt } });
      await tx.healthFamilyMember.deleteMany({ where: { familyId: family.id, personId: input.personId } });
      if (family.masterFamily?.socialProfile) await tx.socialFamilyMember.deleteMany({ where: { familyId: family.masterFamily.socialProfile.id, personId: input.personId } });
    } else {
      if (!await tx.person.count({ where: { id: input.personId, status: "Ativo" } })) throw new Error("Selecione uma pessoa ativa para compor a família.");
      await tx.familyMember.upsert({ where: { familyId_personId: { familyId: masterFamilyId, personId: input.personId } }, create: { familyId: masterFamilyId, personId: input.personId, kinship: input.kinship, joinedAt: input.effectiveAt }, update: { kinship: input.kinship, status: "ATIVO", joinedAt: input.effectiveAt, leftAt: null } });
      const healthLink = await tx.healthFamilyMember.findUnique({ where: { personId: input.personId } });
      if (healthLink && healthLink.familyId !== family.id) throw new Error("Registre a saída da outra família antes da entrada.");
      await tx.healthFamilyMember.upsert({ where: { personId: input.personId }, create: { personId: input.personId, familyId: family.id, kinship: input.kinship }, update: { kinship: input.kinship } });
      if (family.masterFamily?.socialProfile) {
        const socialLink = await tx.socialFamilyMember.findUnique({ where: { personId: input.personId } });
        if (socialLink && socialLink.familyId !== family.masterFamily.socialProfile.id) throw new Error("A pessoa pertence a outra família no perfil social. Concilie a saída.");
        await tx.socialFamilyMember.upsert({ where: { personId: input.personId }, create: { personId: input.personId, familyId: family.masterFamily.socialProfile.id, kinship: input.kinship }, update: { kinship: input.kinship } });
      }
    }
    await tx.healthFamilyEvent.create({ data: { familyId: family.id, eventType: input.operation, personId: input.personId, effectiveAt: input.effectiveAt, reason: input.reason, actorUsuarioId: context.user.id, snapshot: JSON.parse(JSON.stringify({ before, operation: input.operation, kinship: input.kinship })) } });
    return { familyId: family.id };
  });
}

export async function movePrimaryFamily(context: AppContext, raw: unknown) {
  const input = z.object({ familyId: z.string().min(1), householdId: z.string().nullable(), outsideMunicipality: z.boolean(), effectiveAt: z.coerce.date(), reason: z.string().trim().min(1) }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "HealthFamily" WHERE id=${input.familyId} FOR UPDATE`;
    const family = await familyForAccess(tx, context, input.familyId);
    const destination = input.householdId ? await tx.healthHousehold.findUniqueOrThrow({ where: { id: input.householdId }, include: { microarea: { include: { area: true } } } }) : null;
    if (!input.outsideMunicipality && !destination) throw new Error("Informe o domicílio de destino.");
    if (input.outsideMunicipality && destination) throw new Error("Para saída do município, não selecione um domicílio local.");
    if (destination && (!destination.isActive || !destination.microarea?.area.unitId)) throw new Error("Selecione domicílio ativo com unidade de abrangência.");
    if (destination?.microarea?.area.unitId) assertHealthUnitAccess(context.user, destination.microarea.area.unitId);
    await tx.healthFamily.update({ where: { id: family.id }, data: { householdId: input.outsideMunicipality ? null : destination!.id, ...(destination ? { unitId: destination.microarea!.area.unitId, teamId: destination.microarea!.area.teamId } : {}), isActive: !input.outsideMunicipality } });
    if (destination && family.masterFamily?.socialProfile) await tx.socialFamily.update({ where: { id: family.masterFamily.socialProfile.id }, data: { addressId: destination.addressId } });
    return tx.healthFamilyEvent.create({ data: { familyId: family.id, eventType: input.outsideMunicipality ? "OUTSIDE_MUNICIPALITY" : "HOUSEHOLD_TRANSFER", effectiveAt: input.effectiveAt, reason: input.reason, actorUsuarioId: context.user.id, snapshot: JSON.parse(JSON.stringify({ previousHousehold: family.household, destination })) } });
  });
}

export async function recordVisitOutcome(context: AppContext, raw: unknown) {
  const input = z.object({ visitId: z.string().min(1), personId: z.string().min(1), outcome: z.enum(["PRESENT", "ABSENT", "REFUSED"]), refusalReason: z.string().trim().max(2000).nullable(), weight: z.number().positive().max(500).nullable(), height: z.number().positive().max(3).nullable(), bloodPressure: z.string().max(30).nullable(), temperature: z.number().min(25).max(45).nullable(), heartRate: z.number().int().min(1).max(300).nullable(), bloodGlucose: z.number().min(1).max(1000).nullable() }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    const visit = await tx.healthHomeVisit.findUniqueOrThrow({ where: { id: input.visitId }, include: { professional: true } });
    if (visit.status !== "REALIZADA" || visit.professional.employeeId !== context.user.employeeId || !visit.professional.isActive) throw new Error("A participação exige visita realizada pelo profissional autenticado.");
    const visitUnitId = visit.unitId || visit.professional.unitId;
    if (visitUnitId) assertHealthUnitAccess(context.user, visitUnitId);
    else if (context.user.hasHealthAccessScope) throw new Error("Visita sem unidade responsável acessível.");
    if (input.outcome === "REFUSED" && !input.refusalReason) throw new Error("Informe o motivo da recusa.");
    if (input.outcome !== "PRESENT" && [input.weight, input.height, input.bloodPressure, input.temperature, input.heartRate, input.bloodGlucose].some(value => value !== null)) throw new Error("Ausência ou recusa não permitem registrar medidas não coletadas.");
    if (visit.familyId && !await tx.healthFamilyMember.count({ where: { familyId: visit.familyId, personId: input.personId } })) throw new Error("Inclua a pessoa na composição familiar antes de registrar a participação.");
    const patient = await tx.patient.findUnique({ where: { personId: input.personId }, select: { id: true } });
    const data = { ...input, patientId: patient?.id || null };
    return tx.healthHomeVisitParticipant.upsert({ where: { visitId_personId: { visitId: input.visitId, personId: input.personId } }, create: data, update: data });
  });
}

export async function createHomeCareRequest(context: AppContext, raw: unknown) {
  const input = z.object({ patientId: z.string().min(1), unitId: z.string().min(1), requestedAt: z.coerce.date(), reason: z.string().trim().min(1) }).strict().parse(raw);
  assertHealthUnitAccess(context.user, input.unitId);
  if (!await context.prisma.patient.count({ where: { id: input.patientId, status: "Ativo" } }) || !await context.prisma.healthUnit.count({ where: { id: input.unitId, isActive: true } })) throw new Error("Selecione paciente e unidade ativos.");
  return context.prisma.healthHomeCareRequest.create({ data: { ...input, createdByUsuarioId: context.user.id } });
}

export async function assessHomeCare(context: AppContext, raw: unknown) {
  const input = z.object({ requestId: z.string().min(1), assessedAt: z.coerce.date(), eligible: z.boolean(), modality: z.enum(["AD1", "AD2", "AD3"]), cidReferenceId: z.string().nullable(), character: z.enum(["ELETIVO", "URGENCIA"]), evaluation: z.string().trim().min(1) }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "HealthHomeCareRequest" WHERE id=${input.requestId} FOR UPDATE`;
    const request = await tx.healthHomeCareRequest.findUniqueOrThrow({ where: { id: input.requestId } });
    const professional = await professionalInUnit(tx, context, request.unitId);
    if (input.assessedAt < request.requestedAt) throw new Error("A avaliação deve ocorrer após a solicitação.");
    if (input.cidReferenceId && !await tx.healthSusReference.count({ where: { id: input.cidReferenceId, kind: "CID" } })) throw new Error("CID não encontrado.");
    const assessment = await tx.healthHomeCareAssessment.create({ data: { ...input, professionalId: professional.id, actorUsuarioId: context.user.id } });
    await tx.healthHomeCareRequest.update({ where: { id: request.id }, data: { status: input.eligible ? "ELIGIBLE" : "INELIGIBLE" } });
    return assessment;
  });
}

export async function performHomeCare(context: AppContext, raw: unknown) {
  const input = z.object({ requestId: z.string().min(1), assessmentId: z.string().min(1), performedAt: z.coerce.date(), narrative: z.string().trim().min(1), procedureId: z.string().nullable() }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "HealthHomeCareRequest" WHERE id=${input.requestId} FOR UPDATE`;
    const request = await tx.healthHomeCareRequest.findUniqueOrThrow({ where: { id: input.requestId } });
    const assessment = await tx.healthHomeCareAssessment.findFirstOrThrow({ where: { id: input.assessmentId, requestId: request.id } });
    const latest = await tx.healthHomeCareAssessment.findFirst({ where: { requestId: request.id }, orderBy: [{ assessedAt: "desc" }, { createdAt: "desc" }] });
    const professional = await professionalInUnit(tx, context, request.unitId);
    if (!assessment.eligible || latest?.id !== assessment.id || request.status !== "ELIGIBLE" || input.performedAt < assessment.assessedAt) throw new Error("O atendimento domiciliar exige a última avaliação de elegibilidade anterior e favorável.");
    if (input.procedureId && !await tx.healthSusProcedure.count({ where: { id: input.procedureId, isActive: true, isCurrent: true } })) throw new Error("Selecione procedimento ativo.");
    const record = await tx.medicalRecord.create({ data: { type: "Atendimento domiciliar", date: input.performedAt, patientId: request.patientId, professionalId: professional.id, unitId: request.unitId, careContextSnapshot: await captureCareIndicatorContext(tx, professional.id, request.unitId), evolution: input.narrative, outcome: "Alta", completedAt: input.performedAt } });
    if (input.procedureId) await tx.healthPerformedProcedure.create({ data: { medicalRecordId: record.id, procedureId: input.procedureId, professionalId: professional.id, performedAt: input.performedAt, quantity: 1 } });
    return tx.healthHomeCareAttendance.create({ data: { requestId: request.id, assessmentId: assessment.id, medicalRecordId: record.id, performedAt: input.performedAt, actorUsuarioId: context.user.id } });
  });
}

export async function recordCollectiveActivity(context: AppContext, raw: unknown) {
  const input = z.object({ unitId: z.string().min(1), teamId: z.string().min(1), occurredAt: z.preprocess(value => typeof value === "string" && z.iso.date().safeParse(value).success ? `${value}T12:00:00-03:00` : value, z.coerce.date()), activityType: z.enum(collectiveActivityTypes), themes: z.array(z.enum(collectiveThemes)), practices: z.array(z.enum(collectivePractices)), participantIds: z.array(z.string().min(1)), procedureId: z.string().nullable(), notes: z.string().max(4000).nullable() }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    const professional = await professionalInUnit(tx, context, input.unitId);
    if (new Set(input.participantIds).size !== input.participantIds.length || await tx.person.count({ where: { id: { in: input.participantIds }, status: "Ativo" } }) !== input.participantIds.length) throw new Error("Selecione participantes ativos sem duplicação.");
    if (input.procedureId && !await tx.healthSusProcedure.count({ where: { id: input.procedureId, isActive: true, isCurrent: true } })) throw new Error("Selecione procedimento ativo para a produção coletiva.");
    const team = await tx.healthTeam.findFirst({ where: { id: input.teamId, unitId: input.unitId, isActive: true }, select: { id: true, name: true, unitId: true, classification: true } });
    if (!team) throw new Error("Equipe incompatível com a unidade.");
    if (input.activityType === "EDUCATION" && !input.themes.length) throw new Error("Selecione os temas da educação em saúde.");
    if (["GROUP_CARE", "ASSESSMENT"].includes(input.activityType) && (!input.practices.length || !input.participantIds.length)) throw new Error("Atividade assistencial exige práticas e participantes.");
    if (["TEAM_MEETING", "COMMUNITY_MEETING"].includes(input.activityType) && input.procedureId) throw new Error("Reunião não gera procedimento assistencial.");
    if (input.occurredAt > new Date()) throw new Error("Atividade realizada não pode ter data futura.");
    const activity = await tx.healthCollectiveActivity.create({ data: { ...input, teamSnapshot: team, professionalId: professional.id, createdByUsuarioId: context.user.id } });
    if (input.procedureId) await registerProductionFactTx(tx, { originType: "COLLECTIVE_ACTIVITY", originId: activity.id, unitId: input.unitId, professionalId: professional.id, procedureId: input.procedureId, quantity: 1, occurredAt: input.occurredAt, idempotencyKey: `COLLECTIVE_ACTIVITY:${activity.id}` });
    return activity;
  });
}

export async function recordFoodMarkers(context: AppContext, raw: unknown) {
  const input = z.object({ patientId: z.string().min(1), unitId: z.string().min(1), recordedAt: z.coerce.date(), ageGroup: z.enum(["UNDER_6_MONTHS", "SIX_TO_23_MONTHS", "TWO_YEARS_PLUS"]), place: z.string().trim().min(1), markers: z.unknown() }).strict().parse(raw);
  const markers = validateFoodMarkers(input.ageGroup, input.markers);
  return context.prisma.$transaction(async tx => {
    const professional = await professionalInUnit(tx, context, input.unitId);
    const patient = await tx.patient.findUniqueOrThrow({ where: { id: input.patientId }, include: { person: true } });
    if (!patient.person.birthDate) throw new Error("Complete o nascimento antes de selecionar os marcadores por faixa etária.");
    const months = (input.recordedAt.getUTCFullYear() - patient.person.birthDate.getUTCFullYear()) * 12 + input.recordedAt.getUTCMonth() - patient.person.birthDate.getUTCMonth() - (input.recordedAt.getUTCDate() < patient.person.birthDate.getUTCDate() ? 1 : 0);
    const expected = months < 6 ? "UNDER_6_MONTHS" : months < 24 ? "SIX_TO_23_MONTHS" : "TWO_YEARS_PLUS";
    if (months < 0 || expected !== input.ageGroup) throw new Error("Os marcadores devem corresponder à idade na data da coleta.");
    return tx.healthFoodMarker.create({ data: { ...input, markers, professionalId: professional.id, actorUsuarioId: context.user.id } });
  });
}

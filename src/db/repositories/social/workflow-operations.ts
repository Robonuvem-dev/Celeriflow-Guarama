import { and, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { DatabaseTransaction } from "../../transaction";
import { Decimal } from "../../decimal";
import { people } from "../../schema/people";
import { addresses } from "../../schema/registry";
import { employees, roles } from "../../schema/administration";
import { familyMembers } from "../../schema/master-data";
import * as s from "../../schema/social";
import * as w from "../../schema/social-workflows";
import { saveSocialFamilyInTransaction } from "./operations";
import { assertSocialUnitAccess, type SocialAccess } from "@/lib/social/access-policy";
import { requireValidCnpj, requireValidCpf } from "@/lib/identifiers/brazilian-identifiers";
import { parseWorkflowValues, socialQuestionsSchema, validateSocialAnswers, type SocialWorkflowArea } from "@/lib/social/workflow-contract";
import { insertAuditEvent } from "../platform/audit";
import { auditEventTypes } from "@/lib/contracts/audit";
import { requireSocialProfessional, socialSubject } from "./workflow-access";
import { saveMunicipalWorkflow } from "./municipal-models";
import { readSocialParameters } from "./parameters";
import { socialVisitAttendances } from "../../schema/social-operation-models";
export { requireSocialProfessional, socialSubject } from "./workflow-access";

const date = (value: string) => new Date(`${value}T00:00:00Z`);
export async function recalculateSocialFamily(tx: DatabaseTransaction, familyId: string) {
  const [family] = await tx.select().from(s.socialFamilies).where(eq(s.socialFamilies.id, familyId));
  if (!family) throw new Error("Família não encontrada.");
  const members = await tx.select().from(s.socialFamilyMembers).where(eq(s.socialFamilyMembers.familyId, familyId));
  const count = new Set([family.representativeId, ...members.map(m => m.personId)]).size;
  await tx.update(s.socialFamilies).set({ perCapitaIncome: new Decimal(family.income || 0).div(count).toDecimalPlaces(2).toNumber() }).where(eq(s.socialFamilies.id, familyId));
}

/** Domain-specific writes; caller provides a permission-checked context and transaction. */
export async function saveSocialWorkflow(tx: DatabaseTransaction, access: SocialAccess, area: SocialWorkflowArea, id: string | undefined, raw: unknown): Promise<string> {
  const v = parseWorkflowValues(area, raw), actor = access.userId;
  if (!actor) throw new Error("Usuário não identificado.");
  if (["unidades", "profissionais", "beneficios", "programas", "parametros", "layouts"].includes(area) && !access.administrator) throw new Error("Cadastro restrito à administração.");
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`social-workflow:${area}:${id || v.cpf || v.personId || v.name || actor}`},0))`);
  if (v.unitId) {
    assertSocialUnitAccess(access, v.unitId);
    if (!(await tx.select({ id: s.socialUnits.id }).from(s.socialUnits).where(and(eq(s.socialUnits.id, v.unitId), eq(s.socialUnits.isActive, true)))).length) throw new Error("Unidade inativa ou inexistente.");
  }
  let result = id || "";
  const nullable = (key: string) => v[key] || null;
  const specialized = await saveMunicipalWorkflow(tx, access, area, id, v);
  if (specialized) { result = specialized; }
  else if (area === "unidades") {
    const values = { name: v.name, type: v.type, phone: v.phone, managerId: v.managerId, streetAddress: v.streetAddress, municipality: v.municipality, identificationCode: v.unitNumber };
    const [row] = id ? await tx.update(s.socialUnits).set(values).where(eq(s.socialUnits.id, id)).returning() : await tx.insert(s.socialUnits).values(values).returning();
    if (!row) throw new Error("Unidade não encontrada."); result = row.id;
    const details = { unitId: result, cnpj: v.cnpj ? requireValidCnpj(v.cnpj) : null, legalName: v.legalName, stateRegistration: nullable("stateRegistration"), unitNumber: v.unitNumber };
    await tx.insert(w.socialUnitRegistrations).values(details).onConflictDoUpdate({ target: w.socialUnitRegistrations.unitId, set: details });
  } else if (area === "profissionais") {
    const [role] = await tx.select().from(roles).where(and(eq(roles.id, v.roleId), eq(roles.isActive, true)));
    const [employee] = await tx.select().from(employees).where(and(eq(employees.id, v.employeeId), eq(employees.isActive, true)));
    if (!role || !employee?.personId) throw new Error("Selecione cargo ativo e servidor vinculado a pessoa física.");
    const details = { employeeId: v.employeeId, roleId: v.roleId, council: nullable("council"), registration: nullable("registration") };
    await tx.insert(w.socialProfessionalRegistrations).values(details).onConflictDoUpdate({ target: w.socialProfessionalRegistrations.employeeId, set: details });
    const values = { employeeId: v.employeeId, unitId: v.unitId, jobTitle: role.name, startsAt: date(v.startsAt), endsAt: v.endsAt ? date(v.endsAt) : null, individualScope: v.individualScope, familyScope: v.familyScope };
    const [row] = id ? await tx.update(s.socialProfessionalLinks).set(values).where(eq(s.socialProfessionalLinks.id, id)).returning() : await tx.insert(s.socialProfessionalLinks).values(values).onConflictDoUpdate({ target: [s.socialProfessionalLinks.employeeId, s.socialProfessionalLinks.unitId], set: values }).returning();
    result = row.id;
  } else if (area === "beneficiarios") {
    const cpf = requireValidCpf(v.cpf);
    if (v.nis && !/^\d{11}$/.test(v.nis)) throw new Error("NIS deve conter 11 dígitos.");
    if (v.birthDate > new Date().toISOString().slice(0, 10)) throw new Error("Nascimento não pode ser futuro.");
    const [existing] = await tx.select({ id: people.id }).from(people).where(eq(people.cpf, cpf));
    if (id && existing && existing.id !== id) throw new Error("CPF já pertence a outra pessoa.");
    const values = { fullName: v.fullName, socialName: nullable("socialName"), cpf, birthDate: date(v.birthDate), birthPlace: v.birthPlace, nationality: v.nationality, raceColor: v.raceColor, maritalStatus: v.maritalStatus, motherName: v.motherName, fatherName: v.fatherName, gender: v.gender, phonePrimary: nullable("phonePrimary"), email: nullable("email"), rg: nullable("rg") };
    if (!id && existing) {
      if (!access.administrator) throw new Error("CPF já cadastrado. Solicite à administração o vínculo inicial ao SUAS.");
      result = existing.id;
    }
    const [row] = result ? await tx.update(people).set(values).where(eq(people.id, result)).returning() : await tx.insert(people).values(values).returning();
    if (!row) throw new Error("Pessoa não encontrada."); result = row.id;
    const details = { personId: result, unitId: v.unitId, religion: nullable("religion"), birthCertificate: nullable("birthCertificate"), registeredAt: v.registeredAt };
    await tx.insert(w.socialBeneficiaryRegistrations).values(details).onConflictDoUpdate({ target: w.socialBeneficiaryRegistrations.personId, set: details });
    await tx.insert(s.socialPersonProfiles).values({ personId: result, nis: nullable("nis") }).onConflictDoUpdate({ target: s.socialPersonProfiles.personId, set: { nis: nullable("nis") } });
    const [address] = await tx.select().from(addresses).where(eq(addresses.personId, result)).orderBy(addresses.createdAt).limit(1);
    const addr = { personId: result, streetName: v.streetName, number: v.number, zipCode: nullable("zipCode"), complement: nullable("complement"), addressType: "Residencial" };
    if (address) await tx.update(addresses).set(addr).where(eq(addresses.id, address.id)); else await tx.insert(addresses).values(addr);
  } else if (area === "familias") {
    const memberships = await tx.select().from(familyMembers).where(and(eq(familyMembers.personId, v.representativeId), eq(familyMembers.status, "ATIVO")));
    const [current] = id ? await tx.select().from(s.socialFamilies).where(eq(s.socialFamilies.id, id)) : [];
    if (memberships.some(m => m.familyId !== current?.masterFamilyId)) throw new Error("Responsável já integra outra família ativa. Concilie a composição antes de transferir.");
    const saved = await saveSocialFamilyInTransaction(tx, { representativeId: v.representativeId, familyCode: v.familyCode, nis: v.nis, income: Number(v.income), vulnerabilities: v.vulnerabilities }, id);
    result = saved.id;
    await tx.insert(w.socialFamilyRegistrations).values({ familyId: result, unitId: v.unitId }).onConflictDoUpdate({ target: w.socialFamilyRegistrations.familyId, set: { unitId: v.unitId } });
    const [address] = await tx.select({ id: addresses.id }).from(addresses).where(eq(addresses.personId, v.representativeId)).orderBy(addresses.createdAt).limit(1);
    await tx.update(s.socialFamilies).set({ addressId: address?.id || null, income: Number(v.income) }).where(eq(s.socialFamilies.id, result));
    if (saved.masterFamilyId) {
      for (const member of saved.members) await tx.insert(familyMembers).values({ familyId: saved.masterFamilyId, personId: member.personId, kinship: member.kinship }).onConflictDoNothing();
    }
    await recalculateSocialFamily(tx, result);
  } else if (area === "membros") {
    const [family] = await tx.select().from(s.socialFamilies).where(eq(s.socialFamilies.id, v.familyId));
    if (!family?.masterFamilyId) throw new Error("Salve a ficha completa da família antes da composição.");
    if (family.representativeId === v.personId) throw new Error("Responsável já integra a família. Edite-o na ficha familiar.");
    const other = await tx.select().from(familyMembers).where(and(eq(familyMembers.personId, v.personId), eq(familyMembers.status, "ATIVO")));
    if (other.some(m => m.familyId !== family.masterFamilyId)) throw new Error("Pessoa já pertence a outra família ativa.");
    const [prior] = id ? await tx.select().from(s.socialFamilyMembers).where(eq(s.socialFamilyMembers.id, id)) : [];
    if (prior && (prior.personId !== v.personId || prior.familyId !== v.familyId)) throw new Error("Preserve a pessoa e família da composição existente.");
    const values = { familyId: v.familyId, personId: v.personId, kinship: v.kinship };
    const [row] = id ? await tx.update(s.socialFamilyMembers).set(values).where(eq(s.socialFamilyMembers.id, id)).returning() : await tx.insert(s.socialFamilyMembers).values(values).returning(); result = row.id;
    await tx.insert(familyMembers).values({ familyId: family.masterFamilyId, personId: v.personId, kinship: v.kinship }).onConflictDoUpdate({ target: [familyMembers.familyId, familyMembers.personId], set: { kinship: v.kinship } });
    await recalculateSocialFamily(tx, v.familyId);
  } else if (area === "beneficios") {
    const values = { name: v.name, description: v.description, isRecurrent: v.isRecurrent === "true" };
    const [row] = id ? await tx.update(s.socialBenefits).set(values).where(eq(s.socialBenefits.id, id)).returning() : await tx.insert(s.socialBenefits).values(values).returning(); result = row.id;
    await tx.insert(w.socialBenefitClassifications).values({ benefitId: result, sphere: v.sphere }).onConflictDoUpdate({ target: w.socialBenefitClassifications.benefitId, set: { sphere: v.sphere } });
  } else if (area === "programas") {
    const values = { name: v.name, sphere: v.sphere, description: v.description };
    const [row] = id ? await tx.update(s.socialPrograms).set(values).where(eq(s.socialPrograms.id, id)).returning() : await tx.insert(s.socialPrograms).values(values).returning(); result = row.id;
  } else if (area === "participacoes") {
    await socialSubject(tx, v.familyId, v.personId);
    const values = { unitId: v.unitId, familyId: nullable("familyId"), personId: nullable("personId"), programId: v.programId, registeredAt: v.registeredAt, includedAt: v.includedAt, excludedAt: nullable("excludedAt"), benefitValue: new Decimal(v.benefitValue), benefitNumber: nullable("benefitNumber"), createdBy: actor };
    const [row] = id ? await tx.update(w.socialProgramEnrollments).set(values).where(eq(w.socialProgramEnrollments.id, id)).returning() : await tx.insert(w.socialProgramEnrollments).values(values).returning(); result = row.id;
  } else if (area === "acompanhamentos") {
    await socialSubject(tx, v.familyId, v.personId); await requireSocialProfessional(tx, access, v.professionalId, v.unitId, v.startsAt);
    if ((v.status === "CLOSED") !== Boolean(v.endsAt)) throw new Error("Acompanhamento encerrado exige data de término; ativo não pode ter término.");
    const values = { unitId: v.unitId, familyId: nullable("familyId"), personId: nullable("personId"), professionalId: v.professionalId, service: v.service, startsAt: v.startsAt, endsAt: nullable("endsAt"), diagnosis: v.diagnosis, objectives: v.objectives, actions: v.actions, reviewAt: nullable("reviewAt"), status: v.status, createdBy: actor };
    const [row] = id ? await tx.update(w.socialFollowups).set(values).where(eq(w.socialFollowups.id, id)).returning() : await tx.insert(w.socialFollowups).values(values).returning(); result = row.id;
  } else if (area === "evolucoes") {
    if (id) throw new Error("Evoluções são históricas; registre um complemento.");
    const [followup] = await tx.select().from(w.socialFollowups).where(eq(w.socialFollowups.id, v.followupId));
    if (!followup) throw new Error("Acompanhamento não encontrado."); assertSocialUnitAccess(access, followup.unitId);
    if (v.occurredAt < followup.startsAt || followup.endsAt && v.occurredAt > followup.endsAt) throw new Error("Evolução fora do período do acompanhamento.");
    const [row] = await tx.insert(w.socialFollowupNotes).values({ followupId: v.followupId, occurredAt: v.occurredAt, description: v.description, nextReviewAt: nullable("nextReviewAt"), createdBy: actor }).returning(); result = row.id;
  } else if (area === "visitas") {
    await requireSocialProfessional(tx, access, v.professionalId, v.unitId, v.scheduledDate.slice(0, 10));
    if (v.status === "Realizada" && (!v.realizedDate || !v.report)) throw new Error("Informe realização e relatório.");
    if (v.status === "Cancelada" && !v.report) throw new Error("Informe o motivo do cancelamento.");
    if (v.status !== "Realizada" && v.realizedDate) throw new Error("Data de realização somente para visita realizada.");
    // datetime-local represents the municipality's wall clock, persisted without timezone conversion ambiguity.
    const values = { unitId: v.unitId, familyId: v.familyId, professionalId: v.professionalId, scheduledDate: new Date(`${v.scheduledDate}:00-03:00`), realizedDate: v.realizedDate ? new Date(`${v.realizedDate}:00-03:00`) : null, objective: v.objective, report: nullable("report"), status: v.status };
    const [row] = id ? await tx.update(s.socialVisits).set(values).where(eq(s.socialVisits.id, id)).returning() : await tx.insert(s.socialVisits).values(values).returning(); result = row.id;
    const [linked]=await tx.select().from(socialVisitAttendances).where(eq(socialVisitAttendances.visitId,row.id));
    if(row.status==="Realizada"&&row.realizedDate){
      const attendance={familyId:row.familyId,unitId:v.unitId,professionalId:row.professionalId,type:"Visita Domiciliar",description:row.report||row.objective,date:row.realizedDate,isActive:true};
      if(linked)await tx.update(s.socialAttendances).set(attendance).where(eq(s.socialAttendances.id,linked.attendanceId));else{const [created]=await tx.insert(s.socialAttendances).values(attendance).returning({id:s.socialAttendances.id});await tx.insert(socialVisitAttendances).values({visitId:row.id,attendanceId:created.id});}
    }else if(linked)await tx.update(s.socialAttendances).set({isActive:false}).where(eq(s.socialAttendances.id,linked.attendanceId));
  } else if (area === "condicionalidades") {
    if (["NONCOMPLIANCE", "SUSPENDED"].includes(v.status) && !v.occurredAt) throw new Error("Descumprimento exige data da ocorrência.");
    if (v.status === "SUSPENDED" && (!v.suspensionFrom || !v.suspensionUntil)) throw new Error("Informe período da suspensão.");
    const values = { unitId: v.unitId, personId: v.personId, programId: v.programId, kind: v.kind, dueAt: v.dueAt, occurredAt: nullable("occurredAt"), effect: v.effect, suspensionFrom: nullable("suspensionFrom"), suspensionUntil: nullable("suspensionUntil"), status: v.status, observations: v.observations, createdBy: actor };
    const [row] = id ? await tx.update(w.socialConditionalities).set(values).where(eq(w.socialConditionalities.id, id)).returning() : await tx.insert(w.socialConditionalities).values(values).returning(); result = row.id;
  } else if (area === "formularios") {
    const questions = socialQuestionsSchema.parse(JSON.parse(v.questions));
    const [prior] = id ? await tx.select().from(w.socialQuestionnaires).where(eq(w.socialQuestionnaires.id, id)) : [];
    if (prior && !prior.isActive) throw new Error("Esta versão já foi substituída. Abra a versão vigente para continuar.");
    if (prior) await tx.update(w.socialQuestionnaires).set({ isActive: false }).where(eq(w.socialQuestionnaires.id, prior.id));
    const [row] = await tx.insert(w.socialQuestionnaires).values({ unitId: v.unitId, title: v.title, version: prior ? prior.version + 1 : 1, previousId: prior?.id, questions, createdBy: actor }).returning(); result = row.id;
  } else if (area === "respostas") {
    if (id) throw new Error("Respostas são históricas; registre nova resposta.");
    await socialSubject(tx, v.familyId, v.personId);
    const [questionnaire] = await tx.select().from(w.socialQuestionnaires).where(and(eq(w.socialQuestionnaires.id, v.questionnaireId), eq(w.socialQuestionnaires.isActive, true)));
    if (!questionnaire) throw new Error("Formulário/versão inativo."); assertSocialUnitAccess(access, questionnaire.unitId);
    const answers = validateSocialAnswers(questionnaire.questions, JSON.parse(v.answers));
    const [row] = await tx.insert(w.socialQuestionnaireResponses).values({ questionnaireId: v.questionnaireId, familyId: nullable("familyId"), personId: nullable("personId"), answeredAt: v.answeredAt, answers, createdBy: actor }).returning(); result = row.id;
  } else if (area === "scfv") {
    if (!Number.isInteger(Number(v.ageMin)) || !Number.isInteger(Number(v.ageMax)) || Number(v.ageMax) < Number(v.ageMin) || Number(v.ageMax) > 130) throw new Error("Faixa etária inválida.");
    if (v.endTime <= v.startTime) throw new Error("Horário final deve ser posterior ao inicial.");
    const weekdays: unknown = JSON.parse(v.weekdays);
    if (!Array.isArray(weekdays) || !weekdays.length || weekdays.some(n => !Number.isInteger(n) || n < 0 || n > 6)) throw new Error("Selecione os dias da semana.");
    await requireSocialProfessional(tx, access, v.professionalId, v.unitId, v.startsAt);
    for (const professionalId of new Set([v.referenceProfessionalId, v.advisorId, v.facilitatorId])) await requireSocialProfessional(tx, access, professionalId, v.unitId, v.startsAt, false);
    const values = { unitId: v.unitId, realizationUnitId: v.realizationUnitId, name: v.name, serviceType: v.serviceType, ageMin: Number(v.ageMin), ageMax: Number(v.ageMax), registeredAt: v.registeredAt, startsAt: v.startsAt, endsAt: v.endsAt, professionalId: v.professionalId, referenceProfessionalId: v.referenceProfessionalId, advisorId: v.advisorId, facilitatorId: v.facilitatorId, weekdays: [...new Set(weekdays as number[])], startTime: v.startTime, endTime: v.endTime, createdBy: actor };
    const [row] = id ? await tx.update(w.socialScfvGroups).set(values).where(eq(w.socialScfvGroups.id, id)).returning() : await tx.insert(w.socialScfvGroups).values(values).returning(); result = row.id;
  } else if (area === "matriculas") {
    const [group] = await tx.select().from(w.socialScfvGroups).where(eq(w.socialScfvGroups.id, v.groupId));
    if (!group?.isActive) throw new Error("SCFV inativo/inexistente."); assertSocialUnitAccess(access, group.unitId);
    const [person] = await tx.select().from(people).where(eq(people.id, v.personId));
    if (!person?.birthDate || person.status !== "Ativo") throw new Error("Beneficiário ativo com nascimento obrigatório.");
    const birth = person.birthDate.toISOString().slice(0, 10), on = v.enrolledAt;
    const age = Number(on.slice(0, 4)) - Number(birth.slice(0, 4)) - (on.slice(5) < birth.slice(5) ? 1 : 0);
    if (age < group.ageMin || age > group.ageMax || on < group.startsAt || on > group.endsAt) throw new Error("Matrícula fora da faixa etária/período do SCFV.");
    if (v.leftAt && !v.exitReason) throw new Error("Informe motivo do desligamento.");
    const [prior] = id ? await tx.select().from(w.socialScfvEnrollments).where(eq(w.socialScfvEnrollments.id, id)) : [];
    if (prior && (prior.groupId !== v.groupId || prior.personId !== v.personId || prior.enrolledAt !== v.enrolledAt)) throw new Error("Preserve SCFV, pessoa e data de matrícula; desligue e crie nova matrícula para mudança de grupo.");
    const values = { groupId: v.groupId, personId: v.personId, enrolledAt: v.enrolledAt, leftAt: nullable("leftAt"), exitReason: nullable("exitReason"), createdBy: actor };
    const [row] = id ? await tx.update(w.socialScfvEnrollments).set(values).where(eq(w.socialScfvEnrollments.id, id)).returning() : await tx.insert(w.socialScfvEnrollments).values(values).returning(); result = row.id;
  } else if (area === "eventos") {
    const [group] = await tx.select().from(w.socialScfvGroups).where(eq(w.socialScfvGroups.id, v.groupId));
    if (!group) throw new Error("SCFV não encontrado."); assertSocialUnitAccess(access, group.unitId);
    if (v.occursAt < group.startsAt || v.occursAt > group.endsAt) throw new Error("Evento fora do período do SCFV.");
    if (v.status !== "PLANNED" && !v.report) throw new Error("Informe relatório da execução ou motivo do cancelamento.");
    if (id) {
      const [prior] = await tx.select().from(w.socialScfvEvents).where(eq(w.socialScfvEvents.id, id));
      const hasAttendance = (await tx.select({ id: w.socialScfvAttendance.id }).from(w.socialScfvAttendance).where(eq(w.socialScfvAttendance.eventId, id)).limit(1)).length;
      if (hasAttendance && prior && (prior.groupId !== v.groupId || prior.occursAt !== v.occursAt)) throw new Error("Evento com chamada não pode mudar SCFV ou data. Preserve o histórico e registre novo encontro.");
    }
    const values = { groupId: v.groupId, title: v.title, occursAt: v.occursAt, planning: v.planning, status: v.status, report: v.report, createdBy: actor };
    const [row] = id ? await tx.update(w.socialScfvEvents).set(values).where(eq(w.socialScfvEvents.id, id)).returning() : await tx.insert(w.socialScfvEvents).values(values).returning(); result = row.id;
  } else if (area === "presencas") {
    const [event] = await tx.select({ event: w.socialScfvEvents, unitId: w.socialScfvGroups.unitId }).from(w.socialScfvEvents).innerJoin(w.socialScfvGroups, eq(w.socialScfvGroups.id, w.socialScfvEvents.groupId)).where(eq(w.socialScfvEvents.id, v.eventId));
    const [enrollment] = await tx.select().from(w.socialScfvEnrollments).where(eq(w.socialScfvEnrollments.id, v.enrollmentId));
    if (!event || !enrollment || event.event.groupId !== enrollment.groupId || event.event.status !== "REALIZED") throw new Error("Selecione evento realizado e matrícula do mesmo SCFV.");
    assertSocialUnitAccess(access, event.unitId);
    if (enrollment.enrolledAt > event.event.occursAt || enrollment.leftAt && enrollment.leftAt < event.event.occursAt) throw new Error("Matrícula não vigente no evento.");
    const values = { eventId: v.eventId, enrollmentId: v.enrollmentId, present: v.present === "true", justification: nullable("justification"), createdBy: actor };
    const [row] = await tx.insert(w.socialScfvAttendance).values(values).onConflictDoUpdate({ target: [w.socialScfvAttendance.eventId, w.socialScfvAttendance.enrollmentId], set: values }).returning(); result = row.id;
  } else if (area === "anexos") {
    if (Boolean(v.eventId) === Boolean(v.personId)) throw new Error("Vincule a um evento ou pessoa, exclusivamente.");
    if (v.eventId) {
      const [event] = await tx.select({ unitId: w.socialScfvGroups.unitId }).from(w.socialScfvEvents).innerJoin(w.socialScfvGroups, eq(w.socialScfvGroups.id, w.socialScfvEvents.groupId)).where(eq(w.socialScfvEvents.id, v.eventId));
      if (event?.unitId !== v.unitId) throw new Error("Evento fora da unidade.");
    }
    const [row] = await tx.insert(w.socialAttachments).values({ unitId: v.unitId, eventId: nullable("eventId"), personId: nullable("personId"), documentId: v.documentId, caption: v.caption, createdBy: actor }).returning(); result = row.id;
  } else if (area === "comunicacoes") {
    if (id) throw new Error("Mensagens preservam o lote original.");
    if (v.body.length > 600) throw new Error("Mensagem deve ter até 600 caracteres.");
    const settings=await readSocialParameters(tx);const [origin]=await tx.select().from(s.socialUnits).where(eq(s.socialUnits.id,v.unitId));
    const body=v.body.replaceAll("{unidade}",origin.name).replaceAll("{condicionalidade}",v.conditionalityKind||"atualização cadastral").replaceAll("{prazo}",v.dueAt.split("-").reverse().join("/"));
    if(body.length>600)throw new Error("O texto final excede 600 caracteres; ajuste o modelo de mensagem.");
    const enrollments = await tx.select().from(w.socialProgramEnrollments).where(and(eq(w.socialProgramEnrollments.unitId, v.unitId), eq(w.socialProgramEnrollments.programId, v.programId), lte(w.socialProgramEnrollments.includedAt, v.dueAt), or(isNull(w.socialProgramEnrollments.excludedAt), gte(w.socialProgramEnrollments.excludedAt, v.dueAt))));
    let count = 0;
    const phones=new Set<string>();
    for (const enrollment of enrollments) {
      const members = enrollment.personId ? [enrollment.personId] : (await tx.select({ personId: familyMembers.personId }).from(familyMembers).innerJoin(s.socialFamilies, eq(s.socialFamilies.masterFamilyId, familyMembers.familyId)).where(and(eq(s.socialFamilies.id, enrollment.familyId!), eq(familyMembers.status, "ATIVO")))).map(p => p.personId);
      if (!members.length) continue;
      const recipients = await tx.select().from(people).where(inArray(people.id, members));
      for (const p of recipients) if (p.phonePrimary && p.status === "Ativo") {
        const phone=p.phonePrimary.replace(/\D/g,"");if(phones.has(phone))continue;phones.add(phone);
        await tx.insert(w.socialMessages).values({ unitId: v.unitId, personId: p.id, programEnrollmentId: enrollment.id, phone: p.phonePrimary, body, dueAt: v.dueAt, status: settings.parameters.smsProvider==="QUEUE"?"AWAITING_PROVIDER":"QUEUED", dedupeKey: `${v.programId}:${phone}:${v.dueAt}:${body}`, createdBy: actor }).onConflictDoNothing(); count++;
      }
    }
    if (!count) throw new Error("Nenhum participante vigente com telefone no programa/unidade."); result = v.programId;
  }
  if (!result) throw new Error("Operação não produziu registro.");
  await tx.insert(w.socialWorkflowRevisions).values({ area, recordId: result, values: v, actorId: actor });
  await insertAuditEvent(tx, { actorUsuarioId: actor, eventType: auditEventTypes.administrativeMutation, targetType: `SocialWorkflow:${area}`, targetId: result });
  return result;
}

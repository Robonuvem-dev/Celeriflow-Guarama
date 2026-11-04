import { and, asc, desc, eq, inArray, ne, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { DatabaseExecutor } from "../../transaction";
import { people } from "../../schema/people";
import { employees, roles } from "../../schema/administration";
import { addresses, documents } from "../../schema/registry";
import * as s from "../../schema/social";
import * as w from "../../schema/social-workflows";
import type { SocialAccess } from "@/lib/social/access-policy";
import type { SocialWorkflowArea, SocialWorkflowData, SocialWorkflowRow } from "@/lib/social/workflow-contract";
import * as m from "../../schema/social-operation-models";
import { readSocialParameters } from "./parameters";
import { socialCaseFileWhere } from "./workflow-access";
import { socialDocumentTemplates } from "@/lib/social/document-templates";
import { defaultImportLayout } from "@/lib/social/municipal-contract";

export function socialWorkflowScope(access: SocialAccess, column: AnyPgColumn): SQL {
  return access.administrator ? sql`true` : inArray(column, access.links.map(l => l.unitId));
}
function strings(input: object): Record<string, string> {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, value === null || value === undefined ? "" : value instanceof Date ? value.toISOString().slice(0, 10) : typeof value === "object" ? JSON.stringify(value) : String(value)]));
}
const instantLocal = (date: Date | null) => date ? new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date).replace(" ", "T") : "";
export async function readSocialWorkflow(database: DatabaseExecutor, access: SocialAccess, area: SocialWorkflowArea): Promise<SocialWorkflowData> {
  const settings = await readSocialParameters(database);
  const [unitRows, personRows, employeeRows, roleRows, familyRows, programRows, groupRows, eventRows, enrollmentRows, questionnaireRows, followupRows] = await Promise.all([
    database.select().from(s.socialUnits).where(socialWorkflowScope(access, s.socialUnits.id)).orderBy(asc(s.socialUnits.name)),
    database.select({ person: people, registration: w.socialBeneficiaryRegistrations }).from(people).leftJoin(w.socialBeneficiaryRegistrations, eq(w.socialBeneficiaryRegistrations.personId, people.id)).where(access.administrator ? undefined : socialWorkflowScope(access, w.socialBeneficiaryRegistrations.unitId)).orderBy(asc(people.fullName)),
    database.select().from(employees).where(eq(employees.isActive, true)).orderBy(asc(employees.name)),
    database.select().from(roles).where(eq(roles.isActive, true)).orderBy(asc(roles.name)),
    database.select({ family: s.socialFamilies, registration: w.socialFamilyRegistrations }).from(s.socialFamilies).leftJoin(w.socialFamilyRegistrations, eq(w.socialFamilyRegistrations.familyId, s.socialFamilies.id)).where(access.administrator ? undefined : socialWorkflowScope(access, w.socialFamilyRegistrations.unitId)),
    database.select().from(s.socialPrograms).orderBy(asc(s.socialPrograms.name)),
    database.select().from(w.socialScfvGroups).where(socialWorkflowScope(access, w.socialScfvGroups.unitId)).orderBy(asc(w.socialScfvGroups.name)),
    database.select({ event: w.socialScfvEvents, unitId: w.socialScfvGroups.unitId }).from(w.socialScfvEvents).innerJoin(w.socialScfvGroups, eq(w.socialScfvGroups.id, w.socialScfvEvents.groupId)).where(socialWorkflowScope(access, w.socialScfvGroups.unitId)).orderBy(desc(w.socialScfvEvents.occursAt)),
    database.select({ enrollment: w.socialScfvEnrollments, unitId: w.socialScfvGroups.unitId }).from(w.socialScfvEnrollments).innerJoin(w.socialScfvGroups, eq(w.socialScfvGroups.id, w.socialScfvEnrollments.groupId)).where(socialWorkflowScope(access, w.socialScfvGroups.unitId)),
    database.select().from(w.socialQuestionnaires).where(socialWorkflowScope(access, w.socialQuestionnaires.unitId)).orderBy(desc(w.socialQuestionnaires.createdAt)),
    database.select().from(w.socialFollowups).where(and(socialWorkflowScope(access, w.socialFollowups.unitId), access.administrator || access.links.some(l => l.familyScope !== "OWN" || l.individualScope !== "OWN") ? undefined : eq(w.socialFollowups.professionalId, access.employeeId || ""))),
  ]);
  const personName = (id: string | null) => personRows.find(p => p.person.id === id)?.person.fullName || "—";
  const familyName = (id: string | null) => { const family = familyRows.find(f => f.family.id === id)?.family; return family ? `${family.familyCode || "Sem código"} — ${personName(family.representativeId)}` : "—"; };
  const groupName = (id: string) => groupRows.find(g => g.id === id)?.name || "—";
  const unitName = (id: string) => unitRows.find(u => u.id === id)?.name || "—";
  const rows: SocialWorkflowRow[] = [];
  const add = (id: string, title: string, unitId: string, date: string, status: string, values: object, detail = "", immutable = false) => rows.push({ id, title, unitId, date, status, values: strings(values), detail, immutable });
  if (area === "parametros") {
    add("municipal", "Configuração municipal vigente", "", settings.updatedAt?.toISOString().slice(0, 10) || new Date().toISOString().slice(0, 10), `Revisão ${settings.revision}`, { ...settings.parameters, revision: settings.revision }, `Modelos ${settings.parameters.modelVersion}; canal SMS ${settings.parameters.smsProvider}`);
  } else if (area === "layouts") {
    const records = await database.select().from(m.socialImportLayouts).orderBy(desc(m.socialImportLayouts.createdAt));
    for (const row of records) add(row.id, `${row.name} — ${row.version}`, "", row.createdAt.toISOString().slice(0, 10), row.isActive ? "Ativo" : "Versão anterior", { name: row.name, version: row.version, ...row.configuration, delimiter:row.configuration.delimiter==="\t"?"TAB":row.configuration.delimiter }, Object.entries(row.configuration.mapping).map(([key,value]) => `${key}: ${value}`).join("\n"), !row.isActive);
  } else if (area === "prontuarios") {
    const records = await database.select().from(m.socialCaseFiles).where(socialCaseFileWhere(access)).orderBy(desc(m.socialCaseFiles.receivedAt));
    for (const row of records) add(row.id, row.familyId ? familyName(row.familyId) : personName(row.personId), row.unitId, row.receivedAt, row.status, { ...row, ...row.sections }, `${row.initialDemand}\n${row.sections.diagnosis || ""}`);
  } else if (area === "mensal") {
    const records = await database.select().from(m.socialMonthlyStatements).where(socialWorkflowScope(access, m.socialMonthlyStatements.unitId)).orderBy(desc(m.socialMonthlyStatements.competence));
    for (const row of records) add(row.id, `${unitName(row.unitId)} — ${row.competence}`, row.unitId, `${row.competence}-01`, row.status, row, `Versão ${row.version}\n${row.observations}\n${row.snapshot.indicators.map(i => `${i.code}: ${i.value ?? "Não informado"} — ${i.label}`).join("\n")}`);
  } else if (area === "documentos") {
    const records = await database.select().from(m.socialIssuedDocuments).where(socialWorkflowScope(access, m.socialIssuedDocuments.unitId)).orderBy(desc(m.socialIssuedDocuments.createdAt));
    for (const row of records) add(row.id, `${row.model.title} — ${row.values.person || row.familyId && familyName(row.familyId) || personName(row.personId)}`, row.unitId, row.createdAt.toISOString().slice(0, 10), row.status, { ...row, documentData: row.values }, Object.entries(row.values).map(([key,value]) => `${key}: ${value}`).join("\n"), row.status === "ISSUED");
  } else if (area === "unidades") {
    const registrations = await database.select().from(w.socialUnitRegistrations);
    for (const row of unitRows) { const extra = registrations.find(r => r.unitId === row.id); add(row.id, row.name, row.id, row.createdAt.toISOString().slice(0, 10), row.isActive ? "Ativo" : "Inativo", { ...row, ...extra, unitNumber: extra?.unitNumber || row.identificationCode }, row.streetAddress || ""); }
  } else if (area === "profissionais") {
    const rows = await database.select({ link: s.socialProfessionalLinks, registration: w.socialProfessionalRegistrations }).from(s.socialProfessionalLinks).leftJoin(w.socialProfessionalRegistrations, eq(w.socialProfessionalRegistrations.employeeId, s.socialProfessionalLinks.employeeId)).where(socialWorkflowScope(access, s.socialProfessionalLinks.unitId));
    for (const { link, registration } of rows) add(link.id, employeeRows.find(e => e.id === link.employeeId)?.name || "—", link.unitId, link.startsAt.toISOString().slice(0, 10), link.isActive ? "Ativo" : "Inativo", { ...link, ...registration, startsAt: link.startsAt, endsAt: link.endsAt });
  } else if (area === "beneficiarios") {
    const ids = personRows.map(p => p.person.id);
    const profiles = ids.length ? await database.select().from(s.socialPersonProfiles).where(inArray(s.socialPersonProfiles.personId, ids)) : [];
    const addressRows = ids.length ? await database.select().from(addresses).where(inArray(addresses.personId, ids)).orderBy(asc(addresses.createdAt)) : [];
    for (const { person, registration } of personRows.filter(p => p.registration)) add(person.id, person.fullName, registration!.unitId, registration!.registeredAt, "Beneficiário", { ...person, ...registration, ...profiles.find(p => p.personId === person.id), ...addressRows.find(a => a.personId === person.id) }, person.cpf || "");
  } else if (area === "familias") {
    for (const { family, registration } of familyRows) add(family.id, familyName(family.id), registration?.unitId || "", family.createdAt.toISOString().slice(0, 10), family.status, { ...family, unitId: registration?.unitId }, `Renda: ${family.income || 0}; per capita: ${family.perCapitaIncome || 0}`);
  } else if (area === "membros") {
    const members = familyRows.length ? await database.select().from(s.socialFamilyMembers).where(inArray(s.socialFamilyMembers.familyId, familyRows.map(f => f.family.id))) : [];
    for (const member of members) add(member.id, personName(member.personId), familyRows.find(f => f.family.id === member.familyId)?.registration?.unitId || "", member.createdAt.toISOString().slice(0, 10), member.kinship, { ...member, unitId: familyRows.find(f => f.family.id === member.familyId)?.registration?.unitId }, familyName(member.familyId));
  } else if (area === "beneficios") {
    const benefits = await database.select({ benefit: s.socialBenefits, classification: w.socialBenefitClassifications }).from(s.socialBenefits).leftJoin(w.socialBenefitClassifications, eq(w.socialBenefitClassifications.benefitId, s.socialBenefits.id));
    for (const { benefit, classification } of benefits) add(benefit.id, benefit.name, "", benefit.createdAt.toISOString().slice(0, 10), classification?.sphere || "Não classificado", { ...benefit, sphere: classification?.sphere || "Municipal" }, benefit.description || "");
  } else if (area === "programas") {
    for (const p of programRows) add(p.id, p.name, "", p.createdAt.toISOString().slice(0, 10), p.sphere, p, p.description || "");
  } else if (area === "participacoes") {
    const records = await database.select().from(w.socialProgramEnrollments).where(socialWorkflowScope(access, w.socialProgramEnrollments.unitId));
    for (const p of records) add(p.id, p.personId ? personName(p.personId) : familyName(p.familyId), p.unitId, p.includedAt, p.excludedAt ? "Desligado" : "Incluído", p, `${programRows.find(x => x.id === p.programId)?.name || ""} — R$ ${p.benefitValue.toString()} — ${p.benefitNumber || "sem número"}`);
  } else if (area === "acompanhamentos") {
    for (const p of followupRows) add(p.id, p.personId ? personName(p.personId) : familyName(p.familyId), p.unitId, p.startsAt, p.status, p, `${p.service}\n${p.diagnosis}\nObjetivos: ${p.objectives}\nAções: ${p.actions}`);
  } else if (area === "evolucoes") {
    const notes = followupRows.length ? await database.select().from(w.socialFollowupNotes).where(inArray(w.socialFollowupNotes.followupId, followupRows.map(f => f.id))).orderBy(desc(w.socialFollowupNotes.occurredAt)) : [];
    for (const p of notes) add(p.id, p.description, followupRows.find(f => f.id === p.followupId)!.unitId, p.occurredAt, "Registrada", p, p.description, true);
  } else if (area === "visitas") {
    const records = await database.select().from(s.socialVisits).where(and(socialWorkflowScope(access, s.socialVisits.unitId), access.administrator ? undefined : eq(s.socialVisits.professionalId, access.employeeId || ""))).orderBy(desc(s.socialVisits.scheduledDate));
    for (const p of records) add(p.id, familyName(p.familyId), p.unitId || "", p.scheduledDate.toISOString().slice(0, 10), p.status, { ...p, scheduledDate: instantLocal(p.scheduledDate), realizedDate: instantLocal(p.realizedDate) }, `${p.objective}\n${p.report || ""}`);
  } else if (area === "condicionalidades") {
    const records = await database.select().from(w.socialConditionalities).where(socialWorkflowScope(access, w.socialConditionalities.unitId));
    for (const p of records) add(p.id, `${personName(p.personId)} — ${p.kind}`, p.unitId, p.dueAt, p.status, p, `${p.effect}\n${p.observations}`);
  } else if (area === "formularios") {
    for (const p of questionnaireRows) add(p.id, `${p.title} — v${p.version}`, p.unitId, p.createdAt.toISOString().slice(0, 10), p.isActive ? "Ativo" : "Versão anterior", p, p.questions.map(q => `${q.label} (${q.type})`).join("\n"));
  } else if (area === "respostas") {
    const responses = questionnaireRows.length ? await database.select().from(w.socialQuestionnaireResponses).where(inArray(w.socialQuestionnaireResponses.questionnaireId, questionnaireRows.map(q => q.id))) : [];
    for (const p of responses) { const q = questionnaireRows.find(q => q.id === p.questionnaireId)!; add(p.id, `${q.title} — ${p.personId ? personName(p.personId) : familyName(p.familyId)}`, q.unitId, p.answeredAt, `v${q.version}`, p, q.questions.map(question => `${question.label}: ${Array.isArray(p.answers[question.key]) ? (p.answers[question.key] as string[]).join(", ") : String(p.answers[question.key] ?? "—")}`).join("\n"), true); }
  } else if (area === "scfv") {
    for (const p of groupRows) add(p.id, p.name, p.unitId, p.startsAt, p.isActive ? "Ativo" : "Inativo", p, `${p.serviceType} — ${p.ageMin} a ${p.ageMax} anos — ${p.startTime} a ${p.endTime}`);
  } else if (area === "matriculas") {
    for (const { enrollment: p, unitId } of enrollmentRows) add(p.id, personName(p.personId), unitId, p.enrolledAt, p.leftAt ? "Desligado" : "Matriculado", p, groupName(p.groupId));
  } else if (area === "eventos") {
    for (const { event: p, unitId } of eventRows) add(p.id, p.title, unitId, p.occursAt, p.status, p, `${groupName(p.groupId)}\nPlanejamento: ${p.planning}\nRelatório: ${p.report}`);
  } else if (area === "presencas") {
    const records = eventRows.length ? await database.select().from(w.socialScfvAttendance).where(inArray(w.socialScfvAttendance.eventId, eventRows.map(e => e.event.id))) : [];
    for (const p of records) { const event = eventRows.find(e => e.event.id === p.eventId)!; const enrollment = enrollmentRows.find(e => e.enrollment.id === p.enrollmentId); add(p.id, `${personName(enrollment?.enrollment.personId || null)} — ${event.event.title}`, event.unitId, event.event.occursAt, p.present ? "Presente" : "Ausente", p, p.justification || ""); }
  } else if (area === "anexos") {
    const records = await database.select({ attachment: w.socialAttachments, document: documents }).from(w.socialAttachments).innerJoin(documents, eq(documents.id, w.socialAttachments.documentId)).where(and(socialWorkflowScope(access, w.socialAttachments.unitId), ne(documents.status, "Arquivado")));
    for (const { attachment: p, document } of records) add(p.id, p.caption, p.unitId, p.createdAt.toISOString().slice(0, 10), document.documentType, p, `${document.title}`, true);
  } else if (area === "comunicacoes") {
    const records = await database.select().from(w.socialMessages).where(socialWorkflowScope(access, w.socialMessages.unitId)).orderBy(desc(w.socialMessages.createdAt));
    for (const p of records) add(p.id, personName(p.personId), p.unitId, p.dueAt, p.status, p, `${p.phone}\n${p.body}\n${p.lastError || ""}`, true);
  }
  const links = await database.select().from(s.socialProfessionalLinks).where(and(eq(s.socialProfessionalLinks.isActive, true), socialWorkflowScope(access, s.socialProfessionalLinks.unitId)));
  const allowedEmployeeIds = new Set(links.map(l => l.employeeId));
  const documentRows = area === "anexos" ? await database.select({ id: documents.id, name: documents.title }).from(documents).where(and(ne(documents.status, "Arquivado"), access.administrator ? undefined : inArray(documents.personId, personRows.map(p => p.person.id)))) : [];
  const personOptions = personRows.map(p => ({ id: p.person.id, name: p.person.fullName }));
  const ownProfessional = area === "anexos" ? employeeRows.find(e => e.id === access.employeeId) : null;
  if (ownProfessional?.personId && !personOptions.some(p => p.id === ownProfessional.personId)) personOptions.push({ id: ownProfessional.personId, name: `${ownProfessional.name} — documentação profissional` });
  const review=new Date();review.setUTCDate(review.getUTCDate()+settings.parameters.reviewDays);
  const healthDue=new Date();healthDue.setUTCDate(healthDue.getUTCDate()+settings.parameters.healthReminderDays);
  const defaultValues = area === "parametros" ? strings({ ...settings.parameters, revision: settings.revision }) : area === "layouts" ? strings({ ...defaultImportLayout, name: "Cadastro familiar", version: "1.0" }) : area === "mensal" ? { competence: new Date().toISOString().slice(0, 7), declaredValues: "{}" } : area === "comunicacoes" ? { body: settings.parameters.smsTemplate } : area === "prontuarios" || area === "acompanhamentos" ? {reviewAt:review.toISOString().slice(0,10)} : area === "condicionalidades" ? {dueAt:healthDue.toISOString().slice(0,10),healthReminderDays:String(settings.parameters.healthReminderDays),educationReminderDays:String(settings.parameters.educationReminderDays),registrationReminderMonths:String(settings.parameters.registrationReminderMonths)} : {};
  return { administrator: access.administrator, rows, defaults: defaultValues, unitTypes: Object.fromEntries(unitRows.map(u => [u.id,u.type])), questionnaires: questionnaireRows.map(q => ({ id: q.id, questions: q.questions })), options: {
    units: unitRows.map(u => ({ id: u.id, name: u.name })), people: personOptions, employees: access.administrator ? employeeRows.map(e => ({ id: e.id, name: e.name })) : [],
    professionals: employeeRows.filter(e => allowedEmployeeIds.has(e.id)).map(e => ({ id: e.id, name: e.name })), roles: roleRows.map(r => ({ id: r.id, name: r.name })), families: familyRows.map(f => ({ id: f.family.id, name: familyName(f.family.id) })), programs: programRows.map(p => ({ id: p.id, name: p.name })), groups: groupRows.map(g => ({ id: g.id, name: `${g.name} — ${unitName(g.unitId)}` })),
    events: eventRows.map(e => ({ id: e.event.id, name: `${e.event.occursAt} — ${e.event.title} — ${groupName(e.event.groupId)}` })), enrollments: enrollmentRows.map(e => ({ id: e.enrollment.id, name: `${personName(e.enrollment.personId)} — ${groupName(e.enrollment.groupId)}` })), questionnaires: questionnaireRows.filter(q => q.isActive).map(q => ({ id: q.id, name: `${q.title} — v${q.version}` })), followups: followupRows.map(f => ({ id: f.id, name: `${f.service} — ${f.personId ? personName(f.personId) : familyName(f.familyId)}` })), documents: documentRows, templates: socialDocumentTemplates.map(t => ({id:t.code,name:t.title})),
  } };
}

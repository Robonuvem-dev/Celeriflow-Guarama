import { and, eq, gte, inArray, lt } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { people } from "../../schema/people";
import { employees } from "../../schema/administration";
import * as s from "../../schema/social";
import * as w from "../../schema/social-workflows";
import { socialAttendanceWhere, type SocialAccess } from "@/lib/social/access-policy";
import { socialWorkflowScope } from "./workflow-queries";
import { ageAt, socialReportFilter, socialReportKinds, type SocialReport, type SocialReportSection } from "@/lib/social/report-contract";
import { socialCaseFiles, socialMonthlyStatements } from "../../schema/social-operation-models";
import { socialCaseFileWhere } from "./workflow-access";
import { buildCaseFileSections } from "./case-file-report";
import { calculateSocialMonthly } from "./monthly-statements";
import { readSocialParameters } from "./parameters";

export async function buildSocialReport(database: DatabaseExecutor, access: SocialAccess, raw: unknown): Promise<SocialReport> {
  const f = socialReportFilter.parse(raw), from = new Date(`${f.from}T00:00:00-03:00`), next = new Date(`${f.to}T00:00:00-03:00`); next.setUTCDate(next.getUTCDate() + 1);
  if (f.caseId) {
    const [record] = await database.select().from(socialCaseFiles).where(and(eq(socialCaseFiles.id,f.caseId),socialCaseFileWhere(access)));
    if (!record) throw new Error("Prontuário não encontrado no seu escopo.");
    f.familyId=record.familyId||"";f.personId=record.personId||"";f.unitId=record.unitId;
  }
  const unitFilter = <T extends { unitId: string }>(rows: T[]) => rows.filter(r => !f.unitId || r.unitId === f.unitId);
  const within = (value: string | Date) => { const day = value instanceof Date ? new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(value) : value; return day >= f.from && day <= f.to; };
  const [units, persons, professionals, families, attendances, referrals, requests, groups, enrollments, events, followups] = await Promise.all([
    database.select().from(s.socialUnits).where(socialWorkflowScope(access, s.socialUnits.id)),
    database.select({ person: people, unitId: w.socialBeneficiaryRegistrations.unitId, registeredAt: w.socialBeneficiaryRegistrations.registeredAt }).from(people).innerJoin(w.socialBeneficiaryRegistrations, eq(w.socialBeneficiaryRegistrations.personId, people.id)).where(socialWorkflowScope(access, w.socialBeneficiaryRegistrations.unitId)),
    database.select({ employee: employees, link: s.socialProfessionalLinks }).from(s.socialProfessionalLinks).innerJoin(employees, eq(employees.id, s.socialProfessionalLinks.employeeId)).where(socialWorkflowScope(access, s.socialProfessionalLinks.unitId)),
    database.select({ family: s.socialFamilies, unitId: w.socialFamilyRegistrations.unitId }).from(s.socialFamilies).innerJoin(w.socialFamilyRegistrations, eq(w.socialFamilyRegistrations.familyId, s.socialFamilies.id)).where(socialWorkflowScope(access, w.socialFamilyRegistrations.unitId)),
    database.select().from(s.socialAttendances).where(and(socialAttendanceWhere(access), eq(s.socialAttendances.isActive, true), gte(s.socialAttendances.date, from), lt(s.socialAttendances.date, next))),
    database.select({ referral: s.socialReferrals, details: w.socialReferralDetails, destination: s.socialNetworkOrganizations.name }).from(s.socialReferrals).leftJoin(w.socialReferralDetails, eq(w.socialReferralDetails.referralId, s.socialReferrals.id)).innerJoin(s.socialNetworkOrganizations, eq(s.socialNetworkOrganizations.id, s.socialReferrals.destinationOrganizationId)).where(socialWorkflowScope(access, s.socialReferrals.unitId)),
    database.select({ request: s.socialBenefitRequests, item: s.socialBenefitRequestItems, benefit: s.socialBenefits.name, details: w.socialRequestDetails }).from(s.socialBenefitRequests).innerJoin(s.socialBenefitRequestItems, eq(s.socialBenefitRequestItems.requestId, s.socialBenefitRequests.id)).innerJoin(s.socialBenefits, eq(s.socialBenefits.id, s.socialBenefitRequestItems.benefitId)).leftJoin(w.socialRequestDetails, eq(w.socialRequestDetails.requestId, s.socialBenefitRequests.id)).where(socialWorkflowScope(access, s.socialBenefitRequests.unitId)),
    database.select().from(w.socialScfvGroups).where(socialWorkflowScope(access, w.socialScfvGroups.unitId)),
    database.select({ enrollment: w.socialScfvEnrollments, unitId: w.socialScfvGroups.unitId }).from(w.socialScfvEnrollments).innerJoin(w.socialScfvGroups, eq(w.socialScfvGroups.id, w.socialScfvEnrollments.groupId)).where(socialWorkflowScope(access, w.socialScfvGroups.unitId)),
    database.select({ event: w.socialScfvEvents, unitId: w.socialScfvGroups.unitId }).from(w.socialScfvEvents).innerJoin(w.socialScfvGroups, eq(w.socialScfvGroups.id, w.socialScfvEvents.groupId)).where(socialWorkflowScope(access, w.socialScfvGroups.unitId)),
    database.select().from(w.socialFollowups).where(socialWorkflowScope(access, w.socialFollowups.unitId)),
  ]);
  const personName = (id: string | null) => persons.find(p => p.person.id === id)?.person.fullName || families.find(x => x.family.representativeId === id)?.family.familyCode || id || "Família";
  const unitName = (id: string) => units.find(u => u.id === id)?.name || id;
  const professionalName = (id: string) => professionals.find(p => p.employee.id === id)?.employee.name || id;
  const familyName = (id: string | null) => families.find(x => x.family.id === id)?.family.familyCode || id || "—";
  const a = unitFilter(attendances).filter(x => (!f.professionalId || x.professionalId === f.professionalId) && (!f.personId || x.personId === f.personId) && (!f.familyId || x.familyId === f.familyId));
  const r = referrals.filter(x => (!f.unitId || x.referral.unitId === f.unitId) && within(x.referral.referredAt) && (!f.referralType || x.details?.referralType === f.referralType) && (!f.professionalId || x.details?.professionalId === f.professionalId));
  const q = requests.filter(x => (!f.unitId || x.request.unitId === f.unitId) && (!f.professionalId || x.details?.professionalId === f.professionalId) && (!f.personId || x.request.personId === f.personId) && (!f.familyId || x.request.familyId === f.familyId));
  const delivered = q.filter(x => x.item.status === "DELIVERED" && x.item.deliveredAt && within(x.item.deliveredAt));
  const scopedEvents = events.filter(x => (!f.unitId || x.unitId === f.unitId) && (!f.groupId || x.event.groupId === f.groupId) && within(x.event.occursAt));
  const e = scopedEvents.filter(x => x.event.status === "REALIZED");
  const tracked = unitFilter(followups).filter(x => x.startsAt <= f.to && (!x.endsAt || x.endsAt >= f.from) && (!f.professionalId || x.professionalId === f.professionalId) && (!f.familyId || x.familyId === f.familyId) && (!f.personId || x.personId === f.personId) && (access.administrator || access.links.some(l => l.unitId === x.unitId && (l.familyScope !== "OWN" || l.individualScope !== "OWN")) || x.professionalId === access.employeeId));
  const section = (title: string, headers: string[], rows: string[][]): SocialReportSection => ({ title, headers, rows });
  const sections: SocialReportSection[] = [];
  const attendanceSection = section("Atendimentos realizados", ["Data", "Unidade", "Profissional", "Família", "Indivíduo", "Tipo"], a.map(x => [x.date.toISOString(), unitName(x.unitId), professionalName(x.professionalId), familyName(x.familyId), personName(x.personId), x.type]));
  const referralSection = section("Encaminhamentos", ["Data", "Unidade", "Profissional", "Tipo", "Destino", "Beneficiário", "Situação"], r.map(x => [x.referral.referredAt.toISOString().slice(0, 10), unitName(x.referral.unitId), x.details ? professionalName(x.details.professionalId) : "Legado", x.details?.referralType || "Não classificado", x.destination, x.referral.personId ? personName(x.referral.personId) : familyName(x.referral.familyId), x.referral.status]));
  const benefitSection = section("Entregas de benefícios no período", ["Data", "Unidade", "Família", "Indivíduo", "Benefício", "Quantidade", "Valor R$"], delivered.map(x => [x.item.deliveredAt!.toISOString().slice(0, 10), unitName(x.request.unitId), familyName(x.request.familyId), personName(x.request.personId), x.benefit, String(x.item.quantity), x.item.value?.toString() || "—"]));
  if (f.kind === "dashboard") sections.push(section("Totais do período", ["Indicador", "Total"], [["Atendimentos", String(a.length)], ["Eventos SCFV realizados", String(e.length)], ["Encaminhamentos", String(r.length)], ["Entregas de benefícios", String(delivered.length)]]), attendanceSection, section("Eventos SCFV realizados", ["Data", "SCFV", "Evento", "Unidade"], e.map(x => [x.event.occursAt, groups.find(g => g.id === x.event.groupId)?.name || "—", x.event.title, unitName(x.unitId)])), referralSection, benefitSection);
  if (f.kind === "periodico") sections.push(section("Profissionais com vínculo no período", ["Nome", "Unidade", "Função", "Início", "Fim"], professionals.filter(p => (!f.unitId || p.link.unitId === f.unitId) && (!f.professionalId || p.employee.id === f.professionalId) && p.link.startsAt <= next && (!p.link.endsAt || p.link.endsAt >= from)).map(p => [p.employee.name, unitName(p.link.unitId), p.link.jobTitle, p.link.startsAt.toISOString().slice(0, 10), p.link.endsAt?.toISOString().slice(0, 10) || "Vigente"])), section("Famílias atendidas no período", ["Código", "Responsável", "Unidade"], families.filter(x => a.some(at => at.familyId === x.family.id) || q.some(b => b.request.familyId === x.family.id && within(b.details?.requestedAt || b.request.createdAt))).map(x => [x.family.familyCode || "—", personName(x.family.representativeId), unitName(x.unitId)])), section("Solicitações de benefícios", ["Data", "Família", "Benefício", "Situação", "Quantidade", "Valor R$"], q.filter(x => within(x.details?.requestedAt || x.request.createdAt)).map(x => [x.details?.requestedAt || x.request.createdAt.toISOString().slice(0, 10), familyName(x.request.familyId), x.benefit, x.item.status, String(x.item.quantity), x.item.value?.toString() || "—"])), benefitSection);
  if (f.kind === "encaminhamentos") sections.push(referralSection);
  if (f.kind === "acompanhadas" || f.kind === "prontuario") sections.push(section("Acompanhamentos vigentes em algum dia do período", ["Família", "Indivíduo", "Unidade", "Profissional", "Serviço", "Início", "Fim", "Objetivos", "Ações"], tracked.map(x => [familyName(x.familyId), personName(x.personId), unitName(x.unitId), professionalName(x.professionalId), x.service, x.startsAt, x.endsAt || "Em curso", x.objectives, x.actions])));
  if (f.kind === "prontuario") {
    sections.unshift(...await buildCaseFileSections(database,access,f));
    const notes = tracked.length ? await database.select().from(w.socialFollowupNotes).where(inArray(w.socialFollowupNotes.followupId, tracked.map(x => x.id))) : [];
    sections.push(attendanceSection, section("Evoluções", ["Data", "Evolução", "Próxima revisão"], notes.filter(n => within(n.occurredAt)).map(n => [n.occurredAt, n.description, n.nextReviewAt || "—"])), benefitSection);
  }
  const selectedEnrollments = enrollments.filter(x => (!f.unitId || x.unitId === f.unitId) && (!f.groupId || x.enrollment.groupId === f.groupId) && (!f.personId || x.enrollment.personId === f.personId));
  if (f.kind === "matriculados") sections.push(section("Matrículas realizadas no período", ["SCFV", "Unidade", "Beneficiário", "Matrícula", "Desligamento"], selectedEnrollments.filter(x => within(x.enrollment.enrolledAt)).map(x => [groups.find(g => g.id === x.enrollment.groupId)?.name || "—", unitName(x.unitId), personName(x.enrollment.personId), x.enrollment.enrolledAt, x.enrollment.leftAt || "—"])));
  if (f.kind === "frequencia") {
    const calls = e.length ? await database.select().from(w.socialScfvAttendance).where(inArray(w.socialScfvAttendance.eventId, e.map(x => x.event.id))) : [];
    const rows: string[][] = [];
    for (const x of e) for (const { enrollment } of selectedEnrollments.filter(m => m.enrollment.groupId === x.event.groupId && m.enrollment.enrolledAt <= x.event.occursAt && (!m.enrollment.leftAt || m.enrollment.leftAt >= x.event.occursAt))) { const call = calls.find(c => c.eventId === x.event.id && c.enrollmentId === enrollment.id); rows.push([x.event.occursAt, groups.find(g => g.id === x.event.groupId)?.name || "—", personName(enrollment.personId), call ? call.present ? "Presente" : "Ausente" : "Não registrada", call?.justification || ""]); }
    sections.push(section("Frequência por encontro realizado", ["Data", "SCFV", "Beneficiário", "Presença", "Justificativa"], rows));
  }
  if (f.kind === "faixas") {
    const ranges = [[0, 5], [6, 14], [15, 17], [18, 29], [30, 59], [60, 130]];
    const selected = unitFilter(persons).filter(p => p.registeredAt <= f.to && (!f.personId || p.person.id === f.personId));
    sections.push(section(`Faixas etárias na data ${f.to}`, ["Faixa", "Total"], ranges.map(([min, max]) => [`${min} a ${max} anos`, String(selected.filter(p => p.person.birthDate && ageAt(p.person.birthDate.toISOString().slice(0, 10), f.to) >= min && ageAt(p.person.birthDate.toISOString().slice(0, 10), f.to) <= max).length)])), section("Beneficiários cadastrados até a referência", ["Nome", "Nascimento", "Idade", "Unidade"], selected.map(p => [p.person.fullName, p.person.birthDate?.toISOString().slice(0, 10) || "Não informado", p.person.birthDate ? String(ageAt(p.person.birthDate.toISOString().slice(0, 10), f.to)) : "Não informada", unitName(p.unitId)])));
  }
  if (f.kind === "prestacao") {
    const statements=await database.select().from(socialMonthlyStatements).where(and(socialWorkflowScope(access,socialMonthlyStatements.unitId),f.statementId?eq(socialMonthlyStatements.id,f.statementId):undefined));
    if(f.statementId&&!statements.length)throw new Error("Registro mensal não encontrado no seu escopo.");
    const months:string[]=[];const cursor=new Date(`${f.from.slice(0,7)}-01T12:00:00Z`);while(cursor.toISOString().slice(0,7)<=f.to.slice(0,7)){months.push(cursor.toISOString().slice(0,7));cursor.setUTCMonth(cursor.getUTCMonth()+1);if(months.length>120)throw new Error("Selecione até 120 competências por emissão.");}
    for(const unit of units.filter(u=>(!f.unitId||u.id===f.unitId)&&["CRAS","CREAS"].includes(u.type)))for(const month of months){
      const saved=statements.find(s=>s.unitId===unit.id&&s.competence===month);
      if(f.statementId&&!saved)continue;
      const snapshot=saved?.snapshot||await calculateSocialMonthly(database,unit.id,month,{});
      sections.push(section(`${snapshot.title} — ${unit.name} — ${month}${saved?` — revisão ${saved.version}`:" — em elaboração"}`,["Código","Bloco","Indicador","Quantidade","Origem"],snapshot.indicators.map(i=>[i.code,i.block,i.label,i.value===null?"Não informado":String(i.value),i.source==="CALCULATED"?"Calculado":i.source==="DECLARED"?"Informado pela unidade":"Não informado"])));
      if(saved?.observations)sections.push(section(`Observações — ${unit.name} — ${month}`,["Informação"],[[saved.observations]]));
    }
  }
  const settings=await readSocialParameters(database);
  return { title: f.kind==="prontuario"?settings.parameters.recordTitle:f.kind==="prestacao"?settings.parameters.monthlyTitle:socialReportKinds[f.kind], period: `${f.from} a ${f.to}`, sections, totals: { attendances: a.length, events: e.length, referrals: r.length, deliveries: delivered.length }, note: f.kind === "prestacao" ? `Modelo CelerFlow ${settings.parameters.modelVersion}. Apuração por competência; origem de cada indicador identificada no relatório.` : "Relatório integral do filtro, respeitando o escopo de acesso. Datas de referência identificadas em cada seção." };
}

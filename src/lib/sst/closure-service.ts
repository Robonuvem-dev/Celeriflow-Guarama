import { sql } from "drizzle-orm";
import { sstRows, sstTimestamp } from "@/db/repositories/sst/sql";
import { readSstFunctionalPeriods, readSstHistoricalProgramGroups } from "@/db/repositories/sst/functional";
import { sstParameters } from "@/db/repositories/sst/scope";
import { sstDatabase } from "./database";
import { z } from "zod";
import { AccessError, assertBudgetUnitAccess, canPerformModuleOperation, canViewModule, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { assertDisciplineAccess } from "./clinical-access";
import { matchesHistoricalExposure, historicalIntersection } from "./functional-policy";
import { closureInput, closurePage, missingPeriods } from "./closure-policy";
import { clinicalDisciplines, type ClinicalDiscipline } from "./clinical-policy";

async function assertReport(context: AppContext, unitId: string, clinical: boolean) {
  assertBudgetUnitAccess(context.user, unitId);
  if (!canViewModule(context.user, "SST") || !canPerformModuleOperation(context.user, "SST", "issueReports")) throw new AccessError("Relatório exige autorização SST de emissão.", 403);
  // Legacy medical sources have no discipline column. Medicine is mandatory
  // for that base; it never grants psychology, nursing or social-work access.
  if (clinical) await assertDisciplineAccess(context, unitId, "MEDICINE");
}
async function canonicalHistory(context: AppContext, input: z.infer<typeof closureInput>) {
  const periods = await readSstFunctionalPeriods(sstDatabase(context), sql`p."employeeId"=${input.employeeId} AND p."budgetUnitId"=${input.budgetUnitId} AND NOT p.voided AND NOT EXISTS (SELECT 1 FROM "HrEmployeeFunctionalPeriod" n WHERE n."supersedesId"=p.id) AND p."startsAt"<${input.until} AND p."endsAt">${input.from}`);
  const groups = await readSstHistoricalProgramGroups(sstDatabase(context), { ...input, kind: "LTCAT" });
  const criteria = z.object({ departmentIds: z.array(z.string()).nullable(), roleIds: z.array(z.string()).nullable(), startsAt: z.coerce.date(), endsAt: z.coerce.date().nullable() });
  const exposures = periods.flatMap((period) => groups.flatMap((group) => {
    const rule = criteria.parse(group.groupSnapshot);
    if (!matchesHistoricalExposure(period, rule)) return [];
    let interval = historicalIntersection(period, { startsAt: input.from, endsAt: input.until });
    if (interval) interval = historicalIntersection(interval, group.program);
    if (interval) interval = historicalIntersection(interval, { startsAt: rule.startsAt, endsAt: rule.endsAt || input.until });
    return interval ? [{ ...interval, functionalPeriodId: period.id, programId: group.programId, programGroupId: group.id, version: group.program.version, group: group.groupSnapshot, risks: group.risks }] : [];
  }));
  return { periods, exposures, missingHistory: missingPeriods(input.from, input.until, periods), missingLtcat: missingPeriods(input.from, input.until, exposures) };
}
export async function pppReport(context: AppContext, raw: unknown, page = 1) {
  const input = closureInput.parse(raw);
  await assertReport(context, input.budgetUnitId, false);
  return pppForAuthorizedIdentity(context, input, page);
}
export async function portalPppReport(context: AppContext, raw: Omit<z.input<typeof closureInput>, "employeeId">, page = 1) {
  if (!context.user.employeeId || !canViewModule(context.user, "PORTAL_SERVIDOR")) throw new AccessError("Vínculo próprio autenticado obrigatório.", 403);
  const input = closureInput.parse({ ...raw, employeeId: context.user.employeeId });
  // Ownership is proven by the canonical history, not a browser employee ID
  // or the user's administrative UG grant/current lotation.
  const own = await sstRows<{ id: string }>(sstDatabase(context), sql`SELECT p.id FROM "HrEmployeeFunctionalPeriod" p JOIN "Employee" e ON e.id=p."employeeId" AND e."isActive" JOIN "HrBudgetUnitEntityMapping" m ON m."budgetUnitId"=p."budgetUnitId" AND m."governmentEntityId"=p."governmentEntityId" WHERE p."employeeId"=${input.employeeId} AND p."budgetUnitId"=${input.budgetUnitId} AND NOT p.voided AND NOT EXISTS (SELECT 1 FROM "HrEmployeeFunctionalPeriod" n WHERE n."supersedesId"=p.id) AND p."startsAt"<${input.until} AND p."endsAt">${input.from} LIMIT 1`);
  if (!own.length) throw new AccessError("Sem histórico próprio verificado nesta UG/período.", 403);
  return pppForAuthorizedIdentity(context, input, page);
}
async function pppForAuthorizedIdentity(context: AppContext, input: z.infer<typeof closureInput>, requestedPage: number) {
  const history = await canonicalHistory(context, input);
  const counts = await sstRows<{ total: number }>(sstDatabase(context), sql`SELECT count(*)::int total FROM "SstCat" WHERE "employeeId"=${input.employeeId} AND "budgetUnitId"=${input.budgetUnitId} AND kind<>'INCIDENT' AND "occurredAt">=${input.from} AND "occurredAt"<${input.until}`);
  const total = counts[0].total, page = closurePage(requestedPage, total);
  const [periodCount] = await sstRows<{ total: number }>(sstDatabase(context), sql`SELECT count(*)::int total FROM "HrEmployeeFunctionalPeriod" p WHERE p."employeeId"=${input.employeeId} AND p."budgetUnitId"=${input.budgetUnitId} AND NOT p.voided AND NOT EXISTS (SELECT 1 FROM "HrEmployeeFunctionalPeriod" n WHERE n."supersedesId"=p.id) AND p."startsAt"<${input.until} AND p."endsAt">${input.from}`);
  const historyPage = closurePage(requestedPage, periodCount.total);
  const displayedPeriods = await readSstFunctionalPeriods(sstDatabase(context), sql`p."employeeId"=${input.employeeId} AND p."budgetUnitId"=${input.budgetUnitId} AND NOT p.voided AND NOT EXISTS (SELECT 1 FROM "HrEmployeeFunctionalPeriod" n WHERE n."supersedesId"=p.id) AND p."startsAt"<${input.until} AND p."endsAt">${input.from}`, { limit: 20, offset: (historyPage - 1) * 20 });
  // PPP projection never includes CAT clinical evidence, CID or diagnosis.
  const accidentRows = await sstRows<{ id: string; kind: string; occurredAt: string }>(sstDatabase(context), sql`SELECT id,kind,"occurredAt" FROM "SstCat" WHERE "employeeId"=${input.employeeId} AND "budgetUnitId"=${input.budgetUnitId} AND kind<>'INCIDENT' AND "occurredAt">=${input.from} AND "occurredAt"<${input.until} ORDER BY "occurredAt",id LIMIT 20 OFFSET ${(page - 1) * 20}`);
  const accidents = accidentRows.map(row => ({ ...row, occurredAt: sstTimestamp(row.occurredAt) }));
  await writeAuditEvent(sstDatabase(context), { actorUsuarioId: context.user.id, eventType: auditEventTypes.pageView, targetType: "SST_PPP_REPORT", targetId: input.employeeId });
  return { ...history, periods: displayedPeriods, exposures: history.exposures.filter((exposure) => displayedPeriods.some((period) => period.id === exposure.functionalPeriodId)), historyPage, historyTotal: periodCount.total, accidents, page, total, input, complete: false as const, limitations: ["Relatório histórico preparatório PPP; não é PPP eletrônico oficial nem documento assinado.", "Lacunas indicadas não significam ausência de risco.", "Versões LTCAT concorrentes são preservadas para revisão técnica; agentes e códigos fiscais não são inventados."] };
}

type ClinicalReportWireRow = { source: string; id: string; occurredAt: string; content: Record<string, unknown> };
export async function functionalSstReport(context: AppContext, raw: unknown, requestedPage = 1) {
  const input = closureInput.parse(raw);
  await assertReport(context, input.budgetUnitId, true);
  const authorizedDisciplines: ClinicalDiscipline[] = ["MEDICINE"];
  for (const discipline of ["NURSING", "PSYCHOLOGY", "SOCIAL_WORK"] as const) {
    try { await assertDisciplineAccess(context, input.budgetUnitId, discipline); authorizedDisciplines.push(discipline); }
    catch (error) { if (!(error instanceof AccessError) || error.status !== 403) throw error; }
  }
  const history = await canonicalHistory(context, input);
  // Explicit queries keep source ownership visible and avoid exporting unrelated
  // Person/Employee records. Scope predicates apply before UNION/count/paging.
  const e = input.employeeId, u = input.budgetUnitId, f = input.from, t = input.until;
  // Recheck the exact record's discipline in SQL, so a grant revoked between
  // authorization and fetching cannot leak records into count, page or PDF.
  // Unknown disciplines are excluded even for the technical administrator.
  const recordDisciplineScope = sql`r.discipline IN (${sstParameters(authorizedDisciplines)}) AND ${isSystemAdministrator(context.user) ? sql`TRUE` : sql`EXISTS (SELECT 1 FROM "SstDisciplineGrant" g JOIN "SstAccessGrant" a ON a."budgetUnitId"=g."budgetUnitId" AND a."usuarioId"=g."usuarioId" WHERE g."budgetUnitId"=r."budgetUnitId" AND g."usuarioId"=${context.user.id} AND g.discipline=r.discipline AND g."isActive" AND g."canRead" AND a."isActive" AND a."canReadClinical")`}`;
  const union = sql`
    SELECT 'ATESTADO' AS source,c.id,c."startsAt" AS "occurredAt",to_jsonb(c) AS content FROM "SstMedicalCertificate" c WHERE c."employeeId"=${e} AND c."budgetUnitId"=${u} AND c."startsAt"<${t} AND c."endsAt">=${f}
    UNION ALL SELECT 'PERICIA_JUNTA',a.id,a."assessedAt",to_jsonb(a) FROM "SstMedicalAssessment" a JOIN "SstMedicalCertificate" c ON c.id=a."certificateId" WHERE c."employeeId"=${e} AND c."budgetUnitId"=${u} AND a."assessedAt">=${f} AND a."assessedAt"<${t}
    UNION ALL SELECT 'CAT',c.id,c."occurredAt",to_jsonb(c) FROM "SstCat" c WHERE c."employeeId"=${e} AND c."budgetUnitId"=${u} AND c."occurredAt">=${f} AND c."occurredAt"<${t}
    UNION ALL SELECT 'CAT_PARECER_ATENDIMENTO',a.id,a."createdAt",to_jsonb(a) FROM "SstCatEvidence" a JOIN "SstCat" c ON c.id=a."catId" WHERE c."employeeId"=${e} AND c."budgetUnitId"=${u} AND a."createdAt">=${f} AND a."createdAt"<${t}
    UNION ALL SELECT 'EPI_EPC',i.id,d."deliveredAt",to_jsonb(i) FROM "SstEquipmentDeliveryItem" i JOIN "SstEquipmentDelivery" d ON d.id=i."deliveryId" WHERE i."employeeId"=${e} AND d."budgetUnitId"=${u} AND d."deliveredAt">=${f} AND d."deliveredAt"<${t}
    UNION ALL SELECT 'ASO',a.id,a."performedAt",to_jsonb(a) FROM "SstAso" a WHERE a."employeeId"=${e} AND a."budgetUnitId"=${u} AND a."performedAt">=${f} AND a."performedAt"<${t}
    UNION ALL SELECT 'EXAME',x.id,x."performedAt",to_jsonb(x) FROM "SstOccupationalExam" x JOIN "SstAso" a ON a.id=x."asoId" WHERE a."employeeId"=${e} AND a."budgetUnitId"=${u} AND x."performedAt">=${f} AND x."performedAt"<${t}
    UNION ALL SELECT 'RESTRICAO',r.id,r."startsAt",to_jsonb(r) FROM "SstRestriction" r WHERE r."employeeId"=${e} AND r."budgetUnitId"=${u} AND r."startsAt"<${t} AND r."endsAt">=${f}
    UNION ALL SELECT 'ACOMPANHAMENTO',a.id,a."followedAt",to_jsonb(a) FROM "SstRestrictionFollowup" a JOIN "SstRestriction" r ON r.id=a."restrictionId" WHERE r."employeeId"=${e} AND r."budgetUnitId"=${u} AND a."followedAt">=${f} AND a."followedAt"<${t}
    UNION ALL SELECT 'PRONTUARIO_SOLICITACOES_LAUDO',r.id,r."attendedAt",to_jsonb(r) FROM "SstClinicalRecord" r JOIN "Employee" emp ON emp."personId"=r."personId" WHERE emp.id=${e} AND r."budgetUnitId"=${u} AND ${recordDisciplineScope} AND r."attendedAt">=${f} AND r."attendedAt"<${t}
    UNION ALL SELECT 'ANAMNESE',n.id,n."createdAt",to_jsonb(n) FROM "SstAnamnesis" n JOIN "SstAso" a ON a.id=n."asoId" WHERE a."employeeId"=${e} AND a."budgetUnitId"=${u} AND n."createdAt">=${f} AND n."createdAt"<${t}
    UNION ALL SELECT 'VACINACAO',v.id,v."administeredAt",to_jsonb(v) FROM "SstVaccination" v JOIN "Employee" emp ON emp."personId"=v."personId" WHERE emp.id=${e} AND v."budgetUnitId"=${u} AND v."administeredAt">=${f} AND v."administeredAt"<${t}`;
  const [count] = await sstRows<{ total: number }>(sstDatabase(context), sql`SELECT count(*)::int total FROM (${union}) records`);
  const page = closurePage(requestedPage, count.total);
  const recordRows = await sstRows<ClinicalReportWireRow>(sstDatabase(context), sql`SELECT * FROM (${union}) records ORDER BY "occurredAt" DESC,source,id LIMIT 20 OFFSET ${(page - 1) * 20}`);
  const records = recordRows.map(row => ({ ...row, occurredAt: sstTimestamp(row.occurredAt) }));
  await writeAuditEvent(sstDatabase(context), { actorUsuarioId: context.user.id, eventType: auditEventTypes.pageView, targetType: "SST_FUNCTIONAL_INTEGRAL_REPORT", targetId: e });
  const omittedDisciplines = (Object.keys(clinicalDisciplines) as ClinicalDiscipline[]).filter((discipline) => !authorizedDisciplines.includes(discipline));
  return { records, total: count.total, page, input, history, authorizedDisciplines, omittedDisciplines, complete: false as const, limitations: [`Atuações autorizadas nesta UG: ${authorizedDisciplines.map((discipline) => clinicalDisciplines[discipline]).join(", ")}.`, ...(omittedDisciplines.length ? [`Atuações fora do escopo de acesso: ${omittedDisciplines.map((discipline) => clinicalDisciplines[discipline]).join(", ")}. Seus registros não são consultados, contados ou emitidos.`] : []), "Fontes ocupacionais registradas e histórico canônico; lacunas não são preenchidas com lotação atual.", "Documentos GED e assinaturas não são presumidos a partir deste relatório."] };
}

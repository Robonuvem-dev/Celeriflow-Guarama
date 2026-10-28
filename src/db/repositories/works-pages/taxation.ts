import { and, asc, count, desc, eq, getTableColumns, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DatabaseExecutor } from "@/db/transaction";
import type { WorksPageAccess } from "@/lib/contracts/works-pages";
import { constructionCases as cases, constructionCaseProperties as properties, constructionConfigVersions as configs } from "@/db/schema/construction-core";
import { constructionDocumentRequests as requests } from "@/db/schema/construction-documents";
import { pageFees as fees, pageTaxRules as rules } from "@/db/schema/works-pages";
import { taxAssessments as assessments, taxGuides as guides, taxes } from "@/db/schema/taxation-core";
import { taxPayments as payments } from "@/db/schema/tax-accounting";
import { processes } from "@/db/schema/processes";
import { people } from "@/db/schema/people";
import { companies, realEstates, taxpayers } from "@/db/schema/registry";
import { pageCaseScope } from "./cases";

const personTaxpayers = alias(taxpayers, "personTaxpayer");
const companyTaxpayers = alias(taxpayers, "companyTaxpayer");

async function loadAssessmentGuides(database: DatabaseExecutor, assessmentIds: string[], guideId?: string) {
  const guideRows = await database.select().from(guides).where(and(inArray(guides.assessmentId, assessmentIds), guideId ? eq(guides.id, guideId) : undefined));
  const paymentRows = await database.select().from(payments).where(and(inArray(payments.guideId, guideRows.map(row => row.id)), eq(payments.status, "Confirmado")));
  return guideRows.map(row => ({ ...row, payments: paymentRows.filter(payment => payment.guideId === row.id) }));
}
export async function loadPageTaxation(database: DatabaseExecutor, access: WorksPageAccess, page: number, caseId?: string) {
  const where = and(pageCaseScope(access), caseId ? eq(cases.id, caseId) : undefined);
  const [rows, taxOptions, ruleRows, total] = await Promise.all([
    database.select({ record: cases, configuration: configs, process: getTableColumns(processes), person: getTableColumns(people), company: getTableColumns(companies), personTaxpayer: getTableColumns(personTaxpayers), companyTaxpayer: getTableColumns(companyTaxpayers) }).from(cases).innerJoin(processes, eq(processes.id, cases.processId)).innerJoin(configs, eq(configs.id, cases.configurationId)).leftJoin(people, eq(people.id, processes.personId)).leftJoin(companies, eq(companies.id, processes.companyId)).leftJoin(personTaxpayers, eq(personTaxpayers.personId, people.id)).leftJoin(companyTaxpayers, eq(companyTaxpayers.companyId, companies.id)).where(where).orderBy(desc(cases.createdAt)).offset((page - 1) * 20).limit(20),
    database.select({ id: taxes.id, name: taxes.name }).from(taxes).where(and(eq(taxes.isActive, true), eq(taxes.taxType, "Taxa"))).orderBy(asc(taxes.name)),
    database.select({ ...getTableColumns(rules), tax: getTableColumns(taxes) }).from(rules).innerJoin(taxes, eq(taxes.id, rules.taxId)).orderBy(desc(rules.publishedAt)).limit(30),
    database.select({ value: count() }).from(cases).innerJoin(processes, eq(processes.id, cases.processId)).where(where).then(rows => rows[0].value),
  ]);
  const ids = rows.map(row => row.record.id);
  const [propertyRows, feeRows, documentRequests] = await Promise.all([
    database.select({ ...getTableColumns(properties), realEstate: getTableColumns(realEstates) }).from(properties).innerJoin(realEstates, eq(realEstates.id, properties.realEstateId)).where(inArray(properties.caseId, ids)),
    database.select({ fee: fees, assessment: getTableColumns(assessments) }).from(fees).leftJoin(assessments, eq(assessments.id, fees.assessmentId)).where(inArray(fees.caseId, ids)),
    database.select({ id: requests.id, caseId: requests.caseId, type: requests.type, sourceIssuedDocumentId: requests.sourceIssuedDocumentId }).from(requests).where(and(inArray(requests.caseId, ids), eq(requests.status, "PENDING"), inArray(requests.type, ["CORRECTION", "RENEWAL"]))),
  ]);
  const guideRows = await loadAssessmentGuides(database, feeRows.flatMap(row => row.assessment ? [row.assessment.id] : []));
  const records = rows.map(row => ({ ...row.record, configuration: row.configuration,
    process: { ...row.process, person: row.person ? { ...row.person, taxpayerInfo: row.personTaxpayer } : null, company: row.company ? { ...row.company, taxpayerInfo: row.companyTaxpayer } : null },
    properties: propertyRows.filter(property => property.caseId === row.record.id),
    fees: feeRows.filter(fee => fee.fee.caseId === row.record.id).map(({ fee, assessment }) => ({ ...fee, assessment: assessment ? { ...assessment, guides: guideRows.filter(guide => guide.assessmentId === assessment.id) } : null })),
  }));
  return { records, taxes: taxOptions, rules: ruleRows, total, documentRequests };
}
export async function findPageGuide(database: DatabaseExecutor, access: WorksPageAccess, guideId: string) {
  const [row] = await database.select({ fee: fees, record: cases, process: getTableColumns(processes), rule: rules, assessment: assessments, taxpayer: taxpayers, person: getTableColumns(people), company: getTableColumns(companies), realEstate: getTableColumns(realEstates) }).from(fees)
    .innerJoin(cases, eq(cases.id, fees.caseId)).innerJoin(processes, eq(processes.id, cases.processId)).innerJoin(rules, eq(rules.id, fees.ruleId)).innerJoin(assessments, eq(assessments.id, fees.assessmentId)).innerJoin(guides, eq(guides.assessmentId, assessments.id)).innerJoin(taxpayers, eq(taxpayers.id, assessments.taxpayerId)).leftJoin(people, eq(people.id, taxpayers.personId)).leftJoin(companies, eq(companies.id, taxpayers.companyId)).leftJoin(realEstates, eq(realEstates.id, assessments.realEstateId)).where(and(pageCaseScope(access), eq(guides.id, guideId))).limit(1);
  if (!row) return null;
  const guideRows = await loadAssessmentGuides(database, [row.assessment.id], guideId);
  return { ...row.fee, case: { ...row.record, process: row.process }, rule: row.rule, assessment: { ...row.assessment, taxpayer: { ...row.taxpayer, person: row.person, company: row.company }, realEstate: row.realEstate, guides: guideRows } };
}

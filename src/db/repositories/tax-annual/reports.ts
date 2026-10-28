import { and, desc, eq, getTableColumns, inArray, isNotNull, ne, or, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { annualBenefitGrants } from "@/db/schema/tax-annual";
import { planningBudgetUnitLabels, planningEntityUnits } from "@/db/schema/planning-catalog";
import { governmentEntities } from "@/db/schema/master-data";
import { companies, realEstates, taxpayers } from "@/db/schema/registry";
import { people } from "@/db/schema/people";
import { economicRegistrations, taxAssessments, taxGuides, taxes } from "@/db/schema/taxation-core";
import { taxPayments } from "@/db/schema/tax-accounting";
import { taxRegistryEntries } from "@/db/schema/taxation-registry";
import { annualObject, annualRequired } from "./records";

export async function readAnnualUnitBindings(db: DatabaseExecutor, entityId: string, allowed?: string[]) {
  return db.select({ budgetUnitId: planningEntityUnits.budgetUnitId }).from(planningEntityUnits).where(and(eq(planningEntityUnits.governmentEntityId, entityId), allowed ? inArray(planningEntityUnits.budgetUnitId, allowed) : undefined));
}
export async function readAnnualSummaryUnit(db: DatabaseExecutor, entityId: string, unitId: string) {
  return annualRequired((await db.select({ governmentEntity: { name: governmentEntities.name }, budgetUnit: { code: planningBudgetUnitLabels.code } }).from(planningEntityUnits).innerJoin(governmentEntities, eq(governmentEntities.id, planningEntityUnits.governmentEntityId)).innerJoin(planningBudgetUnitLabels, eq(planningBudgetUnitLabels.id, planningEntityUnits.budgetUnitId)).where(and(eq(planningEntityUnits.governmentEntityId, entityId), eq(planningEntityUnits.budgetUnitId, unitId))).limit(1))[0], "Ente/UG");
}

export async function readAnnualAssessmentRows(db: DatabaseExecutor, input: { years: number[]; entityId: string; units: string[]; taxId?: string | null; kind?: "PROPERTY" | "ECONOMIC" | "ALL"; excludeCancelled?: boolean }) {
  // JSON equality preserves type: a numeric JSON value cannot impersonate an ID.
  const unitScope = or(...input.units.map(id => sql`${taxAssessments.calculationSnapshot}->'budgetUnitId' = ${JSON.stringify(id)}::jsonb`));
  const rows = await db.select({
    ...getTableColumns(taxAssessments), tax: { name: taxes.name },
    taxpayer: { id: taxpayers.id, corporateName: companies.corporateName, fullName: people.fullName },
    realEstate: { municipalInsc: realEstates.municipalInsc }, economicRegistration: { municipalInsc: economicRegistrations.municipalInsc },
  }).from(taxAssessments).innerJoin(taxes, eq(taxes.id, taxAssessments.taxId)).innerJoin(taxpayers, eq(taxpayers.id, taxAssessments.taxpayerId)).leftJoin(companies, eq(companies.id, taxpayers.companyId)).leftJoin(people, eq(people.id, taxpayers.personId)).leftJoin(realEstates, eq(realEstates.id, taxAssessments.realEstateId)).leftJoin(economicRegistrations, eq(economicRegistrations.id, taxAssessments.economicRegistrationId)).where(and(
    inArray(taxAssessments.year, input.years), input.excludeCancelled ? ne(taxAssessments.status, "Cancelado") : undefined,
    input.taxId ? eq(taxAssessments.taxId, input.taxId) : undefined,
    input.kind === "PROPERTY" ? isNotNull(taxAssessments.realEstateId) : input.kind === "ECONOMIC" ? isNotNull(taxAssessments.economicRegistrationId) : undefined,
    sql`${taxAssessments.calculationSnapshot}->'governmentEntityId' = ${JSON.stringify(input.entityId)}::jsonb`, input.units.length ? unitScope : sql`false`,
  ));
  const ids = rows.map(row => row.id);
  const guides = ids.length ? await db.select().from(taxGuides).where(inArray(taxGuides.assessmentId, ids)) : [];
  const payments = ids.length ? await db.select({ ...getTableColumns(taxPayments), guide: { assessmentId: taxGuides.assessmentId } }).from(taxPayments).innerJoin(taxGuides, eq(taxGuides.id, taxPayments.guideId)).where(and(inArray(taxGuides.assessmentId, ids), eq(taxPayments.status, "Confirmado"))) : [];
  return { assessments: rows.map(row => ({ ...row, guides: guides.filter(guide => guide.assessmentId === row.id).map(guide => ({ ...guide, payments: payments.filter(payment => payment.guideId === guide.id) })) })), payments };
}

export async function readAnnualCreditMovements(db: DatabaseExecutor, ids: string[]) {
  if (!ids.length) return [];
  return db.select({ entityId: taxRegistryEntries.entityId, data: taxRegistryEntries.data }).from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "TAX_ASSESSMENT"), inArray(taxRegistryEntries.entityId, ids), eq(taxRegistryEntries.category, "CREDIT_MOVEMENT"), eq(taxRegistryEntries.status, "EFETIVADO")));
}
export async function readAnnualBenefits(db: DatabaseExecutor, assessmentIds: string[]) {
  const events = assessmentIds.length ? await db.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "TAX_ASSESSMENT"), inArray(taxRegistryEntries.entityId, assessmentIds), eq(taxRegistryEntries.category, "CREDIT_EVENT"), eq(taxRegistryEntries.status, "ATIVO"), eq(taxRegistryEntries.source, "BENEFICIO"))) : [];
  const ids = events.flatMap(row => { const id = annualObject(row.data).grantId; return typeof id === "string" ? [id] : []; });
  const benefits = ids.length ? await db.select().from(annualBenefitGrants).where(and(inArray(annualBenefitGrants.id, ids), eq(annualBenefitGrants.status, "CONCEDIDO"))) : [];
  const classificationEntries = benefits.length ? await db.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "TAX_BENEFIT_RULE"), inArray(taxRegistryEntries.entityId, benefits.map(row => row.ruleId)), eq(taxRegistryEntries.category, "BENEFIT_REPORT_CLASSIFICATION"))).orderBy(desc(taxRegistryEntries.version)) : [];
  return { events, benefits, classificationEntries };
}

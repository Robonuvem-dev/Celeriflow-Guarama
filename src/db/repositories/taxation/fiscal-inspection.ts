import { and, asc, count, desc, eq, inArray, or } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import type { FiscalInspectionPageSource } from "@/lib/contracts/taxation-inspection";
import { employees } from "@/db/schema/administration";
import { neighborhoods } from "@/db/schema/localities";
import { people } from "@/db/schema/people";
import { addresses, companies, realEstates, taxpayers } from "@/db/schema/registry";
import { economicRegistrations } from "@/db/schema/taxation-core";
import { fiscalAssessmentMaps, fiscalDocumentRequests, fiscalDocuments, fiscalFindingOrders, fiscalFindings, fiscalOrderEvents, fiscalOrders, fiscalPenaltyRules, fiscalPlanEvents, fiscalPlanInspectors, fiscalPlanSelections, fiscalPlans, fiscalProductivityLedger, fiscalProductivityPeriods, fiscalTemplates } from "@/db/schema/taxation-inspection";

function grouped<T>(rows: T[], key: (row: T) => string) {
  const result = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row), items = result.get(id);
    if (items) items.push(row); else result.set(id, [row]);
  }
  return result;
}

export async function readFiscalInspectionPage(db: DatabaseExecutor, scope: { canManage: boolean; employeeId: string | null }): Promise<FiscalInspectionPageSource> {
  const [subjects, properties, inspectors, plans, orders, findings, periods, templates, rules] = await Promise.all([
    db.select({ taxpayer: taxpayers, person: { id: people.id, fullName: people.fullName, cpf: people.cpf }, company: { id: companies.id, corporateName: companies.corporateName, cnpj: companies.cnpj } }).from(taxpayers).leftJoin(people, eq(people.id, taxpayers.personId)).leftJoin(companies, eq(companies.id, taxpayers.companyId)).where(eq(taxpayers.status, "Ativo")).orderBy(asc(taxpayers.createdAt)).limit(300),
    db.select({ property: realEstates, neighborhood: { name: neighborhoods.name } }).from(realEstates).leftJoin(neighborhoods, eq(neighborhoods.id, realEstates.neighborhoodId)).orderBy(asc(realEstates.createdAt)).limit(300),
    db.select({ id: employees.id, name: employees.name, registration: employees.registration, salaryBase: employees.salaryBase }).from(employees).where(eq(employees.isActive, true)).orderBy(asc(employees.name)).limit(200),
    db.select().from(fiscalPlans).orderBy(desc(fiscalPlans.createdAt)).limit(100),
    db.select().from(fiscalOrders).orderBy(desc(fiscalOrders.issuedAt)).limit(200),
    db.select().from(fiscalFindings).orderBy(desc(fiscalFindings.differenceDecimal), desc(fiscalFindings.updatedAt)).limit(200),
    db.select().from(fiscalProductivityPeriods).where(scope.canManage ? undefined : eq(fiscalProductivityPeriods.employeeId, scope.employeeId ?? "SEM_VINCULO")).orderBy(desc(fiscalProductivityPeriods.createdAt)).limit(100),
    db.select().from(fiscalTemplates).orderBy(asc(fiscalTemplates.code), desc(fiscalTemplates.version)).limit(100),
    db.select().from(fiscalPenaltyRules).orderBy(desc(fiscalPenaltyRules.effectiveFrom)).limit(100),
  ]);
  const taxpayerIds = subjects.map(row => row.taxpayer.id), personIds = subjects.flatMap(row => row.person ? [row.person.id] : []), companyIds = subjects.flatMap(row => row.company ? [row.company.id] : []);
  const planIds = plans.map(row => row.id), orderIds = orders.map(row => row.id), findingIds = findings.map(row => row.id), periodIds = periods.map(row => row.id);
  const [subjectAddresses, registrations, selections, assigned, planEvents, planOrderCounts, orderEvents, issuedDocuments, requests, maps, links, ledger] = await Promise.all([
    db.select({ address: addresses, neighborhood: { name: neighborhoods.name } }).from(addresses).leftJoin(neighborhoods, eq(neighborhoods.id, addresses.neighborhoodId)).where(or(inArray(addresses.personId, personIds), inArray(addresses.companyId, companyIds))),
    db.select().from(economicRegistrations).where(inArray(economicRegistrations.taxpayerId, taxpayerIds)),
    db.select().from(fiscalPlanSelections).where(inArray(fiscalPlanSelections.planId, planIds)),
    db.select().from(fiscalPlanInspectors).where(inArray(fiscalPlanInspectors.planId, planIds)),
    db.select().from(fiscalPlanEvents).where(inArray(fiscalPlanEvents.planId, planIds)).orderBy(desc(fiscalPlanEvents.createdAt)),
    db.select({ planId: fiscalOrders.planId, total: count() }).from(fiscalOrders).where(and(inArray(fiscalOrders.planId, planIds))).groupBy(fiscalOrders.planId),
    db.select().from(fiscalOrderEvents).where(inArray(fiscalOrderEvents.orderId, orderIds)).orderBy(desc(fiscalOrderEvents.createdAt)),
    db.select().from(fiscalDocuments).where(inArray(fiscalDocuments.orderId, orderIds)).orderBy(desc(fiscalDocuments.issuedAt)),
    db.select().from(fiscalDocumentRequests).where(inArray(fiscalDocumentRequests.orderId, orderIds)).orderBy(asc(fiscalDocumentRequests.createdAt)),
    db.select().from(fiscalAssessmentMaps).where(inArray(fiscalAssessmentMaps.orderId, orderIds)).orderBy(desc(fiscalAssessmentMaps.version)),
    db.select().from(fiscalFindingOrders).where(inArray(fiscalFindingOrders.findingId, findingIds)),
    db.select().from(fiscalProductivityLedger).where(inArray(fiscalProductivityLedger.periodId, periodIds)).orderBy(asc(fiscalProductivityLedger.createdAt)),
  ]);
  const addressByPerson = grouped(subjectAddresses.filter(row => row.address.personId !== null), row => row.address.personId!);
  const addressByCompany = grouped(subjectAddresses.filter(row => row.address.companyId !== null), row => row.address.companyId!);
  const registrationByTaxpayer = grouped(registrations, row => row.taxpayerId);
  const selectionByPlan = grouped(selections, row => row.planId), inspectorByPlan = grouped(assigned, row => row.planId), eventByPlan = grouped(planEvents, row => row.planId);
  const countByPlan = new Map(planOrderCounts.map(row => [row.planId, row.total]));
  const eventByOrder = grouped(orderEvents, row => row.orderId), documentByOrder = grouped(issuedDocuments, row => row.orderId), requestByOrder = grouped(requests, row => row.orderId), mapByOrder = grouped(maps, row => row.orderId);
  const linksByFinding = grouped(links, row => row.findingId), ledgerByPeriod = grouped(ledger, row => row.periodId);
  const addressDto = (rows: typeof subjectAddresses) => rows.map(row => ({ streetName: row.address.streetName, neighborhood: row.neighborhood }));
  return {
    rawTaxpayers: subjects.map(row => ({ id: row.taxpayer.id, economicActivities: row.taxpayer.economicActivities, person: row.person ? { ...row.person, addresses: addressDto(addressByPerson.get(row.person.id) ?? []) } : null, company: row.company ? { ...row.company, addresses: addressDto(addressByCompany.get(row.company.id) ?? []) } : null, economicRegistrations: registrationByTaxpayer.get(row.taxpayer.id) ?? [] })),
    properties: properties.map(row => ({ ...row.property, neighborhood: row.neighborhood })), employees: inspectors,
    plans: plans.map(row => ({ ...row, selections: selectionByPlan.get(row.id) ?? [], inspectors: inspectorByPlan.get(row.id) ?? [], events: (eventByPlan.get(row.id) ?? []).slice(0, 5), _count: { orders: countByPlan.get(row.id) ?? 0 } })),
    orders: orders.map(row => ({ ...row, events: (eventByOrder.get(row.id) ?? []).slice(0, 8), documents: documentByOrder.get(row.id) ?? [], requests: requestByOrder.get(row.id) ?? [], assessmentMaps: mapByOrder.get(row.id) ?? [] })),
    findings: findings.map(row => ({ ...row, orderLinks: linksByFinding.get(row.id) ?? [] })),
    periods: periods.map(row => ({ ...row, ledger: ledgerByPeriod.get(row.id) ?? [] })), templates, rules,
  };
}

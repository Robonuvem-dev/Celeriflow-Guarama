import { and, desc, eq, getTableColumns, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DatabaseExecutor } from "../../transaction";
import type { HealthManagementPeriod } from "@/lib/contracts/health-management-operations";
import { healthLabOrders, healthLabExamModels, healthLabResults } from "../../schema/health-laboratory";
import { diagnosticLabReports, diagnosticSpecializedDistributions } from "../../schema/health-diagnostics";
import { specializedTherapeuticPlans } from "../../schema/health-care-lines";
import { healthExamRequests } from "../../schema/health-care";
import { vaccinationRecords, vaccines } from "../../schema/health-vaccination";
import { healthSusProcedures } from "../../schema/health-catalogs";
import { healthUnits, healthTeams, healthProfessionals } from "../../schema/health-workforce";
import { employees } from "../../schema/administration";
import { patients } from "../../schema/health-registration";
import { people } from "../../schema/people";
import { companies, suppliers } from "../../schema/registry";
import { materials, materialStocks, warehouses } from "../../schema/assets-stock";
import { managementPeriod, managementUnitScope } from "./common";

export async function readManagementVaccinations(db: DatabaseExecutor, unitIds: string[] | undefined, period: HealthManagementPeriod) {
  const rows = await db.select({ record: getTableColumns(vaccinationRecords), vaccine: getTableColumns(vaccines), person: { fullName: people.fullName }, unit: { name: healthUnits.name }, employee: { name: employees.name } }).from(vaccinationRecords).innerJoin(vaccines, eq(vaccines.id, vaccinationRecords.vaccineId)).innerJoin(patients, eq(patients.id, vaccinationRecords.patientId)).innerJoin(people, eq(people.id, patients.personId)).innerJoin(healthUnits, eq(healthUnits.id, vaccinationRecords.unitId)).innerJoin(healthProfessionals, eq(healthProfessionals.id, vaccinationRecords.professionalId)).innerJoin(employees, eq(employees.id, healthProfessionals.employeeId))
    .where(and(managementPeriod(vaccinationRecords.date, period), managementUnitScope(vaccinationRecords.unitId, unitIds))).orderBy(desc(vaccinationRecords.date));
  return rows.map(r => ({ ...r.record, vaccine: r.vaccine, patient: { person: r.person }, unit: r.unit, professional: { employee: r.employee } }));
}

export async function readManagementLabOrders(db: DatabaseExecutor, options: { unitIds?: string[]; period?: HealthManagementPeriod; limit?: number; recordId?: string }) {
  const requestUnit = alias(healthUnits, "management_lab_request"), collectionUnit = alias(healthUnits, "management_lab_collection"), providerPerson = alias(people, "management_lab_provider");
  const query = db.select({ order: getTableColumns(healthLabOrders), person: { fullName: people.fullName }, request: { examName: healthExamRequests.examName }, model: getTableColumns(healthLabExamModels), procedure: { code: healthSusProcedures.code, unitValue: healthSusProcedures.unitValue }, requestUnit: { name: requestUnit.name }, collectionUnit: { name: collectionUnit.name }, supplier: { id: suppliers.id }, providerPerson: { fullName: providerPerson.fullName }, company: { corporateName: companies.corporateName } }).from(healthLabOrders)
    .innerJoin(patients, eq(patients.id, healthLabOrders.patientId)).innerJoin(people, eq(people.id, patients.personId)).leftJoin(healthExamRequests, eq(healthExamRequests.id, healthLabOrders.examRequestId)).leftJoin(healthLabExamModels, eq(healthLabExamModels.id, healthLabOrders.examModelId)).leftJoin(healthSusProcedures, eq(healthSusProcedures.id, healthLabExamModels.procedureId)).leftJoin(requestUnit, eq(requestUnit.id, healthLabOrders.requestUnitId)).leftJoin(collectionUnit, eq(collectionUnit.id, healthLabOrders.collectionUnitId)).leftJoin(suppliers, eq(suppliers.id, healthLabOrders.providerSupplierId)).leftJoin(providerPerson, eq(providerPerson.id, suppliers.personId)).leftJoin(companies, eq(companies.id, suppliers.companyId))
    .where(options.recordId ? or(eq(healthLabOrders.id, options.recordId), eq(healthLabOrders.sampleBarcode, options.recordId)) : and(managementPeriod(healthLabOrders.createdAt, options.period), options.unitIds ? or(managementUnitScope(healthLabOrders.requestUnitId, options.unitIds), managementUnitScope(healthLabOrders.collectionUnitId, options.unitIds)) : undefined))
    .orderBy(...(options.recordId ? [] : [desc(healthLabOrders.createdAt)])).$dynamic();
  const rows = await (options.recordId ? query.limit(1) : options.limit !== undefined ? query.limit(options.limit) : query);
  if (!rows.length) return [];
  const ids = rows.map(r => r.order.id);
  const [reports, results] = await Promise.all([
    db.select({ id: diagnosticLabReports.id, orderId: diagnosticLabReports.orderId }).from(diagnosticLabReports).where(managementUnitScope(diagnosticLabReports.orderId, ids)),
    db.select({ status: healthLabResults.status, orderId: healthLabResults.orderId }).from(healthLabResults).where(managementUnitScope(healthLabResults.orderId, ids)),
  ]);
  return rows.map(r => ({ ...r.order, patient: { person: r.person }, examRequest: r.request, examModel: r.model ? { ...r.model, procedure: r.procedure } : null, requestUnit: r.requestUnit, collectionUnit: r.collectionUnit, providerSupplier: r.supplier ? { person: r.providerPerson, company: r.company } : null, reports: reports.filter(x => x.orderId === r.order.id), results: results.filter(x => x.orderId === r.order.id) }));
}

export async function readManagementDistributions(db: DatabaseExecutor, unitIds: string[] | undefined, period: HealthManagementPeriod, teamId?: string) {
  const t = diagnosticSpecializedDistributions;
  const rows = await db.select({ distribution: getTableColumns(t), person: { fullName: people.fullName }, material: { name: materials.name }, stock: { batchNumber: materialStocks.batchNumber }, warehouse: { name: warehouses.name }, unit: { name: healthUnits.name }, team: { name: healthTeams.name } }).from(t).innerJoin(patients, eq(patients.id, t.patientId)).innerJoin(people, eq(people.id, patients.personId)).innerJoin(materials, eq(materials.id, t.materialId)).innerJoin(materialStocks, eq(materialStocks.id, t.stockId)).innerJoin(warehouses, eq(warehouses.id, t.warehouseId)).innerJoin(specializedTherapeuticPlans, eq(specializedTherapeuticPlans.id, t.planId)).innerJoin(healthUnits, eq(healthUnits.id, specializedTherapeuticPlans.unitId)).innerJoin(healthTeams, eq(healthTeams.id, specializedTherapeuticPlans.teamId))
    .where(and(managementPeriod(t.deliveredAt, period), managementUnitScope(specializedTherapeuticPlans.unitId, unitIds), teamId ? eq(specializedTherapeuticPlans.teamId, teamId) : undefined)).orderBy(desc(t.deliveredAt));
  return rows.map(r => ({ ...r.distribution, patient: { person: r.person }, material: r.material, stock: r.stock, warehouse: r.warehouse, plan: { unit: r.unit, team: r.team } }));
}

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { people } from "../../schema/people";
import { materials, warehouses } from "../../schema/assets-stock";
import { schools, students } from "../../schema/education-core";
import { educationApplicationPlans, educationFinancialAccounts, educationFoodMovements, educationLibraryCopies, educationLibraryLoans, educationLibraryTitles, educationSchoolMenus, educationTransportEvents, educationTransportJourneys, educationTransportRoutes } from "../../schema/education-operations";
import { listActiveEducationSchools } from "./core";
import type { EducationFoodData, EducationLibraryData, EducationOperationStudent, EducationSchoolResourcesData, EducationTransportData } from "@/lib/contracts/education-operations";

export async function listOperationalEducationStudents(database: DatabaseExecutor, transportOnly = false): Promise<EducationOperationStudent[]> {
  return database.select({ id: students.id, studentCode: students.studentCode, person: { fullName: people.fullName } }).from(students).innerJoin(people, eq(people.id, students.personId)).where(and(eq(students.status, "Ativo"), transportOnly ? eq(students.usesSchoolTransport, true) : undefined)).orderBy(asc(students.studentCode));
}

export async function loadEducationLibraryData(database: DatabaseExecutor): Promise<EducationLibraryData> {
  const [schoolRows, studentRows, titles, copies, loanRows] = await Promise.all([
    listActiveEducationSchools(database), listOperationalEducationStudents(database),
    database.select({ id: educationLibraryTitles.id, title: educationLibraryTitles.title }).from(educationLibraryTitles).orderBy(asc(educationLibraryTitles.title)),
    database.select({ id: educationLibraryCopies.id, assetCode: educationLibraryCopies.assetCode, title: { title: educationLibraryTitles.title } }).from(educationLibraryCopies).innerJoin(educationLibraryTitles, eq(educationLibraryTitles.id, educationLibraryCopies.titleId)).where(eq(educationLibraryCopies.status, "Disponível")).orderBy(asc(educationLibraryCopies.assetCode)),
    database.select({ id: educationLibraryLoans.id, dueAt: educationLibraryLoans.dueAt, renewals: educationLibraryLoans.renewals, status: educationLibraryLoans.status, assetCode: educationLibraryCopies.assetCode, title: educationLibraryTitles.title, fullName: people.fullName }).from(educationLibraryLoans).innerJoin(educationLibraryCopies, eq(educationLibraryCopies.id, educationLibraryLoans.copyId)).innerJoin(educationLibraryTitles, eq(educationLibraryTitles.id, educationLibraryCopies.titleId)).innerJoin(students, eq(students.id, educationLibraryLoans.studentId)).innerJoin(people, eq(people.id, students.personId)).orderBy(desc(educationLibraryLoans.loanedAt)).limit(100),
  ]);
  return { schools: schoolRows, students: studentRows, titles, copies, loans: loanRows.map(({ assetCode, title, fullName, ...row }) => ({ ...row, copy: { assetCode, title: { title } }, student: { person: { fullName } } })) };
}

export async function loadEducationFoodData(database: DatabaseExecutor): Promise<EducationFoodData> {
  const [schoolRows, materialRows, warehouseRows, menus, movements] = await Promise.all([
    listActiveEducationSchools(database),
    database.select({ id: materials.id, name: materials.name, unitOfMeasure: materials.unitOfMeasure }).from(materials).where(eq(materials.isActive, true)).orderBy(asc(materials.name)),
    database.select({ id: warehouses.id, name: warehouses.name }).from(warehouses).where(eq(warehouses.isActive, true)).orderBy(asc(warehouses.name)),
    database.select({ id: educationSchoolMenus.id }).from(educationSchoolMenus).orderBy(desc(educationSchoolMenus.weekStart)),
    database.select({ id: educationFoodMovements.id, materialId: educationFoodMovements.materialId, type: educationFoodMovements.type, quantity: educationFoodMovements.quantity, occurredAt: educationFoodMovements.occurredAt, notes: educationFoodMovements.notes, school: { name: schools.name }, material: { name: materials.name, unitOfMeasure: materials.unitOfMeasure }, warehouse: { name: warehouses.name } }).from(educationFoodMovements).innerJoin(schools, eq(schools.id, educationFoodMovements.schoolId)).innerJoin(materials, eq(materials.id, educationFoodMovements.materialId)).leftJoin(warehouses, eq(warehouses.id, educationFoodMovements.warehouseId)).orderBy(desc(educationFoodMovements.occurredAt)),
  ]);
  return { schools: schoolRows, materials: materialRows, warehouses: warehouseRows, menus, movements };
}

export async function loadEducationSchoolResourcesData(database: DatabaseExecutor): Promise<EducationSchoolResourcesData> {
  const [schoolRows, bankRows, accounts, plans] = await Promise.all([
    listActiveEducationSchools(database),
    database.execute<{ id: string; bankName: string; agency: string; accountNumber: string }>(sql`SELECT id, "bankName", agency, "accountNumber" FROM "BankAccount" WHERE "isActive" = true ORDER BY "bankName" ASC`),
    database.select({ id: educationFinancialAccounts.id, name: educationFinancialAccounts.name, school: { name: schools.name } }).from(educationFinancialAccounts).innerJoin(schools, eq(schools.id, educationFinancialAccounts.schoolId)).orderBy(asc(educationFinancialAccounts.name)),
    database.select({ id: educationApplicationPlans.id, title: educationApplicationPlans.title, total: educationApplicationPlans.total, status: educationApplicationPlans.status, items: educationApplicationPlans.items, school: { name: schools.name }, account: { name: educationFinancialAccounts.name } }).from(educationApplicationPlans).innerJoin(schools, eq(schools.id, educationApplicationPlans.schoolId)).leftJoin(educationFinancialAccounts, eq(educationFinancialAccounts.id, educationApplicationPlans.accountId)).orderBy(desc(educationApplicationPlans.createdAt)),
  ]);
  return { schools: schoolRows, banks: bankRows.rows, accounts, plans };
}

export async function loadEducationTransportData(database: DatabaseExecutor): Promise<EducationTransportData> {
  const [schoolRows, studentRows, fleetRoutes, units, routes, journeyRows] = await Promise.all([
    listActiveEducationSchools(database), listOperationalEducationStudents(database, true),
    database.execute<{ id: string; code: string; name: string }>(sql`SELECT id, code, name FROM "FleetRoute" WHERE active = true ORDER BY name ASC`),
    database.execute<{ id: string; code: string; name: string }>(sql`SELECT id, code, name FROM "FleetUnit" WHERE status = 'ATIVO' ORDER BY name ASC`),
    database.select({ id: educationTransportRoutes.id, code: educationTransportRoutes.code, name: educationTransportRoutes.name }).from(educationTransportRoutes).orderBy(asc(educationTransportRoutes.name)),
    database.select({ id: educationTransportJourneys.id, startedAt: educationTransportJourneys.startedAt, endedAt: educationTransportJourneys.endedAt, status: educationTransportJourneys.status, route: { name: educationTransportRoutes.name }, unitName: sql<string | null>`fu.name` }).from(educationTransportJourneys).innerJoin(educationTransportRoutes, eq(educationTransportRoutes.id, educationTransportJourneys.routeId)).leftJoin(sql`"FleetUnit" fu`, sql`fu.id = ${educationTransportJourneys.fleetUnitId}`).orderBy(desc(educationTransportJourneys.startedAt)).limit(100),
  ]);
  const events = journeyRows.length ? await database.select({ journeyId: educationTransportEvents.journeyId, type: educationTransportEvents.type, notes: educationTransportEvents.notes }).from(educationTransportEvents).where(inArray(educationTransportEvents.journeyId, journeyRows.map(row => row.id))) : [];
  return { schools: schoolRows, students: studentRows, fleetRoutes: fleetRoutes.rows, units: units.rows, routes, journeys: journeyRows.map(({ unitName, ...row }) => ({ ...row, fleetUnit: unitName === null ? null : { name: unitName }, events: events.filter(event => event.journeyId === row.id) })) };
}

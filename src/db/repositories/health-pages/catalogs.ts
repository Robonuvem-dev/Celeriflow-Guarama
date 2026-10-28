import { and, asc, desc, eq, inArray, isNotNull, ne, or, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import type { HealthPageOption, HealthPageUnitScope } from "@/lib/contracts/health-pages";
import { healthUnits, healthTeams, healthProfessionals } from "@/db/schema/health-workforce";
import { healthSpecialties } from "@/db/schema/health-administration";
import { healthSusImportBatches, healthSusImportIssues, healthSusProcedures } from "@/db/schema/health-catalogs";
import { employees } from "@/db/schema/administration";
import { users } from "@/db/schema/identity";
import { neighborhoods } from "@/db/schema/localities";
import { procurementCovenants } from "@/db/schema/procurement-instruments";
import { healthAppointments } from "@/db/schema/health-agenda";
import { integrationConnections, integrationRuns } from "@/db/schema/integrations";
import { healthSusFiles, healthProductionCompetences } from "@/db/schema/health-production";
import { pageEsusBatches, pageLaboratoryConfigurations } from "@/db/schema/health-pages";

export async function healthPageUnits(db: DatabaseExecutor, units?: HealthPageUnitScope, active = true): Promise<HealthPageOption[]> {
  return db.select({ id: healthUnits.id, name: healthUnits.name }).from(healthUnits).where(and(active ? eq(healthUnits.isActive, true) : undefined, units ? inArray(healthUnits.id, [...units]) : undefined)).orderBy(asc(healthUnits.name));
}

export async function healthReportPageOptions(db: DatabaseExecutor, units: HealthPageUnitScope) {
  const [unitRows, specialties, professionals, teams, financingRows, municipalities, covenantStatuses, appointmentStatuses] = await Promise.all([
    healthPageUnits(db, units),
    db.select({ id: healthSpecialties.id, name: healthSpecialties.name }).from(healthSpecialties).where(and(eq(healthSpecialties.isActive, true), units ? sql`(EXISTS (SELECT 1 FROM "HealthUnitSpecialty" s WHERE s."specialtyId"=${healthSpecialties.id} AND s."isActive" AND s."unitId" IN (${units.length ? sql.join(units.map(id => sql`${id}`), sql`,`) : sql`NULL`})) OR EXISTS (SELECT 1 FROM "HealthProfessionalAssignment" a WHERE a."specialtyId"=${healthSpecialties.id} AND a."isActive" AND a."unitId" IN (${units.length ? sql.join(units.map(id => sql`${id}`), sql`,`) : sql`NULL`})))` : undefined)).orderBy(asc(healthSpecialties.name)),
    db.select({ id: healthProfessionals.id, employee: { name: employees.name } }).from(healthProfessionals).innerJoin(employees, eq(employees.id, healthProfessionals.employeeId)).where(and(eq(healthProfessionals.isActive, true), units ? or(inArray(healthProfessionals.unitId, [...units]), sql`EXISTS (SELECT 1 FROM "HealthProfessionalAssignment" a WHERE a."professionalId"=${healthProfessionals.id} AND a."isActive" AND a."unitId" IN (${units.length ? sql.join(units.map(id => sql`${id}`), sql`,`) : sql`NULL`}))`) : undefined)).orderBy(asc(employees.name)),
    db.select({ id: healthTeams.id, name: healthTeams.name, unit: { name: healthUnits.name } }).from(healthTeams).innerJoin(healthUnits, eq(healthUnits.id, healthTeams.unitId)).where(and(eq(healthTeams.isActive, true), units ? inArray(healthTeams.unitId, [...units]) : undefined)).orderBy(asc(healthUnits.name), asc(healthTeams.name)),
    db.selectDistinct({ financing: healthSusProcedures.financing }).from(healthSusProcedures).where(and(eq(healthSusProcedures.isCurrent, true), isNotNull(healthSusProcedures.financing))).orderBy(asc(healthSusProcedures.financing)),
    db.selectDistinct({ city: neighborhoods.city, state: neighborhoods.state }).from(neighborhoods).where(ne(neighborhoods.city, "")).orderBy(asc(neighborhoods.city), asc(neighborhoods.state)),
    db.selectDistinct({ status: procurementCovenants.status }).from(procurementCovenants).orderBy(asc(procurementCovenants.status)),
    db.selectDistinct({ status: healthAppointments.status }).from(healthAppointments).orderBy(asc(healthAppointments.status)),
  ]);
  return { units: unitRows, specialties, professionals, teams, financingRows, municipalities, covenantStatuses, appointmentStatuses };
}

export async function healthIntegrationPageData(db: DatabaseExecutor, codes: string[]) {
  const [connectionRows, files, batches] = await Promise.all([
    db.select().from(integrationConnections).where(inArray(integrationConnections.code, codes)).orderBy(asc(integrationConnections.code)),
    db.select({ fileType: healthSusFiles.fileType, status: healthSusFiles.status, createdAt: healthSusFiles.createdAt, competence: { period: healthProductionCompetences.period } }).from(healthSusFiles).innerJoin(healthProductionCompetences, eq(healthProductionCompetences.id, healthSusFiles.competenceId)).orderBy(desc(healthSusFiles.createdAt)).limit(5),
    db.select({ competence: pageEsusBatches.competence, status: pageEsusBatches.status, createdAt: pageEsusBatches.createdAt }).from(pageEsusBatches).orderBy(desc(pageEsusBatches.createdAt)).limit(5),
  ]);
  const connections = await Promise.all(connectionRows.map(async connection => ({ ...connection, runs: await db.select({ operation: integrationRuns.operation, status: integrationRuns.status, message: integrationRuns.message, createdAt: integrationRuns.createdAt }).from(integrationRuns).where(eq(integrationRuns.connectionId, connection.id)).orderBy(desc(integrationRuns.createdAt)).limit(5) })));
  return { connections, files, batches };
}

export async function healthSusImportPageRows(db: DatabaseExecutor) {
  const rows = await db.select({ batch: healthSusImportBatches, actorUsuario: { nome: users.nome } }).from(healthSusImportBatches).innerJoin(users, eq(users.id, healthSusImportBatches.actorUsuarioId)).orderBy(desc(healthSusImportBatches.startedAt), desc(healthSusImportBatches.id)).limit(20);
  return Promise.all(rows.map(async row => ({ ...row.batch, actorUsuario: row.actorUsuario, issues: await db.select({ id: healthSusImportIssues.id, rowNumber: healthSusImportIssues.rowNumber, entityType: healthSusImportIssues.entityType, reason: healthSusImportIssues.reason }).from(healthSusImportIssues).where(eq(healthSusImportIssues.batchId, row.batch.id)).orderBy(asc(healthSusImportIssues.rowNumber), asc(healthSusImportIssues.id)).limit(100) })));
}

export async function healthLaboratoryConfigurationPage(db: DatabaseExecutor, unitId: string, requestedPage: number) {
  const where = unitId ? eq(pageLaboratoryConfigurations.unitId, unitId) : undefined;
  const [{ total }] = await db.select({ total: sql<number>`count(*)::integer` }).from(pageLaboratoryConfigurations).where(where);
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / 20)));
  const [rows, units] = await Promise.all([
    db.select({ configuration: pageLaboratoryConfigurations, unit: { name: healthUnits.name }, createdByUsuario: { nome: users.nome } }).from(pageLaboratoryConfigurations).innerJoin(healthUnits, eq(healthUnits.id, pageLaboratoryConfigurations.unitId)).innerJoin(users, eq(users.id, pageLaboratoryConfigurations.createdByUsuarioId)).where(where).orderBy(desc(pageLaboratoryConfigurations.isActive), desc(pageLaboratoryConfigurations.createdAt)).limit(20).offset((page - 1) * 20),
    healthPageUnits(db),
  ]);
  return { total, page, units, configurations: rows.map(row => ({ ...row.configuration, unit: row.unit, createdByUsuario: row.createdByUsuario })) };
}

import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { departments } from "../../schema/administration";
import { planningEntityUnits } from "../../schema/planning-catalog";
import { judicialBudgetUnits, judicialGovernmentEntities, processJudicialCases, processJudicialCaseEvents } from "../../schema/process-judicial";
import { processes, processDocuments } from "../../schema/processes";
import { documentVersions } from "../../schema/document-workflow";
import { documents } from "../../schema/registry";

export async function readControlEntityUnits(db: DatabaseExecutor, isAdmin: boolean, allowedBudgetUnitIds: string[]) {
  return db.select({ budgetUnitId: planningEntityUnits.budgetUnitId, governmentEntityId: planningEntityUnits.governmentEntityId, secretariatId: judicialBudgetUnits.secretariatId, governmentEntity: { id: judicialGovernmentEntities.id, name: judicialGovernmentEntities.name } }).from(planningEntityUnits).innerJoin(judicialBudgetUnits, eq(judicialBudgetUnits.id, planningEntityUnits.budgetUnitId)).innerJoin(judicialGovernmentEntities, eq(judicialGovernmentEntities.id, planningEntityUnits.governmentEntityId)).where(isAdmin ? undefined : inArray(planningEntityUnits.budgetUnitId, allowedBudgetUnitIds));
}

export async function readUnambiguousDepartmentIds(db: DatabaseExecutor, governmentEntityId: string, secretariatIds: string[]) {
  // Evaluate every durable UG, including ones outside the viewer's own allowed
  // units. A missing binding or a second entity makes ownership ambiguous.
  return db.select({ id: departments.id }).from(departments).where(and(inArray(departments.secretariatId, secretariatIds), sql`EXISTS(SELECT 1 FROM "BudgetUnit" u JOIN "PlanningEntityUnit" p ON p."budgetUnitId"=u.id WHERE u."secretariatId"=${departments.secretariatId} AND p."governmentEntityId"=${governmentEntityId})`, sql`NOT EXISTS(SELECT 1 FROM "BudgetUnit" u LEFT JOIN "PlanningEntityUnit" p ON p."budgetUnitId"=u.id WHERE u."secretariatId"=${departments.secretariatId} AND p."governmentEntityId" IS DISTINCT FROM ${governmentEntityId})`));
}

export async function listJudicialCases(db: DatabaseExecutor, where: SQL | undefined, options: { limit: number; offset: number }) {
  const rows = await db.select({ case: processJudicialCases, process: { protocolNumber: processes.protocolNumber, status: processes.status } }).from(processJudicialCases).innerJoin(processes, eq(processes.id, processJudicialCases.processId)).where(where).orderBy(desc(processJudicialCases.openedAt), desc(processJudicialCases.id)).limit(options.limit).offset(options.offset);
  if (!rows.length) return [];
  const events = await db.select().from(processJudicialCaseEvents).where(inArray(processJudicialCaseEvents.caseId, rows.map(row => row.case.id))).orderBy(desc(processJudicialCaseEvents.version));
  return rows.map(row => ({ ...row.case, process: row.process, events: events.filter(event => event.caseId === row.case.id).slice(0, 1) }));
}

export async function readProcessJudicialRegistration(db: DatabaseExecutor, id: string, scope: SQL) {
  const [row] = await db.select({ process: processes, currentDepartment: { secretariatId: departments.secretariatId } }).from(processes).leftJoin(departments, eq(departments.id, processes.currentDepartmentId)).where(and(eq(processes.id, id), scope)).limit(1);
  if (!row) return null;
  const [judicialCase] = await db.select().from(processJudicialCases).where(eq(processJudicialCases.processId, id)).limit(1);
  const events = judicialCase ? await db.select().from(processJudicialCaseEvents).where(eq(processJudicialCaseEvents.caseId, judicialCase.id)).orderBy(desc(processJudicialCaseEvents.version)) : [];
  return { ...row.process, currentDepartment: row.currentDepartment, judicialCase: judicialCase ? { ...judicialCase, events } : null };
}

export async function readJudicialRegistrationOptions(db: DatabaseExecutor, processId: string, secretariatId: string, allowedBudgetUnitIds?: string[]) {
  const [units, versions] = await Promise.all([
    db.select({ id: judicialBudgetUnits.id, name: judicialBudgetUnits.name, governmentEntity: { name: judicialGovernmentEntities.name } }).from(judicialBudgetUnits).innerJoin(planningEntityUnits, eq(planningEntityUnits.budgetUnitId, judicialBudgetUnits.id)).innerJoin(judicialGovernmentEntities, eq(judicialGovernmentEntities.id, planningEntityUnits.governmentEntityId)).where(and(eq(judicialBudgetUnits.secretariatId, secretariatId), allowedBudgetUnitIds ? inArray(judicialBudgetUnits.id, allowedBudgetUnitIds) : undefined)).orderBy(asc(judicialBudgetUnits.name)),
    db.select({ version: documentVersions, document: { title: documents.title } }).from(documentVersions).innerJoin(documents, eq(documents.id, documentVersions.documentId)).innerJoin(processDocuments, and(eq(processDocuments.documentId, documents.id), eq(processDocuments.processId, processId))).where(and(inArray(documentVersions.status, ["FINAL", "SIGNED"]), eq(documents.status, "Válido"))).orderBy(asc(documentVersions.documentId), desc(documentVersions.versionNumber)),
  ]);
  return { units: units.map(unit => ({ id: unit.id, name: unit.name, planningEntityUnit: { governmentEntity: unit.governmentEntity } })), documents: versions.map(row => ({ ...row.version, document: row.document })) };
}

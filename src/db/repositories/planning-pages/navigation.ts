import { and, asc, count, desc, eq, getTableColumns, inArray, ne } from "drizzle-orm";
import type { PlanningContext } from "@/lib/planejamento/access";
import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import type { ReadExecutor } from "@/lib/contracts/planning-pages";
import { planningEntityScope, planningInstrumentScope, planningLineScope } from "@/db/repositories/planning/scope";
import { planningBudgetUnits as units, planningEntityUnits, planningInstruments as instruments, planningLines as lines } from "@/db/schema/planning-budget";
import { planningActions, planningIndicators, planningObjectives, planningPrograms, planningResourceSources as sources } from "@/db/schema/planning-legal";
import { governmentEntities } from "@/db/schema/master-data";
import { pageNumber, offset } from "./shared";

export async function pageEntities(database: ReadExecutor, context: PlanningContext, admin: boolean) {
  const rows = await database.select().from(governmentEntities).where(planningEntityScope(context, governmentEntities.id)).orderBy(asc(governmentEntities.name), asc(governmentEntities.id));
  const links = await database.select({ link: planningEntityUnits, budgetUnit: units }).from(planningEntityUnits).innerJoin(units, eq(units.id, planningEntityUnits.budgetUnitId)).where(and(inArray(planningEntityUnits.governmentEntityId, rows.map(row => row.id)), isSystemAdministrator(context.user) ? undefined : inArray(planningEntityUnits.budgetUnitId, context.user.allowedBudgetUnitIds)));
  const [allEntities, allUnits] = admin ? await Promise.all([database.select({ id: governmentEntities.id, name: governmentEntities.name }).from(governmentEntities).where(eq(governmentEntities.status, "ATIVA")).orderBy(asc(governmentEntities.name)), database.select({ id: units.id, name: units.name }).from(units).orderBy(asc(units.name))]) : [[], []];
  return { entities: rows.map(row => ({ ...row, planningUnits: links.filter(link => link.link.governmentEntityId === row.id).map(link => ({ ...link.link, budgetUnit: link.budgetUnit })) })), allEntities, units: allUnits };
}
export function pageParentOptions(database: ReadExecutor, context: PlanningContext, kind: "PPA" | "LDO") {
  return database.select({ id: instruments.id, title: instruments.title, governmentEntity: { name: governmentEntities.name } }).from(instruments).innerJoin(governmentEntities, eq(governmentEntities.id, instruments.governmentEntityId)).where(and(planningInstrumentScope(context), eq(instruments.kind, kind))).orderBy(desc(instruments.startYear), asc(instruments.id)).limit(20);
}
export async function pagePrograms(database: ReadExecutor, ppaId: string) {
  const rows = await database.select().from(planningPrograms).where(eq(planningPrograms.multiYearPlanId, ppaId)).orderBy(asc(planningPrograms.code)).limit(20);
  return Promise.all(rows.map(async row => {
    const [actions, objectives] = await Promise.all([database.select().from(planningActions).where(eq(planningActions.programId, row.id)).orderBy(asc(planningActions.code)).limit(20), database.select().from(planningObjectives).where(eq(planningObjectives.programId, row.id)).limit(20)]);
    return { ...row, actions, objectives: await Promise.all(objectives.map(async objective => ({ ...objective, indicators: await database.select().from(planningIndicators).where(eq(planningIndicators.objectiveId, objective.id)).limit(20) }))) };
  }));
}
export function pageCounterparties(database: ReadExecutor, entityId: string) { return database.select({ id: governmentEntities.id, name: governmentEntities.name }).from(governmentEntities).where(and(eq(governmentEntities.status, "ATIVA"), ne(governmentEntities.id, entityId))).orderBy(asc(governmentEntities.name), asc(governmentEntities.id)).limit(20); }
export async function pageImports(database: ReadExecutor, context: PlanningContext, input: { sourceId?: string; page?: string }) {
  const pieces = await database.select({ ...getTableColumns(instruments), governmentEntity: { name: governmentEntities.name } }).from(instruments).innerJoin(governmentEntities, eq(governmentEntities.id, instruments.governmentEntityId)).where(planningInstrumentScope(context)).orderBy(desc(instruments.startYear), asc(instruments.id)).limit(20);
  const where = and(eq(lines.instrumentId, input.sourceId ?? ""), planningLineScope(context));
  const total = (await database.select({ value: count() }).from(lines).where(where))[0].value, page = pageNumber(input.page, total);
  const records = await database.select({ ...getTableColumns(lines), budgetUnit: { name: units.name }, resourceSource: { name: sources.name } }).from(lines).innerJoin(units, eq(units.id, lines.budgetUnitId)).innerJoin(sources, eq(sources.id, lines.resourceSourceId)).where(where).orderBy(asc(lines.code), asc(lines.id)).offset(offset(page)).limit(20);
  return { instruments: pieces, total, page, records };
}

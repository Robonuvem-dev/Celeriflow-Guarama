import { and, asc, count, desc, eq, getTableColumns, inArray } from "drizzle-orm";
import type { ReadExecutor, PlanningPageSearch } from "@/lib/contracts/planning-pages";
import type { PlanningContext } from "@/lib/planejamento/access";
import { planningLineScope } from "@/db/repositories/planning/scope";
import { planningLines } from "@/db/schema/planning-budget";
import { planningActions as actions, planningAnnualPrograms as annual, planningIndicators as indicators, planningMemories as memories, planningObjectives as objectives, planningPlannedWorks as works, planningPriorities as priorities, planningPrograms as programs, planningRisks as risks, planningWaivers as waivers } from "@/db/schema/planning-legal";
import { contains, offset } from "./shared";

export async function pageMaintenanceOptions(database: ReadExecutor, ppaId: string) {
  const [programRows, actionRows, objectiveRows] = await Promise.all([
    database.select({ id: programs.id, name: programs.name }).from(programs).where(eq(programs.multiYearPlanId, ppaId)).orderBy(asc(programs.code), asc(programs.id)).limit(20),
    database.select({ id: actions.id, name: actions.name }).from(actions).innerJoin(programs, eq(programs.id, actions.programId)).where(eq(programs.multiYearPlanId, ppaId)).orderBy(asc(actions.code), asc(actions.id)).limit(20),
    database.select({ id: objectives.id, description: objectives.description }).from(objectives).innerJoin(programs, eq(programs.id, objectives.programId)).where(eq(programs.multiYearPlanId, ppaId)).orderBy(asc(objectives.code), asc(objectives.id)).limit(20),
  ]);
  return { programs: programRows, actions: actionRows, objectives: objectiveRows };
}
export async function pageMaintenanceRecords(database: ReadExecutor, context: PlanningContext, piece: { id: string; budgetGuidelineId: string | null }, ppaId: string, entity: string, input: PlanningPageSearch, programNames: { id: string; name: string }[]) {
  const q = input.q?.slice(0, 200), requested = Math.max(1, Number(input.page) || 1);
  const skip = (total: number) => offset(Math.min(requested, Math.max(1, Math.ceil(total / 20))));
  const valuesOf = (record: object) => Object.fromEntries(Object.entries(record).filter(([, value]) => value !== null && typeof value !== "object" || value instanceof Date || value && typeof value === "object" && "toFixed" in value).map(([key, value]) => [key, value instanceof Date ? value.toISOString().slice(0, 10) : String(value)]));
  const record = (row: { id: string }, label: string) => ({ id: row.id, label, values: valuesOf(row) });
  if (entity === "PROGRAM") {
    const where = and(eq(programs.multiYearPlanId, ppaId), contains(programs.name, q));
    const total = (await database.select({ value: count() }).from(programs).where(where))[0].value;
    const rows = await database.select().from(programs).where(where).orderBy(asc(programs.code), asc(programs.id)).offset(skip(total)).limit(20);
    return { total, records: rows.map(row => record(row, `${row.code} · ${row.name}`)) };
  }
  if (entity === "ACTION") {
    const where = and(eq(programs.multiYearPlanId, ppaId), contains(actions.name, q));
    const total = (await database.select({ value: count() }).from(actions).innerJoin(programs, eq(programs.id, actions.programId)).where(where))[0].value;
    const rows = await database.select(getTableColumns(actions)).from(actions).innerJoin(programs, eq(programs.id, actions.programId)).where(where).orderBy(asc(actions.code), asc(actions.id)).offset(skip(total)).limit(20);
    return { total, records: rows.map(row => record(row, `${row.code} · ${row.name}`)) };
  }
  if (entity === "OBJECTIVE") {
    const where = and(eq(programs.multiYearPlanId, ppaId), contains(objectives.description, q));
    const total = (await database.select({ value: count() }).from(objectives).innerJoin(programs, eq(programs.id, objectives.programId)).where(where))[0].value;
    const rows = await database.select(getTableColumns(objectives)).from(objectives).innerJoin(programs, eq(programs.id, objectives.programId)).where(where).orderBy(asc(objectives.code), asc(objectives.id)).offset(skip(total)).limit(20);
    return { total, records: rows.map(row => record(row, row.description)) };
  }
  if (entity === "INDICATOR") {
    const where = and(eq(programs.multiYearPlanId, ppaId), contains(indicators.name, q));
    const total = (await database.select({ value: count() }).from(indicators).innerJoin(objectives, eq(objectives.id, indicators.objectiveId)).innerJoin(programs, eq(programs.id, objectives.programId)).where(where))[0].value;
    const rows = await database.select(getTableColumns(indicators)).from(indicators).innerJoin(objectives, eq(objectives.id, indicators.objectiveId)).innerJoin(programs, eq(programs.id, objectives.programId)).where(where).orderBy(asc(indicators.name), asc(indicators.id)).offset(skip(total)).limit(20);
    return { total, records: rows.map(row => record(row, row.name)) };
  }
  if (entity === "LINE") {
    const where = and(eq(planningLines.instrumentId, piece.id), planningLineScope(context), inArray(planningLines.kind, ["REVENUE", "EXPENSE"]), contains(planningLines.description, q));
    const total = (await database.select({ value: count() }).from(planningLines).where(where))[0].value;
    const rows = await database.select().from(planningLines).where(where).orderBy(asc(planningLines.year), asc(planningLines.code), asc(planningLines.id)).offset(skip(total)).limit(20);
    return { total, records: rows.map(row => record(row, `${row.code} · ${row.description}`)) };
  }
  if (entity === "MEMORY") {
    const where = and(eq(memories.instrumentId, piece.id), contains(memories.title, q));
    const total = (await database.select({ value: count() }).from(memories).where(where))[0].value;
    const rows = await database.select().from(memories).where(where).orderBy(desc(memories.createdAt), asc(memories.id)).offset(skip(total)).limit(20);
    return { total, records: rows.map(row => record(row, row.title)) };
  }
  if (entity === "WAIVER") {
    const where = and(eq(waivers.instrumentId, piece.id), contains(waivers.description, q));
    const total = (await database.select({ value: count() }).from(waivers).where(where))[0].value;
    const rows = await database.select().from(waivers).where(where).orderBy(asc(waivers.year), asc(waivers.id)).offset(skip(total)).limit(20);
    return { total, records: rows.map(row => record(row, row.description)) };
  }
  if (entity === "PRIORITY") {
    const where = and(eq(priorities.budgetGuidelineId, piece.budgetGuidelineId ?? ""), contains(priorities.description, q));
    const total = (await database.select({ value: count() }).from(priorities).where(where))[0].value;
    const rows = await database.select().from(priorities).where(where).orderBy(asc(priorities.id)).offset(skip(total)).limit(20);
    return { total, records: rows.map(row => record(row, row.description)) };
  }
  if (entity === "RISK") {
    const where = and(eq(risks.budgetGuidelineId, piece.budgetGuidelineId ?? ""), contains(risks.description, q));
    const total = (await database.select({ value: count() }).from(risks).where(where))[0].value;
    const rows = await database.select().from(risks).where(where).orderBy(asc(risks.id)).offset(skip(total)).limit(20);
    return { total, records: rows.map(row => record(row, row.description)) };
  }
  if (entity === "WORK") {
    const where = and(eq(works.instrumentId, piece.id), contains(works.title, q));
    const total = (await database.select({ value: count() }).from(works).where(where))[0].value;
    const rows = await database.select().from(works).where(where).orderBy(asc(works.year), asc(works.id)).offset(skip(total)).limit(20);
    return { total, records: rows.map(row => record(row, row.title)) };
  }
  const total = (await database.select({ value: count() }).from(annual).where(eq(annual.instrumentId, piece.id)))[0].value;
  const rows = await database.select().from(annual).where(eq(annual.instrumentId, piece.id)).orderBy(asc(annual.year), asc(annual.id)).offset(skip(total)).limit(20);
  return { total, records: rows.map(row => record(row, `${programNames.find(program => program.id === row.programId)?.name ?? "Programa"} · ${row.year}`)) };
}

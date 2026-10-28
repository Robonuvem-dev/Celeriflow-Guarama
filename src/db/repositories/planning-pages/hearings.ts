import { and, asc, count, desc, eq, getTableColumns, inArray } from "drizzle-orm";
import type { ReadExecutor } from "@/lib/contracts/planning-pages";
import type { PlanningContext } from "@/lib/planejamento/access";
import { planningInstrumentScope, planningUnitScope } from "@/db/repositories/planning/scope";
import { planningBudgetUnits as units, planningDocumentLinks as links, planningHearings as hearings, planningInstruments as pieces } from "@/db/schema/planning-budget";
import { documents } from "@/db/schema/registry";
import { pageDemands as demands } from "@/db/schema/planning-pages";
import { offset, pageNumber, pageUnitOptions } from "./shared";

export async function pageHearings(database: ReadExecutor, context: PlanningContext, input: { hearingId?: string; page?: string }) {
  const where = and(planningInstrumentScope(context, hearings.instrumentId), planningUnitScope(context, demands.responsibleUnitId), input.hearingId ? eq(demands.hearingId, input.hearingId) : undefined);
  const total = (await database.select({ value: count() }).from(demands).innerJoin(hearings, eq(hearings.id, demands.hearingId)).where(where))[0].value, page = pageNumber(input.page, total);
  const [hearingRows, instruments, unitRows, demandRows] = await Promise.all([
    database.select({ id: hearings.id, instrumentId: hearings.instrumentId, title: hearings.title, heldAt: hearings.heldAt, location: hearings.location, minutes: hearings.minutes }).from(hearings).where(planningInstrumentScope(context, hearings.instrumentId)).orderBy(desc(hearings.heldAt), asc(hearings.id)),
    database.select({ id: pieces.id, title: pieces.title }).from(pieces).where(planningInstrumentScope(context)).orderBy(desc(pieces.startYear), asc(pieces.id)),
    pageUnitOptions(database, context),
    database.select({ ...getTableColumns(demands), hearing: { title: hearings.title }, responsibleUnit: { name: units.name } }).from(demands).innerJoin(hearings, eq(hearings.id, demands.hearingId)).innerJoin(units, eq(units.id, demands.responsibleUnitId)).where(where).orderBy(desc(demands.createdAt), asc(demands.id)).offset(offset(page)).limit(20),
  ]);
  const documentLinks = await database.select({ hearingId: links.hearingId, id: links.id, purpose: links.purpose, document: { title: documents.title } }).from(links).innerJoin(documents, eq(documents.id, links.documentId)).where(inArray(links.hearingId, hearingRows.map(row => row.id))).orderBy(desc(links.createdAt));
  return { total, page, instruments, units: unitRows, demands: demandRows, hearings: hearingRows.map(row => ({ ...row, documentLinks: documentLinks.filter(link => link.hearingId === row.id).map(({ id, purpose, document }) => ({ id, purpose, document })) })) };
}

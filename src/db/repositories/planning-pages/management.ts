import { and, asc, count, desc, eq, getTableColumns, inArray, isNull, ne, notExists, sql } from "drizzle-orm";
import type { ReadExecutor } from "@/lib/contracts/planning-pages";
import type { PlanningContext } from "@/lib/planejamento/access";
import { planningInstrumentScope, planningLineScope, planningUnitScope } from "@/db/repositories/planning/scope";
import { planningAppropriations as appropriations, planningBudgetLaws as laws, planningBudgetUnits as units, planningCreditBatches as credits, planningCreditLines as creditItems, planningDocumentLinks as links, planningHearings as hearings, planningInstruments as instruments, planningLines as lines, planningQuotas as quotas, planningQuotaEvents as events } from "@/db/schema/planning-budget";
import { planningActions as actions, planningLegislativeLinks, planningPrograms as programs, planningResourceSources as sources, planningVersions as versions, planningWaivers as waivers } from "@/db/schema/planning-legal";
import { pageAmendments as amendments, pageAmendmentItems as amendmentItems } from "@/db/schema/planning-pages";
import { financeCreditRequests as requests } from "@/db/schema/finance-legacy-budget";
import { councilors } from "@/db/schema/chamber";
import { documents } from "@/db/schema/registry";
import { users } from "@/db/schema/identity";
import { governmentEntities } from "@/db/schema/master-data";
import { offset, pageNumber } from "./shared";

export async function pageManagementLines(database: ReadExecutor, context: PlanningContext, id: string, input?: string) {
  const where = and(eq(lines.instrumentId, id), planningLineScope(context));
  const lineTotal = (await database.select({ value: count() }).from(lines).where(where))[0].value, linePage = pageNumber(input, lineTotal);
  const rows = await database.select({ ...getTableColumns(lines), budgetUnit: units, resourceSource: sources }).from(lines).innerJoin(units, eq(units.id, lines.budgetUnitId)).innerJoin(sources, eq(sources.id, lines.resourceSourceId)).where(where).orderBy(asc(lines.year), asc(lines.code), asc(lines.id)).offset(offset(linePage)).limit(20);
  return { lineTotal, linePage, lines: rows };
}
export function pageDocumentOptions(database: ReadExecutor, entityId: string) {
  return database.select({ id: documents.id, title: documents.title }).from(documents).where(and(sql`starts_with(${documents.documentType}, 'PLANEJAMENTO:')`, eq(documents.status, "Válido"), isNull(documents.personId), isNull(documents.companyId), notExists(database.select({ id: links.id }).from(links).innerJoin(instruments, eq(instruments.id, links.instrumentId)).where(and(eq(links.documentId, documents.id), ne(instruments.governmentEntityId, entityId)))))).orderBy(asc(documents.title), asc(documents.id)).limit(20);
}
export async function pageDocuments(database: ReadExecutor, id: string, entityId: string, input: number) {
  const where = eq(links.instrumentId, id);
  const total = (await database.select({ value: count() }).from(links).where(where))[0].value, page = pageNumber(input, total);
  const [rows, documentRows, hearingRows] = await Promise.all([
    database.select({ ...getTableColumns(links), document: documents, hearing: hearings }).from(links).innerJoin(documents, eq(documents.id, links.documentId)).leftJoin(hearings, eq(hearings.id, links.hearingId)).where(where).orderBy(desc(links.createdAt), asc(links.id)).offset(offset(page)).limit(20),
    pageDocumentOptions(database, entityId),
    database.select({ id: hearings.id, title: hearings.title }).from(hearings).where(eq(hearings.instrumentId, id)).orderBy(desc(hearings.heldAt), asc(hearings.id)).limit(20),
  ]);
  return { total, page, links: rows, documents: documentRows, hearings: hearingRows };
}
export function pageSigners(database: ReadExecutor) { return database.select({ id: users.id, nome: users.nome }).from(users).where(eq(users.ativo, true)).orderBy(asc(users.nome), asc(users.id)).limit(100); }
export async function pageVersions(database: ReadExecutor, id: string, input: number) {
  const where = eq(versions.instrumentId, id), total = (await database.select({ value: count() }).from(versions).where(where))[0].value, current = pageNumber(input, total);
  return { total, current, versions: await database.select().from(versions).where(where).orderBy(desc(versions.number)).offset(offset(current)).limit(20) };
}
export function pagePeers(database: ReadExecutor, context: PlanningContext, id: string, entityId: string) { return database.select({ id: instruments.id, title: instruments.title, revision: instruments.revision }).from(instruments).where(and(eq(instruments.governmentEntityId, entityId), ne(instruments.id, id), planningInstrumentScope(context))).orderBy(asc(instruments.id)); }
export function pageCouncilors(database: ReadExecutor) { return database.select({ id: councilors.id, nomeCompleto: councilors.nomeCompleto }).from(councilors).where(eq(councilors.active, true)).orderBy(asc(councilors.nomeCompleto), asc(councilors.id)); }
export async function pageAmendmentList(database: ReadExecutor, context: PlanningContext, id: string, input: number) {
  const where = and(eq(amendments.instrumentId, id), notExists(database.select({ id: amendmentItems.id }).from(amendmentItems).innerJoin(lines, eq(lines.id, amendmentItems.lineId)).where(and(eq(amendmentItems.amendmentId, amendments.id), sql`(${planningLineScope(context)}) IS NOT TRUE`))));
  const total = (await database.select({ value: count() }).from(amendments).where(where))[0].value, page = pageNumber(input, total);
  const rows = await database.select({ ...getTableColumns(amendments), councilor: councilors }).from(amendments).innerJoin(councilors, eq(councilors.id, amendments.councilorId)).where(where).orderBy(desc(amendments.date), asc(amendments.id)).offset(offset(page)).limit(20);
  const items = await database.select({ ...getTableColumns(amendmentItems), line: lines }).from(amendmentItems).innerJoin(lines, eq(lines.id, amendmentItems.lineId)).where(inArray(amendmentItems.amendmentId, rows.map(row => row.id)));
  return { total, page, records: rows.map(row => ({ ...row, items: items.filter(item => item.amendmentId === row.id) })) };
}
export async function pageQuotaList(database: ReadExecutor, context: PlanningContext, id: string, lineId?: string, input?: string) {
  const where = and(eq(lines.instrumentId, id), planningLineScope(context), lineId ? eq(lines.id, lineId) : undefined);
  const total = (await database.select({ value: count() }).from(quotas).innerJoin(lines, eq(lines.id, quotas.lineId)).where(where))[0].value, quotaPage = pageNumber(input, total);
  const rows = await database.select({ quota: quotas, line: lines, resourceSource: sources }).from(quotas).innerJoin(lines, eq(lines.id, quotas.lineId)).innerJoin(sources, eq(sources.id, lines.resourceSourceId)).where(where).orderBy(asc(quotas.lineId), asc(quotas.month)).offset(offset(quotaPage)).limit(20);
  const eventRows = await database.select().from(events).where(and(inArray(events.quotaId, rows.map(row => row.quota.id)), inArray(events.type, ["BLOCK", "CONSUME", "PAY"]))).orderBy(asc(events.createdAt));
  return { total, quotaPage, quotas: rows.map(row => ({ ...row.quota, line: { ...row.line, resourceSource: row.resourceSource }, events: eventRows.filter(event => event.quotaId === row.quota.id) })) };
}
export function pageCreditScope(database: ReadExecutor, context: PlanningContext) { return notExists(database.select({ id: creditItems.id }).from(creditItems).innerJoin(lines, eq(lines.id, creditItems.lineId)).where(and(eq(creditItems.batchId, credits.id), sql`(${planningLineScope(context)}) IS NOT TRUE`))); }
export async function pageCredits(database: ReadExecutor, context: PlanningContext, id: string, input: number) {
  const where = and(eq(credits.instrumentId, id), pageCreditScope(database, context));
  const total = (await database.select({ value: count() }).from(credits).where(where))[0].value, page = pageNumber(input, total);
  const rows = await database.select({ ...getTableColumns(credits), creditRequest: requests }).from(credits).innerJoin(requests, eq(requests.id, credits.creditRequestId)).where(where).orderBy(desc(credits.createdAt), asc(credits.id)).offset(offset(page)).limit(20);
  const items = await database.select({ ...getTableColumns(creditItems), line: lines }).from(creditItems).innerJoin(lines, eq(lines.id, creditItems.lineId)).where(inArray(creditItems.batchId, rows.map(row => row.id)));
  return { total, page, records: rows.map(row => ({ ...row, items: items.filter(item => item.batchId === row.id) })) };
}
export function pageLegislativeLinks(database: ReadExecutor, id: string) { return database.select().from(planningLegislativeLinks).where(eq(planningLegislativeLinks.instrumentId, id)).orderBy(desc(planningLegislativeLinks.createdAt), asc(planningLegislativeLinks.id)).limit(20); }
export function pagePredecessors(database: ReadExecutor, context: PlanningContext, piece: { governmentEntityId: string; startYear: number }) { return database.select({ id: instruments.id, title: instruments.title }).from(instruments).innerJoin(laws, eq(laws.id, instruments.annualBudgetLawId)).where(and(planningInstrumentScope(context), eq(instruments.governmentEntityId, piece.governmentEntityId), eq(instruments.kind, "LOA"), eq(instruments.startYear, piece.startYear - 1), eq(laws.status, "PUBLISHED"))).orderBy(asc(instruments.id)); }
export async function pageLegacy(database: ReadExecutor, context: PlanningContext, yearId: string, entityId: string, input?: string) {
  const where = and(eq(appropriations.financialYearId, yearId), planningUnitScope(context, appropriations.budgetUnitId), sql`EXISTS (SELECT 1 FROM "PlanningEntityUnit" eu WHERE eu."budgetUnitId"=${appropriations.budgetUnitId} AND eu."governmentEntityId"=${entityId})`, notExists(database.select({ id: lines.id }).from(lines).where(eq(lines.appropriationId, appropriations.id))));
  const legacyTotal = (await database.select({ value: count() }).from(appropriations).where(where))[0].value, legacyPage = pageNumber(input, legacyTotal);
  return { legacyTotal, legacyPage, legacy: await database.select({ id: appropriations.id, code: appropriations.code, budgetUnit: { name: units.name } }).from(appropriations).innerJoin(units, eq(units.id, appropriations.budgetUnitId)).where(where).orderBy(asc(appropriations.code), asc(appropriations.id)).offset(offset(legacyPage)).limit(20) };
}
export function pageWaiverOptions(database: ReadExecutor, id: string) { return database.select({ id: waivers.id, description: waivers.description }).from(waivers).where(eq(waivers.instrumentId, id)).orderBy(asc(waivers.year), asc(waivers.id)).limit(20); }
export async function pageReportOptions(database: ReadExecutor, context: PlanningContext, id: string) {
  const [pieces, dimensions, creditRows, sourceRows] = await Promise.all([
    database.select({ id: instruments.id, title: instruments.title, kind: instruments.kind, governmentEntity: { name: governmentEntities.name } }).from(instruments).innerJoin(governmentEntities, eq(governmentEntities.id, instruments.governmentEntityId)).where(planningInstrumentScope(context)).orderBy(desc(instruments.startYear), asc(instruments.id)).limit(20),
    database.select({ programId: lines.programId, actionId: lines.actionId, program: { id: programs.id, name: programs.name }, action: { id: actions.id, name: actions.name } }).from(lines).leftJoin(programs, eq(programs.id, lines.programId)).leftJoin(actions, eq(actions.id, lines.actionId)).where(and(eq(lines.instrumentId, id), planningLineScope(context))).then(rows => { const seen = new Set<string>(); return rows.filter(row => { const key = JSON.stringify([row.programId, row.actionId]); if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 20).map(({ program, action }) => ({ program, action })); }),
    database.select({ id: credits.id, creditRequest: { number: requests.number } }).from(credits).innerJoin(requests, eq(requests.id, credits.creditRequestId)).where(and(eq(credits.instrumentId, id), pageCreditScope(database, context))).orderBy(desc(credits.createdAt), asc(credits.id)).limit(20),
    database.select({ id: sources.id, name: sources.name }).from(sources).orderBy(asc(sources.code)).limit(20),
  ]);
  return { pieces, dimensions, credits: creditRows, sources: sourceRows };
}

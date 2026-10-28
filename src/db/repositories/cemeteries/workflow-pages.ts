import { and, asc, count, desc, eq, gte, ilike, inArray, lt, ne, or } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { cemeteries, cemeteryChapels, cemeteryDeathCauses, cemeteryDeceased, cemeteryFeeEvents, cemeteryFuneralHomes, cemeteryGraves, cemeteryMovements, cemeteryOssuaries, cemeteryProcesses } from "../../schema/cemeteries";
import { people } from "../../schema/people";
import { companies, taxpayers } from "../../schema/registry";
import { taxes, taxAssessments, taxGuides } from "../../schema/taxation-core";
import { taxPayments } from "../../schema/tax-accounting";
import { cemeteryEventDayStart } from "@/lib/cemeteries/query-policy";
import { workflowPage } from "@/lib/cemeteries/workflow";
import { readStructureOperators, readStructureTaxpayers } from "./structure";
import type { CemeteryFuneralHomeRecord } from "@/lib/contracts/cemeteries";
import type { WorkflowProcess, WorkflowProcessDetail, WorkflowDeceased, CemeteryTransferPage, CemeteryGuideDetail } from "@/lib/contracts/cemeteries-workflow";
import type { TaxpayerDetails } from "@/lib/contracts/registry";

const contains = (value: string) => `%${value.replace(/[\\%_]/g, c => `\\${c}`)}%`;

export async function readScheduledProcessPage(db: DatabaseExecutor, filters: { q: string; type: string; status: string; cemeteryId: string; start: string; end: string; page: number }): Promise<{ rows: WorkflowProcess[]; total: number; page: number }> {
  const endDay = filters.end ? new Date(new Date(`${filters.end}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10) : "";
  const where = and(filters.q ? or(ilike(cemeteryProcesses.receiptCode, contains(filters.q)), ilike(cemeteryDeceased.fullName, contains(filters.q))) : undefined,
    filters.type ? eq(cemeteryProcesses.processType, filters.type) : undefined, filters.status ? eq(cemeteryProcesses.status, filters.status) : undefined,
    filters.cemeteryId ? eq(cemeteryProcesses.cemeteryId, filters.cemeteryId) : undefined,
    filters.start ? gte(cemeteryProcesses.scheduledAt, cemeteryEventDayStart(filters.start)) : undefined,
    endDay ? lt(cemeteryProcesses.scheduledAt, cemeteryEventDayStart(endDay)) : undefined);
  const [{ total }] = await db.select({ total: count() }).from(cemeteryProcesses).innerJoin(cemeteryDeceased, eq(cemeteryDeceased.id, cemeteryProcesses.deceasedId)).where(where);
  const page = Math.min(filters.page, Math.max(1, Math.ceil(total / 20)));
  const rows = await db.select({ process: cemeteryProcesses, deceased: cemeteryDeceased, cemetery: cemeteries, grave: cemeteryGraves, chapel: cemeteryChapels }).from(cemeteryProcesses).innerJoin(cemeteryDeceased, eq(cemeteryDeceased.id, cemeteryProcesses.deceasedId)).leftJoin(cemeteries, eq(cemeteries.id, cemeteryProcesses.cemeteryId)).leftJoin(cemeteryGraves, eq(cemeteryGraves.id, cemeteryProcesses.graveId)).leftJoin(cemeteryChapels, eq(cemeteryChapels.id, cemeteryProcesses.chapelId)).where(where).orderBy(desc(cemeteryProcesses.scheduledAt), desc(cemeteryProcesses.id)).limit(20).offset((page - 1) * 20);
  return { total, page, rows: rows.map(({ process, ...relations }) => ({ ...process, ...relations })) };
}
export async function readWorkflowProcess(db: DatabaseExecutor, key: { id: string } | { receiptCode: string }): Promise<WorkflowProcessDetail | null> {
  const [row] = await db.select({ process: cemeteryProcesses, deceased: cemeteryDeceased, cause: cemeteryDeathCauses, funeralHome: cemeteryFuneralHomes, cemetery: cemeteries, grave: cemeteryGraves, chapel: cemeteryChapels }).from(cemeteryProcesses).innerJoin(cemeteryDeceased, eq(cemeteryDeceased.id, cemeteryProcesses.deceasedId)).leftJoin(cemeteryDeathCauses, eq(cemeteryDeathCauses.id, cemeteryDeceased.causeId)).leftJoin(cemeteryFuneralHomes, eq(cemeteryFuneralHomes.id, cemeteryDeceased.funeralHomeId)).leftJoin(cemeteries, eq(cemeteries.id, cemeteryProcesses.cemeteryId)).leftJoin(cemeteryGraves, eq(cemeteryGraves.id, cemeteryProcesses.graveId)).leftJoin(cemeteryChapels, eq(cemeteryChapels.id, cemeteryProcesses.chapelId)).where("id" in key ? eq(cemeteryProcesses.id, key.id) : eq(cemeteryProcesses.receiptCode, key.receiptCode)).limit(1);
  return row ? { ...row.process, deceased: { ...row.deceased, cause: row.cause, funeralHome: row.funeralHome }, cemetery: row.cemetery, grave: row.grave, chapel: row.chapel } : null;
}
export async function readWorkflowFuneralHome(db: DatabaseExecutor, id: string): Promise<CemeteryFuneralHomeRecord | null> {
  return (await db.select().from(cemeteryFuneralHomes).where(eq(cemeteryFuneralHomes.id, id)).limit(1))[0] ?? null;
}
export async function readWorkflowTaxpayer(db: DatabaseExecutor, id: string): Promise<TaxpayerDetails | null> {
  return (await readStructureTaxpayers(db, [id]))[0] ?? null;
}
export async function readWorkflowDeceased(db: DatabaseExecutor, id: string): Promise<WorkflowDeceased | null> {
  const [row] = await db.select({ deceased: cemeteryDeceased, cause: cemeteryDeathCauses, funeralHome: cemeteryFuneralHomes, grave: cemeteryGraves, cemetery: cemeteries }).from(cemeteryDeceased).leftJoin(cemeteryDeathCauses, eq(cemeteryDeathCauses.id, cemeteryDeceased.causeId)).leftJoin(cemeteryFuneralHomes, eq(cemeteryFuneralHomes.id, cemeteryDeceased.funeralHomeId)).leftJoin(cemeteryGraves, eq(cemeteryGraves.id, cemeteryDeceased.graveId)).leftJoin(cemeteries, eq(cemeteries.id, cemeteryGraves.cemeteryId)).where(eq(cemeteryDeceased.id, id)).limit(1);
  if (!row) return null;
  // grave.cemetery is a required FK, exactly as in the original include.
  if (row.grave && !row.cemetery) throw new Error("Cemitério da sepultura não encontrado.");
  return { ...row.deceased, cause: row.cause, funeralHome: row.funeralHome, grave: row.grave && row.cemetery ? { ...row.grave, cemetery: row.cemetery } : null };
}
export async function readCemeteryTransferPage(db: DatabaseExecutor, filters: { page?: string; q?: string; type?: string; cemeteryId?: string }): Promise<CemeteryTransferPage> {
  const where = and(filters.type ? eq(cemeteryMovements.movementType, filters.type) : ne(cemeteryMovements.movementType, "SEPULTAMENTO"), filters.cemeteryId ? eq(cemeteryGraves.cemeteryId, filters.cemeteryId) : undefined, filters.q?.trim() ? ilike(cemeteryDeceased.fullName, contains(filters.q.trim())) : undefined);
  const [{ total }] = await db.select({ total: count() }).from(cemeteryMovements).innerJoin(cemeteryGraves, eq(cemeteryGraves.id, cemeteryMovements.graveId)).leftJoin(cemeteryDeceased, eq(cemeteryDeceased.id, cemeteryMovements.deceasedId)).where(where);
  const page = Math.min(workflowPage(filters.page), Math.max(1, Math.ceil(total / 20)));
  const joined = await db.select({ movement: cemeteryMovements, deceased: cemeteryDeceased, grave: cemeteryGraves, toOssuary: cemeteryOssuaries }).from(cemeteryMovements).innerJoin(cemeteryGraves, eq(cemeteryGraves.id, cemeteryMovements.graveId)).leftJoin(cemeteryDeceased, eq(cemeteryDeceased.id, cemeteryMovements.deceasedId)).leftJoin(cemeteryOssuaries, eq(cemeteryOssuaries.id, cemeteryMovements.toOssuaryId)).where(where).orderBy(desc(cemeteryMovements.movementDate), desc(cemeteryMovements.id)).limit(20).offset((page - 1) * 20);
  const rows = joined.map(({ movement, ...relations }) => ({ ...movement, ...relations }));
  const ids = rows.flatMap(row => [row.fromGraveId, row.toGraveId].filter((id): id is string => Boolean(id)));
  const [selected, operators] = await Promise.all([ids.length ? db.select({ grave: cemeteryGraves, cemetery: cemeteries }).from(cemeteryGraves).innerJoin(cemeteries, eq(cemeteries.id, cemeteryGraves.cemeteryId)).where(inArray(cemeteryGraves.id, ids)) : [], readStructureOperators(db, rows.map(row => row.createdByUsuarioId))]);
  return { rows, total, page, graves: selected.map(row => ({ ...row.grave, cemetery: row.cemetery })), operators };
}
export async function readCemeteryFeeChoices(db: DatabaseExecutor): Promise<{ cemeteries: { id: string; name: string }[]; taxes: { id: string; name: string }[] }> {
  const [cemeteryChoices, taxChoices] = await Promise.all([db.select({ id: cemeteries.id, name: cemeteries.name }).from(cemeteries).orderBy(asc(cemeteries.name)), db.select({ id: taxes.id, name: taxes.name }).from(taxes).where(and(eq(taxes.isActive, true), eq(taxes.taxType, "Taxa"))).orderBy(asc(taxes.name))]);
  return { cemeteries: cemeteryChoices, taxes: taxChoices };
}
export async function readCemeteryGuide(db: DatabaseExecutor, id: string): Promise<CemeteryGuideDetail> {
  const [event] = await db.select().from(cemeteryFeeEvents).where(eq(cemeteryFeeEvents.guideId, id)).limit(1);
  if (!event) return { event: null, guide: null };
  const [row] = await db.select({ guide: taxGuides, assessment: taxAssessments, tax: taxes, taxpayer: taxpayers, person: people, company: companies }).from(taxGuides).innerJoin(taxAssessments, eq(taxAssessments.id, taxGuides.assessmentId)).innerJoin(taxes, eq(taxes.id, taxAssessments.taxId)).innerJoin(taxpayers, eq(taxpayers.id, taxAssessments.taxpayerId)).leftJoin(people, eq(people.id, taxpayers.personId)).leftJoin(companies, eq(companies.id, taxpayers.companyId)).where(eq(taxGuides.id, id)).limit(1);
  if (!row) return { event, guide: null };
  const payments = await db.select().from(taxPayments).where(and(eq(taxPayments.guideId, id), eq(taxPayments.status, "Confirmado")));
  return { event, guide: { ...row.guide, payments, assessment: { ...row.assessment, tax: row.tax, taxpayer: { ...row.taxpayer, person: row.person, company: row.company } } } };
}

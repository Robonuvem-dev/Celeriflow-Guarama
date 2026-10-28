import { and, asc, count, desc, eq, gt, inArray, sql, type SQL } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { createId } from "../../ids";
import { databaseTimestamp } from "../../temporal";
import { cemeteryChangeHistory, cemeteryGraves, cemeteryIdentificationFields } from "../../schema/cemeteries";
import { users } from "../../schema/identity";
import { taxpayers, companies } from "../../schema/registry";
import { people } from "../../schema/people";
import { structureConfig, type StructureKind } from "@/lib/cemeteries/structure-config";
import type { StructureRecord, CemeteryFieldRecord, CemeteryHistoryRecord } from "@/lib/contracts/cemeteries-workflow";
import type { CemeteryGraveRecord } from "@/lib/contracts/cemeteries";
import type { TaxpayerDetails } from "@/lib/contracts/registry";

// The only dynamic SQL in this repository is the ten fixed structure tables
// and their reviewed form fields. Values are always bound; no ORM delegate API.
function table(kind: StructureKind) {
  const config = structureConfig[kind];
  if (!config) throw new Error("Tipo de estrutura inválido.");
  return sql.identifier(config.table);
}
function decode(row: Record<string, unknown>): StructureRecord {
  if (typeof row.id !== "string") throw new Error("Registro estrutural sem identificador.");
  const result: StructureRecord = { ...row, id: row.id };
  for (const key of ["createdAt", "updatedAt"] as const) {
    const value = row[key];
    if (value != null) {
      if (!(typeof value === "string" || value instanceof Date)) throw new Error("Timestamp estrutural inválido.");
      result[key] = databaseTimestamp(value);
    }
  }
  return result;
}
export async function readStructureRecord(db: DatabaseExecutor, kind: StructureKind, id: string): Promise<StructureRecord | null> {
  const result = await db.execute<Record<string, unknown>>(sql`SELECT * FROM ${table(kind)} WHERE id=${id}`);
  return result.rows[0] ? decode(result.rows[0]) : null;
}
export async function lockStructureRecord(tx: DatabaseTransaction, kind: StructureKind, id: string): Promise<void> {
  await tx.execute(sql`SELECT id FROM ${table(kind)} WHERE id=${id} FOR UPDATE`);
}
export async function readStructureRows(db: DatabaseExecutor, kind: StructureKind, filters: { q: string; cemeteryId: string; active: string; status: string; page: number }): Promise<{ rows: StructureRecord[]; total: number; page: number }> {
  const config = structureConfig[kind];
  const predicates: SQL[] = [];
  if (filters.q) {
    const pattern = `%${filters.q.replace(/[\\%_]/g, c => `\\${c}`)}%`;
    predicates.push(sql`(${sql.join(config.search.map(key => sql`${sql.identifier(key)} ILIKE ${pattern}`), sql` OR `)})`);
  }
  if (filters.cemeteryId && config.fields.some(f => f.key === "cemeteryId")) predicates.push(sql`"cemeteryId"=${filters.cemeteryId}`);
  if (filters.active && config.fields.some(f => f.key === "active")) predicates.push(sql`active=${filters.active === "true"}`);
  if (filters.status && ["LOTE", "SEPULTURA"].includes(kind)) predicates.push(sql`status=${filters.status}`);
  const where = predicates.length ? sql`WHERE ${sql.join(predicates, sql` AND `)}` : sql``;
  const { rows: [totalRow] } = await db.execute<{ total: string }>(sql`SELECT count(*) AS total FROM ${table(kind)} ${where}`);
  const total = Number(totalRow.total), page = Math.min(filters.page, Math.max(1, Math.ceil(total / 20)));
  const order = kind === "QUADRA" ? sql`"sortOrder" ASC,id ASC` : sql`"createdAt" DESC,id DESC`;
  const selected = await db.execute<Record<string, unknown>>(sql`SELECT * FROM ${table(kind)} ${where} ORDER BY ${order} LIMIT 20 OFFSET ${(page - 1) * 20}`);
  const rows = await Promise.all(selected.rows.map(async raw => {
    const row = decode(raw);
    if (kind !== "LOTE") return row;
    const [registered] = await db.select({ total: count() }).from(cemeteryGraves).where(eq(cemeteryGraves.lotId, row.id));
    const [occupied] = await db.select({ total: count() }).from(cemeteryGraves).where(and(eq(cemeteryGraves.lotId, row.id), gt(cemeteryGraves.occupantCount, 0)));
    return { ...row, registered: registered.total, occupied: occupied.total };
  }));
  return { rows, total, page };
}
export async function writeStructureRecord(tx: DatabaseTransaction, kind: StructureKind, id: string | undefined, data: Record<string, unknown>): Promise<StructureRecord> {
  const allowed = new Set(structureConfig[kind].fields.map(field => field.key));
  if (kind === "LOTE" || kind === "SEPULTURA") allowed.add("additionalData");
  const entries = Object.entries(data).filter(([, value]) => value !== undefined);
  if (entries.some(([key]) => !allowed.has(key))) throw new Error("Campo estrutural inválido.");
  const timestamps = !["QUADRA", "COVEIRO", "FUNERARIA", "CAUSA"].includes(kind);
  const values = entries.map(([key, value]) => [key, key === "additionalData" ? sql`${JSON.stringify(value)}::jsonb` : sql`${value}`] as const);
  if (timestamps) values.push(["updatedAt", sql`${new Date()}`]);
  const targetId = id ?? createId();
  const statement = id
    ? sql`UPDATE ${table(kind)} SET ${sql.join(values.map(([key, value]) => sql`${sql.identifier(key)}=${value}`), sql`, `)} WHERE id=${id} RETURNING *`
    : sql`INSERT INTO ${table(kind)} (${sql.join([sql.identifier("id"), ...values.map(([key]) => sql.identifier(key))], sql`, `)}) VALUES (${sql.join([sql`${targetId}`, ...values.map(([, value]) => value)], sql`, `)}) RETURNING *`;
  const { rows: [row] } = await tx.execute<Record<string, unknown>>(statement);
  if (!row) throw new Error("Registro não encontrado.");
  return decode(row);
}

export async function readStructureFields(db: DatabaseExecutor, targetType: string, cemeteryId?: string): Promise<CemeteryFieldRecord[]> {
  return db.select().from(cemeteryIdentificationFields).where(and(eq(cemeteryIdentificationFields.targetType, targetType), cemeteryId ? eq(cemeteryIdentificationFields.cemeteryId, cemeteryId) : eq(cemeteryIdentificationFields.active, true))).orderBy(asc(cemeteryIdentificationFields.label), asc(cemeteryIdentificationFields.id));
}
export async function readStructureHistory(db: DatabaseExecutor, targetType: string, targetId: string, page: number): Promise<{ total: number; history: CemeteryHistoryRecord[] }> {
  const where = and(eq(cemeteryChangeHistory.targetType, targetType), eq(cemeteryChangeHistory.targetId, targetId));
  const [[{ total }], history] = await Promise.all([db.select({ total: count() }).from(cemeteryChangeHistory).where(where), db.select().from(cemeteryChangeHistory).where(where).orderBy(desc(cemeteryChangeHistory.createdAt), desc(cemeteryChangeHistory.id)).limit(20).offset((page - 1) * 20)]);
  return { total, history };
}
export async function readStructureOperators(db: DatabaseExecutor, ids: string[]): Promise<{ id: string; nome: string }[]> {
  return ids.length ? db.select({ id: users.id, nome: users.nome }).from(users).where(inArray(users.id, ids)) : [];
}
export async function readStructureTaxpayers(db: DatabaseExecutor, ids: string[]): Promise<TaxpayerDetails[]> {
  const rows = ids.length ? await db.select({ taxpayer: taxpayers, person: people, company: companies }).from(taxpayers).leftJoin(people, eq(people.id, taxpayers.personId)).leftJoin(companies, eq(companies.id, taxpayers.companyId)).where(inArray(taxpayers.id, ids)) : [];
  return rows.map(row => ({ ...row.taxpayer, person: row.person, company: row.company }));
}
export async function readLotGraves(db: DatabaseExecutor, lotId: string, page: number): Promise<{ total: number; graves: CemeteryGraveRecord[] }> {
  const where = eq(cemeteryGraves.lotId, lotId);
  const [[{ total }], graves] = await Promise.all([db.select({ total: count() }).from(cemeteryGraves).where(where), db.select().from(cemeteryGraves).where(where).orderBy(desc(cemeteryGraves.createdAt), desc(cemeteryGraves.id)).limit(20).offset((page - 1) * 20)]);
  return { total, graves };
}

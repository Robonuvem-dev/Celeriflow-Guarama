import { and, desc, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { healthDatabaseConnection } from "./health-transaction";
import { Decimal } from "@/db/decimal";
import type { JsonObject } from "@/db/json";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import { healthUnits } from "@/db/schema/health-workforce";
import { healthSusProcedures } from "@/db/schema/health-catalogs";
import { healthProcedurePriceTables, healthProcedurePriceItems } from "@/db/schema/health-production";
import { z } from "zod";
import { assertHealthUnitAccess, type AppContext } from "@/lib/platform/tenant-context";

const id = z.string().trim().min(1).max(200);
const priceTableSchema = z.object({ unitId: id, agreementId: id.nullable(), code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_.-]{1,40}$/), name: z.string().trim().min(3).max(200), validFrom: z.iso.date(), validUntil: z.iso.date(), sourceReference: z.string().trim().min(3).max(4000), items: z.array(z.object({ procedureId: id, unitValue: z.string().regex(/^\d{1,12}(\.\d{1,6})?$/) }).strict()).min(1).max(1000) }).strict();
const date = (value: string) => new Date(`${value}T00:00:00Z`);
const json = (value: unknown): JsonObject => JSON.parse(JSON.stringify(value));

export async function publishHealthProcedurePrices(context: AppContext, raw: unknown) {
  const input = priceTableSchema.parse(raw);
  assertHealthUnitAccess(context.user, input.unitId);
  if (input.validFrom > input.validUntil || new Set(input.items.map(item => item.procedureId)).size !== input.items.length) throw new Error("Confira a vigência e não repita procedimentos na tabela.");
  return withDatabaseTransaction(healthDatabaseConnection(context), async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`HEALTH_PRICE_TABLE:${input.unitId}`}))`);
    if (!(await tx.select({ id: healthUnits.id }).from(healthUnits).where(and(eq(healthUnits.id, input.unitId), eq(healthUnits.isActive, true))).limit(1)).length) throw new Error("Selecione uma unidade ativa para a tabela.");
    const [previous] = await tx.select().from(healthProcedurePriceTables).where(and(eq(healthProcedurePriceTables.unitId, input.unitId), eq(healthProcedurePriceTables.code, input.code))).orderBy(desc(healthProcedurePriceTables.version)).limit(1);
    const previousItems = previous ? await tx.select().from(healthProcedurePriceItems).where(eq(healthProcedurePriceItems.tableId, previous.id)) : [];
    if (previous && previous.agreementId !== input.agreementId) throw new Error("O código da tabela já está ligado a outro convênio. Use código próprio para cada vínculo.");
    if (previous && previous.name === input.name && previous.sourceReference === input.sourceReference && previous.validFrom.toISOString().slice(0, 10) === input.validFrom && previous.validUntil.toISOString().slice(0, 10) === input.validUntil && previousItems.length === input.items.length && input.items.every(item => previousItems.some(old => old.procedureId === item.procedureId && old.unitValue.eq(item.unitValue)))) return { id: previous.id, version: previous.version };
    if (input.agreementId && !(await tx.execute(sql`SELECT id FROM "HealthCareAgreement" WHERE id=${input.agreementId} AND "isActive"=true AND "validFrom"<=${date(input.validFrom)} AND ("validUntil" IS NULL OR "validUntil">=${date(input.validUntil)}) LIMIT 1`)).rows.length) throw new Error("Convênio sem vigência para o período integral da tabela.");
    if ((await tx.select({ id: healthSusProcedures.id }).from(healthSusProcedures).where(and(inArray(healthSusProcedures.id, input.items.map(item => item.procedureId)), eq(healthSusProcedures.isActive, true)))).length !== input.items.length) throw new Error("Selecione procedimentos SUS ativos sem duplicação.");
    const [conflict] = await tx.select({ code: healthProcedurePriceTables.code }).from(healthProcedurePriceTables).innerJoin(healthProcedurePriceItems, eq(healthProcedurePriceItems.tableId, healthProcedurePriceTables.id)).where(and(eq(healthProcedurePriceTables.unitId, input.unitId), input.agreementId ? eq(healthProcedurePriceTables.agreementId, input.agreementId) : isNull(healthProcedurePriceTables.agreementId), ne(healthProcedurePriceTables.code, input.code), lte(healthProcedurePriceTables.validFrom, date(input.validUntil)), gte(healthProcedurePriceTables.validUntil, date(input.validFrom)), inArray(healthProcedurePriceItems.procedureId, input.items.map(item => item.procedureId)))).limit(1);
    if (conflict) throw new Error(`Há preço concorrente na tabela ${conflict.code}. Publique revisão do mesmo código ou separe as vigências.`);
    if (input.agreementId) for (const item of input.items) {
      if (!(await tx.execute(sql`SELECT id FROM "HealthCareCoverage" WHERE "agreementId"=${input.agreementId} AND "unitId"=${input.unitId} AND "procedureId"=${item.procedureId} AND "isActive"=true AND "validFrom"<=${date(input.validFrom)} AND ("validUntil" IS NULL OR "validUntil">=${date(input.validUntil)}) LIMIT 1`)).rows.length) throw new Error("O convênio deve cobrir cada procedimento na unidade e durante toda a vigência da tabela.");
    }
    const { items, validFrom, validUntil, ...data } = input;
    const [table] = await tx.insert(healthProcedurePriceTables).values({ ...data, validFrom: date(validFrom), validUntil: date(validUntil), version: (previous?.version || 0) + 1, actorUsuarioId: context.user.id }).returning();
    await tx.insert(healthProcedurePriceItems).values(items.map(item => ({ ...item, tableId: table.id, unitValue: new Decimal(item.unitValue) })));
    return { id: table.id, version: table.version };
  }, { timeoutMs: 60000 });
}

type PriceReader = DatabaseExecutor;
type ResolvedProcedurePrice = { unitValue: Decimal | null; totalValue: Decimal | null; snapshot: JsonObject };
export async function resolveHealthProcedurePrice(tx: PriceReader, input: { unitId: string; procedureId: string; occurredAt: Date; quantity: number; agreementId?: string | null; billingContext?: unknown }): Promise<ResolvedProcedurePrice> {
  const on = date(input.occurredAt.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }));
  const rows = await tx.select({ table: healthProcedurePriceTables, item: healthProcedurePriceItems }).from(healthProcedurePriceTables).leftJoin(healthProcedurePriceItems, and(eq(healthProcedurePriceItems.tableId, healthProcedurePriceTables.id), eq(healthProcedurePriceItems.procedureId, input.procedureId))).where(and(eq(healthProcedurePriceTables.unitId, input.unitId), input.agreementId ? eq(healthProcedurePriceTables.agreementId, input.agreementId) : isNull(healthProcedurePriceTables.agreementId), lte(healthProcedurePriceTables.validFrom, on), gte(healthProcedurePriceTables.validUntil, on))).orderBy(desc(healthProcedurePriceTables.version));
  const tables = rows.map(row => ({ ...row.table, items: row.item ? [row.item] : [] }));
  // Latest applicable version of each logical table wins, even when a procedure was removed in that version.
  const latest = new Map<string, typeof tables[number]>();
  for (const table of tables) if (!latest.has(table.code)) latest.set(table.code, table);
  const match = [...latest.values()].find(table => table.items.length);
  if (!match && input.agreementId) {
    const defaults = await resolveHealthProcedurePrice(tx, { ...input, agreementId: null });
    return { ...defaults, snapshot: { ...defaults.snapshot, requestedAgreementId: input.agreementId } };
  }
  const [procedure] = await tx.select({ code: healthSusProcedures.code, source: healthSusProcedures.source, sourceBatchId: healthSusProcedures.sourceBatchId, competence: healthSusProcedures.competence, unitValue: healthSusProcedures.unitValue }).from(healthSusProcedures).where(eq(healthSusProcedures.id, input.procedureId)).limit(1);
  if (!procedure) throw new Error("Procedimento SUS não encontrado.");
  const unitValue = match?.items[0].unitValue ?? procedure.unitValue;
  const totalValue = unitValue === null ? null : unitValue.mul(input.quantity).toDecimalPlaces(2);
  const snapshot = json({ source: match ? "AUXILIARY_TABLE" : "PROCEDURE_CATALOG", procedureId: input.procedureId, procedureCode: procedure.code, quantity: input.quantity, unitValue: unitValue?.toFixed(6) ?? null, totalValue: totalValue?.toFixed(2) ?? null, table: match ? { id: match.id, code: match.code, version: match.version, itemId: match.items[0].id, validFrom: match.validFrom, validUntil: match.validUntil, sourceReference: match.sourceReference, agreementId: match.agreementId } : null, catalog: { source: procedure.source, batchId: procedure.sourceBatchId, competence: procedure.competence }, billingContext: input.billingContext ?? null });
  return { unitValue, totalValue, snapshot };
}

export const appointmentBillingContextSchema = z.object({ agreementId: z.string().nullable(), providerUnit: z.object({ id: z.string(), name: z.string(), cnes: z.string().nullable() }).nullable() });

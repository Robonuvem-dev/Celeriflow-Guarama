import { createHash } from "node:crypto";
import { and, asc, count, desc, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseExecutor, DatabaseTransaction } from "@/db/transaction";
import { instanceParameters } from "@/db/schema/instance-configuration";
import { recyclingMaterialBindings, recyclingMovements, recyclingStocks } from "@/db/schema/environment-recycling";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { auditEventTypes } from "@/lib/contracts/audit";
import { recyclingEntryKey, recyclingEntrySchema, type RecyclingEntry } from "@/lib/environment/recycling-catalog";
import { RecyclingStockError, type RecyclingMovementInput, type RecyclingMovementSnapshot } from "@/lib/environment/recycling-stock";

export async function hasRecyclingStockSchema(database: DatabaseExecutor): Promise<boolean> {
  const result = await database.execute<{ ready: boolean }>(sql`SELECT
    to_regclass('public."EnvRecyclingMaterialBinding"') IS NOT NULL
    AND to_regclass('public."EnvRecyclingStock"') IS NOT NULL
    AND to_regclass('public."EnvRecyclingMovement"') IS NOT NULL AS ready`);
  return result.rows[0]?.ready === true;
}

const key = (kind: RecyclingEntry["kind"], code: string) => recyclingEntryKey({ kind, code });
const label = ({ code, name }: RecyclingEntry) => ({ code, name });
const maximumQuantity = new Decimal("999999999999999.999");

/** The caller authenticates/authorizes MEIO_AMBIENTE:create, validates the input
 * and supplies the shared transaction. No MaterialStock/accounting calls occur.
 */
export async function recordRecyclingMovement(tx: DatabaseTransaction, instanceId: string, actorUsuarioId: string, input: RecyclingMovementInput) {
  if (!await hasRecyclingStockSchema(tx)) throw new RecyclingStockError("O controle de estoque ainda não está disponível nesta instância.");
  const materialKey = key("materials", input.materialCode);
  const depotKey = key("depots", input.depotCode);
  const requestHash = createHash("sha256").update(JSON.stringify({ ...input, quantity: input.quantity.toFixed(3), amount: input.amount.toFixed(2) })).digest("hex");
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`CF10_REQUEST:${instanceId}:${input.idempotencyKey}`}))`);
  const [replay] = await tx.select().from(recyclingMovements).where(and(eq(recyclingMovements.instanceId, instanceId), eq(recyclingMovements.idempotencyKey, input.idempotencyKey)));
  if (replay) {
    if (replay.requestHash !== requestHash || replay.actorUsuarioId !== actorUsuarioId) throw new RecyclingStockError("Chave já utilizada em outra movimentação.");
    return replay;
  }
  // Serializes this material across depots: its classification/unit cannot race
  // into different definitions when two first receipts arrive concurrently.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`CF10_MATERIAL:${instanceId}:${materialKey}`}))`);
  const [binding] = await tx.select().from(recyclingMaterialBindings).where(and(eq(recyclingMaterialBindings.instanceId, instanceId), eq(recyclingMaterialBindings.materialKey, materialKey)));
  if (!binding && (input.kind === "EXIT" || !input.typeCode || !input.unitCode)) throw new RecyclingStockError("Registre a primeira entrada do material informando tipo e unidade de medida.");
  const typeKey = input.typeCode ? key("types", input.typeCode) : binding!.typeKey;
  const unitKey = input.unitCode ? key("units", input.unitCode) : binding!.unitKey;
  if (binding && (binding.typeKey !== typeKey || binding.unitKey !== unitKey)) throw new RecyclingStockError("Preserve o tipo e a unidade já utilizados por este material nos depósitos.");
  const destinationKey = input.kind === "EXIT" ? key("centers", input.destinationCode) : null;
  const keys = [...new Set([materialKey, depotKey, typeKey, unitKey, ...(destinationKey ? [destinationKey] : [])])].sort();
  // Share the exact locks used by catalog edits; active state and labels remain
  // stable until the movement and audit commit together.
  for (const catalogKey of keys) await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${instanceId + catalogKey}))`);
  const parameters = await tx.select({ chave: instanceParameters.chave, valor: instanceParameters.valor }).from(instanceParameters).where(and(eq(instanceParameters.configuracaoInstanciaId, instanceId), inArray(instanceParameters.chave, keys)));
  const entries = new Map<string, RecyclingEntry>();
  for (const catalogKey of keys) {
    const parsed = recyclingEntrySchema.safeParse(parameters.find(parameter => parameter.chave === catalogKey)?.valor);
    if (!parsed.success || recyclingEntryKey(parsed.data) !== catalogKey) throw new RecyclingStockError("Um cadastro selecionado não existe nesta instância ou está inválido.");
    if (!parsed.data.active && (input.kind === "ENTRY" || catalogKey === destinationKey)) throw new RecyclingStockError("Selecione cadastros ativos para a entrada ou para o centro de destino.");
    entries.set(catalogKey, parsed.data);
  }
  const position = and(eq(recyclingStocks.instanceId, instanceId), eq(recyclingStocks.materialKey, materialKey), eq(recyclingStocks.depotKey, depotKey));
  let [stock] = await tx.select().from(recyclingStocks).where(position);
  if (!stock && input.kind === "EXIT") throw new RecyclingStockError("Não há saldo deste material no depósito selecionado.");
  const [last] = await tx.select({ occurredOn: recyclingMovements.occurredOn }).from(recyclingMovements).where(and(eq(recyclingMovements.instanceId, instanceId), eq(recyclingMovements.materialKey, materialKey), eq(recyclingMovements.depotKey, depotKey))).orderBy(desc(recyclingMovements.sequence)).limit(1);
  if (last && input.occurredOn < last.occurredOn) throw new RecyclingStockError("A data não pode ser anterior à última movimentação deste material no depósito.");
  const before = stock?.quantity ?? new Decimal(0);
  const after = input.kind === "ENTRY" ? before.plus(input.quantity) : before.minus(input.quantity);
  if (after.isNegative()) throw new RecyclingStockError("Saldo insuficiente no depósito selecionado.");
  if (after.gt(maximumQuantity)) throw new RecyclingStockError("O saldo resultante excede o limite permitido.");
  if (!binding) await tx.insert(recyclingMaterialBindings).values({ instanceId, materialKey, typeKey, unitKey });
  if (!stock) {
    [stock] = await tx.insert(recyclingStocks).values({ instanceId, materialKey, depotKey, typeKey, unitKey, quantity: new Decimal(0), version: 0 }).returning();
  }
  const sequence = stock.version + 1;
  const [updated] = await tx.update(recyclingStocks).set({ quantity: after, version: sequence, updatedAt: new Date() }).where(and(position, eq(recyclingStocks.version, stock.version))).returning();
  if (!updated) throw new RecyclingStockError("O saldo foi alterado por outra operação. Atualize a página e tente novamente.");
  const destination = destinationKey ? entries.get(destinationKey)! : null;
  const snapshot: RecyclingMovementSnapshot = {
    material: label(entries.get(materialKey)!), depot: label(entries.get(depotKey)!),
    materialType: label(entries.get(typeKey)!), unit: label(entries.get(unitKey)!),
    destination: destination ? { ...label(destination), address: destination.address } : null,
  };
  const [movement] = await tx.insert(recyclingMovements).values({
    instanceId, materialKey, depotKey, kind: input.kind, quantity: input.quantity, amount: input.amount,
    quantityBefore: before, quantityAfter: after, sequence, destinationKey, origin: input.origin,
    notes: input.notes, snapshot, occurredOn: input.occurredOn, actorUsuarioId,
    idempotencyKey: input.idempotencyKey, requestHash, createdAt: new Date(),
  }).returning();
  await insertAuditEvent(tx, { actorUsuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "RecyclingMovement", targetId: `${instanceId}:${movement.id}` });
  return movement;
}

const pageSize = 20;
function pageNumber(value: unknown, total: number) {
  const parsed = typeof value === "string" && /^\d{1,6}$/.test(value) ? Number(value) : 1;
  return Math.min(Math.max(1, parsed), Math.max(1, Math.ceil(total / pageSize)));
}
export async function loadRecyclingStockPage(database: DatabaseExecutor, instanceId: string, pages: { stock?: string; history?: string } = {}) {
  const [stockCount] = await database.select({ total: count() }).from(recyclingStocks).where(eq(recyclingStocks.instanceId, instanceId));
  const [historyCount] = await database.select({ total: count() }).from(recyclingMovements).where(eq(recyclingMovements.instanceId, instanceId));
  const stockPage = pageNumber(pages.stock, stockCount.total), historyPage = pageNumber(pages.history, historyCount.total);
  const stocks = await database.select({ ...getTableColumns(recyclingStocks), materialTotal: sql<string>`sum(${recyclingStocks.quantity}) OVER (PARTITION BY ${recyclingStocks.instanceId}, ${recyclingStocks.materialKey})` }).from(recyclingStocks).where(eq(recyclingStocks.instanceId, instanceId)).orderBy(asc(recyclingStocks.materialKey), asc(recyclingStocks.depotKey)).limit(pageSize).offset((stockPage - 1) * pageSize);
  const movements = await database.select().from(recyclingMovements).where(eq(recyclingMovements.instanceId, instanceId)).orderBy(desc(recyclingMovements.occurredOn), desc(recyclingMovements.createdAt), desc(recyclingMovements.id)).limit(pageSize).offset((historyPage - 1) * pageSize);
  return { stocks, movements, stockPage, historyPage, stockTotal: stockCount.total, historyTotal: historyCount.total, pageSize };
}

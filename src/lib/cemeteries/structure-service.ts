import { and, count, eq, inArray, ne } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import { JsonNull, type JsonValue } from "@/db/json";
import { cemeteries, cemeteryChangeHistory, cemeteryGraves, cemeteryIdentificationFields, cemeteryLots, cemeteryProcesses, cemeterySectors } from "@/db/schema/cemeteries";
import { taxpayers } from "@/db/schema/registry";
import { lockStructureRecord as lock, readStructureRecord, readStructureRows, writeStructureRecord } from "@/db/repositories/cemeteries/structure";
import { z } from "zod";
import { structureConfig, structureFilters, type StructureKind } from "./structure-config";
import { recordCemeteryFeeEvent, chargeCemeteryFeeEvent } from "./fees-service";
import { cemeteryFeeEventKey } from "./fees-engine";

export type { StructureRecord } from "@/lib/contracts/cemeteries-workflow";
const json = (v: unknown): JsonValue | typeof JsonNull => v == null ? JsonNull : JSON.parse(JSON.stringify(v));
export async function listStructure(connection: DatabaseConnection, input: unknown) {
  const filters = structureFilters.parse(input);
  return withDatabaseTransaction(connection, async tx => {
    const { rows, total, page } = await readStructureRows(tx, filters.tipo, filters);
    return { filters: { ...filters, page }, total, rows };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
export async function getStructure(db: DatabaseExecutor, kind: StructureKind, id: string) { return readStructureRecord(db, kind, id); }

export async function saveStructure(connection: DatabaseConnection, actor: { usuarioId: string }, kind: StructureKind, id: string | undefined, input: Record<string, unknown>) {
  const config = structureConfig[kind];
  const shape: Record<string, z.ZodType> = {};
  for (const field of config.fields) shape[field.key] = field.type === "checkbox" ? z.boolean() : field.type === "number" ? z.coerce.number().int().min(field.key === "sortOrder" ? 0 : 1).max(1000000) : field.options ? z.enum(field.options as [string, ...string[]]) : field.required ? z.string().trim().min(1, `${field.label} é obrigatório.`).max(2000) : z.string().trim().max(10000).nullable().optional();
  const data = z.object(shape).parse(input) as Record<string, unknown>;
  if (kind === "CAMPO" && !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(String(data.fieldKey))) throw new Error("Chave deve começar com letra e conter apenas letras, números e sublinhado (até 64 caracteres).");
  for (const key of Object.keys(data)) if (data[key] === "") data[key] = null;
  const saved = await withDatabaseTransaction(connection, async tx => {
    // Cemetery lock also serializes custom-field configuration and additional-data edits.
    const existing = id ? await getStructure(tx, kind, id) : null;
    if (id && !existing) throw new Error("Registro não encontrado.");
    const cemeteryIds = [...new Set([existing?.cemeteryId, data.cemeteryId].filter((v): v is string => typeof v === "string"))].sort();
    for (const cemeteryId of cemeteryIds) await lock(tx, "CEMITERIO", cemeteryId);
    if (id) await lock(tx, kind, id);
    const before = id ? await getStructure(tx, kind, id) : null;
    if (input.expectedUpdatedAt && before?.updatedAt && new Date(String(input.expectedUpdatedAt)).getTime() !== new Date(String(before.updatedAt)).getTime()) throw new Error("Registro alterado por outro operador. Reabra a ficha.");
    if (data.cemeteryId) {
      const [cemetery] = await tx.select().from(cemeteries).where(eq(cemeteries.id, String(data.cemeteryId))).limit(1);
      if (!cemetery?.active) throw new Error("Selecione um cemitério ativo.");
    }
    for (const field of config.fields.filter(f => f.lookup === "taxpayer")) if (data[field.key]) {
      const [taxpayer] = await tx.select({ status: taxpayers.status }).from(taxpayers).where(eq(taxpayers.id, String(data[field.key]))).limit(1);
      if (taxpayer?.status !== "Ativo") throw new Error(`${field.label} deve ser contribuinte ativo do Cadastro Único.`);
    }
    if (before?.cemeteryId !== undefined && before.cemeteryId !== data.cemeteryId) {
      const [{ total: used }] = kind === "LOTE" ? await tx.select({ total: count() }).from(cemeteryGraves).where(eq(cemeteryGraves.lotId, before.id)) : kind === "QUADRA" ? await tx.select({ total: count() }).from(cemeteryGraves).where(eq(cemeteryGraves.sectorId, before.id)) : kind === "SEPULTURA" ? await tx.select({ total: count() }).from(cemeteryProcesses).where(eq(cemeteryProcesses.graveId, before.id)) : [{ total: 0 }];
      if (used || Number(before.occupantCount) > 0) throw new Error("Registro em uso não pode mudar de cemitério.");
    }
    if (kind === "LOTE") {
      const [{ total }] = id ? await tx.select({ total: count() }).from(cemeteryGraves).where(eq(cemeteryGraves.lotId, id)) : [{ total: 0 }];
      if (Number(data.graveLimit) < total) throw new Error("Limite inferior às sepulturas já cadastradas.");
      if (data.active === false && id && (await tx.select({ total: count() }).from(cemeteryProcesses).innerJoin(cemeteryGraves, eq(cemeteryGraves.id, cemeteryProcesses.graveId)).where(and(eq(cemeteryGraves.lotId, id), inArray(cemeteryProcesses.status, ["AGENDADO", "EM_REALIZACAO"]))))[0].total) throw new Error("Lote possui atendimento pendente.");
    }
    if (kind === "SEPULTURA") {
      if (data.graveType === "GAVETA" && !data.ownerTaxpayerId) throw new Error("Lóculo exige proprietário.");
      const lotIds = [...new Set([before?.lotId, data.lotId].filter((v): v is string => typeof v === "string"))].sort();
      for (const lotId of lotIds) await lock(tx, "LOTE", lotId);
      const [lot] = await tx.select().from(cemeteryLots).where(eq(cemeteryLots.id, String(data.lotId))).limit(1);
      if (!lot?.active || lot.cemeteryId !== data.cemeteryId) throw new Error("Lote deve estar ativo e pertencer ao cemitério.");
      const [{ total }] = await tx.select({ total: count() }).from(cemeteryGraves).where(and(eq(cemeteryGraves.lotId, lot.id), id ? ne(cemeteryGraves.id, id) : undefined));
      if (total >= lot.graveLimit) throw new Error("Limite de sepulturas do lote atingido.");
      if (data.sectorId) { const [sector] = await tx.select().from(cemeterySectors).where(eq(cemeterySectors.id, String(data.sectorId))).limit(1); if (sector?.cemeteryId !== data.cemeteryId) throw new Error("Quadra não pertence ao cemitério."); }
      if (Number(data.capacity) < Number(before?.occupantCount ?? 0)) throw new Error("Capacidade inferior à ocupação.");
      if (before && (data.active === false || before.lotId !== data.lotId) && (Number(before.occupantCount) > 0 || (await tx.select({ total: count() }).from(cemeteryProcesses).where(and(eq(cemeteryProcesses.graveId, before.id), inArray(cemeteryProcesses.status, ["AGENDADO", "EM_REALIZACAO"]))))[0].total)) throw new Error("Sepultura ocupada ou com atendimento pendente.");
    }
    if (kind === "OSSUARIO" && (Number(data.capacity) < Number(before?.occupantCount ?? 0) || data.active === false && Number(before?.occupantCount) > 0)) throw new Error("Ossuário ocupado: verifique capacidade e ativação.");
    if (kind === "CAMPO" && before) {
      // Identity/type is permanent once created: also protects values retained only in history.
      for (const key of ["cemeteryId", "targetType", "fieldKey", "valueType"]) if (data[key] !== before[key]) throw new Error("Chave, destino, cemitério e tipo são permanentes. Crie um novo campo e inative o anterior.");
    }
    if (kind === "LOTE" || kind === "SEPULTURA") {
      const fields = await tx.select().from(cemeteryIdentificationFields).where(and(eq(cemeteryIdentificationFields.cemeteryId, String(data.cemeteryId)), eq(cemeteryIdentificationFields.targetType, kind)));
      const previous = (before?.additionalData ?? {}) as Record<string, unknown>;
      const supplied = z.record(z.string(), z.union([z.string(), z.number(), z.null()])).parse(input.additionalData ?? {});
      const extra = { ...previous };
      for (const field of fields) {
        if (!field.active) continue;
        const value = supplied[field.fieldKey] ?? previous[field.fieldKey];
        if (field.required && (value == null || String(value).trim() === "")) throw new Error(`${field.label} é obrigatório.`);
        if (value != null && String(value) !== "" && field.valueType === "NUMERICO" && !Number.isFinite(Number(value))) throw new Error(`${field.label} deve ser numérico.`);
        extra[field.fieldKey] = value == null || value === "" ? null : field.valueType === "NUMERICO" ? Number(value) : String(value);
      }
      data.additionalData = extra;
    }
    const result = await writeStructureRecord(tx, kind, id, data);
    const changes = Object.entries(data).flatMap(([key, value]) => key === "additionalData" ? Object.entries(value as Record<string, unknown>).map(([k, v]) => [`additionalData.${k}`, ((before?.additionalData ?? {}) as Record<string, unknown>)[k], v] as const) : [[key, before?.[key], value] as const]);
    for (const [fieldName, previous, value] of changes) if (JSON.stringify(previous ?? null) !== JSON.stringify(value ?? null)) await tx.insert(cemeteryChangeHistory).values({ targetType: kind, targetId: result.id, fieldName, previousValue: json(previous), newValue: json(value), actorUsuarioId: actor.usuarioId });
    if (kind === "LOTE" && !id) await recordCemeteryFeeEvent(tx, { eventType: "ACQUISICAO_LOTE", sourceType: "LOTE", sourceId: result.id });
    return result;
  }, { timeoutMs: 20000 });
  if (kind === "LOTE" && !id) await chargeCemeteryFeeEvent(connection, { usuarioId: actor.usuarioId, employeeId: null }, cemeteryFeeEventKey("ACQUISICAO_LOTE", "LOTE", saved.id));
  return saved;
}

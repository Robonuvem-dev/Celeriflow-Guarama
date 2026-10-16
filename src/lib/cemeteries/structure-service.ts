import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { structureConfig, structureFilters, type StructureKind } from "./structure-config";
import { recordCemeteryFeeEvent, chargeCemeteryFeeEvent } from "./fees-service";
import { cemeteryFeeEventKey } from "./fees-engine";

export type StructureRecord = Record<string, unknown> & { id: string };
type Delegate = { findUnique(args: unknown): Promise<StructureRecord | null>; findMany(args: unknown): Promise<StructureRecord[]>; count(args: unknown): Promise<number>; create(args: unknown): Promise<StructureRecord>; update(args: unknown): Promise<StructureRecord> };
const delegate = (db: PrismaClient | Prisma.TransactionClient, kind: StructureKind) => (db as unknown as Record<string, Delegate>)[structureConfig[kind].model];
const json = (v: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull => v == null ? Prisma.JsonNull : JSON.parse(JSON.stringify(v));
async function lock(tx: Prisma.TransactionClient, kind: StructureKind, id: string) {
  await tx.$queryRawUnsafe(`SELECT id FROM "${structureConfig[kind].table}" WHERE id = $1 FOR UPDATE`, id);
}
export async function listStructure(db: PrismaClient, input: unknown) {
  const filters = structureFilters.parse(input);
  const config = structureConfig[filters.tipo];
  const where: Record<string, unknown> = {};
  if (filters.q) where.OR = config.search.map(key => ({ [key]: { contains: filters.q, mode: "insensitive" } }));
  if (filters.cemeteryId && config.fields.some(f => f.key === "cemeteryId")) where.cemeteryId = filters.cemeteryId;
  if (filters.active && config.fields.some(f => f.key === "active")) where.active = filters.active === "true";
  if (filters.status && ["LOTE", "SEPULTURA"].includes(filters.tipo)) where.status = filters.status;
  return db.$transaction(async tx => {
    const model = delegate(tx, filters.tipo);
    const total = await model.count({ where });
    const page = Math.min(filters.page, Math.max(1, Math.ceil(total / 20)));
    const rows = await model.findMany({ where, orderBy: filters.tipo === "QUADRA" ? [{ sortOrder: "asc" }, { id: "asc" }] : [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 20 });
    const enriched = await Promise.all(rows.map(async row => filters.tipo === "LOTE" ? { ...row, registered: await tx.taxGrave.count({ where: { lotId: row.id } }), occupied: await tx.taxGrave.count({ where: { lotId: row.id, occupantCount: { gt: 0 } } }) } : row));
    return { filters: { ...filters, page }, total, rows: enriched };
  }, { isolationLevel: "RepeatableRead" });
}
export async function getStructure(db: PrismaClient | Prisma.TransactionClient, kind: StructureKind, id: string) { return delegate(db, kind).findUnique({ where: { id } }); }

export async function saveStructure(db: PrismaClient, actor: { usuarioId: string }, kind: StructureKind, id: string | undefined, input: Record<string, unknown>) {
  const config = structureConfig[kind];
  const shape: Record<string, z.ZodType> = {};
  for (const field of config.fields) shape[field.key] = field.type === "checkbox" ? z.boolean() : field.type === "number" ? z.coerce.number().int().min(field.key === "sortOrder" ? 0 : 1).max(1000000) : field.options ? z.enum(field.options as [string, ...string[]]) : field.required ? z.string().trim().min(1, `${field.label} é obrigatório.`).max(2000) : z.string().trim().max(10000).nullable().optional();
  const data = z.object(shape).parse(input) as Record<string, unknown>;
  if (kind === "CAMPO" && !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(String(data.fieldKey))) throw new Error("Chave deve começar com letra e conter apenas letras, números e sublinhado (até 64 caracteres).");
  for (const key of Object.keys(data)) if (data[key] === "") data[key] = null;
  const saved = await db.$transaction(async tx => {
    // Cemetery lock also serializes custom-field configuration and additional-data edits.
    const existing = id ? await getStructure(tx, kind, id) : null;
    if (id && !existing) throw new Error("Registro não encontrado.");
    const cemeteryIds = [...new Set([existing?.cemeteryId, data.cemeteryId].filter((v): v is string => typeof v === "string"))].sort();
    for (const cemeteryId of cemeteryIds) await lock(tx, "CEMITERIO", cemeteryId);
    if (id) await lock(tx, kind, id);
    const before = id ? await delegate(tx, kind).findUnique({ where: { id } }) : null;
    if (input.expectedUpdatedAt && before?.updatedAt && new Date(String(input.expectedUpdatedAt)).getTime() !== new Date(String(before.updatedAt)).getTime()) throw new Error("Registro alterado por outro operador. Reabra a ficha.");
    if (data.cemeteryId) {
      const cemetery = await tx.taxCemetery.findUnique({ where: { id: String(data.cemeteryId) } });
      if (!cemetery?.active) throw new Error("Selecione um cemitério ativo.");
    }
    for (const field of config.fields.filter(f => f.lookup === "taxpayer")) if (data[field.key]) {
      const taxpayer = await tx.taxpayer.findUnique({ where: { id: String(data[field.key]) }, select: { status: true } });
      if (taxpayer?.status !== "Ativo") throw new Error(`${field.label} deve ser contribuinte ativo do Cadastro Único.`);
    }
    if (before?.cemeteryId !== undefined && before.cemeteryId !== data.cemeteryId) {
      const used = kind === "LOTE" ? await tx.taxGrave.count({ where: { lotId: id } }) : kind === "QUADRA" ? await tx.taxGrave.count({ where: { sectorId: id } }) : kind === "SEPULTURA" ? await tx.cemeteryProcess.count({ where: { graveId: id } }) : 0;
      if (used || Number(before.occupantCount) > 0) throw new Error("Registro em uso não pode mudar de cemitério.");
    }
    if (kind === "LOTE") {
      const count = id ? await tx.taxGrave.count({ where: { lotId: id } }) : 0;
      if (Number(data.graveLimit) < count) throw new Error("Limite inferior às sepulturas já cadastradas.");
      if (data.active === false && id && await tx.cemeteryProcess.count({ where: { grave: { lotId: id }, status: { in: ["AGENDADO", "EM_REALIZACAO"] } } })) throw new Error("Lote possui atendimento pendente.");
    }
    if (kind === "SEPULTURA") {
      if (data.graveType === "GAVETA" && !data.ownerTaxpayerId) throw new Error("Lóculo exige proprietário.");
      const lotIds = [...new Set([before?.lotId, data.lotId].filter((v): v is string => typeof v === "string"))].sort();
      for (const lotId of lotIds) await lock(tx, "LOTE", lotId);
      const lot = await tx.cemeteryLot.findUnique({ where: { id: String(data.lotId) } });
      if (!lot?.active || lot.cemeteryId !== data.cemeteryId) throw new Error("Lote deve estar ativo e pertencer ao cemitério.");
      const count = await tx.taxGrave.count({ where: { lotId: lot.id, ...(id ? { id: { not: id } } : {}) } });
      if (count >= lot.graveLimit) throw new Error("Limite de sepulturas do lote atingido.");
      if (data.sectorId) { const sector = await tx.taxCemeterySector.findUnique({ where: { id: String(data.sectorId) } }); if (sector?.cemeteryId !== data.cemeteryId) throw new Error("Quadra não pertence ao cemitério."); }
      if (Number(data.capacity) < Number(before?.occupantCount ?? 0)) throw new Error("Capacidade inferior à ocupação.");
      if (before && (data.active === false || before.lotId !== data.lotId) && (Number(before.occupantCount) > 0 || await tx.cemeteryProcess.count({ where: { graveId: id, status: { in: ["AGENDADO", "EM_REALIZACAO"] } } }))) throw new Error("Sepultura ocupada ou com atendimento pendente.");
    }
    if (kind === "OSSUARIO" && (Number(data.capacity) < Number(before?.occupantCount ?? 0) || data.active === false && Number(before?.occupantCount) > 0)) throw new Error("Ossuário ocupado: verifique capacidade e ativação.");
    if (kind === "CAMPO" && before) {
      // Identity/type is permanent once created: also protects values retained only in history.
      for (const key of ["cemeteryId", "targetType", "fieldKey", "valueType"]) if (data[key] !== before[key]) throw new Error("Chave, destino, cemitério e tipo são permanentes. Crie um novo campo e inative o anterior.");
    }
    if (kind === "LOTE" || kind === "SEPULTURA") {
      const fields = await tx.cemeteryIdentificationField.findMany({ where: { cemeteryId: String(data.cemeteryId), targetType: kind } });
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
    const result = id ? await delegate(tx, kind).update({ where: { id }, data }) : await delegate(tx, kind).create({ data });
    const changes = Object.entries(data).flatMap(([key, value]) => key === "additionalData" ? Object.entries(value as Record<string, unknown>).map(([k, v]) => [`additionalData.${k}`, ((before?.additionalData ?? {}) as Record<string, unknown>)[k], v] as const) : [[key, before?.[key], value] as const]);
    for (const [fieldName, previous, value] of changes) if (JSON.stringify(previous ?? null) !== JSON.stringify(value ?? null)) await tx.cemeteryChangeHistory.create({ data: { targetType: kind, targetId: result.id, fieldName, previousValue: json(previous), newValue: json(value), actorUsuarioId: actor.usuarioId } });
    if (kind === "LOTE" && !id) await recordCemeteryFeeEvent(tx, { eventType: "ACQUISICAO_LOTE", sourceType: "LOTE", sourceId: result.id });
    return result;
  }, { timeout: 20000 });
  if (kind === "LOTE" && !id) await chargeCemeteryFeeEvent(db, { usuarioId: actor.usuarioId, employeeId: null }, cemeteryFeeEventKey("ACQUISICAO_LOTE", "LOTE", saved.id));
  return saved;
}

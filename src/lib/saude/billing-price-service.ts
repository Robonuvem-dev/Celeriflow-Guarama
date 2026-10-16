import { Prisma } from "@prisma/client";
import { z } from "zod";
import { assertHealthUnitAccess, type AppContext } from "@/lib/platform/tenant-context";

const id = z.string().trim().min(1).max(200);
const priceTableSchema = z.object({ unitId: id, agreementId: id.nullable(), code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_.-]{1,40}$/), name: z.string().trim().min(3).max(200), validFrom: z.iso.date(), validUntil: z.iso.date(), sourceReference: z.string().trim().min(3).max(4000), items: z.array(z.object({ procedureId: id, unitValue: z.string().regex(/^\d{1,12}(\.\d{1,6})?$/) }).strict()).min(1).max(1000) }).strict();
const date = (value: string) => new Date(`${value}T00:00:00Z`);
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));

export async function publishHealthProcedurePrices(context: AppContext, raw: unknown) {
  const input = priceTableSchema.parse(raw);
  assertHealthUnitAccess(context.user, input.unitId);
  if (input.validFrom > input.validUntil || new Set(input.items.map(item => item.procedureId)).size !== input.items.length) throw new Error("Confira a vigência e não repita procedimentos na tabela.");
  return context.prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`HEALTH_PRICE_TABLE:${input.unitId}`}))`;
    if (!await tx.healthUnit.count({ where: { id: input.unitId, isActive: true } })) throw new Error("Selecione uma unidade ativa para a tabela.");
    const previous = await tx.healthProcedurePriceTable.findFirst({ where: { unitId: input.unitId, code: input.code }, orderBy: { version: "desc" }, include: { items: true } });
    if (previous && previous.agreementId !== input.agreementId) throw new Error("O código da tabela já está ligado a outro convênio. Use código próprio para cada vínculo.");
    if (previous && previous.name === input.name && previous.sourceReference === input.sourceReference && previous.validFrom.toISOString().slice(0, 10) === input.validFrom && previous.validUntil.toISOString().slice(0, 10) === input.validUntil && previous.items.length === input.items.length && input.items.every(item => previous.items.some(old => old.procedureId === item.procedureId && old.unitValue.eq(item.unitValue)))) return { id: previous.id, version: previous.version };
    if (input.agreementId && !await tx.healthCareAgreement.count({ where: { id: input.agreementId, isActive: true, validFrom: { lte: date(input.validFrom) }, OR: [{ validUntil: null }, { validUntil: { gte: date(input.validUntil) } }] } })) throw new Error("Convênio sem vigência para o período integral da tabela.");
    if (await tx.healthSusProcedure.count({ where: { id: { in: input.items.map(item => item.procedureId) }, isActive: true } }) !== input.items.length) throw new Error("Selecione procedimentos SUS ativos sem duplicação.");
    const conflict = await tx.healthProcedurePriceTable.findFirst({ where: { unitId: input.unitId, agreementId: input.agreementId, code: { not: input.code }, validFrom: { lte: date(input.validUntil) }, validUntil: { gte: date(input.validFrom) }, items: { some: { procedureId: { in: input.items.map(item => item.procedureId) } } } }, select: { code: true } });
    if (conflict) throw new Error(`Há preço concorrente na tabela ${conflict.code}. Publique revisão do mesmo código ou separe as vigências.`);
    if (input.agreementId) for (const item of input.items) {
      if (!await tx.healthCareCoverage.count({ where: { agreementId: input.agreementId, unitId: input.unitId, procedureId: item.procedureId, isActive: true, validFrom: { lte: date(input.validFrom) }, OR: [{ validUntil: null }, { validUntil: { gte: date(input.validUntil) } }] } })) throw new Error("O convênio deve cobrir cada procedimento na unidade e durante toda a vigência da tabela.");
    }
    const { items, validFrom, validUntil, ...data } = input;
    const table = await tx.healthProcedurePriceTable.create({ data: { ...data, validFrom: date(validFrom), validUntil: date(validUntil), version: (previous?.version || 0) + 1, actorUsuarioId: context.user.id, items: { create: items.map(item => ({ ...item, unitValue: new Prisma.Decimal(item.unitValue) })) } } });
    return { id: table.id, version: table.version };
  }, { timeout: 60000 });
}

type PriceReader = Pick<Prisma.TransactionClient, "healthProcedurePriceTable" | "healthSusProcedure">;
type ResolvedProcedurePrice = { unitValue: Prisma.Decimal | null; totalValue: Prisma.Decimal | null; snapshot: Prisma.InputJsonValue };
export async function resolveHealthProcedurePrice(tx: PriceReader, input: { unitId: string; procedureId: string; occurredAt: Date; quantity: number; agreementId?: string | null; billingContext?: unknown }): Promise<ResolvedProcedurePrice> {
  const on = date(input.occurredAt.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }));
  const tables = await tx.healthProcedurePriceTable.findMany({ where: { unitId: input.unitId, agreementId: input.agreementId ? { in: [input.agreementId] } : null, validFrom: { lte: on }, validUntil: { gte: on } }, orderBy: { version: "desc" }, include: { items: { where: { procedureId: input.procedureId } } } });
  // Latest applicable version of each logical table wins, even when a procedure was removed in that version.
  const latest = new Map<string, typeof tables[number]>();
  for (const table of tables) if (!latest.has(table.code)) latest.set(table.code, table);
  const match = [...latest.values()].find(table => table.items.length);
  if (!match && input.agreementId) {
    const defaults = await resolveHealthProcedurePrice(tx, { ...input, agreementId: null });
    return { ...defaults, snapshot: json({ ...(defaults.snapshot as Prisma.JsonObject), requestedAgreementId: input.agreementId }) };
  }
  const procedure = await tx.healthSusProcedure.findUniqueOrThrow({ where: { id: input.procedureId }, select: { code: true, source: true, sourceBatchId: true, competence: true, unitValue: true } });
  const unitValue = match?.items[0].unitValue ?? procedure.unitValue;
  const totalValue = unitValue === null ? null : unitValue.mul(input.quantity).toDecimalPlaces(2);
  const snapshot = json({ source: match ? "AUXILIARY_TABLE" : "PROCEDURE_CATALOG", procedureId: input.procedureId, procedureCode: procedure.code, quantity: input.quantity, unitValue: unitValue?.toFixed(6) ?? null, totalValue: totalValue?.toFixed(2) ?? null, table: match ? { id: match.id, code: match.code, version: match.version, itemId: match.items[0].id, validFrom: match.validFrom, validUntil: match.validUntil, sourceReference: match.sourceReference, agreementId: match.agreementId } : null, catalog: { source: procedure.source, batchId: procedure.sourceBatchId, competence: procedure.competence }, billingContext: input.billingContext ?? null });
  return { unitValue, totalValue, snapshot };
}

export const appointmentBillingContextSchema = z.object({ agreementId: z.string().nullable(), providerUnit: z.object({ id: z.string(), name: z.string(), cnes: z.string().nullable() }).nullable() });

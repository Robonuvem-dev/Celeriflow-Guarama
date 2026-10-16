import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { createTaxAssessment, generateTaxGuide, type TaxActor } from "@/lib/tributacao";
import { calculateCemeteryEventFee, cemeteryEventDueDate, cemeteryFeeEventKey, cemeteryFeeEventType, cemeteryFeeRuleSchema } from "./fees-engine";

type Db = PrismaClient | Prisma.TransactionClient;
export type CemeteryFeeSourceType = "LOTE" | "PROCESSO" | "MOVIMENTO" | "CONCESSAO";
export type CemeteryFeeEventInput = { eventType: string; sourceType: CemeteryFeeSourceType; sourceId: string; quantity?: string };
export type CemeteryFeeVersion = {
  id: string; ruleId: string; scopeKey: string; cemeteryId: string | null; eventType: string; version: number;
  label: string; formula: string; baseAmount: Prisma.Decimal; dueDays: number; taxId: string;
  validFrom: Date; validUntil: Date | null; legalBasis: string; publishedBy: string; createdAt: Date;
};
export type CemeteryFeeEvent = {
  id: string; eventKey: string; eventType: string; sourceType: string; sourceId: string;
  cemeteryId: string | null; taxpayerId: string | null; occurredAt: Date; quantity: Prisma.Decimal;
  ruleVersionId: string | null; calculationSnapshot: Prisma.JsonValue | null; amount: Prisma.Decimal | null;
  dueDate: Date | null; assessmentId: string | null; guideId: string | null; status: string; lastError: string | null;
};

// Publications always create a new legacy rule and an immutable version; no mutable rule is used for automatic billing.
export async function publishCemeteryFeeRule(db: PrismaClient, actor: TaxActor, input: unknown) {
  const data = cemeteryFeeRuleSchema.parse(input);
  calculateCemeteryEventFee(data.formula, data.baseAmount);
  return db.$transaction(async (tx) => {
    const scopeKey = data.cemeteryId || "GLOBAL";
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"cemetery-fee-rule:" + scopeKey + ":" + data.eventType}))`;
    const tax = await tx.tax.findFirst({ where: { id: data.taxId, isActive: true, taxType: "Taxa" }, select: { id: true } });
    if (!tax) throw new Error("Selecione uma taxa ativa da Tributação.");
    if (data.cemeteryId && !await tx.taxCemetery.findUnique({ where: { id: data.cemeteryId }, select: { id: true } })) throw new Error("Cemitério não encontrado.");
    const versions = await tx.$queryRaw<{ version: number }[]>`SELECT "version" FROM "CemeteryFeeRuleVersion" WHERE "scopeKey"=${scopeKey} AND "eventType"=${data.eventType} ORDER BY "version" DESC LIMIT 1`;
    const version = (versions[0]?.version ?? 0) + 1;
    const validFrom = new Date(data.validFrom + "T00:00:00Z");
    const validUntil = data.validUntil ? new Date(data.validUntil + "T23:59:59.999Z") : null;
    const legacy = await tx.cemeteryFeeRule.create({ data: { cemeteryId: data.cemeteryId || null, eventType: data.eventType, label: data.label, formula: data.formula, baseAmount: data.baseAmount, validFrom, validUntil } });
    const id = randomUUID();
    await tx.$executeRaw`INSERT INTO "CemeteryFeeRuleVersion" ("id","ruleId","scopeKey","cemeteryId","eventType","version","label","formula","baseAmount","dueDays","taxId","validFrom","validUntil","legalBasis","publishedBy") VALUES (${id},${legacy.id},${scopeKey},${data.cemeteryId || null},${data.eventType},${version},${data.label},${data.formula},${new Prisma.Decimal(data.baseAmount)},${data.dueDays},${data.taxId},${validFrom},${validUntil},${data.legalBasis},${actor.usuarioId})`;
    await tx.taxAuditLog.create({ data: { action: "CEMETERY_FEE_RULE_PUBLISHED", entityType: "CemeteryFeeRuleVersion", entityId: id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { ...data, version, ruleId: legacy.id } } });
    return { id, ruleId: legacy.id, version };
  });
}

async function effectiveRule(tx: Db, eventType: string, cemeteryId: string | null, at: Date) {
  const rules = await tx.$queryRaw<CemeteryFeeVersion[]>`SELECT * FROM "CemeteryFeeRuleVersion" WHERE "eventType"=${eventType} AND ("cemeteryId"=${cemeteryId} OR "cemeteryId" IS NULL) AND "validFrom"<=${at} AND ("validUntil" IS NULL OR "validUntil">=${at}) ORDER BY ("cemeteryId" IS NOT NULL) DESC,"version" DESC LIMIT 1`;
  return rules[0] ?? null;
}

function snapshot(rule: CemeteryFeeVersion, occurredAt: Date, quantity: string) {
  const calculated = calculateCemeteryEventFee(rule.formula, rule.baseAmount, quantity);
  const dueDate = cemeteryEventDueDate(occurredAt, rule.dueDays);
  return { amount: calculated.amount, dueDate, json: { ...calculated, amount: calculated.amount.toFixed(2), ruleVersionId: rule.id, ruleId: rule.ruleId, version: rule.version, taxId: rule.taxId, label: rule.label, legalBasis: rule.legalBasis, dueDays: rule.dueDays, validFrom: rule.validFrom.toISOString(), validUntil: rule.validUntil?.toISOString() ?? null, occurredAt: occurredAt.toISOString(), dueDate: dueDate.toISOString(), assessmentYear: dueDate.getUTCFullYear() } };
}

async function sourceFacts(tx: Prisma.TransactionClient, input: CemeteryFeeEventInput) {
  if (input.sourceType === "LOTE") {
    const lot = await tx.cemeteryLot.findUniqueOrThrow({ where: { id: input.sourceId } });
    if (input.eventType !== "ACQUISICAO_LOTE") throw new Error("Evento de lote deve ser ACQUISICAO_LOTE.");
    return { cemeteryId: lot.cemeteryId, taxpayerId: lot.ownerTaxpayerId, occurredAt: lot.createdAt };
  }
  if (input.sourceType === "PROCESSO") {
    const process = await tx.cemeteryProcess.findUniqueOrThrow({ where: { id: input.sourceId }, include: { deceased: { select: { cemeteryId: true } } } });
    if (!process.performedAt || ["AGENDADO", "EM_REALIZACAO", "CANCELADO"].includes(process.status)) throw new Error("O fato gerador exige processo efetivamente realizado.");
    if (input.eventType !== process.processType) throw new Error("Evento não corresponde ao tipo do processo realizado.");
    return { cemeteryId: process.cemeteryId ?? process.deceased.cemeteryId, taxpayerId: process.declarantTaxpayerId, occurredAt: process.performedAt };
  }
  if (input.sourceType === "MOVIMENTO") {
    const movement = await tx.taxBurialMovement.findUniqueOrThrow({ where: { id: input.sourceId }, include: { grave: { select: { cemeteryId: true } }, deceased: { select: { taxpayerId: true, declarantTaxpayerId: true } } } });
    // Burial is charged by the completed process only, preventing a second charge for its movement.
    if (movement.movementType === "SEPULTAMENTO" || input.eventType !== movement.movementType) throw new Error("Sepultamento deve ser cobrado pelo processo; demais eventos devem corresponder à movimentação.");
    return { cemeteryId: movement.grave.cemeteryId, taxpayerId: movement.deceased?.declarantTaxpayerId ?? movement.deceased?.taxpayerId ?? null, occurredAt: movement.movementDate };
  }
  if (input.sourceType === "CONCESSAO") {
    const concession = await tx.taxGraveConcession.findUniqueOrThrow({ where: { id: input.sourceId }, include: { grave: { select: { cemeteryId: true } } } });
    return { cemeteryId: concession.grave.cemeteryId, taxpayerId: concession.taxpayerId, occurredAt: concession.startsAt };
  }
  throw new Error("Tipo de fato gerador inválido.");
}

// Call INSIDE the source transaction. The immutable fact and selected rule snapshot commit with the funeral/lot operation.
export async function recordCemeteryFeeEvent(tx: Prisma.TransactionClient, input: CemeteryFeeEventInput) {
  const eventType = cemeteryFeeEventType.parse(input.eventType);
  if (eventType === "ACQUISICAO_LOTE" && input.sourceType !== "LOTE") throw new Error("Aquisição de lote exige origem LOTE.");
  if (eventType === "SEPULTAMENTO" && input.sourceType !== "PROCESSO") throw new Error("Sepultamento exige origem PROCESSO realizado.");
  const eventKey = cemeteryFeeEventKey(eventType, input.sourceType, input.sourceId);
  const quantity = new Prisma.Decimal(input.quantity ?? "1");
  calculateCemeteryEventFee("VALOR_FIXO", "1", quantity);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${eventKey}))`;
  const existing = await tx.$queryRaw<CemeteryFeeEvent[]>`SELECT * FROM "CemeteryFeeEvent" WHERE "eventKey"=${eventKey}`;
  if (existing[0]) {
    if (!new Prisma.Decimal(existing[0].quantity).eq(quantity)) throw new Error("Chave de evento reutilizada com quantidade diferente.");
    return existing[0];
  }
  const facts = await sourceFacts(tx, { ...input, eventType });
  const rule = await effectiveRule(tx, eventType, facts.cemeteryId, facts.occurredAt);
  const calculation = rule ? snapshot(rule, facts.occurredAt, quantity.toString()) : null;
  const id = randomUUID();
  const status = !rule ? "AGUARDANDO_CONFIGURACAO" : !facts.taxpayerId ? "AGUARDANDO_CONTRIBUINTE" : "PENDENTE";
  await tx.$executeRaw`INSERT INTO "CemeteryFeeEvent" ("id","eventKey","eventType","sourceType","sourceId","cemeteryId","taxpayerId","occurredAt","quantity","ruleVersionId","calculationSnapshot","amount","dueDate","status") VALUES (${id},${eventKey},${eventType},${input.sourceType},${input.sourceId},${facts.cemeteryId},${facts.taxpayerId},${facts.occurredAt},${quantity},${rule?.id ?? null},${calculation ? JSON.stringify(calculation.json) : null}::jsonb,${calculation?.amount ?? null},${calculation?.dueDate ?? null},${status})`;
  return (await tx.$queryRaw<CemeteryFeeEvent[]>`SELECT * FROM "CemeteryFeeEvent" WHERE "id"=${id}`)[0];
}

// Call AFTER source commit; safe to replay from UI/jobs. Billing failures never undo an essential funeral event.
export async function chargeCemeteryFeeEvent(db: PrismaClient, actor: TaxActor, eventKey: string) {
  try {
    return await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<CemeteryFeeEvent[]>`SELECT * FROM "CemeteryFeeEvent" WHERE "eventKey"=${eventKey} FOR UPDATE`;
      const event = rows[0];
      if (!event) throw new Error("Evento de taxa não encontrado.");
      if (event.assessmentId) return event;
      if (!event.taxpayerId) return event;
      let calculation = event.calculationSnapshot;
      let amount = event.amount;
      let dueDate = event.dueDate;
      if (!event.ruleVersionId) {
        const rule = await effectiveRule(tx, event.eventType, event.cemeteryId, event.occurredAt);
        if (!rule) return event; // Explicit awaiting configuration; never invent a fee or reuse an unrelated tax.
        const selected = snapshot(rule, event.occurredAt, new Prisma.Decimal(event.quantity).toString());
        calculation = selected.json;
        amount = selected.amount;
        dueDate = selected.dueDate;
        await tx.$executeRaw`UPDATE "CemeteryFeeEvent" SET "ruleVersionId"=${rule.id},"calculationSnapshot"=${JSON.stringify(calculation)}::jsonb,"amount"=${amount},"dueDate"=${dueDate},"status"='PENDENTE' WHERE "id"=${event.id}`;
      }
      if (!calculation || typeof calculation !== "object" || Array.isArray(calculation) || typeof calculation.taxId !== "string" || !amount || !dueDate) throw new Error("Snapshot da taxa incompleto.");
      // Central APIs own their transactions; adapt to this already locked transaction (same pattern as construction taxation).
      const transactionalDb = { $transaction: async <T>(callback: (client: Prisma.TransactionClient) => Promise<T>) => callback(tx) } as unknown as PrismaClient;
      const assessment = await createTaxAssessment(transactionalDb, actor, { year: dueDate.getUTCFullYear(), taxId: calculation.taxId, taxpayerId: event.taxpayerId, taxableBase: amount, rate: "100", competence: event.occurredAt });
      await tx.taxAssessment.update({ where: { id: assessment.id }, data: { calculationSnapshot: { ...calculation, eventKey: event.eventKey, sourceType: event.sourceType, sourceId: event.sourceId, taxpayerId: event.taxpayerId } } });
      const guide = await generateTaxGuide(transactionalDb, actor, { assessmentId: assessment.id, dueDate });
      await tx.$executeRaw`UPDATE "CemeteryFeeEvent" SET "assessmentId"=${assessment.id},"guideId"=${guide.id},"status"='EMITIDA',"lastError"=NULL,"chargedAt"=CURRENT_TIMESTAMP WHERE "id"=${event.id}`;
      if (event.sourceType === "MOVIMENTO") await tx.taxBurialMovement.update({ where: { id: event.sourceId }, data: { feeAssessmentId: assessment.id } });
      if (event.sourceType === "CONCESSAO") await tx.taxGraveConcession.update({ where: { id: event.sourceId }, data: { feeAssessmentId: assessment.id } });
      return (await tx.$queryRaw<CemeteryFeeEvent[]>`SELECT * FROM "CemeteryFeeEvent" WHERE "id"=${event.id}`)[0];
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao emitir taxa.";
    await db.$executeRaw`UPDATE "CemeteryFeeEvent" SET "status"='FALHA_EMISSAO',"lastError"=${message.slice(0, 2000)} WHERE "eventKey"=${eventKey} AND "assessmentId" IS NULL`;
    return { eventKey, status: "FALHA_EMISSAO", lastError: message, assessmentId: null, guideId: null };
  }
}

export async function listCemeteryFeeRules(db: Db, page = 1, filter: { q?: string; cemeteryId?: string } = {}) {
  const q = filter.q?.trim() || "";
  const cemeteryId = filter.cemeteryId || "";
  const totals = await db.$queryRaw<{ total: bigint }[]>`SELECT count(*) AS total FROM "CemeteryFeeRuleVersion" WHERE (${cemeteryId}='' OR "cemeteryId"=${cemeteryId} OR "cemeteryId" IS NULL) AND (${q}='' OR position(lower(${q}) in lower("eventType" || ' ' || "label")) > 0)`;
  const total = Number(totals[0].total);
  const currentPage = Math.min(Math.max(1, Math.floor(page)), Math.max(1, Math.ceil(total / 20)));
  const offset = (currentPage - 1) * 20;
  const rows = await db.$queryRaw<CemeteryFeeVersion[]>`SELECT * FROM "CemeteryFeeRuleVersion" WHERE (${cemeteryId}='' OR "cemeteryId"=${cemeteryId} OR "cemeteryId" IS NULL) AND (${q}='' OR position(lower(${q}) in lower("eventType" || ' ' || "label")) > 0) ORDER BY "createdAt" DESC,"id" LIMIT 20 OFFSET ${offset}`;
  return { rows, total, page: currentPage };
}

export async function listCemeteryFeeEvents(db: Db, page = 1, status = "", filter: { q?: string; cemeteryId?: string } = {}) {
  const q = filter.q?.trim() || "";
  const cemeteryId = filter.cemeteryId || "";
  const totals = await db.$queryRaw<{ total: bigint }[]>`SELECT count(*) AS total FROM "CemeteryFeeEvent" WHERE (${status}='' OR "status"=${status}) AND (${cemeteryId}='' OR "cemeteryId"=${cemeteryId}) AND (${q}='' OR position(lower(${q}) in lower("eventType" || ' ' || "sourceId" || ' ' || "eventKey")) > 0)`;
  const total = Number(totals[0].total);
  const currentPage = Math.min(Math.max(1, Math.floor(page)), Math.max(1, Math.ceil(total / 20)));
  const offset = (currentPage - 1) * 20;
  const rows = await db.$queryRaw<CemeteryFeeEvent[]>`SELECT * FROM "CemeteryFeeEvent" WHERE (${status}='' OR "status"=${status}) AND (${cemeteryId}='' OR "cemeteryId"=${cemeteryId}) AND (${q}='' OR position(lower(${q}) in lower("eventType" || ' ' || "sourceId" || ' ' || "eventKey")) > 0) ORDER BY "occurredAt" DESC,"id" LIMIT 20 OFFSET ${offset}`;
  const guides = await db.taxGuide.findMany({ where: { id: { in: rows.flatMap((row) => row.guideId ? [row.guideId] : []) } }, select: { id: true, guideNumber: true, status: true, dueDate: true, totalValueDecimal: true, assessment: { select: { assessmentNumber: true, taxpayer: { select: { person: { select: { fullName: true } }, company: { select: { corporateName: true } } } } } } } });
  return { rows: rows.map((row) => ({ ...row, guide: guides.find((guide) => guide.id === row.guideId) ?? null })), total, page: currentPage };
}

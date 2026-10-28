import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor, type DatabaseTransaction } from "@/db/transaction";
import { Decimal } from "@/db/decimal";
import { cemeteries, cemeteryConcessions, cemeteryDeceased, cemeteryFeeEvents, cemeteryFeeRules, cemeteryFeeRuleVersions, cemeteryGraves, cemeteryLots, cemeteryMovements, cemeteryProcesses } from "@/db/schema/cemeteries";
import { taxes, taxAssessments, taxGuides } from "@/db/schema/taxation-core";
import { taxAuditLogs } from "@/db/schema/taxation-audit";
import { companies, taxpayers } from "@/db/schema/registry";
import { people } from "@/db/schema/people";
import { createTaxAssessmentInTransaction, generateTaxGuideInTransaction, type TaxActor } from "@/lib/tributacao";
import type { CemeteryFeeEvent, CemeteryFeeVersion, CemeteryEventGuide } from "@/lib/contracts/cemeteries-fees";
import { calculateCemeteryEventFee, cemeteryEventDueDate, cemeteryFeeEventKey, cemeteryFeeEventType, cemeteryFeeRuleSchema } from "./fees-engine";

export type { CemeteryFeeEvent, CemeteryFeeVersion } from "@/lib/contracts/cemeteries-fees";
export type CemeteryFeeSourceType = "LOTE" | "PROCESSO" | "MOVIMENTO" | "CONCESSAO";
export type CemeteryFeeEventInput = { eventType: string; sourceType: CemeteryFeeSourceType; sourceId: string; quantity?: string };

// Publications always create a new legacy rule and an immutable version; no mutable rule is used for automatic billing.
export async function publishCemeteryFeeRule(connection: DatabaseConnection, actor: TaxActor, input: unknown) {
  const data = cemeteryFeeRuleSchema.parse(input);
  calculateCemeteryEventFee(data.formula, data.baseAmount);
  return withDatabaseTransaction(connection, async (tx) => {
    const scopeKey = data.cemeteryId || "GLOBAL";
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"cemetery-fee-rule:" + scopeKey + ":" + data.eventType}))`);
    const [tax] = await tx.select({ id: taxes.id }).from(taxes).where(and(eq(taxes.id, data.taxId), eq(taxes.isActive, true), eq(taxes.taxType, "Taxa"))).limit(1);
    if (!tax) throw new Error("Selecione uma taxa ativa da Tributação.");
    if (data.cemeteryId && !(await tx.select({ id: cemeteries.id }).from(cemeteries).where(eq(cemeteries.id, data.cemeteryId)).limit(1))[0]) throw new Error("Cemitério não encontrado.");
    const versions = await tx.select({ version: cemeteryFeeRuleVersions.version }).from(cemeteryFeeRuleVersions).where(and(eq(cemeteryFeeRuleVersions.scopeKey, scopeKey), eq(cemeteryFeeRuleVersions.eventType, data.eventType))).orderBy(desc(cemeteryFeeRuleVersions.version)).limit(1);
    const version = (versions[0]?.version ?? 0) + 1;
    const validFrom = new Date(data.validFrom + "T00:00:00Z");
    const validUntil = data.validUntil ? new Date(data.validUntil + "T23:59:59.999Z") : null;
    const [legacy] = await tx.insert(cemeteryFeeRules).values({ cemeteryId: data.cemeteryId || null, eventType: data.eventType, label: data.label, formula: data.formula, baseAmount: new Decimal(data.baseAmount), validFrom, validUntil }).returning();
    const id = randomUUID();
    await tx.insert(cemeteryFeeRuleVersions).values({ id, ruleId: legacy.id, scopeKey, cemeteryId: data.cemeteryId || null, eventType: data.eventType, version, label: data.label, formula: data.formula, baseAmount: new Decimal(data.baseAmount), dueDays: data.dueDays, taxId: data.taxId, validFrom, validUntil, legalBasis: data.legalBasis, publishedBy: actor.usuarioId });
    await tx.insert(taxAuditLogs).values({ action: "CEMETERY_FEE_RULE_PUBLISHED", entityType: "CemeteryFeeRuleVersion", entityId: id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { ...data, version, ruleId: legacy.id } });
    return { id, ruleId: legacy.id, version };
  });
}

async function effectiveRule(tx: DatabaseExecutor, eventType: string, cemeteryId: string | null, at: Date) {
  const rules = await tx.select().from(cemeteryFeeRuleVersions).where(and(eq(cemeteryFeeRuleVersions.eventType, eventType), or(cemeteryId ? eq(cemeteryFeeRuleVersions.cemeteryId, cemeteryId) : undefined, isNull(cemeteryFeeRuleVersions.cemeteryId)), lte(cemeteryFeeRuleVersions.validFrom, at), or(isNull(cemeteryFeeRuleVersions.validUntil), gte(cemeteryFeeRuleVersions.validUntil, at)))).orderBy(desc(sql`${cemeteryFeeRuleVersions.cemeteryId} IS NOT NULL`), desc(cemeteryFeeRuleVersions.version)).limit(1);
  return rules[0] ?? null;
}

function snapshot(rule: CemeteryFeeVersion, occurredAt: Date, quantity: string) {
  const calculated = calculateCemeteryEventFee(rule.formula, rule.baseAmount, quantity);
  const dueDate = cemeteryEventDueDate(occurredAt, rule.dueDays);
  return { amount: calculated.amount, dueDate, json: { ...calculated, amount: calculated.amount.toFixed(2), ruleVersionId: rule.id, ruleId: rule.ruleId, version: rule.version, taxId: rule.taxId, label: rule.label, legalBasis: rule.legalBasis, dueDays: rule.dueDays, validFrom: rule.validFrom.toISOString(), validUntil: rule.validUntil?.toISOString() ?? null, occurredAt: occurredAt.toISOString(), dueDate: dueDate.toISOString(), assessmentYear: dueDate.getUTCFullYear() } };
}

async function sourceFacts(tx: DatabaseTransaction, input: CemeteryFeeEventInput) {
  if (input.sourceType === "LOTE") {
    const [lot] = await tx.select().from(cemeteryLots).where(eq(cemeteryLots.id, input.sourceId)).limit(1);
    if (!lot) throw new Error("Lote não encontrado.");
    if (input.eventType !== "ACQUISICAO_LOTE") throw new Error("Evento de lote deve ser ACQUISICAO_LOTE.");
    return { cemeteryId: lot.cemeteryId, taxpayerId: lot.ownerTaxpayerId, occurredAt: lot.createdAt };
  }
  if (input.sourceType === "PROCESSO") {
    const [row] = await tx.select({ process: cemeteryProcesses, deceased: cemeteryDeceased }).from(cemeteryProcesses).innerJoin(cemeteryDeceased, eq(cemeteryDeceased.id, cemeteryProcesses.deceasedId)).where(eq(cemeteryProcesses.id, input.sourceId)).limit(1);
    if (!row) throw new Error("Processo não encontrado.");
    const { process, deceased } = row;
    if (!process.performedAt || ["AGENDADO", "EM_REALIZACAO", "CANCELADO"].includes(process.status)) throw new Error("O fato gerador exige processo efetivamente realizado.");
    if (input.eventType !== process.processType) throw new Error("Evento não corresponde ao tipo do processo realizado.");
    return { cemeteryId: process.cemeteryId ?? deceased.cemeteryId, taxpayerId: process.declarantTaxpayerId, occurredAt: process.performedAt };
  }
  if (input.sourceType === "MOVIMENTO") {
    const [row] = await tx.select({ movement: cemeteryMovements, grave: cemeteryGraves, deceased: cemeteryDeceased }).from(cemeteryMovements).innerJoin(cemeteryGraves, eq(cemeteryGraves.id, cemeteryMovements.graveId)).leftJoin(cemeteryDeceased, eq(cemeteryDeceased.id, cemeteryMovements.deceasedId)).where(eq(cemeteryMovements.id, input.sourceId)).limit(1);
    if (!row) throw new Error("Movimentação não encontrada.");
    const { movement, grave, deceased } = row;
    // Burial is charged by the completed process only, preventing a second charge for its movement.
    if (movement.movementType === "SEPULTAMENTO" || input.eventType !== movement.movementType) throw new Error("Sepultamento deve ser cobrado pelo processo; demais eventos devem corresponder à movimentação.");
    return { cemeteryId: grave.cemeteryId, taxpayerId: deceased?.declarantTaxpayerId ?? deceased?.taxpayerId ?? null, occurredAt: movement.movementDate };
  }
  if (input.sourceType === "CONCESSAO") {
    const [row] = await tx.select({ concession: cemeteryConcessions, grave: cemeteryGraves }).from(cemeteryConcessions).innerJoin(cemeteryGraves, eq(cemeteryGraves.id, cemeteryConcessions.graveId)).where(eq(cemeteryConcessions.id, input.sourceId)).limit(1);
    if (!row) throw new Error("Concessão não encontrada.");
    return { cemeteryId: row.grave.cemeteryId, taxpayerId: row.concession.taxpayerId, occurredAt: row.concession.startsAt };
  }
  throw new Error("Tipo de fato gerador inválido.");
}

// Call INSIDE the source transaction. The immutable fact and selected rule snapshot commit with the funeral/lot operation.
export async function recordCemeteryFeeEvent(tx: DatabaseTransaction, input: CemeteryFeeEventInput): Promise<CemeteryFeeEvent> {
  const eventType = cemeteryFeeEventType.parse(input.eventType);
  if (eventType === "ACQUISICAO_LOTE" && input.sourceType !== "LOTE") throw new Error("Aquisição de lote exige origem LOTE.");
  if (eventType === "SEPULTAMENTO" && input.sourceType !== "PROCESSO") throw new Error("Sepultamento exige origem PROCESSO realizado.");
  const eventKey = cemeteryFeeEventKey(eventType, input.sourceType, input.sourceId);
  const quantity = new Decimal(input.quantity ?? "1");
  calculateCemeteryEventFee("VALOR_FIXO", "1", quantity);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${eventKey}))`);
  const existing = await tx.select().from(cemeteryFeeEvents).where(eq(cemeteryFeeEvents.eventKey, eventKey));
  if (existing[0]) {
    if (!existing[0].quantity.eq(quantity)) throw new Error("Chave de evento reutilizada com quantidade diferente.");
    return existing[0];
  }
  const facts = await sourceFacts(tx, { ...input, eventType });
  const rule = await effectiveRule(tx, eventType, facts.cemeteryId, facts.occurredAt);
  const calculation = rule ? snapshot(rule, facts.occurredAt, quantity.toString()) : null;
  const id = randomUUID();
  const status = !rule ? "AGUARDANDO_CONFIGURACAO" : !facts.taxpayerId ? "AGUARDANDO_CONTRIBUINTE" : "PENDENTE";
  const [event] = await tx.insert(cemeteryFeeEvents).values({ id, eventKey, eventType, sourceType: input.sourceType, sourceId: input.sourceId, ...facts, quantity, ruleVersionId: rule?.id ?? null, calculationSnapshot: calculation?.json ?? null, amount: calculation?.amount ?? null, dueDate: calculation?.dueDate ?? null, status }).returning();
  return event;
}

// Call AFTER source commit; safe to replay from UI/jobs. Billing failures never undo an essential funeral event.
export async function chargeCemeteryFeeEvent(connection: DatabaseConnection, actor: TaxActor, eventKey: string) {
  try {
    return await withDatabaseTransaction(connection, async (tx) => {
      const rows = await tx.select().from(cemeteryFeeEvents).where(eq(cemeteryFeeEvents.eventKey, eventKey)).for("update");
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
        const selected = snapshot(rule, event.occurredAt, event.quantity.toString());
        calculation = selected.json;
        amount = selected.amount;
        dueDate = selected.dueDate;
        await tx.update(cemeteryFeeEvents).set({ ruleVersionId: rule.id, calculationSnapshot: calculation, amount, dueDate, status: "PENDENTE" }).where(eq(cemeteryFeeEvents.id, event.id));
      }
      if (!calculation || typeof calculation !== "object" || Array.isArray(calculation) || typeof calculation.taxId !== "string" || !amount || !dueDate) throw new Error("Snapshot da taxa incompleto.");
      // Central cores use this exact transaction: event, assessment, guide and
      // audit/accounting commit or roll back together.
      const assessment = await createTaxAssessmentInTransaction(tx, actor, { year: dueDate.getUTCFullYear(), taxId: calculation.taxId, taxpayerId: event.taxpayerId, taxableBase: amount, rate: "100", competence: event.occurredAt });
      await tx.update(taxAssessments).set({ calculationSnapshot: { ...calculation, eventKey: event.eventKey, sourceType: event.sourceType, sourceId: event.sourceId, taxpayerId: event.taxpayerId } }).where(eq(taxAssessments.id, assessment.id));
      const guide = await generateTaxGuideInTransaction(tx, actor, { assessmentId: assessment.id, dueDate });
      const [charged] = await tx.update(cemeteryFeeEvents).set({ assessmentId: assessment.id, guideId: guide.id, status: "EMITIDA", lastError: null, chargedAt: sql`CURRENT_TIMESTAMP` }).where(eq(cemeteryFeeEvents.id, event.id)).returning();
      if (event.sourceType === "MOVIMENTO") await tx.update(cemeteryMovements).set({ feeAssessmentId: assessment.id }).where(eq(cemeteryMovements.id, event.sourceId));
      if (event.sourceType === "CONCESSAO") await tx.update(cemeteryConcessions).set({ feeAssessmentId: assessment.id }).where(eq(cemeteryConcessions.id, event.sourceId));
      return charged;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao emitir taxa.";
    await connection.db.update(cemeteryFeeEvents).set({ status: "FALHA_EMISSAO", lastError: message.slice(0, 2000) }).where(and(eq(cemeteryFeeEvents.eventKey, eventKey), isNull(cemeteryFeeEvents.assessmentId)));
    return { eventKey, status: "FALHA_EMISSAO", lastError: message, assessmentId: null, guideId: null };
  }
}

export async function listCemeteryFeeRules(db: DatabaseExecutor, page = 1, filter: { q?: string; cemeteryId?: string } = {}): Promise<{ rows: CemeteryFeeVersion[]; total: number; page: number }> {
  const q = filter.q?.trim() || "";
  const cemeteryId = filter.cemeteryId || "";
  const where = and(cemeteryId ? or(eq(cemeteryFeeRuleVersions.cemeteryId, cemeteryId), isNull(cemeteryFeeRuleVersions.cemeteryId)) : undefined, q ? sql`position(lower(${q}) in lower(${cemeteryFeeRuleVersions.eventType} || ' ' || ${cemeteryFeeRuleVersions.label})) > 0` : undefined);
  const totals = await db.select({ total: count() }).from(cemeteryFeeRuleVersions).where(where);
  const total = Number(totals[0].total);
  const currentPage = Math.min(Math.max(1, Math.floor(page)), Math.max(1, Math.ceil(total / 20)));
  const offset = (currentPage - 1) * 20;
  const rows = await db.select().from(cemeteryFeeRuleVersions).where(where).orderBy(desc(cemeteryFeeRuleVersions.createdAt), asc(cemeteryFeeRuleVersions.id)).limit(20).offset(offset);
  return { rows, total, page: currentPage };
}

export async function listCemeteryFeeEvents(db: DatabaseExecutor, page = 1, status = "", filter: { q?: string; cemeteryId?: string } = {}): Promise<{ rows: (CemeteryFeeEvent & { guide: CemeteryEventGuide | null })[]; total: number; page: number }> {
  const q = filter.q?.trim() || "";
  const cemeteryId = filter.cemeteryId || "";
  const where = and(status ? eq(cemeteryFeeEvents.status, status) : undefined, cemeteryId ? eq(cemeteryFeeEvents.cemeteryId, cemeteryId) : undefined, q ? sql`position(lower(${q}) in lower(${cemeteryFeeEvents.eventType} || ' ' || ${cemeteryFeeEvents.sourceId} || ' ' || ${cemeteryFeeEvents.eventKey})) > 0` : undefined);
  const totals = await db.select({ total: count() }).from(cemeteryFeeEvents).where(where);
  const total = Number(totals[0].total);
  const currentPage = Math.min(Math.max(1, Math.floor(page)), Math.max(1, Math.ceil(total / 20)));
  const offset = (currentPage - 1) * 20;
  const rows = await db.select().from(cemeteryFeeEvents).where(where).orderBy(desc(cemeteryFeeEvents.occurredAt), asc(cemeteryFeeEvents.id)).limit(20).offset(offset);
  const ids = rows.flatMap(row => row.guideId ? [row.guideId] : []);
  const joined = ids.length ? await db.select({ id: taxGuides.id, guideNumber: taxGuides.guideNumber, status: taxGuides.status, dueDate: taxGuides.dueDate, totalValueDecimal: taxGuides.totalValueDecimal, assessmentNumber: taxAssessments.assessmentNumber, person: { id: people.id, fullName: people.fullName }, company: { id: companies.id, corporateName: companies.corporateName } }).from(taxGuides).innerJoin(taxAssessments, eq(taxAssessments.id, taxGuides.assessmentId)).innerJoin(taxpayers, eq(taxpayers.id, taxAssessments.taxpayerId)).leftJoin(people, eq(people.id, taxpayers.personId)).leftJoin(companies, eq(companies.id, taxpayers.companyId)).where(inArray(taxGuides.id, ids)) : [];
  const guides: CemeteryEventGuide[] = joined.map(({ assessmentNumber, person, company, ...guide }) => ({ ...guide, assessment: { assessmentNumber, taxpayer: { person: person ? { fullName: person.fullName } : null, company: company ? { corporateName: company.corporateName } : null } } }));
  return { rows: rows.map((row) => ({ ...row, guide: guides.find((guide) => guide.id === row.guideId) ?? null })), total, page: currentPage };
}

import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { leaves, vacations as vacationTable } from "@/db/schema/personnel-records";
import { hrVacationPolicies } from "@/db/schema/personnel-configuration";
import { hrEmploymentContracts, hrIntegrationEvents, hrPayrollRuns, hrPayrollStatements, hrRightEntries, payrolls } from "@/db/schema/personnel-workforce";
import { findHrIntegrationEvent, lockPersonnel, personnelJson as json, requireHrIntegrationEvent } from "@/db/repositories/personnel/integration";
import { requireEmploymentContract, requireEmploymentHolderHistory, requireEmploymentRegime } from "@/db/repositories/personnel/workforce";
import { z } from "zod";
import { resolveContractRevision } from "./contract-timeline";
import { enqueueHrIntegration } from "./workforce-service";

const day = 86400000;
const civil = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Data civil inválida.");
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const requestSchema = z.object({ sourceKey: z.string().trim().min(1).max(140), contractId: z.string().min(1), start: civil, reason: z.string().trim().min(10).max(4000), allocations: z.array(z.object({ periodStart: civil, periodEnd: civil, days: z.number().int().min(1).max(90) }).strict()).min(2).max(10) }).strict().superRefine((input, ctx) => {
  if (input.allocations.reduce((sum, allocation) => sum + allocation.days, 0) > 90) ctx.addIssue({ code: "custom", message: "Gozo conjunto não pode ultrapassar 90 dias." });
  const sorted = [...input.allocations].sort((a, b) => a.periodStart.localeCompare(b.periodStart));
  for (const [index, allocation] of sorted.entries()) {
    if (allocation.periodEnd < allocation.periodStart || (index > 0 && allocation.periodStart <= sorted[index - 1].periodEnd)) ctx.addIssue({ code: "custom", message: "Aquisitivos inválidos, duplicados ou sobrepostos." });
  }
});

/** Consecutive projections retain each acquisition period, rather than invent
 * one continuous acquisition range across distinct rights. */
export async function reserveMultipleVacationPeriods(db: DatabaseConnection, actorId: string, raw: unknown) {
  const input = requestSchema.parse(raw);
  input.allocations.sort((a, b) => a.periodStart.localeCompare(b.periodStart));
  const sourceKey = `FERIAS:MULTIPLOS:${input.sourceKey}`;
  return withDatabaseTransaction(db, async tx => {
    await lockPersonnel(tx, sourceKey);
    const previous = await findHrIntegrationEvent(tx, sourceKey);
    if (previous) {
      const payload = previous.payload as { input: unknown; entryIds: string[]; vacationIds: string[] };
      if (previous.eventType !== "FERIAS_MULTIPLOS_RESERVADAS" || JSON.stringify(requestSchema.parse(payload.input)) !== JSON.stringify(input)) throw new Error("Origem de férias reutilizada com outros dados.");
      return { entryIds: payload.entryIds, vacationIds: payload.vacationIds, sourceKey };
    }
    const initial = await requireEmploymentContract(tx, input.contractId);
    await lockPersonnel(tx, `employee:${initial.employeeId}`);
    await lockPersonnel(tx, `contract:${initial.id}`);
    const stored = await requireEmploymentHolderHistory(tx, initial.id);
    const start = date(input.start); const totalDays = input.allocations.reduce((sum, allocation) => sum + allocation.days, 0); const end = new Date(start.getTime() + (totalDays - 1) * day);
    const contract = resolveContractRevision(stored, stored.revisions, { start, end: start }).contract;
    if (!stored.employee.isActive || !stored.employee.personId || contract.status !== "ATIVO" || start < contract.admittedAt || (contract.endsAt && end > contract.endsAt)) throw new Error("Reserva fora do vínculo ativo do titular.");
    if (stored.revisions.some(revision => revision.effectiveFrom > start && revision.effectiveFrom <= end && ((revision.snapshot as { regimeId: string; status: string }).regimeId !== contract.regimeId || (revision.snapshot as { status: string }).status !== "ATIVO"))) throw new Error("Gozo atravessa transição de regime/situação; concilie antes de reservar.");
    const regime = await requireEmploymentRegime(tx, contract.regimeId);
    const [policy] = regime.vacationPolicyId ? await tx.select().from(hrVacationPolicies).where(eq(hrVacationPolicies.id, regime.vacationPolicyId)).limit(1) : [];
    const set = regime.ruleSet;
    if (!regime.isActive || !policy?.isActive || set.status !== "ATIVA" || set.effectiveFrom > start || (set.effectiveUntil && set.effectiveUntil < end)) throw new Error("Política de férias ativa deve cobrir todo o gozo.");
    if (set.scope === "PRODUCAO" && (set.isDemo || !set.approvedAt || set.approvedAt > new Date() || !set.legalReference)) throw new Error("Reserva de produção exige parâmetros oficiais aprovados.");
    const [vacationConflict] = await tx.select({ id: vacationTable.id }).from(vacationTable).where(and(eq(vacationTable.employeeId, contract.employeeId), inArray(vacationTable.status, ["Programada", "Em gozo", "Concluída"]), lte(vacationTable.enjoymentStart, end), gte(vacationTable.enjoymentEnd, start))).limit(1);
    const [leaveConflict] = await tx.select({ id: leaves.id }).from(leaves).where(and(eq(leaves.employeeId, contract.employeeId), eq(leaves.status, "Ativa"), lte(leaves.startDate, end), gte(leaves.endDate, start))).limit(1);
    if (vacationConflict || leaveConflict) throw new Error("Gozo conjunto conflita com férias ou afastamento vigente.");
    const pending = [];
    let cursor = start;
    for (const allocation of input.allocations) {
      const periodStart = date(allocation.periodStart); const periodEnd = date(allocation.periodEnd);
      const entries = await tx.select().from(hrRightEntries).where(and(eq(hrRightEntries.contractId, contract.id), eq(hrRightEntries.kind, "FERIAS"), eq(hrRightEntries.periodStart, periodStart), eq(hrRightEntries.periodEnd, periodEnd)));
      const balance = entries.reduce((sum, entry) => sum.add(entry.quantity), new Decimal(0));
      if (balance.lt(allocation.days)) throw new Error(`Dias excedem saldo do aquisitivo ${allocation.periodStart}.`);
      if (cursor <= periodEnd) throw new Error("Cada parcela de gozo deve ocorrer após seu aquisitivo.");
      const canceled = new Set(entries.map(entry => (entry.details as { cancelsId?: string }).cancelsId).filter(Boolean));
      const splits = entries.filter(entry => entry.quantity.lt(0) && !canceled.has(entry.id) && (entry.details as { kind?: string }).kind === "GOZO");
      if (splits.length >= policy.maxSplits || allocation.days < (splits.length ? policy.minOtherSplitDays : policy.minFirstSplitDays)) throw new Error(`Fracionamento/duração incompatível no aquisitivo ${allocation.periodStart}.`);
      const segmentEnd = new Date(cursor.getTime() + (allocation.days - 1) * day);
      pending.push({ allocation, periodStart, periodEnd, start: cursor, end: segmentEnd });
      cursor = new Date(segmentEnd.getTime() + day);
    }
    const entryIds = []; const vacationIds = [];
    for (const segment of pending) {
      const [vacation] = await tx.insert(vacationTable).values({ employeeId: contract.employeeId, acquisitionStart: segment.periodStart, acquisitionEnd: segment.periodEnd, enjoymentStart: segment.start, enjoymentEnd: segment.end, days: segment.allocation.days, status: "Programada" }).returning();
      const [entry] = await tx.insert(hrRightEntries).values({ contractId: contract.id, sourceKey: `${sourceKey}:${segment.allocation.periodStart}`, kind: "FERIAS", periodStart: segment.periodStart, periodEnd: segment.periodEnd, quantity: new Decimal(-segment.allocation.days), amount: new Decimal(0), actorId, details: json({ kind: "GOZO", groupSourceKey: sourceKey, scope: set.scope, start: segment.start.toISOString().slice(0, 10), end: segment.end, reason: input.reason, vacationId: vacation.id, policy, contractVersion: contract.version }) }).returning();
      entryIds.push(entry.id); vacationIds.push(vacation.id);
    }
    await enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: set.scope, eventType: "FERIAS_MULTIPLOS_RESERVADAS", payload: json({ input, entryIds, vacationIds, employeeId: contract.employeeId, actorId, policy, start, end, totalDays }) });
    return { entryIds, vacationIds, sourceKey };
  }, { timeoutMs: 60000 });
}

export async function cancelMultipleVacationPeriods(db: DatabaseConnection, actorId: string, raw: unknown) {
  const input = z.object({ groupSourceKey: z.string().min(1), reason: z.string().trim().min(10).max(4000) }).strict().parse(raw);
  return withDatabaseTransaction(db, async tx => {
    await lockPersonnel(tx, input.groupSourceKey);
    const original = await requireHrIntegrationEvent(tx, input.groupSourceKey);
    if (original.eventType !== "FERIAS_MULTIPLOS_RESERVADAS") throw new Error("Selecione uma reserva conjunta original.");
    const payload = z.object({ input: requestSchema, entryIds: z.array(z.string()), vacationIds: z.array(z.string()) }).parse(original.payload);
    const sourceKey = `CANCELAMENTO:${original.sourceKey}`;
    if ((await tx.select({ id: hrIntegrationEvents.id }).from(hrIntegrationEvents).where(inArray(hrIntegrationEvents.sourceKey, payload.entryIds.map(id => `FERIAS:FOLHA:${id}`))).limit(1)).length) throw new Error("Reserva conjunta conciliada em folha fechada exige compensação financeira antes de cancelar.");
    const previous = await findHrIntegrationEvent(tx, sourceKey);
    if (previous) {
      const memory = previous.payload as { reason: string; entryIds: string[] };
      if (memory.reason !== input.reason) throw new Error("Grupo de férias cancelado com outro fundamento.");
      return { entryIds: memory.entryIds };
    }
    const contract = await requireEmploymentContract(tx, payload.input.contractId);
    await lockPersonnel(tx, `employee:${contract.employeeId}`);
    await lockPersonnel(tx, `contract:${contract.id}`);
    const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
    for (const id of [...payload.vacationIds].sort()) await tx.execute(sql`SELECT id FROM "Vacation" WHERE id=${id} FOR UPDATE`);
    const entries = await tx.select().from(hrRightEntries).where(and(inArray(hrRightEntries.id, payload.entryIds), eq(hrRightEntries.contractId, contract.id), eq(hrRightEntries.kind, "FERIAS")));
    const vacations = await tx.select().from(vacationTable).where(and(inArray(vacationTable.id, payload.vacationIds), eq(vacationTable.employeeId, contract.employeeId)));
    if (entries.length !== payload.input.allocations.length || vacations.length !== entries.length || vacations.some(vacation => vacation.status !== "Programada" || !vacation.enjoymentStart || vacation.enjoymentStart <= today) || entries.some(entry => !entry.quantity.lt(0) || (entry.details as { groupSourceKey?: string }).groupSourceKey !== original.sourceKey)) throw new Error("Cancelamento exige grupo íntegro com todos os gozos futuros ainda programados.");
    const statements = await tx.select({ competence: payrolls.competence }).from(hrPayrollStatements).innerJoin(hrEmploymentContracts, eq(hrEmploymentContracts.id, hrPayrollStatements.contractId)).innerJoin(hrPayrollRuns, eq(hrPayrollRuns.id, hrPayrollStatements.runId)).innerJoin(payrolls, eq(payrolls.id, hrPayrollRuns.payrollId)).where(and(eq(hrEmploymentContracts.employeeId, contract.employeeId), eq(hrPayrollRuns.mode, "OFICIAL"), eq(hrPayrollRuns.status, "FECHADA")));
    if (statements.some(statement => { const [month, year] = statement.competence.split("/"); const competence = `${year}-${month}`; return vacations.some(vacation => competence >= vacation.enjoymentStart!.toISOString().slice(0, 7) && competence <= vacation.enjoymentEnd!.toISOString().slice(0, 7)); })) throw new Error("Grupo alcança competência fechada; concilie financeiramente antes de devolver direitos.");
    const entryIds = [];
    for (const entry of entries) {
      const details = entry.details as { vacationId: string };
      await tx.update(vacationTable).set({ status: "Cancelada" }).where(eq(vacationTable.id, details.vacationId));
      const [restored] = await tx.insert(hrRightEntries).values({ contractId: entry.contractId, sourceKey: `${sourceKey}:${entry.id}`, kind: "FERIAS", periodStart: entry.periodStart, periodEnd: entry.periodEnd, quantity: entry.quantity.negated(), amount: entry.amount.negated(), actorId, details: { cancelsId: entry.id, groupSourceKey: original.sourceKey, vacationId: details.vacationId, reason: input.reason, scope: original.environment } }).returning();
      entryIds.push(restored.id);
    }
    await enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: original.environment, eventType: "FERIAS_MULTIPLOS_CANCELADAS", payload: { originalSourceKey: original.sourceKey, entryIds, actorId, reason: input.reason } });
    return { entryIds };
  }, { timeoutMs: 60000 });
}

import { createHash } from "node:crypto";
import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor, type DatabaseTransaction } from "@/db/transaction";
import { sql } from "drizzle-orm";
import type { JsonObject, JsonValue } from "@/db/json";
import { findFinancialScopeYear } from "@/db/repositories/finance/report-scopes";
import { countClosedAccountingMonths } from "@/db/repositories/finance/accounting";
import { insertAnnualPayable, insertAnnualPayableEvent, listAnnualCommitments, listAnnualPayables, updateAnnualPayable } from "@/db/repositories/finance/annual-ledger";
import { demobilizeAnnualAccountingClose } from "@/db/repositories/finance/accounting-closes";
import { insertAnnualAudit, listAnnualAuditRecords } from "@/db/repositories/finance/annual-stages";
import type { FinanceActor } from "./index";
import { resolveFinancialReportScope } from "./report-scope";
import { inspectAnnualConsistency } from "./annual-consistency";
import { assertNoActiveAnnualRapPosting } from "./annual-rap-postings";

const object = (value: JsonValue | null | undefined): JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const decimal = (value: Decimal | null) => { if (!value?.isFinite() || value.lt(0)) throw new Error("Apuração RAP exige valores Decimal não negativos conciliados."); return value; };
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as JsonValue;

async function candidates(tx: DatabaseExecutor, financialYearId: string) {
  const year = await findFinancialScopeYear(tx, financialYearId);
  if (!year) throw new Error("Exercício de inscrição RAP não encontrado.");
  const commitments = await listAnnualCommitments(tx, financialYearId, year.endDate);
  const result = new Map<string, { commitmentId: string; budgetUnitId: string; type: string; value: Decimal }>();
  for (const commitment of commitments) {
    const effective = commitment.movements.reduce((total, movement) => { if (movement.type === "Reforço") return total.plus(decimal(movement.valueDecimal)); if (movement.type === "Anulação") return total.minus(decimal(movement.valueDecimal)); throw new Error("Movimento de empenho não conciliado para inscrição anual."); }, decimal(commitment.valueDecimal));
    const settled = commitment.settlements.reduce((total, row) => total.plus(decimal(row.valueDecimal)), new Decimal(0));
    const paid = commitment.payments.reduce((total, row) => total.plus(decimal(row.valueDecimal)), new Decimal(0));
    if (effective.lt(settled) || settled.lt(paid)) throw new Error("Valores empenhado, liquidado e pago incompatíveis para inscrição RAP.");
    for (const [type, value] of [["PROCESSADO", settled.minus(paid)], ["NAO_PROCESSADO", effective.minus(settled)]] as const) result.set(`${commitment.id}:${type}`, { commitmentId: commitment.id, budgetUnitId: commitment.appropriation.budgetUnitId, type, value });
  }
  return result;
}

async function registrations(tx: DatabaseExecutor, financialYearId: string) {
  return listAnnualPayables(tx, financialYearId, { originalOnly: true });
}

function assertMutableRegistration(payable: Awaited<ReturnType<typeof registrations>>[number]) {
  const permitted = ["INSCRICAO_APURADA", "INSCRICAO_REAPURADA", "INSCRICAO_DESMOVIMENTADA"];
  if (!["PENDENTE", "INSCRICAO_DESMOVIMENTADA"].includes(payable.status) || !payable.events.some(event => event.action === "INSCRICAO_APURADA") || payable.events.some(event => !permitted.includes(event.action)) || payable.nativePayments.length || payable.nativeSettlements.length || payable.successorPayableCarryForward) throw new Error("Inscrição possui acompanhamento, execução, cancelamento ou transporte posterior; preserve o histórico e desfaça as etapas dependentes primeiro.");
}

/** Used by preparation and the standalone stage, after the caller has locked and authorized the year. */
export async function reconcileAnnualPayableRegistrations(tx: DatabaseTransaction, actor: FinanceActor, financialYearId: string, reason: string) {
  const expected = await candidates(tx, financialYearId);
  const existing = await registrations(tx, financialYearId);
  const summary = { created: 0, updated: 0, demobilized: 0, unchanged: 0, processed: "0.00", unprocessed: "0.00" };
  let processed = new Decimal(0), unprocessed = new Decimal(0);
  for (const candidate of expected.values()) { if (candidate.type === "PROCESSADO") processed = processed.plus(candidate.value); else unprocessed = unprocessed.plus(candidate.value); }
  for (const payable of existing) {
    if (payable.commitment.appropriation.financialYearId !== financialYearId) throw new Error("Inscrição anual aponta para empenho de outro exercício.");
    const key = `${payable.commitmentId}:${payable.type}`;
    const candidate = expected.get(key);
    const value = candidate?.value ?? new Decimal(0);
    if ((value.isZero() && ["INSCRICAO_DESMOVIMENTADA", "CANCELADO"].includes(payable.status)) || (value.eq(payable.valueDecimal) && payable.status === "PENDENTE")) { summary.unchanged++; expected.delete(key); continue; }
    assertMutableRegistration(payable);
    await assertNoActiveAnnualRapPosting(tx, financialYearId);
    const status = value.isZero() ? "INSCRICAO_DESMOVIMENTADA" : "PENDENTE";
    const action = value.isZero() ? "INSCRICAO_DESMOVIMENTADA" : "INSCRICAO_REAPURADA";
    await updateAnnualPayable(tx, payable.id, status, value.isZero() ? undefined : value);
    await insertAnnualPayableEvent(tx, { payableCarryForwardId: payable.id, action, justification: reason, actorUsuarioId: actor.usuarioId, valueDecimal: value });
    await insertAnnualAudit(tx, { action: "ANNUAL_RAP_RECONCILE", entityType: "PayableCarryForward", entityId: payable.id, financialYearId, budgetUnitId: payable.commitment.appropriation.budgetUnitId, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { previousValue: payable.valueDecimal.toFixed(2), value: value.toFixed(2), previousStatus: payable.status, status, reason } });
    if (value.isZero()) summary.demobilized++; else summary.updated++;
    expected.delete(key);
  }
  for (const candidate of expected.values()) {
    if (candidate.value.isZero()) continue;
    const payable = await insertAnnualPayable(tx, { financialYearId, commitmentId: candidate.commitmentId, type: candidate.type, valueDecimal: candidate.value });
    await insertAnnualPayableEvent(tx, { payableCarryForwardId: payable.id, action: "INSCRICAO_APURADA", actorUsuarioId: actor.usuarioId, valueDecimal: candidate.value, justification: reason });
    await insertAnnualAudit(tx, { action: "REGISTER", entityType: "PayableCarryForward", entityId: payable.id, financialYearId, budgetUnitId: candidate.budgetUnitId, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { type: candidate.type, value: candidate.value.toFixed(2), commitmentId: candidate.commitmentId, originFinancialYearId: financialYearId, reason } });
    summary.created++;
  }
  summary.processed = processed.toFixed(2); summary.unprocessed = unprocessed.toFixed(2);
  return summary;
}

export async function assertAnnualPayableRegistrations(tx: DatabaseExecutor, financialYearId: string) {
  const expected = await candidates(tx, financialYearId);
  for (const payable of await registrations(tx, financialYearId)) {
    const key = `${payable.commitmentId}:${payable.type}`;
    const value = expected.get(key)?.value ?? new Decimal(0);
    if (value.gt(0) ? payable.status !== "PENDENTE" || !value.eq(payable.valueDecimal) : !["INSCRICAO_DESMOVIMENTADA", "CANCELADO"].includes(payable.status)) throw new Error("Inscrição anual de RAP diverge dos saldos apurados; prepare ou reapure a etapa antes da validação final.");
    expected.delete(key);
  }
  if ([...expected.values()].some(candidate => candidate.value.gt(0))) throw new Error("Existem saldos a pagar sem inscrição anual de RAP; prepare a etapa antes da validação final.");
}

export async function executeAnnualPayableRegistration(db: DatabaseConnection, actor: FinanceActor, input: { financialYearId: string; operation: "REGISTER" | "UNDO"; reason: string; requestKey: string }) {
  if (!actor.employeeId || !input.reason.trim() || !input.requestKey.trim() || input.requestKey.length > 150 || !["REGISTER", "UNDO"].includes(input.operation)) throw new Error("Informe operação, servidor, justificativa e chave documental da inscrição anual.");
  return withDatabaseTransaction(db, async tx => {
    const scope = await resolveFinancialReportScope(tx, input.financialYearId, { budgetUnitIds: actor.allowedBudgetUnitIds });
    if (!scope.fullEntity || !scope.governmentEntityId) throw new Error("Inscrição anual exige autorização para todas as UGs do ente conciliado.");
    const year = await findFinancialScopeYear(tx, input.financialYearId);
    if (!year) throw new Error("Exercício de inscrição RAP não encontrado.");
    for (let month = 0; month < 12; month++) { const key = `ACCOUNTING_PERIOD:${year.id}:${new Date(Date.UTC(year.year, month, 1)).toISOString()}`; await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`); }
    await tx.execute(sql`SELECT id FROM "FinancialYear" WHERE id = ${year.id} FOR UPDATE`);
    const entityId = `ANNUAL_PAYABLE:${year.id}:${input.requestKey.trim()}`;
    const requestHash = createHash("sha256").update(JSON.stringify({ ...input, reason: input.reason.trim(), requestKey: input.requestKey.trim() })).digest("hex");
    const [previous] = await listAnnualAuditRecords(tx, { action: "ANNUAL_PAYABLE_STAGE_COMPLETE", entityType: "AnnualPayableRegistrationStage", entityId }, 1);
    if (previous) { if (object(previous.payload).requestHash !== requestHash) throw new Error("Chave da inscrição anual já usada com outros dados."); return { stageId: previous.id, replay: true }; }
    const current = await findFinancialScopeYear(tx, year.id);
    if (!current || !["Aberto", "Em Encerramento"].includes(current.status)) throw new Error("Etapa de inscrição exige exercício aberto ou em encerramento, anterior à validação final.");
    if (await countClosedAccountingMonths(tx, year.id) !== 12) throw new Error("Etapa de inscrição anual exige doze competências fechadas.");
    let summary: object;
    if (input.operation === "REGISTER") {
      const consistency = await inspectAnnualConsistency(tx, actor, year.id);
      if (consistency.counts.errors) throw new Error("Corrija as inconsistências antes da inscrição anual; emita o relatório de conferência.");
      summary = await reconcileAnnualPayableRegistrations(tx, actor, year.id, input.reason.trim());
    } else {
      await assertNoActiveAnnualRapPosting(tx, year.id);
      const rows = (await registrations(tx, year.id)).filter(row => row.status !== "INSCRICAO_DESMOVIMENTADA");
      for (const row of rows) {
        if (row.commitment.appropriation.financialYearId !== year.id || !scope.budgetUnitIds?.includes(row.commitment.appropriation.budgetUnitId)) throw new Error("Inscrição anual fora do exercício/UG/ente conciliados; preserve a origem e corrija o vínculo documental.");
        assertMutableRegistration(row);
      }
      for (const row of rows) {
        await updateAnnualPayable(tx, row.id, "INSCRICAO_DESMOVIMENTADA");
        await insertAnnualPayableEvent(tx, { payableCarryForwardId: row.id, action: "INSCRICAO_DESMOVIMENTADA", justification: input.reason.trim(), actorUsuarioId: actor.usuarioId, valueDecimal: row.valueDecimal });
      }
      await demobilizeAnnualAccountingClose(tx, year.id);
      summary = { demobilized: rows.length, payableIds: rows.map(row => row.id) };
    }
    const audit = await insertAnnualAudit(tx, { action: "ANNUAL_PAYABLE_STAGE_COMPLETE", entityType: "AnnualPayableRegistrationStage", entityId, financialYearId: year.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: json({ operation: input.operation, requestKey: input.requestKey.trim(), requestHash, reason: input.reason.trim(), summary }) });
    return { stageId: audit.id, replay: false };
  }, { timeoutMs: 120000 });
}

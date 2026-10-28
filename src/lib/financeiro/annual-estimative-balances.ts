import { createHash } from "node:crypto";
import { and, eq, ne, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import type { JsonObject, JsonValue } from "@/db/json";
import { withDatabaseTransaction } from "@/db/transaction";
import { annualAccountingCloses } from "@/db/schema/finance-accounting";
import { listAnnualEstimativeCommitments, listEstimativeAppropriations } from "@/db/repositories/finance/annual-ledger";
import { insertAnnualAudit, listAnnualAuditRecords } from "@/db/repositories/finance/annual-stages";
import { readPayableYear } from "@/db/repositories/finance/payables";
import { assertAccountingPeriodOpen, assertFinancialYearOpen, createCommitmentMovementInTransaction, type FinanceActor } from "./index";
import { resolveFinancialReportScope } from "./report-scope";
import { lockPlanningBudgetForAppropriation } from "../planejamento/execution-bridge";

const decimal = (value: Decimal | null) => {
  if (!value?.isFinite() || value.lt(0)) throw new Error("Saldo estimativo exige valores Decimal não negativos conciliados.");
  return value;
};
const object = (value: JsonValue | null): JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value : {};
type Input = { financialYearId: string; operation: "KEEP" | "CANCEL_UNSETTLED"; reason: string; requestKey: string };

/** Closing preparation, before December is closed. Native movements remain the documentary source. */
export async function executeAnnualEstimativeBalances(db: DatabaseConnection, actor: FinanceActor, input: Input) {
  if (!actor.employeeId || !["KEEP", "CANCEL_UNSETTLED"].includes(input.operation) || !input.reason.trim() || !input.requestKey.trim() || input.requestKey.length > 150) throw new Error("Informe servidor, opção, justificativa e chave documental dos saldos estimativos.");
  return withDatabaseTransaction(db, async tx => {
    const scope = await resolveFinancialReportScope(tx, input.financialYearId, { budgetUnitIds: actor.allowedBudgetUnitIds });
    if (!scope.fullEntity || !scope.governmentEntityId) throw new Error("Etapa estimativa exige autorização para todas as UGs do ente conciliado.");
    const stageKey = `ANNUAL_ESTIMATIVE:${input.financialYearId}`;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${stageKey}, 0))::text`);
    const requestHash = createHash("sha256").update(JSON.stringify({ ...input, reason: input.reason.trim(), requestKey: input.requestKey.trim() })).digest("hex");
    const [previous] = await listAnnualAuditRecords(tx, { action: "ANNUAL_ESTIMATIVE_COMPLETE", entityType: "AnnualEstimativeStage", entityId: stageKey, requestKey: input.requestKey.trim() }, 1);
    if (previous) {
      if (object(previous.payload).requestHash !== requestHash) throw new Error("Chave estimativa já utilizada com outros dados.");
      return { stageId: previous.id, replay: true, summary: object(previous.payload).summary };
    }
    const year = await readPayableYear(tx, input.financialYearId);
    // Native execution locks instrument, appropriation, commitment, then period.
    const appropriations = await listEstimativeAppropriations(tx, year.id);
    for (const appropriation of appropriations) {
      await lockPlanningBudgetForAppropriation(tx, appropriation.id);
      await tx.execute(sql`SELECT id FROM "BudgetAppropriation" WHERE id = ${appropriation.id} FOR UPDATE`);
    }
    await tx.execute(sql`SELECT c.id FROM "Commitment" c JOIN "BudgetAppropriation" a ON a.id = c."appropriationId" WHERE a."financialYearId" = ${year.id} AND c.type = 'Estimativo' ORDER BY c.id FOR UPDATE OF c`);
    const periodKey = `ACCOUNTING_PERIOD:${year.id}:${new Date(Date.UTC(year.year, 11, 1)).toISOString()}`;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${periodKey}, 0))::text`);
    await assertFinancialYearOpen(tx, year.id, year.endDate);
    await assertAccountingPeriodOpen(tx, year.id, year.endDate);
    const commitments = await listAnnualEstimativeCommitments(tx, year.id);
    const rows: Array<{ commitmentId: string; budgetUnitId: string; effective: string; liquidated: string; unsettled: string; canceled: string; movementId: string | null }> = [];
    let totalCanceled = new Decimal(0), totalUnsettled = new Decimal(0);
    for (const commitment of commitments) {
      if (!scope.budgetUnitIds?.includes(commitment.appropriation.budgetUnitId) || commitment.date > year.endDate || [...commitment.movements, ...commitment.settlements, ...commitment.payments].some(row => row.date > year.endDate) || commitment.settlements.some(row => row.payableCarryForwardId) || commitment.payments.some(row => row.payableCarryForwardId)) throw new Error("Empenho estimativo possui execução fora da origem/UG conciliadas; preserve os fatos e corrija o vínculo antes desta etapa.");
      const effective = commitment.movements.reduce((total, movement) => {
        if (movement.type === "Reforço") return total.plus(decimal(movement.valueDecimal));
        if (movement.type === "Anulação") return total.minus(decimal(movement.valueDecimal));
        throw new Error("Movimento estimativo sem tipo conciliado.");
      }, decimal(commitment.valueDecimal));
      const liquidated = commitment.settlements.reduce((total, row) => total.plus(decimal(row.valueDecimal)), new Decimal(0));
      const allocated = commitment.payments.reduce((total, row) => total.plus(decimal(row.valueDecimal)), new Decimal(0));
      if (effective.lt(liquidated) || allocated.gt(liquidated)) throw new Error("Execução estimativa excede o saldo empenhado/liquidado conciliado.");
      const unsettled = effective.minus(liquidated);
      let movementId: string | null = null;
      if (input.operation === "CANCEL_UNSETTLED" && unsettled.gt(0)) {
        const movement = await createCommitmentMovementInTransaction(tx, actor, { commitmentId: commitment.id, date: year.endDate, type: "Anulação", value: unsettled, justification: `Encerramento anual: ${input.reason.trim()}` });
        movementId = movement.id;
        totalCanceled = totalCanceled.plus(unsettled);
      }
      totalUnsettled = totalUnsettled.plus(unsettled);
      rows.push({ commitmentId: commitment.id, budgetUnitId: commitment.appropriation.budgetUnitId, effective: effective.toFixed(2), liquidated: liquidated.toFixed(2), unsettled: unsettled.toFixed(2), canceled: movementId ? unsettled.toFixed(2) : "0.00", movementId });
    }
    const summary = { commitments: rows.length, unsettled: totalUnsettled.toFixed(2), canceled: totalCanceled.toFixed(2), rows };
    const audit = await insertAnnualAudit(tx, { action: "ANNUAL_ESTIMATIVE_COMPLETE", entityType: "AnnualEstimativeStage", entityId: stageKey, financialYearId: year.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { operation: input.operation, reason: input.reason.trim(), requestKey: input.requestKey.trim(), requestHash, summary } });
    if (totalCanceled.gt(0)) await tx.update(annualAccountingCloses).set({ status: "SALDOS_ESTIMATIVOS_REAPURADOS" }).where(and(eq(annualAccountingCloses.financialYearId, year.id), ne(annualAccountingCloses.status, "ENCERRADO")));
    return { stageId: audit.id, replay: false, summary };
  }, { timeoutMs: 120000 });
}

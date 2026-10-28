import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import type { JsonObject, JsonValue } from "@/db/json";
import { listAnnualCommitments, listAnnualConsistencyCash, listAnnualConsistencyPostings, listAnnualMonths, listAnnualPayables } from "@/db/repositories/finance/annual-ledger";
import { insertAnnualAudit } from "@/db/repositories/finance/annual-stages";
import { findFinancialScopeYear } from "@/db/repositories/finance/report-scopes";
import { resolveFinancialReportScope } from "./report-scope";
import { accountingPendingChecks, type FinanceActor } from "./index";

type Issue = { code: string; severity: "ERROR" | "WARNING"; entityType: string; entityId: string; budgetUnitId: string | null; message: string };
const object = (value: JsonValue | undefined): JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value : {};

/** A complete-entity diagnostic is required because annual closing operates on every unit. */
export async function inspectAnnualConsistency(tx: DatabaseExecutor, actor: { allowedBudgetUnitIds?: string[] }, financialYearId: string) {
  const scope = await resolveFinancialReportScope(tx, financialYearId, { budgetUnitIds: actor.allowedBudgetUnitIds });
  if (!scope.governmentEntityId || !scope.fullEntity || !scope.budgetUnitIds?.length) throw new Error("Conferência anual exige autorização para todas as UGs do ente conciliado.");
  const year = await findFinancialScopeYear(tx, financialYearId);
  if (!year) throw new Error("Exercício de conferência anual não encontrado.");
  const issues: Issue[] = [];
  const add = (code: string, severity: Issue["severity"], entityType: string, entityId: string, budgetUnitId: string | null, message: string) => issues.push({ code, severity, entityType, entityId, budgetUnitId, message });
  const [months, postings, cash, commitments, payables, pending] = await Promise.all([
    listAnnualMonths(tx, financialYearId),
    listAnnualConsistencyPostings(tx, financialYearId),
    listAnnualConsistencyCash(tx, scope.budgetUnitIds, year.endDate),
    listAnnualCommitments(tx, financialYearId),
    listAnnualPayables(tx, financialYearId),
    accountingPendingChecks(tx, financialYearId, year.endDate),
  ]);
  for (let month = 0; month < 12; month++) {
    if (!months.some(row => row.status === "FECHADO" && row.competence.getUTCFullYear() === year.year && row.competence.getUTCMonth() === month)) add("MONTH_NOT_CLOSED", "ERROR", "MonthlyAccountingClose", `${year.year}-${String(month + 1).padStart(2, "0")}`, null, "Competência ainda não fechada para o encerramento anual.");
  }
  for (const [code, count, label] of [["DRAFT_POSTINGS", pending.draftTransactions, "transações contábeis em rascunho"], ["ISSUED_PAYMENTS", pending.emittedPayments, "ordens de pagamento emitidas"], ["OPEN_RECONCILIATIONS", pending.openReconciliations, "itens de extrato pendentes/parciais"]] as const) if (count) add(code, "ERROR", "FinancialYear", year.id, null, `${count} ${label} impedem o encerramento.`);
  const nominal = new Map<string, { accountId: string; budgetUnitId: string | null; balance: Decimal }>();
  for (const posting of postings) {
    if (!posting.budgetUnitId || !scope.budgetUnitIds.includes(posting.budgetUnitId) || posting.governmentEntityId !== scope.governmentEntityId) add("JOURNAL_SCOPE", "ERROR", "AccountingTransaction", posting.id, posting.budgetUnitId, "Lançamento sem ente/UG compatíveis com o exercício.");
    if (posting.date < year.startDate || posting.date > year.endDate || posting.date.getUTCFullYear() !== year.year) add("JOURNAL_DATE", "ERROR", "AccountingTransaction", posting.id, posting.budgetUnitId, "Data do lançamento fora do exercício documental.");
    if (posting.status !== "POSTADO") continue;
    let debit = new Decimal(0), credit = new Decimal(0);
    if (!posting.entries.length) add("EMPTY_POSTING", "ERROR", "AccountingTransaction", posting.id, posting.budgetUnitId, "Transação postada sem partidas.");
    for (const entry of posting.entries) {
      if (!entry.valueDecimal?.isFinite() || entry.valueDecimal.lte(0) || !["Débito", "Crédito"].includes(entry.type)) { add("ENTRY_VALUE", "ERROR", "AccountingEntry", entry.id, posting.budgetUnitId, "Partida sem direção ou valor Decimal positivo conciliados."); continue; }
      if (entry.type === "Débito") debit = debit.plus(entry.valueDecimal); else credit = credit.plus(entry.valueDecimal);
      if (entry.date.getTime() !== posting.date.getTime()) add("ENTRY_DATE", "ERROR", "AccountingEntry", entry.id, posting.budgetUnitId, "Competência da partida diverge da transação.");
      const snapshot = object(entry.classificationSnapshot ?? undefined);
      const dimensions = object(snapshot.dimensions);
      const msc = object(dimensions.msc);
      if (typeof snapshot.externalCode !== "string") add("ACCOUNT_CLASSIFICATION", process.env.CELERIFLOW_ACCOUNTING_MODE === "POC" ? "WARNING" : "ERROR", "AccountingEntry", entry.id, posting.budgetUnitId, "Classificação contábil documental ausente na partida original.");
      if (msc.status !== "DOCUMENTED") add("MSC_DIMENSIONS", "WARNING", "AccountingEntry", entry.id, posting.budgetUnitId, "Composição MSC da partida não está completamente conciliada.");
      const classification = typeof snapshot.externalCode === "string" ? snapshot.externalCode.replace(/\D/g, "").slice(0, 1) : "";
      if (["3", "4"].includes(classification) || ["VPD", "VPA"].includes(entry.account.type)) {
        const key = JSON.stringify([posting.budgetUnitId, entry.accountId, dimensions.resourceSourceId ?? null, dimensions.budgetDimensions ?? null]);
        const row = nominal.get(key) ?? { accountId: entry.accountId, budgetUnitId: posting.budgetUnitId, balance: new Decimal(0) };
        row.balance = entry.type === "Débito" ? row.balance.plus(entry.valueDecimal) : row.balance.minus(entry.valueDecimal);
        nominal.set(key, row);
      }
    }
    if (!debit.eq(credit)) add("UNBALANCED_POSTING", "ERROR", "AccountingTransaction", posting.id, posting.budgetUnitId, `Débitos ${debit.toFixed(2)} diferem dos créditos ${credit.toFixed(2)}.`);
  }
  for (const row of nominal.values()) if (!row.balance.isZero()) add("RESULT_NOT_CLOSED", "WARNING", "AccountingPlan", row.accountId, row.budgetUnitId, `Saldo nominal ${row.balance.toFixed(2)} exige apuração antes da validação final.`);
  for (const movement of cash) {
    if (!movement.resourceSourceId) add("BANK_SOURCE", "ERROR", "TreasuryMovement", movement.id, movement.bankAccount.budgetUnitId, "Movimento histórico sem fonte documental; conciliação exigida antes da abertura multifonte.");
    if (!movement.valueDecimal.isFinite() || movement.valueDecimal.lte(0) || !["Entrada", "ENTRADA", "CREDIT", "Saída", "SAIDA", "DEBIT"].includes(movement.direction)) add("BANK_VALUE", "ERROR", "TreasuryMovement", movement.id, movement.bankAccount.budgetUnitId, "Movimento bancário sem valor ou direção conciliados.");
  }
  for (const commitment of commitments) {
    const unit = commitment.appropriation.budgetUnitId;
    if (!scope.budgetUnitIds.includes(unit) || !commitment.appropriation.resourceSourceId) add("COMMITMENT_SCOPE", "ERROR", "Commitment", commitment.id, unit, "Empenho sem UG/fonte conciliadas no ente.");
    const values = [commitment.valueDecimal, ...commitment.movements.map(row => row.valueDecimal), ...commitment.settlements.map(row => row.valueDecimal), ...commitment.payments.map(row => row.valueDecimal)];
    if (values.some(value => !value?.isFinite() || value.lt(0))) { add("COMMITMENT_VALUE", "ERROR", "Commitment", commitment.id, unit, "Empenho, liquidação ou pagamento sem valor Decimal válido."); continue; }
    const effective = commitment.movements.reduce((sum, row) => row.type === "Reforço" ? sum.plus(row.valueDecimal!) : sum.minus(row.valueDecimal!), commitment.valueDecimal!);
    const settled = commitment.settlements.reduce((sum, row) => sum.plus(row.valueDecimal!), new Decimal(0));
    const paid = commitment.payments.reduce((sum, row) => sum.plus(row.valueDecimal!), new Decimal(0));
    if (effective.lt(0) || settled.gt(effective) || paid.gt(settled)) add("COMMITMENT_OVER_EXECUTION", "ERROR", "Commitment", commitment.id, unit, `Empenhado ${effective.toFixed(2)}, liquidado ${settled.toFixed(2)} e pago ${paid.toFixed(2)} incompatíveis.`);
  }
  for (const payable of payables) {
    const origin = payable.commitment.appropriation;
    if (payable.originFinancialYear.governmentEntityId !== scope.governmentEntityId || origin.financialYearId !== payable.originFinancialYearId || !scope.budgetUnitIds.includes(origin.budgetUnitId) || !origin.resourceSourceId || !["PROCESSADO", "NAO_PROCESSADO"].includes(payable.type)) add("RAP_ORIGIN", "ERROR", "PayableCarryForward", payable.id, origin.budgetUnitId, "Inscrição RAP sem tipo, ente, UG, exercício ou fonte de origem conciliados.");
  }
  return { financialYearId, governmentEntityId: scope.governmentEntityId, year: year.year, status: year.status, generatedAt: new Date().toISOString(), fullEntity: true, counts: { errors: issues.filter(issue => issue.severity === "ERROR").length, warnings: issues.filter(issue => issue.severity === "WARNING").length, postings: postings.length, commitments: commitments.length, carryForwards: payables.length, treasuryMovements: cash.length }, issues };
}

export async function captureAnnualConsistencyReport(db: DatabaseConnection, actor: FinanceActor, financialYearId: string) {
  if (!actor.employeeId) throw new Error("Relatório anual exige servidor responsável vinculado ao usuário.");
  return withDatabaseTransaction(db, async tx => {
    const report = await inspectAnnualConsistency(tx, actor, financialYearId);
    const audit = await insertAnnualAudit(tx, { action: "ANNUAL_CONSISTENCY_REPORT", entityType: "AnnualConsistencyReport", entityId: financialYearId, financialYearId, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: report });
    return { ...report, reportId: audit.id };
  }, { isolationLevel: "repeatable read", timeoutMs: 120000 });
}

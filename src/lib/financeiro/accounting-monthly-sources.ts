import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import type { JsonObject, JsonValue } from "@/db/json";
import { listMonthlySourceEntries } from "@/db/repositories/finance/accounting-reports";
import { resolveFinancialReportScope } from "./report-scope";

type Actor = { allowedBudgetUnitIds?: string[] };
type Input = { financialYearId: string; governmentEntityId: string; budgetUnitId?: string; account?: string };
type Month = { debit: Decimal; credit: Decimal; balance: Decimal };
type Row = { accountId: string; accountCode: string; accountName: string; budgetUnitId: string; sourceId: string | null; sourceCode: string | null; months: Month[]; undocumentedEntries: number };
const object = (value: JsonValue | null | undefined): JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const string = (value: JsonValue | undefined) => typeof value === "string" ? value : null;

/** Monthly balances use the source frozen on each posting line, never today's bank or appropriation mapping. */
export async function readAccountingMonthlySources(db: DatabaseConnection, actor: Actor, input: Input) {
  return withDatabaseTransaction(db, async tx => {
    const scope = await resolveFinancialReportScope(tx, input.financialYearId, { governmentEntityId: input.governmentEntityId, budgetUnitId: input.budgetUnitId, budgetUnitIds: actor.allowedBudgetUnitIds });
    if (!scope.governmentEntityId || !scope.budgetUnitIds?.length || input.budgetUnitId && !scope.budgetUnitIds.includes(input.budgetUnitId)) throw new Error("Consulta exige exercício do ente e ao menos uma UG autorizada.");
    const rows = new Map<string, Row>();
    let cursor: string | undefined;
    let entryCount = 0;
    let undocumentedEntries = 0;
    for (;;) {
      const entries = await listMonthlySourceEntries(tx, { governmentEntityId: scope.governmentEntityId, financialYearId: input.financialYearId, budgetUnitIds: scope.budgetUnitIds, year: scope.year, account: input.account, cursor });
      if (!entries.length) break;
      for (const entry of entries) {
        const transaction = entry.transaction;
        if (!transaction?.budgetUnitId || !entry.valueDecimal || !entry.valueDecimal.isFinite() || entry.valueDecimal.lt(0) || !["Débito", "Crédito"].includes(entry.type)) throw new Error(`Linha ${entry.id} sem valor Decimal, natureza ou UG conciliados; regularize a origem antes de calcular saldos.`);
        const snapshot = object(entry.classificationSnapshot), dimensions = object(snapshot.dimensions), classification = object(dimensions.sourceClassification);
        if (dimensions.governmentEntityId && dimensions.governmentEntityId !== transaction.governmentEntityId || dimensions.budgetUnitId && dimensions.budgetUnitId !== transaction.budgetUnitId) throw new Error(`Dimensões da linha ${entry.id} divergem do ente/UG da partida.`);
        const sourceId = string(dimensions.resourceSourceId), sourceCode = string(classification.externalCode);
        const accountCode = string(snapshot.externalCode) ?? entry.account.code;
        const documented = Boolean(string(snapshot.entryId) && sourceId && sourceCode);
        const key = JSON.stringify([entry.accountId, accountCode, transaction.budgetUnitId, sourceId, sourceCode]);
        let row = rows.get(key);
        if (!row) {
          row = { accountId: entry.accountId, accountCode, accountName: entry.account.name, budgetUnitId: transaction.budgetUnitId, sourceId, sourceCode, months: Array.from({ length: 12 }, () => ({ debit: new Decimal(0), credit: new Decimal(0), balance: new Decimal(0) })), undocumentedEntries: 0 };
          rows.set(key, row);
        }
        const month = row.months[transaction.date.getUTCMonth()];
        if (entry.type === "Débito") month.debit = month.debit.plus(entry.valueDecimal);
        else month.credit = month.credit.plus(entry.valueDecimal);
        if (!documented) { row.undocumentedEntries++; undocumentedEntries++; }
        entryCount++;
      }
      cursor = entries[entries.length - 1].id;
    }
    const result = [...rows.values()].sort((left, right) => left.accountCode.localeCompare(right.accountCode) || left.budgetUnitId.localeCompare(right.budgetUnitId) || (left.sourceCode ?? "").localeCompare(right.sourceCode ?? ""));
    for (const row of result) {
      let balance = new Decimal(0);
      for (const month of row.months) { balance = balance.plus(month.debit).minus(month.credit); month.balance = balance; }
    }
    return { governmentEntityId: scope.governmentEntityId, financialYearId: input.financialYearId, year: scope.year, fullEntity: scope.fullEntity, entryCount, undocumentedEntries, rows: result.map(row => ({ ...row, months: row.months.map(month => ({ debit: month.debit.toFixed(2), credit: month.credit.toFixed(2), balance: month.balance.toFixed(2) })) })) };
  }, { isolationLevel: "repeatable read", timeoutMs: 60000 });
}

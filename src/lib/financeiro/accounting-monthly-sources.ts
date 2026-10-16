import { Prisma, type PrismaClient } from "@prisma/client";
import { resolveFinancialReportScope } from "./report-scope";

type Actor = { allowedBudgetUnitIds?: string[] };
type Input = { financialYearId: string; governmentEntityId: string; budgetUnitId?: string; account?: string };
type Month = { debit: Prisma.Decimal; credit: Prisma.Decimal; balance: Prisma.Decimal };
type Row = { accountId: string; accountCode: string; accountName: string; budgetUnitId: string; sourceId: string | null; sourceCode: string | null; months: Month[]; undocumentedEntries: number };
const entrySelection = { id: true, accountId: true, type: true, valueDecimal: true, classificationSnapshot: true, account: { select: { code: true, name: true } }, transaction: { select: { date: true, governmentEntityId: true, budgetUnitId: true } } } satisfies Prisma.AccountingEntrySelect;
type SourceEntry = Prisma.AccountingEntryGetPayload<{ select: typeof entrySelection }>;
const object = (value: Prisma.JsonValue | undefined): Prisma.JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const string = (value: Prisma.JsonValue | undefined) => typeof value === "string" ? value : null;

/** Monthly balances use the source frozen on each posting line, never today's bank or appropriation mapping. */
export async function readAccountingMonthlySources(db: PrismaClient, actor: Actor, input: Input) {
  return db.$transaction(async tx => {
    const scope = await resolveFinancialReportScope(tx, input.financialYearId, { governmentEntityId: input.governmentEntityId, budgetUnitId: input.budgetUnitId, budgetUnitIds: actor.allowedBudgetUnitIds });
    if (!scope.governmentEntityId || !scope.budgetUnitIds?.length || input.budgetUnitId && !scope.budgetUnitIds.includes(input.budgetUnitId)) throw new Error("Consulta exige exercício do ente e ao menos uma UG autorizada.");
    const rows = new Map<string, Row>();
    let cursor: string | undefined;
    let entryCount = 0;
    let undocumentedEntries = 0;
    for (;;) {
      const entries: SourceEntry[] = await tx.accountingEntry.findMany({
        where: {
          transaction: { governmentEntityId: scope.governmentEntityId, financialYearId: input.financialYearId, status: "POSTADO", budgetUnitId: { in: scope.budgetUnitIds }, date: { gte: new Date(Date.UTC(scope.year, 0, 1)), lt: new Date(Date.UTC(scope.year + 1, 0, 1)) } },
          ...(input.account ? { account: { OR: [{ code: { contains: input.account, mode: "insensitive" } }, { name: { contains: input.account, mode: "insensitive" } }] } } : {}),
        },
        select: entrySelection,
        orderBy: { id: "asc" }, take: 1000, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
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
          row = { accountId: entry.accountId, accountCode, accountName: entry.account.name, budgetUnitId: transaction.budgetUnitId, sourceId, sourceCode, months: Array.from({ length: 12 }, () => ({ debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(0), balance: new Prisma.Decimal(0) })), undocumentedEntries: 0 };
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
      let balance = new Prisma.Decimal(0);
      for (const month of row.months) { balance = balance.plus(month.debit).minus(month.credit); month.balance = balance; }
    }
    return { governmentEntityId: scope.governmentEntityId, financialYearId: input.financialYearId, year: scope.year, fullEntity: scope.fullEntity, entryCount, undocumentedEntries, rows: result.map(row => ({ ...row, months: row.months.map(month => ({ debit: month.debit.toFixed(2), credit: month.credit.toFixed(2), balance: month.balance.toFixed(2) })) })) };
  }, { isolationLevel: "RepeatableRead", timeout: 60000 });
}

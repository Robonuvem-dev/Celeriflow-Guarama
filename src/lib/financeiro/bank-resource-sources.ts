import { Decimal } from "@/db/decimal";
import { sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import { countKnownBankSources, hasPendingSourcePayment, hasPendingSourceWithholding, hasUndocumentedBankSources, listBankSourceMovements, listBankSourceRedistributions, readBankSourceAccount, replaceBankSourcePermissions } from "@/db/repositories/finance/bank-sources";
import { insertAccountingAudit } from "@/db/repositories/finance/accounting";

type Actor = { usuarioId: string; employeeId?: string | null; allowedBudgetUnitIds?: string[] };

export async function assertBankResourceSource(db: DatabaseExecutor, bankAccountId: string, resourceSourceId: string | null | undefined) {
  if (!resourceSourceId) throw new Error("Movimentação bancária exige fonte de recursos documental.");
  const account = await readBankSourceAccount(db, bankAccountId);
  if (account.resourceSourceId !== resourceSourceId && !account.permittedSources.some(source => source.resourceSourceId === resourceSourceId && source.isActive)) throw new Error("A fonte de recursos não está autorizada para esta conta bancária.");
  return resourceSourceId;
}

/** Cash availability is per frozen source; redistribution changes source, not bank cash. */
export async function getBankResourceSourceBalance(db: DatabaseExecutor, bankAccountId: string, resourceSourceId: string, throughDate?: Date) {
  if (throughDate && !Number.isFinite(throughDate.getTime())) throw new Error("Data do saldo por fonte inválida.");
  if (await hasUndocumentedBankSources(db, bankAccountId, throughDate)) throw new Error("Saldo por fonte exige conciliação documental dos movimentos históricos sem fonte.");
  const movements = await listBankSourceMovements(db, bankAccountId, resourceSourceId, { through: throughDate });
  let balance = movements.reduce((total, movement) => {
    if (["Entrada", "ENTRADA", "CREDIT"].includes(movement.direction)) return total.plus(movement.valueDecimal);
    if (["Saída", "SAIDA", "DEBIT"].includes(movement.direction)) return total.minus(movement.valueDecimal);
    throw new Error("Movimento bancário com direção inválida.");
  }, new Decimal(0));
  const redistributions = await listBankSourceRedistributions(db, bankAccountId, resourceSourceId, { through: throughDate });
  for (const redistribution of redistributions) balance = redistribution.sourceResourceSourceId === resourceSourceId ? balance.minus(redistribution.valueDecimal) : balance.plus(redistribution.valueDecimal);
  return balance;
}

/** A backdated debit must leave every already-recorded later position funded. Caller holds the bank lock. */
export async function getBankResourceSourceSpendableBalance(db: DatabaseExecutor, bankAccountId: string, resourceSourceId: string, date: Date) {
  if (await hasUndocumentedBankSources(db, bankAccountId)) throw new Error("Disponibilidade por fonte exige conciliação documental dos movimentos históricos sem fonte.");
  let balance = await getBankResourceSourceBalance(db, bankAccountId, resourceSourceId, date);
  let minimum = balance;
  const movements = await listBankSourceMovements(db, bankAccountId, resourceSourceId, { after: date });
  const redistributions = await listBankSourceRedistributions(db, bankAccountId, resourceSourceId, { after: date });
  const deltas = new Map<number, Decimal>();
  const add = (date: Date, value: Decimal) => deltas.set(date.getTime(), (deltas.get(date.getTime()) ?? new Decimal(0)).plus(value));
  for (const movement of movements) {
    if (["Entrada", "ENTRADA", "CREDIT"].includes(movement.direction)) add(movement.date, movement.valueDecimal);
    else if (["Saída", "SAIDA", "DEBIT"].includes(movement.direction)) add(movement.date, movement.valueDecimal.negated());
    else throw new Error("Movimento bancário com direção inválida.");
  }
  for (const redistribution of redistributions) add(redistribution.date, redistribution.sourceResourceSourceId === resourceSourceId ? redistribution.valueDecimal.negated() : redistribution.valueDecimal);
  for (const [, delta] of [...deltas].sort(([left], [right]) => left - right)) {
    balance = balance.plus(delta);
    minimum = Decimal.min(minimum, balance);
  }
  return minimum;
}

export async function configureBankResourceSources(db: DatabaseConnection, actor: Actor, bankAccountId: string, resourceSourceIds: string[]) {
  if (!Array.isArray(resourceSourceIds) || resourceSourceIds.length > 100 || resourceSourceIds.some(id => typeof id !== "string" || !id.trim()) || new Set(resourceSourceIds).size !== resourceSourceIds.length) throw new Error("Informe uma lista válida de fontes permitidas, sem duplicação.");
  return withDatabaseTransaction(db, async tx => {
    await tx.execute(sql`SELECT id FROM "BankAccount" WHERE id = ${bankAccountId} FOR UPDATE`);
    const account = await readBankSourceAccount(tx, bankAccountId);
    if (!account.budgetUnitId || actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(account.budgetUnitId)) throw new Error("Conta bancária fora das unidades autorizadas.");
    if (!account.resourceSourceId || !resourceSourceIds.includes(account.resourceSourceId)) throw new Error("A lista de fontes deve incluir a fonte principal da conta.");
    if (await countKnownBankSources(tx, resourceSourceIds) !== resourceSourceIds.length) throw new Error("Uma das fontes não foi encontrada.");
    if (resourceSourceIds.length > 1 && await hasUndocumentedBankSources(tx, bankAccountId, undefined, false)) throw new Error("Concilie a fonte documental dos movimentos históricos antes de ativar conta multifonte.");
    for (const previous of account.permittedSources.filter(source => source.isActive && !resourceSourceIds.includes(source.resourceSourceId))) {
      if (!(await getBankResourceSourceBalance(tx, bankAccountId, previous.resourceSourceId)).isZero()) throw new Error("Não é possível remover uma fonte com saldo bancário pendente.");
      if (await hasPendingSourcePayment(tx, bankAccountId, previous.resourceSourceId)) throw new Error("Não é possível remover uma fonte com ordem emitida pendente.");
      if (await hasPendingSourceWithholding(tx, bankAccountId, previous.resourceSourceId)) throw new Error("Não é possível remover uma fonte com retenção pendente de recolhimento.");
    }
    await replaceBankSourcePermissions(tx, bankAccountId, resourceSourceIds);
    await insertAccountingAudit(tx, { ...actor, employeeId: actor.employeeId ?? null }, { action: "CONFIGURE_SOURCES", entityType: "BankAccount", entityId: bankAccountId, budgetUnitId: account.budgetUnitId, payload: { previousSources: account.permittedSources.filter(source => source.isActive).map(source => source.resourceSourceId), resourceSourceIds } });
    return { resourceSourceIds };
  });
}

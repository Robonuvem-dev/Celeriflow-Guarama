import { Prisma, type PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;
type Actor = { usuarioId: string; employeeId?: string | null; allowedBudgetUnitIds?: string[] };

export async function assertBankResourceSource(db: Db, bankAccountId: string, resourceSourceId: string | null | undefined) {
  if (!resourceSourceId) throw new Error("Movimentação bancária exige fonte de recursos documental.");
  const account = await db.bankAccount.findUniqueOrThrow({ where: { id: bankAccountId }, select: { resourceSourceId: true, permittedSources: { where: { resourceSourceId, isActive: true }, select: { resourceSourceId: true } } } });
  if (account.resourceSourceId !== resourceSourceId && !account.permittedSources.length) throw new Error("A fonte de recursos não está autorizada para esta conta bancária.");
  return resourceSourceId;
}

/** Cash availability is per frozen source; redistribution changes source, not bank cash. */
export async function getBankResourceSourceBalance(db: Db, bankAccountId: string, resourceSourceId: string, throughDate?: Date) {
  if (throughDate && !Number.isFinite(throughDate.getTime())) throw new Error("Data do saldo por fonte inválida.");
  const date = throughDate ? { lte: throughDate } : undefined;
  if (await db.treasuryMovement.count({ where: { bankAccountId, status: "Confirmado", resourceSourceId: null, date } })) throw new Error("Saldo por fonte exige conciliação documental dos movimentos históricos sem fonte.");
  const movements = await db.treasuryMovement.findMany({ where: { bankAccountId, resourceSourceId, status: "Confirmado", date }, select: { direction: true, valueDecimal: true } });
  let balance = movements.reduce((total, movement) => {
    if (["Entrada", "ENTRADA", "CREDIT"].includes(movement.direction)) return total.plus(movement.valueDecimal);
    if (["Saída", "SAIDA", "DEBIT"].includes(movement.direction)) return total.minus(movement.valueDecimal);
    throw new Error("Movimento bancário com direção inválida.");
  }, new Prisma.Decimal(0));
  const redistributions = await db.revenueResourceRedistribution.findMany({ where: { date, revenue: { bankAccountId }, OR: [{ sourceResourceSourceId: resourceSourceId }, { destinationResourceSourceId: resourceSourceId }] }, select: { sourceResourceSourceId: true, valueDecimal: true } });
  for (const redistribution of redistributions) balance = redistribution.sourceResourceSourceId === resourceSourceId ? balance.minus(redistribution.valueDecimal) : balance.plus(redistribution.valueDecimal);
  return balance;
}

/** A backdated debit must leave every already-recorded later position funded. Caller holds the bank lock. */
export async function getBankResourceSourceSpendableBalance(db: Db, bankAccountId: string, resourceSourceId: string, date: Date) {
  if (await db.treasuryMovement.count({ where: { bankAccountId, status: "Confirmado", resourceSourceId: null } })) throw new Error("Disponibilidade por fonte exige conciliação documental dos movimentos históricos sem fonte.");
  let balance = await getBankResourceSourceBalance(db, bankAccountId, resourceSourceId, date);
  let minimum = balance;
  const movements = await db.treasuryMovement.findMany({ where: { bankAccountId, resourceSourceId, status: "Confirmado", date: { gt: date } }, select: { date: true, direction: true, valueDecimal: true } });
  const redistributions = await db.revenueResourceRedistribution.findMany({ where: { revenue: { bankAccountId }, date: { gt: date }, OR: [{ sourceResourceSourceId: resourceSourceId }, { destinationResourceSourceId: resourceSourceId }] }, select: { date: true, sourceResourceSourceId: true, valueDecimal: true } });
  const deltas = new Map<number, Prisma.Decimal>();
  const add = (date: Date, value: Prisma.Decimal) => deltas.set(date.getTime(), (deltas.get(date.getTime()) ?? new Prisma.Decimal(0)).plus(value));
  for (const movement of movements) {
    if (["Entrada", "ENTRADA", "CREDIT"].includes(movement.direction)) add(movement.date, movement.valueDecimal);
    else if (["Saída", "SAIDA", "DEBIT"].includes(movement.direction)) add(movement.date, movement.valueDecimal.negated());
    else throw new Error("Movimento bancário com direção inválida.");
  }
  for (const redistribution of redistributions) add(redistribution.date, redistribution.sourceResourceSourceId === resourceSourceId ? redistribution.valueDecimal.negated() : redistribution.valueDecimal);
  for (const [, delta] of [...deltas].sort(([left], [right]) => left - right)) {
    balance = balance.plus(delta);
    minimum = Prisma.Decimal.min(minimum, balance);
  }
  return minimum;
}

export async function configureBankResourceSources(db: PrismaClient, actor: Actor, bankAccountId: string, resourceSourceIds: string[]) {
  if (!Array.isArray(resourceSourceIds) || resourceSourceIds.length > 100 || resourceSourceIds.some(id => typeof id !== "string" || !id.trim()) || new Set(resourceSourceIds).size !== resourceSourceIds.length) throw new Error("Informe uma lista válida de fontes permitidas, sem duplicação.");
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "BankAccount" WHERE id = ${bankAccountId} FOR UPDATE`;
    const account = await tx.bankAccount.findUniqueOrThrow({ where: { id: bankAccountId }, include: { permittedSources: true } });
    if (!account.budgetUnitId || actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(account.budgetUnitId)) throw new Error("Conta bancária fora das unidades autorizadas.");
    if (!account.resourceSourceId || !resourceSourceIds.includes(account.resourceSourceId)) throw new Error("A lista de fontes deve incluir a fonte principal da conta.");
    if (await tx.resourceSource.count({ where: { id: { in: resourceSourceIds } } }) !== resourceSourceIds.length) throw new Error("Uma das fontes não foi encontrada.");
    if (resourceSourceIds.length > 1 && await tx.treasuryMovement.count({ where: { bankAccountId, resourceSourceId: null } })) throw new Error("Concilie a fonte documental dos movimentos históricos antes de ativar conta multifonte.");
    for (const previous of account.permittedSources.filter(source => source.isActive && !resourceSourceIds.includes(source.resourceSourceId))) {
      if (!(await getBankResourceSourceBalance(tx, bankAccountId, previous.resourceSourceId)).isZero()) throw new Error("Não é possível remover uma fonte com saldo bancário pendente.");
      if (await tx.payment.count({ where: { bankAccountId, status: "Emitida", commitment: { appropriation: { resourceSourceId: previous.resourceSourceId } } } })) throw new Error("Não é possível remover uma fonte com ordem emitida pendente.");
      if (await tx.withholdingPayable.count({ where: { status: "Pendente", retention: { payment: { bankAccountId, commitment: { appropriation: { resourceSourceId: previous.resourceSourceId } } } } } })) throw new Error("Não é possível remover uma fonte com retenção pendente de recolhimento.");
    }
    await tx.bankAccountResourceSource.updateMany({ where: { bankAccountId }, data: { isActive: false } });
    for (const resourceSourceId of resourceSourceIds) await tx.bankAccountResourceSource.upsert({ where: { bankAccountId_resourceSourceId: { bankAccountId, resourceSourceId } }, create: { bankAccountId, resourceSourceId }, update: { isActive: true } });
    await tx.financialAuditLog.create({ data: { action: "CONFIGURE_SOURCES", entityType: "BankAccount", entityId: bankAccountId, budgetUnitId: account.budgetUnitId, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { previousSources: account.permittedSources.filter(source => source.isActive).map(source => source.resourceSourceId), resourceSourceIds } } });
    return { resourceSourceIds };
  });
}

import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { FinanceError, getBankAccountLedgerBalance, type FinanceActor } from "./index";

type Db = PrismaClient | Prisma.TransactionClient;
const amount = (value: string | number) => {
  const result = new Prisma.Decimal(String(value));
  if (!result.isFinite() || result.lt(0) || result.decimalPlaces() > 2) throw new FinanceError("Informe valor monetário válido com até duas casas decimais.");
  return result;
};
const allocationSchema = z.object({ sessionId: z.string().min(1), idempotencyKey: z.string().trim().min(1), reason: z.string().trim().min(10).max(2000), allocations: z.array(z.object({ statementItemId: z.string().min(1), treasuryMovementId: z.string().min(1), amount: z.union([z.string(), z.number()]) }).strict()).min(1).max(1000) }).strict();

export function reconciliationDirection(value: { direction: string; sinal?: string | null; valueDecimal: Prisma.Decimal }) {
  if (value.sinal === "DEBITO" || ["Saída", "DEBIT", "DEBITO"].includes(value.direction)) return "Saída";
  if (value.sinal === "CREDITO" || ["Entrada", "CREDIT", "CREDITO"].includes(value.direction)) return "Entrada";
  throw new FinanceError("Sentido do lançamento não está conciliado.");
}

export async function reconciliationAccount(db: Db, actor: FinanceActor, sessionId: string) {
  const session = await db.bankReconciliationSession.findUniqueOrThrow({ where: { id: sessionId } });
  const accounts = await db.bankAccount.findMany({ where: session.bankAccountId ? { id: session.bankAccountId } : { bankName: session.banco, agency: session.agencia, accountNumber: session.contaNumero } });
  if (accounts.length !== 1) throw new FinanceError("Conta da sessão ausente ou ambígua; concilie o vínculo pelo cadastro municipal.");
  const account = accounts[0];
  if (!account.budgetUnitId || (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(account.budgetUnitId))) throw new FinanceError("Conta fora das unidades gestoras autorizadas.");
  if (!await db.planningEntityUnit.count({ where: { budgetUnitId: account.budgetUnitId } })) throw new FinanceError("Conta sem entidade municipal vinculada.");
  return { session, account };
}

export async function readReconciliationPosition(db: Db, actor: FinanceActor, sessionId: string) {
  const { session, account } = await reconciliationAccount(db, actor, sessionId);
  const physicalCount = await db.bankAccount.count({ where: { bankName: account.bankName, agency: account.agency, accountNumber: account.accountNumber } });
  const [items, movements, groups] = await Promise.all([
    db.bankStatementItem.findMany({ where: { date: { gte: session.dataInicio, lte: session.dataFim }, OR: [{ bankAccountId: account.id }, { bankAccountId: null, statementImport: { bankAccountId: account.id } }, ...(physicalCount === 1 ? [{ bankAccountId: null, statementImportId: null, banco: account.bankName, agencia: account.agency, contaNumero: account.accountNumber }] : [])] }, include: { reconciliationAllocations: { where: { group: { status: "EFETIVADO" } } } }, orderBy: [{ date: "asc" }, { id: "asc" }] }),
    db.treasuryMovement.findMany({ where: { bankAccountId: account.id, status: "Confirmado", date: { lte: session.dataFim } }, include: { statementItems: true, reconciliationAllocations: { where: { group: { status: "EFETIVADO" } } } }, orderBy: [{ date: "asc" }, { id: "asc" }] }),
    db.bankReconciliationAllocationGroup.findMany({ where: { sessionId }, include: { allocations: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
  ]);
  const sum = (values: Prisma.Decimal[]) => values.reduce((total, value) => total.plus(value), new Prisma.Decimal(0));
  const bank = items.map((item) => ({ ...item, allocated: item.treasuryMovementId ? item.valueDecimal.abs() : sum(item.reconciliationAllocations.map((row) => row.amountDecimal)), remaining: item.treasuryMovementId ? new Prisma.Decimal(0) : item.valueDecimal.abs().minus(sum(item.reconciliationAllocations.map((row) => row.amountDecimal))) }));
  const treasury = movements.map((movement) => ({ ...movement, allocated: movement.statementItems.length ? movement.valueDecimal.abs() : sum(movement.reconciliationAllocations.map((row) => row.amountDecimal)), remaining: movement.statementItems.length ? new Prisma.Decimal(0) : movement.valueDecimal.abs().minus(sum(movement.reconciliationAllocations.map((row) => row.amountDecimal))) }));
  if ([...bank, ...treasury].some((row) => row.remaining.lt(0))) throw new FinanceError("Alocações legadas excedem o lançamento; regularize a origem antes de continuar.");
  const debits = sum(bank.filter((item) => reconciliationDirection(item) === "Saída").map((item) => item.valueDecimal.abs()));
  const credits = sum(bank.filter((item) => reconciliationDirection(item) === "Entrada").map((item) => item.valueDecimal.abs()));
  const finalBalance = session.saldoInicialDecimal.plus(credits).minus(debits);
  const ledgerBalance = await getBankAccountLedgerBalance(db, account.id, session.dataFim);
  const currentMovements = treasury.filter((movement) => movement.date >= session.dataInicio);
  const matched = bank.filter((item) => item.remaining.isZero()).length;
  const pending = bank.length - matched + currentMovements.filter((movement) => !movement.remaining.isZero()).length;
  const snapshot = { accountId: account.id, opening: session.saldoInicialDecimal.toFixed(2), bank: bank.map((row) => [row.id, row.date.toISOString(), reconciliationDirection(row), row.valueDecimal.toFixed(2), row.remaining.toFixed(2)]), treasury: treasury.map((row) => [row.id, row.date.toISOString(), reconciliationDirection(row), row.valueDecimal.toFixed(2), row.remaining.toFixed(2)]), ledger: ledgerBalance.toFixed(2) };
  return { session, account, bank, treasury, groups, debits, credits, finalBalance, ledgerBalance, difference: ledgerBalance.minus(finalBalance), matched, pending, snapshotHash: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex") };
}

export async function openMunicipalReconciliation(db: PrismaClient, actor: FinanceActor, input: { bankAccountId: string; period: string; openingBalance: string | number }) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.period)) throw new FinanceError("Período inválido; informe AAAA-MM.");
  const opening = new Prisma.Decimal(String(input.openingBalance));
  if (!opening.isFinite() || opening.decimalPlaces() > 2) throw new FinanceError("Saldo inicial inválido.");
  return db.$transaction(async (tx) => {
    const account = await tx.bankAccount.findUniqueOrThrow({ where: { id: input.bankAccountId } });
    if (!account.isActive || !account.budgetUnitId || (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(account.budgetUnitId))) throw new FinanceError("Conta inativa ou fora das unidades autorizadas.");
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`RECONCILIATION:${account.id}:${input.period}`}, 0))::text`;
    const existing = await tx.bankReconciliationSession.findUnique({ where: { bankAccountId_periodo: { bankAccountId: account.id, periodo: input.period } } });
    if (existing) {
      if (!existing.saldoInicialDecimal.eq(opening)) throw new FinanceError("Sessão existente com outro saldo inicial; preserve o histórico.");
      await reconciliationAccount(tx, actor, existing.id);
      return existing;
    }
    const [year, month] = input.period.split("-").map(Number);
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1) - 1);
    const ledger = await getBankAccountLedgerBalance(tx, account.id, end);
    const session = await tx.bankReconciliationSession.create({ data: { bankAccountId: account.id, banco: account.bankName, agencia: account.agency, contaNumero: account.accountNumber, periodo: input.period, dataInicio: start, dataFim: end, saldoInicialDecimal: opening, totalDebitosDecimal: 0, totalCreditosDecimal: 0, saldoFinalDecimal: opening, saldoRazaoDecimal: ledger, diferencaDecimal: ledger.minus(opening) } });
    await reconciliationAccount(tx, actor, session.id);
    return session;
  });
}

async function lockAllocationRows(tx: Prisma.TransactionClient, statementIds: string[], movementIds: string[]) {
  const bank = [...new Set(statementIds)].sort();
  const treasury = [...new Set(movementIds)].sort();
  if (bank.length) await tx.$queryRaw`SELECT id FROM "BankStatementItem" WHERE id IN (${Prisma.join(bank)}) ORDER BY id FOR UPDATE`;
  if (treasury.length) await tx.$queryRaw`SELECT id FROM "TreasuryMovement" WHERE id IN (${Prisma.join(treasury)}) ORDER BY id FOR UPDATE`;
}

async function refreshItems(tx: Prisma.TransactionClient, ids: string[]) {
  const items = await tx.bankStatementItem.findMany({ where: { id: { in: [...new Set(ids)] } }, include: { reconciliationAllocations: { where: { group: { status: "EFETIVADO" } } } } });
  const statuses = new Map<string, string[]>();
  for (const item of items) {
    if (item.treasuryMovementId) continue;
    const allocated = item.reconciliationAllocations.reduce((sum, row) => sum.plus(row.amountDecimal), new Prisma.Decimal(0));
    const status = allocated.isZero() ? "Pendente" : allocated.eq(item.valueDecimal.abs()) ? "Conciliado" : "Parcial";
    statuses.set(status, [...(statuses.get(status) ?? []), item.id]);
  }
  for (const [status, itemIds] of statuses) await tx.bankStatementItem.updateMany({ where: { id: { in: itemIds } }, data: { status } });
}

async function allocate(tx: Prisma.TransactionClient, actor: FinanceActor, raw: z.infer<typeof allocationSchema>) {
  const input = allocationSchema.parse(raw);
  const { session, account } = await reconciliationAccount(tx, actor, input.sessionId);
  const rows = input.allocations.map((row) => ({ ...row, amount: amount(row.amount).toFixed(2) })).sort((a, b) => a.statementItemId.localeCompare(b.statementItemId) || a.treasuryMovementId.localeCompare(b.treasuryMovementId));
  if (new Set(rows.map((row) => JSON.stringify([row.statementItemId, row.treasuryMovementId]))).size !== rows.length || rows.some((row) => new Prisma.Decimal(row.amount).isZero())) throw new FinanceError("Alocações duplicadas ou sem valor.");
  const request = { sessionId: session.id, reason: input.reason, allocations: rows };
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`RECONCILIATION_ALLOCATION:${input.idempotencyKey}`}, 0))::text`;
  const existing = await tx.bankReconciliationAllocationGroup.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { allocations: true } });
  if (existing) {
    // PostgreSQL JSONB does not preserve object key order.
    const prior = existing.request as unknown as typeof request;
    if (existing.sessionId !== session.id || prior.reason !== request.reason || !Array.isArray(prior.allocations) || prior.allocations.length !== rows.length || prior.allocations.some((row, index) => row.statementItemId !== rows[index].statementItemId || row.treasuryMovementId !== rows[index].treasuryMovementId || row.amount !== rows[index].amount)) throw new FinanceError("Chave de conciliação já utilizada com outros dados.");
    if (existing.status !== "EFETIVADO") throw new FinanceError("Lote original desfeito; use nova chave para outra alocação.");
    return existing;
  }
  if (["CONCILIADA", "CANCELADA"].includes(session.status)) throw new FinanceError("Sessão encerrada; reabra formalmente antes de alocar.");
  await lockAllocationRows(tx, rows.map((row) => row.statementItemId), rows.map((row) => row.treasuryMovementId));
  const position = await readReconciliationPosition(tx, actor, session.id);
  const bank = new Map(position.bank.map((row) => [row.id, row]));
  const treasury = new Map(position.treasury.map((row) => [row.id, row]));
  const usedBank = new Map<string, Prisma.Decimal>();
  const usedTreasury = new Map<string, Prisma.Decimal>();
  for (const row of rows) {
    const item = bank.get(row.statementItemId);
    const movement = treasury.get(row.treasuryMovementId);
    if (!item || !movement) throw new FinanceError("Alocação fora da conta/período autorizado ou movimento não confirmado.");
    if (reconciliationDirection(item) !== reconciliationDirection(movement)) throw new FinanceError("Extrato e tesouraria possuem sentidos diferentes.");
    usedBank.set(item.id, (usedBank.get(item.id) ?? new Prisma.Decimal(0)).plus(row.amount));
    usedTreasury.set(movement.id, (usedTreasury.get(movement.id) ?? new Prisma.Decimal(0)).plus(row.amount));
    if (usedBank.get(item.id)!.gt(item.remaining) || usedTreasury.get(movement.id)!.gt(movement.remaining)) throw new FinanceError("Alocação excede o saldo disponível do extrato ou da tesouraria.");
  }
  const group = await tx.bankReconciliationAllocationGroup.create({ data: { sessionId: session.id, bankAccountId: account.id, idempotencyKey: input.idempotencyKey, request, reason: input.reason, authorUsuarioId: actor.usuarioId, allocations: { create: rows.map((row) => ({ statementItemId: row.statementItemId, treasuryMovementId: row.treasuryMovementId, amountDecimal: row.amount })) } }, include: { allocations: true } });
  await refreshItems(tx, rows.map((row) => row.statementItemId));
  await tx.bankReconciliationSession.update({ where: { id: session.id }, data: { status: "EM_ANDAMENTO" } });
  await tx.financialAuditLog.create({ data: { action: "RECONCILIATION_ALLOCATE", entityType: "BankReconciliationAllocationGroup", entityId: group.id, authorUsuarioId: actor.usuarioId, payload: { bankAccountId: account.id, budgetUnitId: account.budgetUnitId, request } } });
  return group;
}

export async function allocateBankReconciliation(db: PrismaClient, actor: FinanceActor, input: z.infer<typeof allocationSchema>) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "BankReconciliationSession" WHERE id = ${input.sessionId} FOR UPDATE`;
    return allocate(tx, actor, input);
  }, { timeout: 60000 });
}

export async function reverseBankReconciliationAllocation(db: PrismaClient, actor: FinanceActor, input: { groupId: string; reason: string }) {
  if (input.reason.trim().length < 10) throw new FinanceError("Informe fundamento do desfazimento com ao menos dez caracteres.");
  return db.$transaction(async (tx) => {
    const group = await tx.bankReconciliationAllocationGroup.findUniqueOrThrow({ where: { id: input.groupId }, include: { allocations: true } });
    await tx.$queryRaw`SELECT id FROM "BankReconciliationSession" WHERE id = ${group.sessionId} FOR UPDATE`;
    const { session } = await reconciliationAccount(tx, actor, group.sessionId);
    const current = await tx.bankReconciliationAllocationGroup.findUniqueOrThrow({ where: { id: group.id } });
    if (current.status === "REVERTIDO") {
      if (current.reversalReason !== input.reason.trim()) throw new FinanceError("Desfazimento já registrado com outro fundamento.");
      return current;
    }
    if (session.status === "CONCILIADA") throw new FinanceError("Reabra formalmente a sessão antes de desfazer alocações.");
    await lockAllocationRows(tx, group.allocations.map((row) => row.statementItemId), group.allocations.map((row) => row.treasuryMovementId));
    const reversed = await tx.bankReconciliationAllocationGroup.update({ where: { id: group.id }, data: { status: "REVERTIDO", reversedAt: new Date(), reversedByUsuarioId: actor.usuarioId, reversalReason: input.reason.trim() } });
    await refreshItems(tx, group.allocations.map((row) => row.statementItemId));
    await tx.financialAuditLog.create({ data: { action: "RECONCILIATION_REVERSE_ALLOCATION", entityType: "BankReconciliationAllocationGroup", entityId: group.id, authorUsuarioId: actor.usuarioId, payload: { reason: input.reason.trim(), sessionId: session.id } } });
    return reversed;
  }, { timeout: 60000 });
}

export async function confirmMunicipalReconciliation(db: PrismaClient, actor: FinanceActor, sessionId: string) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "BankReconciliationSession" WHERE id = ${sessionId} FOR UPDATE`;
    const { session } = await reconciliationAccount(tx, actor, sessionId);
    if (session.status === "CONCILIADA") return { session, recibo: session.reciboIntegracao! };
    if (session.status !== "EM_ANDAMENTO") throw new FinanceError("Execute a correspondência ou aloque os itens antes de confirmar.");
    const access = await reconciliationAccount(tx, actor, sessionId);
    await tx.$queryRaw`SELECT id FROM "BankAccount" WHERE id = ${access.account.id} FOR UPDATE`;
    const position = await readReconciliationPosition(tx, actor, sessionId);
    await lockAllocationRows(tx, position.bank.map((row) => row.id), position.treasury.map((row) => row.id));
    const current = await readReconciliationPosition(tx, actor, sessionId);
    if (!current.bank.length || current.pending || !current.difference.isZero()) throw new FinanceError("Conciliação possui saldo divergente ou lançamentos sem alocação integral.");
    await tx.bankReconciliation.create({ data: { periodStart: session.dataInicio, periodEnd: session.dataFim, bankAccountId: current.account.id, systemBalance: Number(current.ledgerBalance), systemBalanceDecimal: current.ledgerBalance, bankBalance: Number(current.finalBalance), bankBalanceDecimal: current.finalBalance, status: "Conciliado" } });
    const revision = await tx.bankReconciliation.count({ where: { bankAccountId: current.account.id, periodStart: session.dataInicio, periodEnd: session.dataFim } });
    const receipt = `REC-CONCIL-${session.id}:V${revision}`;
    const updated = await tx.bankReconciliationSession.update({ where: { id: session.id }, data: { status: "CONCILIADA", confirmadoPor: actor.usuarioId, confirmadoEm: new Date(), reciboIntegracao: receipt, totalDebitosDecimal: current.debits, totalCreditosDecimal: current.credits, saldoFinalDecimal: current.finalBalance, saldoRazaoDecimal: current.ledgerBalance, diferencaDecimal: current.difference, totalItensBanco: current.bank.length, totalItensContabeis: current.treasury.filter((row) => row.date >= session.dataInicio).length, itensConciliados: current.matched, itensDivergentes: 0 } });
    await tx.financialAuditLog.create({ data: { action: "CONCILIACAO_BANCARIA_CONFIRMADA", entityType: "BankReconciliationSession", entityId: session.id, authorUsuarioId: actor.usuarioId, payload: { bankAccountId: current.account.id, snapshotHash: current.snapshotHash, receipt } } });
    return { session: updated, recibo: receipt };
  }, { timeout: 60000 });
}

export async function reopenMunicipalReconciliation(db: PrismaClient, actor: FinanceActor, input: { sessionId: string; reason: string }) {
  if (input.reason.trim().length < 10) throw new FinanceError("Informe fundamento da reabertura com ao menos dez caracteres.");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "BankReconciliationSession" WHERE id = ${input.sessionId} FOR UPDATE`;
    const { session } = await reconciliationAccount(tx, actor, input.sessionId);
    if (session.status !== "CONCILIADA") throw new FinanceError("Somente sessão conciliada pode ser reaberta.");
    const updated = await tx.bankReconciliationSession.update({ where: { id: session.id }, data: { status: "EM_ANDAMENTO" } });
    const access = await reconciliationAccount(tx, actor, session.id);
    await tx.bankReconciliation.updateMany({ where: { bankAccountId: access.account.id, periodStart: session.dataInicio, periodEnd: session.dataFim, status: "Conciliado" }, data: { status: "Reaberto" } });
    await tx.financialAuditLog.create({ data: { action: "RECONCILIATION_REOPEN", entityType: "BankReconciliationSession", entityId: session.id, authorUsuarioId: actor.usuarioId, payload: { reason: input.reason.trim(), previousReceipt: session.reciboIntegracao } } });
    return updated;
  });
}

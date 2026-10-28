import { and, eq, or, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { bankStatementImports, bankStatementItems } from "@/db/schema/finance-banking";
import { financialAuditLogs } from "@/db/schema/finance-identity";
import { bankReconciliationAllocationGroups, bankReconciliationAllocations, reconciliationBankAccounts, reconciliationTreasuryMovements } from "@/db/schema/finance-reconciliation";
import type { ImportedBankStatementItem } from "@/lib/contracts/finance-banking";
import type { FinanceActor } from "./index";
import { FinanceError } from "./errors";

export async function matchBankStatementItemToTreasuryMovement(
  connection: DatabaseConnection,
  actor: FinanceActor,
  input: { statementItemId: string; treasuryMovementId: string },
): Promise<ImportedBankStatementItem> {
  if (!input.statementItemId.trim() || !input.treasuryMovementId.trim()) throw new FinanceError("Selecione o lançamento do extrato e o movimento de tesouraria.");
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT id FROM "BankStatementItem" WHERE id = ${input.statementItemId} FOR UPDATE`);
    await tx.execute(sql`SELECT id FROM "TreasuryMovement" WHERE id = ${input.treasuryMovementId} FOR UPDATE`);
    const [[statement], [treasury]] = await Promise.all([
      tx.select({ item: bankStatementItems, importAccountId: bankStatementImports.bankAccountId, importBudgetUnitId: reconciliationBankAccounts.budgetUnitId }).from(bankStatementItems)
        .leftJoin(bankStatementImports, eq(bankStatementImports.id, bankStatementItems.statementImportId))
        .leftJoin(reconciliationBankAccounts, eq(reconciliationBankAccounts.id, bankStatementImports.bankAccountId))
        .where(eq(bankStatementItems.id, input.statementItemId)),
      tx.select({ movement: reconciliationTreasuryMovements, account: reconciliationBankAccounts }).from(reconciliationTreasuryMovements)
        .innerJoin(reconciliationBankAccounts, eq(reconciliationBankAccounts.id, reconciliationTreasuryMovements.bankAccountId))
        .where(eq(reconciliationTreasuryMovements.id, input.treasuryMovementId)),
    ]);
    if (!statement) throw new FinanceError("Item de extrato não encontrado.");
    if (!treasury) throw new FinanceError("Movimento de tesouraria não encontrado.");
    const { item } = statement;
    const { movement, account } = treasury;
    const budgetUnitId = statement.importBudgetUnitId ?? account.budgetUnitId;
    if (budgetUnitId && actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(budgetUnitId)) throw new FinanceError("Acesso negado à Unidade Gestora da conta bancária.");
    if (item.status !== "Pendente" || item.treasuryMovementId) throw new FinanceError("O item de extrato já foi conciliado.");
    const bankAccountId = item.bankAccountId ?? statement.importAccountId;
    if (bankAccountId && bankAccountId !== movement.bankAccountId) throw new FinanceError("O movimento de tesouraria deve pertencer à mesma conta bancária do extrato.");
    if ((item.banco && item.banco !== account.bankName) || (item.agencia && item.agencia !== account.agency) || (item.contaNumero && item.contaNumero !== account.accountNumber)) throw new FinanceError("O movimento de tesouraria deve pertencer ao mesmo banco, agência e conta do extrato.");
    const statementDirection = item.sinal === "DEBITO" || item.direction === "DEBIT" || item.direction === "Saída" || item.valueDecimal.lt(0) ? "Saída" : "Entrada";
    const movementDirection = movement.direction === "DEBIT" || movement.direction === "Saída" ? "Saída" : "Entrada";
    if (statementDirection !== movementDirection) throw new FinanceError("O movimento de tesouraria deve possuir o mesmo sentido do lançamento bancário.");
    if (!item.valueDecimal.abs().eq(movement.valueDecimal.abs())) throw new FinanceError("O movimento de tesouraria deve possuir o mesmo valor do lançamento bancário.");
    if (movement.status !== "Confirmado") throw new FinanceError("Somente movimentos de tesouraria confirmados podem ser conciliados.");
    const [linked] = await tx.select({ id: bankStatementItems.id }).from(bankStatementItems).where(eq(bankStatementItems.treasuryMovementId, movement.id)).limit(1);
    if (linked) throw new FinanceError("O movimento de tesouraria já está vinculado a outro item de extrato.");
    const [allocated] = await tx.select({ id: bankReconciliationAllocations.id }).from(bankReconciliationAllocations)
      .innerJoin(bankReconciliationAllocationGroups, eq(bankReconciliationAllocationGroups.id, bankReconciliationAllocations.groupId))
      .where(and(eq(bankReconciliationAllocationGroups.status, "EFETIVADO"), or(eq(bankReconciliationAllocations.statementItemId, item.id), eq(bankReconciliationAllocations.treasuryMovementId, movement.id)))).limit(1);
    if (allocated) throw new FinanceError("Lançamento já possui alocações de conciliação; utilize o saldo parcial no fluxo N:N.");
    const [matched] = await tx.update(bankStatementItems).set({ treasuryMovementId: movement.id, status: "Conciliado" }).where(eq(bankStatementItems.id, item.id)).returning();
    await tx.insert(financialAuditLogs).values({ action: "MATCH", entityType: "BankStatementItem", entityId: matched.id, budgetUnitId: budgetUnitId || actor.budgetUnitId || null, payload: { treasuryMovementId: movement.id, bankAccountId: movement.bankAccountId }, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId });
    return matched;
  });
}

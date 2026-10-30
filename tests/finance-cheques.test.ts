import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { createFinancePagesDatabase } from "./helpers/finance-pages-database";
import { changeChequeState, createCheckbook, issueCheque } from "../src/lib/financeiro/cheques";
import { reconciliationBankAccounts } from "../src/db/schema/finance-reconciliation";
import { readFinancialReportEmitter } from "../src/db/repositories/finance/report-emitter";
import { users } from "../src/db/schema/identity";
import { financeCheques } from "../src/db/schema/finance-cheques";

test("talões e cheques: intervalo, permissão, numeração única, cancelamento e compensação", { timeout: 180000 }, async () => {
  const fixture = await createFinancePagesDatabase();
  fixture.connection.pool.options.max = 1;
  const { connection } = fixture;
  const actor = { usuarioId: "actor", allowedBudgetUnitIds: ["unit"] };
  try {
    assert.equal(await readFinancialReportEmitter(connection.db, "actor", "Operador"), "Operador financeiro");
    await connection.db.update(users).set({ employeeId: "employee" }).where(eq(users.id, "actor"));
    assert.equal(await readFinancialReportEmitter(connection.db, "actor", "Operador"), "Operador financeiro · CPF 12345678901");
    await fixture.database.exec(await readFile("db/migrations/20261030124000_finance_cheques/migration.sql", "utf8"));
    await assert.rejects(createCheckbook(connection, actor, { bankAccountId: "denied-bank", label: "Negado", firstNumber: 1, lastNumber: 20 }), /fora das unidades/);
    const book = await createCheckbook(connection, actor, { bankAccountId: "bank", label: "Talão A", firstNumber: 1, lastNumber: 20 });
    await assert.rejects(createCheckbook(connection, actor, { bankAccountId: "bank", label: "Sobreposto", firstNumber: 10, lastNumber: 30 }), /sobreposta/);
    await assert.rejects(issueCheque(connection, actor, { checkbookId: book.id, number: 21, payee: "Fornecedor", amount: "0.30", issuedAt: "2026-01-01" }), /fora do talão/);
    const first = await issueCheque(connection, actor, { checkbookId: book.id, number: 1, payee: "Fornecedor", amount: "0.30", issuedAt: "2026-01-01" });
    assert.equal(first.amount.toFixed(2), "0.30");
    await assert.rejects(issueCheque(connection, actor, { checkbookId: book.id, number: 1, payee: "Outro", amount: "2.00", issuedAt: "2026-01-01" }), /já emitida/);
    await assert.rejects(changeChequeState(connection, { usuarioId: "actor", allowedBudgetUnitIds: [] }, { id: first.id, status: "CANCELADO", reason: "Dados incorretos" }), /fora das unidades/);
    await assert.rejects(changeChequeState(connection, actor, { id: first.id, status: "COMPENSADO", clearedAt: "2025-12-31" }), /anterior/);
    const canceled = await changeChequeState(connection, actor, { id: first.id, status: "CANCELADO", reason: "Dados incorretos" });
    assert.equal(canceled.status, "CANCELADO");
    await assert.rejects(changeChequeState(connection, actor, { id: first.id, status: "COMPENSADO", clearedAt: "2026-01-03" }), /Somente cheques emitidos/);
    await assert.rejects(issueCheque(connection, actor, { checkbookId: book.id, number: 1, payee: "Outro", amount: "2.00", issuedAt: "2026-01-01" }), /não podem ser reutilizados/);
    const second = await issueCheque(connection, actor, { checkbookId: book.id, number: 2, payee: "Prestador", amount: "100.10", issuedAt: "2026-01-02" });
    const before = (await connection.db.select().from(reconciliationBankAccounts).where(eq(reconciliationBankAccounts.id, "bank")))[0].currentBalance;
    const cleared = await changeChequeState(connection, actor, { id: second.id, status: "COMPENSADO", clearedAt: "2026-01-03" });
    assert.equal(cleared.clearedAt?.toISOString().slice(0, 10), "2026-01-03");
    assert.equal(cleared.status, "COMPENSADO");
    assert.equal((await connection.db.select().from(reconciliationBankAccounts).where(eq(reconciliationBankAccounts.id, "bank")))[0].currentBalance, before);
    assert.equal((await connection.db.select().from(financeCheques)).length, 2);
  } finally { await fixture.close(); }
});

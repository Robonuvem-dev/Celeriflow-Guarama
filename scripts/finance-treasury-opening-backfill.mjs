import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { tsImport } from "tsx/esm/api";
import { createDatabaseConnection } from "../src/db/connection.ts";
import { Decimal } from "../src/db/decimal.ts";
import { createId } from "../src/db/ids.ts";
import { databaseTimestamp } from "../src/db/temporal.ts";

config({ path: ".env.local" });
config();

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} nao configurada.`);
  return value;
}

async function main() {
  const { withDatabaseTransaction } = await tsImport("../src/db/transaction.ts", import.meta.url);
  const connection = createDatabaseConnection(requiredEnvironment("DATABASE_URL"));
  const db = connection.db;
  try {
    const [migrationUser] = (await db.execute(sql`SELECT id,"employeeId" FROM "Usuario" WHERE ativo=true ${process.env.FINANCE_BACKFILL_USER_ID ? sql`AND id=${process.env.FINANCE_BACKFILL_USER_ID}` : sql``} ORDER BY "createdAt" LIMIT 1`)).rows;
    if (!migrationUser) throw new Error("Nenhum usuario ativo esta disponivel para registrar a auditoria da migracao.");

    const accounts = (await db.execute(sql`SELECT id,"createdAt","currentBalanceDecimal"::text FROM "BankAccount"`)).rows.map(row => ({ id: row.id, createdAt: databaseTimestamp(row.createdAt), currentBalanceDecimal: row.currentBalanceDecimal === null ? null : new Decimal(row.currentBalanceDecimal) }));
    let created = 0;
    let skipped = 0;
    for (const account of accounts) {
      const balance = account.currentBalanceDecimal;
      if (!balance || balance.isZero()) { skipped += 1; continue; }
      await withDatabaseTransaction(connection, async (tx) => {
        const [existing] = (await tx.execute(sql`SELECT id FROM "TreasuryMovement" WHERE "bankAccountId"=${account.id} LIMIT 1`)).rows;
        if (existing) { skipped += 1; return; }
        const [year] = (await tx.execute(sql`SELECT id FROM "FinancialYear" WHERE "startDate"<=${account.createdAt} AND "endDate">=${account.createdAt} ORDER BY year DESC LIMIT 1`)).rows;
        if (!year) { skipped += 1; return; }
        const idempotencyKey = `FINANCEIRO:LEGACY_BANK_ACCOUNT:${account.id}:OPENING_BALANCE`;
        let [movement] = (await tx.execute(sql`INSERT INTO "TreasuryMovement" (id,date,type,direction,"valueDecimal",history,"bankAccountId","financialYearId","sourceModule","sourceType","sourceId","eventType","idempotencyKey") VALUES (${createId()},${account.createdAt},'OpeningBalance',${balance.isNegative() ? "Saída" : "Entrada"},${balance.abs().toString()},'Migração auditada do saldo bancário legado para tesouraria.',${account.id},${year.id},'FINANCEIRO','LEGACY_BANK_ACCOUNT',${account.id},'OPENING_BALANCE_MIGRATION',${idempotencyKey}) ON CONFLICT ("idempotencyKey") DO NOTHING RETURNING id`)).rows;
        if (!movement) [movement] = (await tx.execute(sql`SELECT id FROM "TreasuryMovement" WHERE "idempotencyKey"=${idempotencyKey}`)).rows;
        if (!movement) throw new Error("Saldo inicial não foi persistido.");
        await tx.execute(sql`INSERT INTO "FinancialAuditLog" (id,action,"entityType","entityId","financialYearId",payload,"authorUsuarioId","authorEmployeeId") VALUES (${createId()},'MIGRATE_OPENING_BALANCE','TreasuryMovement',${movement.id},${year.id},${JSON.stringify({ source: "SYSTEM_MIGRATION", legacyBankAccountId: account.id, value: balance.abs().toFixed(2) })}::jsonb,${migrationUser.id},${migrationUser.employeeId})`);
        created += 1;
      }, { timeoutMs: 5000 });
    }
    console.log(JSON.stringify({ created, skipped, auditUserId: migrationUser.id }, null, 2));
  } finally {
    await connection.pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import dotenv from "dotenv";
import { and, eq, isNull } from "drizzle-orm";
import { bankStatementItems } from "../src/db/schema/finance-banking";
import { listAutomationBankAccounts } from "../src/db/repositories/finance/bank-automation";

dotenv.config();
dotenv.config({ path: ".env.local", override: true });

async function main() {
  const { db, databaseConnection } = await import("../src/db/client");
  try {
    const accounts = await listAutomationBankAccounts(db, { bankName: "001 - Banco Virtual Robonuvem" });
    let updated = 0;
    for (const account of accounts) {
      const result = await db.update(bankStatementItems).set({ bankAccountId: account.id }).where(and(isNull(bankStatementItems.bankAccountId), eq(bankStatementItems.banco, account.bankName), eq(bankStatementItems.agencia, account.agency), eq(bankStatementItems.contaNumero, account.accountNumber))).returning({ id: bankStatementItems.id });
      updated += result.length;
    }
    console.log({ updated, accounts: accounts.length });
  } finally {
    await databaseConnection.pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

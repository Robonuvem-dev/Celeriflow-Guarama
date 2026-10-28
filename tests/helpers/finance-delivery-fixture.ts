import { PGlite } from "@electric-sql/pglite";
import { connectFinanceDrizzleFixture } from "./finance-drizzle-connection";

/** Isolated SQL tables for the delivery readers; no ORM doubles or shared Planning setup. */
export async function createFinanceDeliveryFixture() {
  const pg = new PGlite();
  let transport: Awaited<ReturnType<typeof connectFinanceDrizzleFixture>> | undefined;
  try {
    await pg.exec(`
      CREATE TABLE "FinancialYear" (
        id text PRIMARY KEY, year integer NOT NULL, "governmentEntityId" text, status text NOT NULL,
        "startDate" timestamp(3) NOT NULL, "endDate" timestamp(3) NOT NULL,
        "createdAt" timestamp(3) NOT NULL DEFAULT now(), "updatedAt" timestamp(3) NOT NULL DEFAULT now()
      );
      CREATE TABLE "AccountingPlan" (
        id text PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL, type text NOT NULL,
        "createdAt" timestamp(3) NOT NULL DEFAULT now(), "updatedAt" timestamp(3) NOT NULL DEFAULT now()
      );
      CREATE TABLE "AccountingTransaction" (
        id text PRIMARY KEY, "financialYearId" text NOT NULL REFERENCES "FinancialYear", "governmentEntityId" text, "budgetUnitId" text,
        date timestamp(3) NOT NULL, history text NOT NULL, status text NOT NULL DEFAULT 'RASCUNHO',
        "sourceModule" text NOT NULL DEFAULT 'MANUAL', "sourceType" text NOT NULL DEFAULT 'ACCOUNTING_TRANSACTION', "sourceId" text,
        "eventType" text NOT NULL DEFAULT 'MANUAL_POSTING', "idempotencyKey" text UNIQUE, "authorUsuarioId" text NOT NULL,
        "authorEmployeeId" text, "postedAt" timestamp(3), "reversalOfId" text UNIQUE,
        "createdAt" timestamp(3) NOT NULL DEFAULT now(), "updatedAt" timestamp(3) NOT NULL DEFAULT now()
      );
      CREATE TABLE "AccountingEntry" (
        id text PRIMARY KEY, "accountId" text NOT NULL REFERENCES "AccountingPlan", "transactionId" text REFERENCES "AccountingTransaction",
        date timestamp(3) NOT NULL DEFAULT now(), value double precision NOT NULL, "valueDecimal" numeric(18,2),
        "classificationSnapshot" jsonb, type text NOT NULL, history text NOT NULL, "authorId" text NOT NULL,
        "createdAt" timestamp(3) NOT NULL DEFAULT now(), "updatedAt" timestamp(3) NOT NULL DEFAULT now()
      );
      CREATE TABLE "MonthlyAccountingClose" (
        id text PRIMARY KEY, "financialYearId" text NOT NULL REFERENCES "FinancialYear", competence timestamp(3) NOT NULL,
        status text NOT NULL, "pendingSummary" jsonb, "closedByUsuarioId" text, "closedByEmployeeId" text, "closedAt" timestamp(3),
        "createdAt" timestamp(3) NOT NULL DEFAULT now(), "updatedAt" timestamp(3) NOT NULL DEFAULT now()
      );
      CREATE TABLE "BudgetUnit" (id text PRIMARY KEY, code text NOT NULL, name text NOT NULL);
      CREATE TABLE "PlanningEntityUnit" ("budgetUnitId" text PRIMARY KEY REFERENCES "BudgetUnit", "governmentEntityId" text NOT NULL);
      CREATE TABLE "ResourceSource" (id text PRIMARY KEY, code text NOT NULL, name text NOT NULL);
      CREATE TABLE "BankAccount" (
        id text PRIMARY KEY, "bankName" text NOT NULL, agency text NOT NULL, "accountNumber" text NOT NULL, "accountType" text NOT NULL,
        "budgetUnitId" text REFERENCES "BudgetUnit", "resourceSourceId" text REFERENCES "ResourceSource"
      );
      CREATE TABLE "BankReconciliation" (
        id text PRIMARY KEY, "bankAccountId" text NOT NULL REFERENCES "BankAccount", date timestamp(3) NOT NULL,
        "periodStart" timestamp(3) NOT NULL, "periodEnd" timestamp(3) NOT NULL,
        "systemBalance" double precision NOT NULL, "systemBalanceDecimal" numeric(18,2),
        "bankBalance" double precision NOT NULL, "bankBalanceDecimal" numeric(18,2), status text NOT NULL,
        "createdAt" timestamp(3) NOT NULL DEFAULT now(), "updatedAt" timestamp(3) NOT NULL DEFAULT now()
      );
      CREATE TABLE "TreasuryMovement" (
        id text PRIMARY KEY, "bankAccountId" text NOT NULL REFERENCES "BankAccount", "financialYearId" text NOT NULL REFERENCES "FinancialYear",
        date timestamp(3) NOT NULL DEFAULT now(), type text NOT NULL, direction text NOT NULL, "valueDecimal" numeric(18,2) NOT NULL,
        history text, status text NOT NULL DEFAULT 'Confirmado', "resourceSourceId" text, "revenueId" text,
        "sourceModule" text NOT NULL DEFAULT 'MANUAL', "sourceType" text NOT NULL DEFAULT 'TREASURY_MOVEMENT', "sourceId" text,
        "eventType" text NOT NULL DEFAULT 'TREASURY_MOVEMENT', "idempotencyKey" text UNIQUE, "createdAt" timestamp(3) NOT NULL DEFAULT now()
      );
      INSERT INTO "FinancialYear" (id,year,status,"startDate","endDate") VALUES ('year-2026',2026,'Aberto','2026-01-01','2026-12-31 23:59:59.999');
      INSERT INTO "AccountingPlan" (id,code,name,type) VALUES ('account-1','1.1.1','Caixa','Ativo');
      INSERT INTO "BudgetUnit" VALUES ('ug','02.001','Saúde');
      INSERT INTO "ResourceSource" VALUES ('source','500','Ordinários');
      INSERT INTO "BankAccount" VALUES ('bank-1','Banco Municipal','0001','123-4','Movimento','ug','source');
    `);
    transport = await connectFinanceDrizzleFixture(pg);
    const connected = transport;
    return { connection: connected.connection, async close() { try { await connected.close(); } finally { await pg.close(); } } };
  } catch (error) {
    try { await transport?.close(); } finally { await pg.close(); }
    throw error;
  }
}

import { createControlDrizzleFixture } from "./control-drizzle-fixture";

/** Read-only financial scope and historical personnel facts for C7. All queries
 * use the same real Neon/Drizzle connection as the control fixture. */
export async function createControlWorkforceFixture() {
  const fixture = await createControlDrizzleFixture();
  try {
    await fixture.pg.exec(`
      CREATE TABLE "FinancialYear" (id TEXT PRIMARY KEY, year INTEGER NOT NULL, "governmentEntityId" TEXT REFERENCES "GovernmentEntity"(id), status TEXT NOT NULL DEFAULT 'Aberto', "startDate" TIMESTAMP(3) NOT NULL, "endDate" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE "Role" (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, level TEXT, "canSign" BOOLEAN NOT NULL DEFAULT FALSE, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
      ALTER TABLE "HrEmploymentContract"
        ADD COLUMN registration TEXT NOT NULL UNIQUE,
        ADD COLUMN "regimeId" TEXT NOT NULL,
        ADD COLUMN "roleId" TEXT NOT NULL,
        ADD COLUMN "departmentId" TEXT,
        ADD COLUMN "workLocation" TEXT NOT NULL,
        ADD COLUMN "salaryLevel" TEXT,
        ADD COLUMN "appointedAt" TIMESTAMP(3),
        ADD COLUMN "swornAt" TIMESTAMP(3),
        ADD COLUMN "monthlyHours" INTEGER NOT NULL DEFAULT 220,
        ADD COLUMN salary NUMERIC(18,2) NOT NULL,
        ADD COLUMN version INTEGER NOT NULL DEFAULT 1,
        ADD COLUMN details JSONB NOT NULL,
        ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
      CREATE TABLE "HrEmploymentRevision" (id TEXT PRIMARY KEY, "contractId" TEXT NOT NULL REFERENCES "HrEmploymentContract"(id), version INTEGER NOT NULL, "effectiveFrom" TIMESTAMP(3) NOT NULL, snapshot JSONB NOT NULL, "actorId" TEXT NOT NULL, reason TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE ("contractId", version));
      CREATE TABLE "HrRoleLegalHistory" (id TEXT PRIMARY KEY, "governmentEntityId" TEXT NOT NULL, "roleId" TEXT NOT NULL, "effectiveFrom" TIMESTAMP(3) NOT NULL, version INTEGER NOT NULL, state TEXT NOT NULL, designation TEXT NOT NULL, "authorizedSeats" INTEGER NOT NULL, "legalReference" TEXT NOT NULL, "documentVersionId" TEXT NOT NULL, "documentHash" TEXT NOT NULL, UNIQUE ("governmentEntityId", "roleId", version));
      INSERT INTO "FinancialYear" (id, year, "governmentEntityId", "startDate", "endDate") VALUES ('ano', 2026, 'ente', '2026-01-01', '2026-12-31');
      INSERT INTO "Employee" (id, name, "secretariatId") VALUES ('servidora-ana', 'Ana Paula Martins', 'secretaria');
    `);
    return fixture;
  } catch (error) { await fixture.close(); throw error; }
}

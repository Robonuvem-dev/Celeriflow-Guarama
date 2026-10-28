import { readFileSync } from "node:fs";
import { createLocalDrizzleDatabase } from "./local-drizzle-database";

/** Fixed C7 integration fixture, using the real production Neon/Drizzle driver.
 * Cross-domain tables contain the read-only columns used by C7; event guards are
 * the authoritative existing SQL migrations, not reimplemented test guards. */
export async function createControlDrizzleFixture(jurisdiction: "EXECUTIVE" | "LEGISLATIVE" = "EXECUTIVE") {
  const fixture = await createLocalDrizzleDatabase();
  try {
    await fixture.database.exec(`
      CREATE TABLE "GovernmentEntity" (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL);
      CREATE TABLE "Secretariat" (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE "BudgetUnit" (id TEXT PRIMARY KEY, code TEXT NOT NULL, name TEXT NOT NULL, "secretariatId" TEXT NOT NULL REFERENCES "Secretariat"(id));
      CREATE TABLE "PlanningEntityUnit" (id TEXT PRIMARY KEY, "budgetUnitId" TEXT NOT NULL UNIQUE REFERENCES "BudgetUnit"(id), "governmentEntityId" TEXT NOT NULL REFERENCES "GovernmentEntity"(id));
      CREATE TABLE "Usuario" (id TEXT PRIMARY KEY, nome TEXT NOT NULL, ativo BOOLEAN NOT NULL DEFAULT TRUE, "employeeId" TEXT);
      CREATE TABLE "UsuarioUnidadeGestora" (id TEXT PRIMARY KEY, "usuarioId" TEXT NOT NULL REFERENCES "Usuario"(id), "budgetUnitId" TEXT NOT NULL REFERENCES "BudgetUnit"(id), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE ("usuarioId", "budgetUnitId"));
      CREATE TABLE "Employee" (id TEXT PRIMARY KEY, name TEXT NOT NULL, "secretariatId" TEXT REFERENCES "Secretariat"(id), "isActive" BOOLEAN NOT NULL DEFAULT TRUE);
      CREATE TABLE "CostCenter" (id TEXT PRIMARY KEY, code TEXT NOT NULL, name TEXT NOT NULL, "governmentEntityId" TEXT REFERENCES "GovernmentEntity"(id), "secretariatId" TEXT REFERENCES "Secretariat"(id), "isActive" BOOLEAN NOT NULL DEFAULT TRUE);
      CREATE TABLE "HrEmploymentContract" (id TEXT PRIMARY KEY, "employeeId" TEXT NOT NULL, "costCenterId" TEXT, status TEXT NOT NULL DEFAULT 'ATIVO', "admittedAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3));
      CREATE TABLE "Document" (id TEXT PRIMARY KEY, title TEXT NOT NULL, "fileUrl" TEXT NOT NULL, status TEXT NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE "BankAccount" (id TEXT PRIMARY KEY, "budgetUnitId" TEXT NOT NULL REFERENCES "BudgetUnit"(id), "resourceSourceId" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT TRUE);
      CREATE TABLE "ConfiguracaoParametroInstancia" (id TEXT PRIMARY KEY, "configuracaoInstanciaId" TEXT NOT NULL, chave TEXT NOT NULL, valor JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE "AuditEvent" (id TEXT PRIMARY KEY, "eventType" TEXT NOT NULL, "targetType" TEXT NOT NULL, "targetId" TEXT NOT NULL, "actorUsuarioId" TEXT NOT NULL REFERENCES "Usuario"(id), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE "InternalControlPlan" (id TEXT PRIMARY KEY, title TEXT NOT NULL, reference TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ABERTO', "dueAt" TIMESTAMP(3), "ownerId" TEXT NOT NULL, "budgetUnitId" TEXT REFERENCES "BudgetUnit"(id), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
      CREATE TABLE "InternalControlFinding" (id TEXT PRIMARY KEY, "planId" TEXT NOT NULL REFERENCES "InternalControlPlan"(id), title TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDENTE', "dueAt" TIMESTAMP(3), "responsibleId" TEXT, "evidenceDocumentId" TEXT, "resolvedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
      CREATE TABLE "InternalControlEvent" (id TEXT PRIMARY KEY, "planId" TEXT NOT NULL REFERENCES "InternalControlPlan"(id), "findingId" TEXT REFERENCES "InternalControlFinding"(id), "eventType" TEXT NOT NULL, "actorId" TEXT NOT NULL, reason TEXT NOT NULL, snapshot JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE "TransparencyPublication" (
        id TEXT PRIMARY KEY, "publicKey" TEXT NOT NULL UNIQUE, "collectionSlug" TEXT NOT NULL, entity TEXT NOT NULL, year INTEGER NOT NULL,
        title TEXT NOT NULL, "group" TEXT NOT NULL, "referencePeriod" TEXT NOT NULL,
        "documentKind" TEXT NOT NULL DEFAULT 'OUTRO', "legalStage" TEXT NOT NULL DEFAULT 'REFERENCIA', source TEXT NOT NULL DEFAULT 'DOCUMENTOS', status TEXT NOT NULL DEFAULT 'DRAFT', "values" JSONB NOT NULL,
        version INTEGER NOT NULL DEFAULT 1, "order" INTEGER NOT NULL DEFAULT 0,
        "fileUrl" TEXT, "filePathname" TEXT, filename TEXT, "contentType" TEXT, sha256 TEXT, "linkUrl" TEXT,
        "publishedAt" TIMESTAMP(3), "withdrawnAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
      );
      INSERT INTO "GovernmentEntity" VALUES ('ente', 'Vila das Araucárias', '${jurisdiction === "EXECUTIVE" ? "PREFEITURA" : "CAMARA"}');
      INSERT INTO "Secretariat" VALUES ('secretaria', 'Administração Municipal');
      INSERT INTO "BudgetUnit" VALUES ('ug', '01.01', 'Unidade Municipal', 'secretaria'), ('ug-restrita', '02.01', 'Unidade de Obras', 'secretaria');
      INSERT INTO "PlanningEntityUnit" VALUES ('binding-ug', 'ug', 'ente'), ('binding-restrita', 'ug-restrita', 'ente');
      INSERT INTO "Usuario" (id,nome) VALUES ('ana', 'Ana Paula Martins'), ('beatriz', 'Beatriz Oliveira Santos');
    `);
    for (const migration of ["20261013220000_control_audit_event_integrity", "20261014100000_control_final_reports"]) {
      await fixture.database.exec(readFileSync(`prisma/migrations-ibema/${migration}/migration.sql`, "utf8"));
    }
    return { db: fixture.connection, pg: fixture.database, close: fixture.close };
  } catch (error) { await fixture.close(); throw error; }
}

/** Drizzle preserves a database rejection in cause instead of copying its
 * message into the query error. Trigger assertions must inspect that cause. */
export function controlDatabaseErrorIncludes(expected: RegExp) {
  return (error: unknown): boolean => {
    while (error instanceof Error) {
      if (expected.test(error.message)) return true;
      error = error.cause;
    }
    return false;
  };
}

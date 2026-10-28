import { readFile, readdir } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { createLocalDrizzleDatabase } from "../../../../tests/helpers/local-drizzle-database";
import type { TaxActor } from "@/lib/tributacao";

/** Historical physical SQL only. Staging allows a legacy row to predate its
 * history trigger, or a minimal link fixture to predate full profile guards. */
export async function createPropertyDrizzleFixture(options: { before?: string } = {}) {
  const fixture = await createLocalDrizzleDatabase();
  try {
    const migrations = (await readdir("prisma/migrations-ibema", { withFileTypes: true }))
      .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    let cursor = 0;
    async function migrate(before?: string): Promise<void> {
      while (cursor < migrations.length && (before === undefined || migrations[cursor] < before)) {
        await fixture.database.exec(await readFile(`prisma/migrations-ibema/${migrations[cursor]}/migration.sql`, "utf8"));
        cursor++;
      }
    }
    await migrate(options.before);
    const db = fixture.connection.db;
    // Explicit columns also work at the legacy stages; timestamps are binds,
    // while the schema/defaults/constraints remain exclusively historical DDL.
    await db.execute(sql`INSERT INTO "ConfiguracaoPerfil" (id,codigo,nome,permissoes,"updatedAt") VALUES ('property-profile','PROPERTY_OPERATOR','Operador','{}',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "Employee" (id,name,"updatedAt") VALUES ('servidora-ana','Ana Fiscal',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "Usuario" (id,nome,email,"perfilId","employeeId","updatedAt") VALUES ('ana','Ana Fiscal','property-ana@example.invalid','property-profile','servidora-ana',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "GovernmentEntity" (id,code,name,type,"updatedAt") VALUES ('ente','PROPERTY','Município','PREFEITURA',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "Secretariat" (id,name,"updatedAt") VALUES ('secretaria','Fazenda',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "BudgetUnit" (id,code,name,"secretariatId","updatedAt") VALUES ('ug','01.01','Unidade Municipal','secretaria',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "PlanningEntityUnit" ("budgetUnitId","governmentEntityId") VALUES ('ug','ente')`);
    await db.execute(sql`INSERT INTO "FinancialYear" (id,year,"governmentEntityId",status,"startDate","endDate","updatedAt") VALUES ('ano',2026,'ente','Aberto','2026-01-01','2026-12-31',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "ResourceSource" (id,code,name,"updatedAt") VALUES ('livre','PROPERTY-000','Recursos ordinários',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "RevenueNature" (id,code,name,"updatedAt") VALUES ('receita','PROPERTY-RECEITA','Receita tributária',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "BankAccount" (id,"bankName",agency,"accountNumber","resourceSourceId","budgetUnitId","currentBalanceDecimal","updatedAt") VALUES ('banco','Banco Municipal','0001','PROPERTY-1','livre','ug',0,CURRENT_TIMESTAMP)`);
    const actor: TaxActor = { usuarioId: "ana", employeeId: "servidora-ana", allowedBudgetUnitIds: ["ug"] };
    return { ...fixture, db, actor, migrate };
  } catch (error) {
    await fixture.close();
    throw error;
  }
}

/** Drizzle retains the PostgreSQL error in cause; assert that cause rather than
 * matching only the wrapper's SQL text (which may contain unrelated strings). */
export function propertyError(pattern: RegExp): (error: unknown) => boolean {
  return error => {
    const seen = new Set<unknown>();
    while (error instanceof Error && !seen.has(error)) {
      seen.add(error);
      if (pattern.test(error.message)) return true;
      error = error.cause;
    }
    return false;
  };
}

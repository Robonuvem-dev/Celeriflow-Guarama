import { readFile, readdir } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { createLocalDrizzleDatabase } from "../../../../tests/helpers/local-drizzle-database";
import type { TaxActor } from "@/lib/tributacao";

/** Isolated Neon/WebSocket/Drizzle/PGlite, replaying physical historical SQL.
 * No generated model metadata and no connection to a municipal database. */
export async function createEconomicDrizzleFixture() {
  const fixture = await createLocalDrizzleDatabase();
  try {
    const migrations = (await readdir("prisma/migrations-ibema", { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    for (const name of migrations) await fixture.database.exec(await readFile(`prisma/migrations-ibema/${name}/migration.sql`, "utf8"));
    const db = fixture.connection.db;
    await db.execute(sql`INSERT INTO "ConfiguracaoPerfil" (id,codigo,nome,permissoes,"updatedAt") VALUES ('economic-profile','ECONOMIC_OPERATOR','Operador','{}',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "Employee" (id,name,"updatedAt") VALUES ('servidora-ana','Ana Fiscal',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "Usuario" (id,nome,email,"perfilId","employeeId","updatedAt") VALUES ('ana','Ana Fiscal','economic-ana@example.invalid','economic-profile','servidora-ana',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "Usuario" (id,nome,email,"perfilId","updatedAt") VALUES ('citizen','Titular','economic-citizen@example.invalid','economic-profile',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "GovernmentEntity" (id,code,name,type,"updatedAt") VALUES ('ente','ECONOMIC','Município','PREFEITURA',CURRENT_TIMESTAMP),('other-ente','OTHER-ECONOMIC','Outro Município','PREFEITURA',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "Secretariat" (id,name,"updatedAt") VALUES ('secretaria','Fazenda',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "BudgetUnit" (id,code,name,"secretariatId","updatedAt") VALUES ('ug','01.01','Unidade Municipal','secretaria',CURRENT_TIMESTAMP),('other-ug','02.01','Outra Unidade','secretaria',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "PlanningEntityUnit" ("budgetUnitId","governmentEntityId") VALUES ('ug','ente'),('other-ug','other-ente')`);
    await db.execute(sql`INSERT INTO "Company" (id,"corporateName",cnpj,"updatedAt") VALUES ('company','Empresa Municipal','11222333000181',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "Person" (id,"fullName",cpf,"updatedAt") VALUES ('person','Sócia Municipal','52998224725',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "Taxpayer" (id,"taxpayerType","companyId","updatedAt") VALUES ('payer','PJ','company',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "Taxpayer" (id,"taxpayerType","personId","updatedAt") VALUES ('partner','PF','person',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "Taxpayer" (id,"taxpayerType","updatedAt") VALUES ('accountant','PF',CURRENT_TIMESTAMP),('unrelated','PF',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "Tax" (id,name,"taxType","updatedAt") VALUES ('fee','Taxa de funcionamento','Taxa',CURRENT_TIMESTAMP),('iss','ISS','Imposto',CURRENT_TIMESTAMP)`);
    const actor: TaxActor = { usuarioId: "ana", employeeId: "servidora-ana", allowedBudgetUnitIds: ["ug"] };
    return { ...fixture, db, actor, migrationCount: migrations.length };
  } catch (error) { await fixture.close(); throw error; }
}

export function economicError(pattern: RegExp): (error: unknown) => boolean {
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

import { readFileSync, readdirSync } from "node:fs";
import type { FinanceActor } from "../../src/lib/financeiro";
import { createLocalDrizzleDatabase } from "./local-drizzle-database";

/** Physical accounting/asset constraints from the original SQL, in a local
 * database only. No planning execution fixture or generated ORM metadata. */
export async function createAssetsAccountingFixture(jurisdiction: "EXECUTIVE" | "LEGISLATIVE") {
  const fixture = await createLocalDrizzleDatabase();
  try {
    const migrations = readdirSync("prisma/migrations-ibema", { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    for (const migration of migrations) await fixture.database.exec(readFileSync(`prisma/migrations-ibema/${migration}/migration.sql`, "utf8"));
    await fixture.database.exec(`
      INSERT INTO "ConfiguracaoPerfil" (id,codigo,nome,permissoes,"updatedAt") VALUES ('asset-profile','ASSET_ACCOUNTING','Contabilidade patrimonial','{}',CURRENT_TIMESTAMP);
      INSERT INTO "Secretariat" (id,name,"updatedAt") VALUES ('secretaria','Administração patrimonial',CURRENT_TIMESTAMP);
      INSERT INTO "Employee" (id,name,"secretariatId","isActive","updatedAt") VALUES ('servidora-ana','Responsável patrimonial','secretaria',true,CURRENT_TIMESTAMP);
      INSERT INTO "Usuario" (id,nome,email,"perfilId","employeeId","updatedAt") VALUES ('ana','Operador patrimonial','assets@example.invalid','asset-profile','servidora-ana',CURRENT_TIMESTAMP);
      INSERT INTO "GovernmentEntity" (id,code,name,type,status,"updatedAt") VALUES ('ente','ASSET','Ente patrimonial','${jurisdiction === "EXECUTIVE" ? "PREFEITURA" : "CAMARA"}','ATIVA',CURRENT_TIMESTAMP);
      INSERT INTO "BudgetUnit" (id,code,name,"secretariatId","updatedAt") VALUES ('ug','ASSET.1','UG patrimonial','secretaria',CURRENT_TIMESTAMP);
      INSERT INTO "PlanningEntityScope" ("governmentEntityId",jurisdiction) VALUES ('ente','${jurisdiction}');
      INSERT INTO "PlanningEntityUnit" ("budgetUnitId","governmentEntityId") VALUES ('ug','ente');
      INSERT INTO "UsuarioUnidadeGestora" (id,"usuarioId","budgetUnitId") VALUES ('asset-unit-access','ana','ug');
      INSERT INTO "FinancialYear" (id,year,"governmentEntityId",status,"startDate","endDate","updatedAt") VALUES ('ano',2026,'ente','Aberto','2026-01-01','2026-12-31 23:59:59.999',CURRENT_TIMESTAMP);
      INSERT INTO "AccountingPlan" (id,code,name,type,"updatedAt") VALUES ('debito','3.1','VPD de referência','Despesa',CURRENT_TIMESTAMP),('credito','4.1','Contrapartida de referência','Receita',CURRENT_TIMESTAMP);
    `);
    const actor: FinanceActor = { usuarioId: "ana", employeeId: "servidora-ana", allowedBudgetUnitIds: ["ug"] };
    return { ...fixture, db: fixture.connection.db, actor };
  } catch (error) { await fixture.close(); throw error; }
}

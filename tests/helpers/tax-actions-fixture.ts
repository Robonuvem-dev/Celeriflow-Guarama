import { sql } from "drizzle-orm";
import { createTaxationDrizzleFixture } from "./taxation-drizzle-fixture";

/** Full installed history and production Neon/Drizzle transport, local only. */
export async function createTaxActionsFixture() {
  const fixture = await createTaxationDrizzleFixture();
  const db = fixture.connection.db;
  try {
    await db.execute(sql`SET TIME ZONE 'UTC'`);
    await db.execute(sql`INSERT INTO "ConfiguracaoPerfil" (id,codigo,nome,permissoes,"updatedAt") VALUES ('actions-profile','TAX_ACTIONS_TEST','Fiscal','{}',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "Usuario" (id,nome,email,"perfilId","updatedAt") VALUES ('actions-actor','Fiscal','tax-actions@example.invalid','actions-profile',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "Secretariat" (id,name,"updatedAt") VALUES ('actions-secretariat','Fazenda',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "GovernmentEntity" (id,code,name,type,"updatedAt") VALUES ('actions-entity','ACTIONS','Município','PREFEITURA',CURRENT_TIMESTAMP),('actions-other-entity','OTHER-ACTIONS','Outro município','PREFEITURA',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "BudgetUnit" (id,code,name,"secretariatId","updatedAt") VALUES ('actions-ug','01','Fazenda','actions-secretariat',CURRENT_TIMESTAMP),('actions-other-ug','02','Outra UG','actions-secretariat',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "PlanningEntityUnit" ("budgetUnitId","governmentEntityId") VALUES ('actions-ug','actions-entity'),('actions-other-ug','actions-other-entity')`);
    await db.execute(sql`INSERT INTO "Person" (id,"fullName",cpf,"updatedAt") VALUES ('actions-person','Pessoa Fiscal','52998224725',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "Company" (id,"corporateName",cnpj,"updatedAt") VALUES ('actions-company','Empresa Fiscal','11222333000181',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "Taxpayer" (id,"taxpayerType","personId","companyId","updatedAt") VALUES ('actions-pf','PF','actions-person',NULL,CURRENT_TIMESTAMP),('actions-pj','PJ',NULL,'actions-company',CURRENT_TIMESTAMP),('actions-null','PF',NULL,NULL,CURRENT_TIMESTAMP)`);
    return { ...fixture, db };
  } catch (error) { await fixture.close(); throw error; }
}

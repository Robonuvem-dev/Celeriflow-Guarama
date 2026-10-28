import { readFileSync, readdirSync } from "node:fs";
import { Decimal } from "../../src/db/decimal";
import { itbiDeclarations } from "../../src/db/schema/tax-itbi";
import { createLocalDrizzleDatabase } from "./local-drizzle-database";
import type { TaxActor } from "../../src/lib/tributacao";

/** Independent physical SQL history and the production Neon/Drizzle transport.
 * The only optional omission lets the legacy-history test install its trigger
 * after inserting the observed legacy position, exactly as deployment did. */
export async function createItbiDrizzleFixture(options: { fieldHistory?: boolean } = {}) {
  const local = await createLocalDrizzleDatabase();
  try {
    for (const migration of readdirSync("prisma/migrations-ibema", { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()) {
      if (options.fieldHistory === false && migration === "20261015230000_itbi_field_history") continue;
      await local.database.exec(readFileSync(`prisma/migrations-ibema/${migration}/migration.sql`, "utf8"));
    }
    await local.database.exec(`
      INSERT INTO "ConfiguracaoPerfil" (id,codigo,nome,permissoes,"updatedAt") VALUES ('itbi-profile','ITBI_TEST','Operador ITBI','{}',CURRENT_TIMESTAMP);
      INSERT INTO "Employee" (id,name,"isActive","updatedAt") VALUES ('servidora-ana','Ana Paula Martins',true,CURRENT_TIMESTAMP);
      INSERT INTO "Usuario" (id,nome,email,"perfilId","employeeId","firebaseUid","updatedAt") VALUES ('ana','Ana Paula Martins','ana-itbi@example.invalid','itbi-profile','servidora-ana','itbi-worker',CURRENT_TIMESTAMP);
      INSERT INTO "Usuario" (id,nome,email,"perfilId","updatedAt") VALUES ('citizen','Tabelião','citizen-itbi@example.invalid','itbi-profile',CURRENT_TIMESTAMP);
      INSERT INTO "ConfiguracaoModulo" (id,nome,codigo,ativo,"updatedAt") VALUES ('itbi-module','Tributação','TRIBUTACAO',true,CURRENT_TIMESTAMP) ON CONFLICT (codigo) DO UPDATE SET ativo=true;
      INSERT INTO "UsuarioModulo" (id,"usuarioId","moduloId","canView","canEdit") SELECT 'itbi-user-module','ana',id,true,true FROM "ConfiguracaoModulo" WHERE codigo='TRIBUTACAO';
      INSERT INTO "GovernmentEntity" (id,code,name,type,status,"updatedAt") VALUES ('ente','ITBI','Prefeitura ITBI','PREFEITURA','ATIVA',CURRENT_TIMESTAMP);
      INSERT INTO "Secretariat" (id,name,"updatedAt") VALUES ('secretaria','Tributação',CURRENT_TIMESTAMP);
      INSERT INTO "BudgetUnit" (id,code,name,"secretariatId","updatedAt") VALUES ('ug','01','UG tributária','secretaria',CURRENT_TIMESTAMP),('other-ug','02','UG restrita','secretaria',CURRENT_TIMESTAMP);
      INSERT INTO "PlanningEntityScope" ("governmentEntityId",jurisdiction) VALUES ('ente','EXECUTIVE');
      INSERT INTO "PlanningEntityUnit" ("budgetUnitId","governmentEntityId") VALUES ('ug','ente'),('other-ug','ente');
      INSERT INTO "UsuarioUnidadeGestora" (id,"usuarioId","budgetUnitId") VALUES ('itbi-user-unit','ana','ug');
      INSERT INTO "FinancialYear" (id,year,"governmentEntityId",status,"startDate","endDate","updatedAt") VALUES ('ano',2026,'ente','Aberto','2026-01-01','2026-12-31 23:59:59.999',CURRENT_TIMESTAMP);
      INSERT INTO "ResourceSource" (id,code,name,"updatedAt") VALUES ('livre','ITBI.0','Recursos próprios',CURRENT_TIMESTAMP);
      INSERT INTO "RevenueNature" (id,code,name,"updatedAt") VALUES ('receita','ITBI.1','Receita ITBI',CURRENT_TIMESTAMP);
      INSERT INTO "AccountingPlan" (id,code,name,type,"updatedAt") VALUES ('itbi-bank-account','ITBI.1','Disponibilidade','Ativo',CURRENT_TIMESTAMP);
      INSERT INTO "BankAccount" (id,"bankName",agency,"accountNumber","resourceSourceId","budgetUnitId","accountingPlanId","updatedAt") VALUES ('banco','Banco isolado','0001','ITBI-1','livre','ug','itbi-bank-account',CURRENT_TIMESTAMP);
      INSERT INTO "Tax" (id,name,"taxType","updatedAt") VALUES ('ITBI','ITBI','Imposto',CURRENT_TIMESTAMP);
      INSERT INTO "TaxFinancialMapping" (id,"taxId","revenueNatureId","resourceSourceId","defaultBankAccountId","updatedAt") VALUES ('itbi-mapping','ITBI','receita','livre','banco',CURRENT_TIMESTAMP);
      INSERT INTO "Department" (id,name,"secretariatId","isActive","updatedAt") VALUES ('itbi-department','Tributação','secretaria',true,CURRENT_TIMESTAMP);
      INSERT INTO "ProcessType" (id,name,"initialDepartmentId","isActive","updatedAt") VALUES ('process-type','ITBI','itbi-department',true,CURRENT_TIMESTAMP);
      INSERT INTO "Subject" (id,name,"processTypeId","isActive","updatedAt") VALUES ('subject','Transmissão','process-type',true,CURRENT_TIMESTAMP);
      INSERT INTO "Person" (id,"fullName",cpf,"updatedAt") VALUES ('seller-person','Transmitente','12345678901',CURRENT_TIMESTAMP),('buyer-person','Adquirente','98765432100',CURRENT_TIMESTAMP),('notary-person','Tabelionato','12345678902',CURRENT_TIMESTAMP);
      INSERT INTO "Taxpayer" (id,"taxpayerType","personId","updatedAt") VALUES ('seller','PF','seller-person',CURRENT_TIMESTAMP),('buyer','PF','buyer-person',CURRENT_TIMESTAMP),('notary','PF','notary-person',CURRENT_TIMESTAMP);
      INSERT INTO "ItbiTransactionType" (id,code,name,rate,"requiresDebtClearance","updatedAt") VALUES ('type','VENDA','Compra e venda',2,false,CURRENT_TIMESTAMP);
      INSERT INTO "RealEstate" (id,"municipalInsc","taxpayerId","landArea","builtArea",status,"updatedAt") VALUES ('property','ITBI-PROPERTY','seller',100,0,'Ativo',CURRENT_TIMESTAMP);
    `);
    const actor: TaxActor = { usuarioId: "ana", employeeId: "servidora-ana", allowedBudgetUnitIds: ["ug"] };
    return { ...local, db: local.connection.db, actor };
  } catch (error) { await local.close(); throw error; }
}

export async function seedItbiDeclaration(f: Awaited<ReturnType<typeof createItbiDrizzleFixture>>, id: string, data: Partial<typeof itbiDeclarations.$inferInsert> = {}) {
  const [row] = await f.db.insert(itbiDeclarations).values({ id, declarationNumber: `ITBI-${id}`, transactionTypeId: "type", realEstateId: "property", transmittedFraction: new Decimal(100), declaredPropertyValue: new Decimal(1000), taxableBase: new Decimal(1000), appliedRate: new Decimal(2), taxAmount: new Decimal(20), calculationSnapshot: { governmentEntityId: "ente", budgetUnitId: "ug" }, createdByUsuarioId: "ana", ...data }).returning();
  return row;
}

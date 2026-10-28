import { createTaxationDrizzleFixture } from "./taxation-drizzle-fixture";
import type { TaxActor } from "../../src/lib/tributacao";

/** Explicit scenario seed over the complete historical schema, with real FKs. */
export async function createTaxResidualFixture(year = 2026, jurisdiction: "EXECUTIVE" | "LEGISLATIVE" = "EXECUTIVE") {
  const local = await createTaxationDrizzleFixture();
  try {
    const db = local.connection.db;
    if (!Number.isInteger(year)) throw new Error("Exercício inválido.");
    await local.database.exec(`
      INSERT INTO "ConfiguracaoPerfil" (id,codigo,nome,permissoes,"updatedAt") VALUES ('operator-profile','RESIDUAL','Operador','{}',CURRENT_TIMESTAMP);
      INSERT INTO "Employee" (id,name,"isActive","updatedAt") VALUES ('servidora-ana','Ana',true,CURRENT_TIMESTAMP);
      INSERT INTO "Usuario" (id,nome,email,"perfilId","employeeId","updatedAt") VALUES ('ana','Ana','ana@example.org','operator-profile','servidora-ana',CURRENT_TIMESTAMP);
      INSERT INTO "GovernmentEntity" (id,code,name,type,status,"updatedAt") VALUES ('ente','ENTE','Ente municipal','${jurisdiction === "EXECUTIVE" ? "PREFEITURA" : "CAMARA"}','ATIVA',CURRENT_TIMESTAMP);
      INSERT INTO "Secretariat" (id,name,"updatedAt") VALUES ('secretaria','Fazenda',CURRENT_TIMESTAMP);
      INSERT INTO "BudgetUnit" (id,code,name,"secretariatId","updatedAt") VALUES ('ug','01','UG autorizada','secretaria',CURRENT_TIMESTAMP),('ug-restrita','02','UG restrita','secretaria',CURRENT_TIMESTAMP);
      INSERT INTO "PlanningEntityScope" ("governmentEntityId",jurisdiction) VALUES ('ente','${jurisdiction}');
      INSERT INTO "PlanningEntityUnit" ("budgetUnitId","governmentEntityId") VALUES ('ug','ente'),('ug-restrita','ente');
      INSERT INTO "FinancialYear" (id,year,"governmentEntityId",status,"startDate","endDate","updatedAt") VALUES ('ano',${year},'ente','Aberto','${year}-01-01','${year}-12-31 23:59:59.999',CURRENT_TIMESTAMP);
      INSERT INTO "Company" (id,"corporateName",cnpj,"updatedAt") VALUES ('empresa','Araucárias Serviços Municipais Ltda.','11222333000181',CURRENT_TIMESTAMP);
      INSERT INTO "Taxpayer" (id,"taxpayerType","updatedAt") VALUES ('contribuinte','PF',CURRENT_TIMESTAMP);
      INSERT INTO "ResourceSource" (id,code,name,"updatedAt") VALUES ('livre','15000000','Recursos próprios',CURRENT_TIMESTAMP);
      INSERT INTO "RevenueNature" (id,code,name,"updatedAt") VALUES ('receita','1.1.1','Receita tributária',CURRENT_TIMESTAMP);
      INSERT INTO "AccountingPlan" (id,code,name,type,"updatedAt") VALUES ('debito','1.1.1.1.1.00.01','Débito','Ativo',CURRENT_TIMESTAMP),('credito','2.1.1.1.1.00.01','Crédito','Passivo',CURRENT_TIMESTAMP);
      INSERT INTO "BankAccount" (id,"bankName",agency,"accountNumber","resourceSourceId","budgetUnitId","accountingPlanId","updatedAt") VALUES ('banco','Banco Municipal','0001','1000-1','livre','ug','debito',CURRENT_TIMESTAMP);
      INSERT INTO "AccountingEventCatalog" (id,code,name,"updatedAt") VALUES ('collection','RECEITA_ARRECADADA','Arrecadação',CURRENT_TIMESTAMP),('reversal','RECEITA_ESTORNADA','Estorno',CURRENT_TIMESTAMP);
      INSERT INTO "AccountingPostingRule" (id,"eventId","debitAccountId","creditAccountId","isReference","updatedAt") VALUES ('collection-rule','collection','debito','credito',true,CURRENT_TIMESTAMP),('reversal-rule','reversal','credito','debito',true,CURRENT_TIMESTAMP);
    `);
    const actor: TaxActor = { usuarioId: "ana", employeeId: "servidora-ana", allowedBudgetUnitIds: ["ug"] };
    return { ...local, db, actor };
  } catch (error) { await local.close(); throw error; }
}

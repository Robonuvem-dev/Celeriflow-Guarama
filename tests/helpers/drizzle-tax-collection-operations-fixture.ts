import { readFileSync, readdirSync } from "node:fs";
import { eq } from "drizzle-orm";
import { Decimal } from "../../src/db/decimal";
import { taxAssessments, taxGuides } from "../../src/db/schema/taxation-core";
import { accountingPlans } from "../../src/db/schema/finance-accounting";
import { planningCatalogVersions, planningCatalogEntries } from "../../src/db/schema/planning-catalog";
import type { TaxActor } from "../../src/lib/tributacao";
import { createLocalDrizzleDatabase } from "./local-drizzle-database";

/** Full original SQL history; production Neon/Drizzle transport over loopback.
 * Await close() before another fixture: Neon transport settings are global. */
export async function createTaxCollectionOperationsFixture(jurisdiction: "EXECUTIVE" | "LEGISLATIVE" = "EXECUTIVE") {
  const local = await createLocalDrizzleDatabase();
  try {
    const history = readdirSync("prisma/migrations-ibema", { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    for (const name of history) await local.database.exec(readFileSync(`prisma/migrations-ibema/${name}/migration.sql`, "utf8"));
    await local.database.exec(`
      INSERT INTO "ConfiguracaoPerfil" (id,codigo,nome,permissoes,"updatedAt") VALUES ('co-profile','CO_OPERATOR','Operador fiscal','{}',CURRENT_TIMESTAMP);
      INSERT INTO "Employee" (id,name,"isActive","updatedAt") VALUES ('co-employee','Responsável fiscal',true,CURRENT_TIMESTAMP);
      INSERT INTO "Usuario" (id,nome,email,"perfilId","employeeId","updatedAt") VALUES ('co-user','Operador fiscal','collection@example.invalid','co-profile','co-employee',CURRENT_TIMESTAMP);
      INSERT INTO "GovernmentEntity" (id,code,name,type,status,"updatedAt") VALUES ('co-entity','CO','Ente municipal','${jurisdiction === "EXECUTIVE" ? "PREFEITURA" : "CAMARA"}','ATIVA',CURRENT_TIMESTAMP),('co-other','CX','Outro ente','PREFEITURA','ATIVA',CURRENT_TIMESTAMP);
      INSERT INTO "Secretariat" (id,name,"updatedAt") VALUES ('co-secretariat','Fazenda',CURRENT_TIMESTAMP);
      INSERT INTO "BudgetUnit" (id,code,name,"secretariatId","updatedAt") VALUES ('co-unit','CO.1','UG fiscal','co-secretariat',CURRENT_TIMESTAMP),('co-other-unit','CX.1','Outra UG','co-secretariat',CURRENT_TIMESTAMP);
      INSERT INTO "PlanningEntityScope" ("governmentEntityId",jurisdiction) VALUES ('co-entity','${jurisdiction}'),('co-other','EXECUTIVE');
      INSERT INTO "PlanningEntityUnit" ("budgetUnitId","governmentEntityId") VALUES ('co-unit','co-entity'),('co-other-unit','co-other');
      INSERT INTO "FinancialYear" (id,year,"governmentEntityId",status,"startDate","endDate","updatedAt") VALUES ('co-year',2026,'co-entity','Aberto','2026-01-01','2026-12-31 23:59:59.999',CURRENT_TIMESTAMP);
      INSERT INTO "Person" (id,"fullName",cpf,"updatedAt") VALUES ('co-person','Contribuinte pessoa física','12345678909',CURRENT_TIMESTAMP);
      INSERT INTO "Company" (id,"corporateName",cnpj,"updatedAt") VALUES ('co-company','Banco Municipal Ltda.','11222333000181',CURRENT_TIMESTAMP);
      INSERT INTO "Taxpayer" (id,"taxpayerType","personId","updatedAt") VALUES ('co-pf','PF','co-person',CURRENT_TIMESTAMP);
      INSERT INTO "Taxpayer" (id,"taxpayerType","companyId","updatedAt") VALUES ('co-pj','PJ','co-company',CURRENT_TIMESTAMP);
      INSERT INTO "Taxpayer" (id,"taxpayerType",status,"updatedAt") VALUES ('co-inactive','PJ','Inativo',CURRENT_TIMESTAMP);
      INSERT INTO "Tax" (id,name,"taxType","updatedAt") VALUES ('co-tax','Tributo municipal','Imposto',CURRENT_TIMESTAMP);
      INSERT INTO "EconomicRegistration" (id,"municipalInsc","taxRegime","taxpayerId","updatedAt") VALUES ('co-registration','CO.001','Normal','co-pj',CURRENT_TIMESTAMP);
      INSERT INTO "Document" (id,title,"documentType","fileUrl",status,"updatedAt") VALUES ('co-document','Documento fiscal','FISCAL','fixture://document','Válido',CURRENT_TIMESTAMP),('co-document-2','Documento complementar','FISCAL','fixture://document-2','Válido',CURRENT_TIMESTAMP);
      INSERT INTO "ResourceSource" (id,code,name,"updatedAt") VALUES ('co-source','CO.0','Recursos próprios',CURRENT_TIMESTAMP);
      INSERT INTO "RevenueNature" (id,code,name,"updatedAt") VALUES ('co-nature','CO.1','Receita tributária',CURRENT_TIMESTAMP);
      INSERT INTO "ProcessType" (id,name,"updatedAt") VALUES ('co-process-type','Fiscalização',CURRENT_TIMESTAMP);
      INSERT INTO "Subject" (id,name,"processTypeId","updatedAt") VALUES ('co-subject','ISS bancário','co-process-type',CURRENT_TIMESTAMP);
      INSERT INTO "Process" (id,"protocolNumber","processTypeId","subjectId","updatedAt") VALUES ('co-process','CO-2026-1','co-process-type','co-subject',CURRENT_TIMESTAMP);
    `);
    const db = local.connection.db;
    const accountIds = ["co-right", "co-vpa", "co-deduction", "co-loss", "co-cash"];
    await db.insert(accountingPlans).values(accountIds.map((id, index) => ({ id, code: `CO.${index + 1}`, name: id, type: [0, 4].includes(index) ? "Ativo" : index === 1 ? "VPA" : "VPD" })));
    await db.insert(planningCatalogVersions).values({ id: "co-catalog", year: 2026, label: "Edição fiscal municipal", normativeReference: "Histórico original isolado", sourceHash: "co-catalog-v1", status: "DRAFT", createdById: "co-user" });
    await db.insert(planningCatalogEntries).values(accountIds.map((id, index) => ({ id: `co-classification:${id}`, versionId: "co-catalog", kind: "ACCOUNT", degree: 7, code: `CO.${index + 1}`, name: id, canonicalId: id, attributes: { operational: true, pocOnly: false, postingAllowed: true, informationNature: "P", balanceNature: index === 1 ? "C" : "D", effectiveFrom: "2026-01-01", effectiveUntil: "2026-12-31" } })));
    await db.update(planningCatalogVersions).set({ status: "PUBLISHED" }).where(eq(planningCatalogVersions.id, "co-catalog"));
    await local.database.exec(`
      INSERT INTO "BankAccount" (id,"bankName",agency,"accountNumber","resourceSourceId","budgetUnitId","accountingPlanId","updatedAt") VALUES ('co-bank','Banco municipal','0001','CO-1','co-source','co-unit','co-cash',CURRENT_TIMESTAMP);
      INSERT INTO "TaxFinancialMapping" (id,"taxId","revenueNatureId","resourceSourceId","defaultBankAccountId","updatedAt") VALUES ('co-mapping','co-tax','co-nature','co-source','co-bank',CURRENT_TIMESTAMP);
    `);
    const actor: TaxActor = { usuarioId: "co-user", employeeId: "co-employee", allowedBudgetUnitIds: ["co-unit"] };
    const scope = { budgetUnitId: "co-unit", governmentEntityId: "co-entity" };
    const assessment = async (id: string, amount = "100.01", taxpayerId = "co-pj") => {
      const [row] = await db.insert(taxAssessments).values({ id, assessmentNumber: id, year: 2026, competence: new Date("2026-01-15T12:34:56.789Z"), taxId: "co-tax", taxpayerId, originalValue: Number(amount), originalValueDecimal: new Decimal(amount), finalValueDecimal: new Decimal(amount), calculationSnapshot: { ...scope, nested: { date: "not-a-date", amount: "001.00", nullable: null } }, status: "Lançado" }).returning();
      return row;
    };
    const guide = async (id: string, assessmentId: string, amount = "100.01") => {
      const [row] = await db.insert(taxGuides).values({ id, assessmentId, totalValue: Number(amount), totalValueDecimal: new Decimal(amount), dueDate: new Date("2026-12-31T23:59:59.999Z") }).returning();
      return row;
    };
    return { ...local, db, actor, scope, assessment, guide, history };
  } catch (error) { await local.close(); throw error; }
}

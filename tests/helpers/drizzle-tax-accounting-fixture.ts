import { readFileSync, readdirSync } from "node:fs";
import { eq } from "drizzle-orm";
import { Decimal } from "../../src/db/decimal";
import { withDatabaseTransaction } from "../../src/db/transaction";
import { accountingEntries, accountingEvents, accountingPlans, accountingRules, accountingTransactions } from "../../src/db/schema/finance-accounting";
import { planningCatalogEntries, planningCatalogVersions } from "../../src/db/schema/planning-catalog";
import { taxAssessments, taxGuides } from "../../src/db/schema/taxation-core";
import { taxPayments } from "../../src/db/schema/tax-accounting";
import type { FinanceActor } from "../../src/lib/financeiro";
import { createLocalDrizzleDatabase } from "./local-drizzle-database";

export const taxAccountingScope = { governmentEntityId: "ta-entity", budgetUnitId: "ta-unit" };
export const taxAccountingDate = new Date("2026-01-31T12:34:56.789Z");

/** Original historical SQL, real Neon transport/pool (5), local server (10).
 * No Tax owner's fixture, generated schema, remote DATABASE_URL or mock ORM. */
export async function createDrizzleTaxAccountingFixture(jurisdiction: "EXECUTIVE" | "LEGISLATIVE" = "EXECUTIVE") {
  const fixture = await createLocalDrizzleDatabase();
  try {
    for (const name of readdirSync("prisma/migrations-ibema", { withFileTypes: true }).filter(item => item.isDirectory()).map(item => item.name).sort()) {
      await fixture.database.exec(readFileSync(`prisma/migrations-ibema/${name}/migration.sql`, "utf8"));
    }
    await fixture.database.exec(`
      INSERT INTO "ConfiguracaoPerfil" (id,codigo,nome,permissoes,"updatedAt") VALUES ('ta-profile','TA_ACCOUNTING','Contabilidade tributária','{}',CURRENT_TIMESTAMP);
      INSERT INTO "Employee" (id,name,"isActive","updatedAt") VALUES ('ta-employee','Responsável contábil',true,CURRENT_TIMESTAMP);
      INSERT INTO "Usuario" (id,nome,email,"perfilId","employeeId","updatedAt") VALUES ('ta-user','Operador tributário','ta@example.invalid','ta-profile','ta-employee',CURRENT_TIMESTAMP);
      INSERT INTO "GovernmentEntity" (id,code,name,type,status,"updatedAt") VALUES ('ta-entity','TA','Ente contábil','${jurisdiction === "EXECUTIVE" ? "PREFEITURA" : "CAMARA"}','ATIVA',CURRENT_TIMESTAMP),('ta-other','TB','Outro ente','PREFEITURA','ATIVA',CURRENT_TIMESTAMP);
      INSERT INTO "Secretariat" (id,name,"updatedAt") VALUES ('ta-secretariat','Administração tributária',CURRENT_TIMESTAMP);
      INSERT INTO "BudgetUnit" (id,code,name,"secretariatId","updatedAt") VALUES ('ta-unit','TA.1','UG autorizada','ta-secretariat',CURRENT_TIMESTAMP),('ta-restricted','TA.2','UG restrita','ta-secretariat',CURRENT_TIMESTAMP),('ta-other-unit','TB.1','Outro ente','ta-secretariat',CURRENT_TIMESTAMP);
      INSERT INTO "PlanningEntityScope" ("governmentEntityId",jurisdiction) VALUES ('ta-entity','${jurisdiction}'),('ta-other','EXECUTIVE');
      INSERT INTO "PlanningEntityUnit" ("budgetUnitId","governmentEntityId") VALUES ('ta-unit','ta-entity'),('ta-restricted','ta-entity'),('ta-other-unit','ta-other');
      INSERT INTO "FinancialYear" (id,year,"governmentEntityId",status,"startDate","endDate","updatedAt") VALUES ('ta-year',2026,'ta-entity','Aberto','2026-01-01','2026-12-31 23:59:59.999',CURRENT_TIMESTAMP);
      INSERT INTO "Person" (id,"fullName","updatedAt") VALUES ('ta-person','Contribuinte',CURRENT_TIMESTAMP);
      INSERT INTO "Taxpayer" (id,"taxpayerType","personId","updatedAt") VALUES ('ta-payer','PF','ta-person',CURRENT_TIMESTAMP);
      INSERT INTO "Tax" (id,name,"taxType","updatedAt") VALUES ('ta-iptu','IPTU','Imposto',CURRENT_TIMESTAMP),('ta-iss','ISS','Imposto',CURRENT_TIMESTAMP);
      INSERT INTO "ResourceSource" (id,code,name,"updatedAt") VALUES ('ta-source','TA.0','Recursos próprios',CURRENT_TIMESTAMP);
      INSERT INTO "RevenueNature" (id,code,name,"updatedAt") VALUES ('ta-nature','TA.1','Receita tributária',CURRENT_TIMESTAMP);
      INSERT INTO "Document" (id,title,"documentType","fileUrl",status,"updatedAt") VALUES ('ta-proof','Comprovante de restituição','Comprovante','fixture://proof','Válido',CURRENT_TIMESTAMP);
    `);
    const db = fixture.connection.db;
    const accountIds = ["ta-right", "ta-vpa", "ta-deduction", "ta-loss", "ta-debt-right", "ta-debt-loss", "ta-cash", "ta-liability"];
    await db.insert(accountingPlans).values(accountIds.map((id, index) => ({ id, code: `TA.${index + 1}`, name: id, type: index === 7 ? "Passivo" : [0, 4, 6].includes(index) ? "Ativo" : [3, 5].includes(index) ? "VPD" : "VPA" })));
    await db.insert(planningCatalogVersions).values({ id: "ta-catalog", year: 2026, label: "Edição municipal isolada", normativeReference: "Fixture de histórico original", sourceHash: "ta-catalog-v1", status: "DRAFT", createdById: "ta-user" });
    await db.insert(planningCatalogEntries).values(accountIds.map((id, index) => ({ id: `ta-classification:${id}`, versionId: "ta-catalog", kind: "ACCOUNT", degree: 7, code: `TA.${index + 1}`, name: id, canonicalId: id, attributes: { operational: true, pocOnly: false, postingAllowed: true, informationNature: "P", balanceNature: [1, 7].includes(index) ? "C" : "D", effectiveFrom: "2026-01-01", effectiveUntil: "2026-12-31" } })));
    await db.update(planningCatalogVersions).set({ status: "PUBLISHED" }).where(eq(planningCatalogVersions.id, "ta-catalog"));
    await fixture.database.exec(`
      INSERT INTO "BankAccount" (id,"bankName",agency,"accountNumber","resourceSourceId","budgetUnitId","accountingPlanId","updatedAt") VALUES ('ta-bank','Banco isolado','0001','TA-1','ta-source','ta-unit','ta-cash',CURRENT_TIMESTAMP);
      INSERT INTO "TaxFinancialMapping" (id,"taxId","revenueNatureId","resourceSourceId","defaultBankAccountId","updatedAt") VALUES ('ta-mapping','ta-iptu','ta-nature','ta-source','ta-bank',CURRENT_TIMESTAMP);
    `);
    const rules = [
      { code: "TAX_COLLECTION_EXCESS", debitAccountId: "ta-cash", creditAccountId: "ta-liability" },
      { code: "TAX_CREDIT_REFUNDED", debitAccountId: "ta-liability", creditAccountId: "ta-cash" },
      { code: "RECEITA_ARRECADADA", debitAccountId: "ta-cash", creditAccountId: "ta-vpa" },
    ];
    for (const rule of rules) {
      await db.insert(accountingEvents).values({ id: `ta-event:${rule.code}`, code: rule.code, name: rule.code });
      await db.insert(accountingRules).values({ id: `ta-rule:${rule.code}`, eventId: `ta-event:${rule.code}`, debitAccountId: rule.debitAccountId, creditAccountId: rule.creditAccountId, isReference: false });
    }
    const actor: FinanceActor = { usuarioId: "ta-user", employeeId: "ta-employee", allowedBudgetUnitIds: ["ta-unit"] };
    const profileInput = { taxId: "ta-iptu", budgetUnitId: "ta-unit", catalogVersionId: "ta-catalog", receivableAccountId: "ta-right", revenueAccountId: "ta-vpa", deductionAccountId: "ta-deduction", lossAccountId: "ta-loss", effectiveFrom: new Date("2026-01-01T00:00:00.000Z"), effectiveUntil: new Date("2026-12-31T23:59:59.999Z"), reason: "Configuração municipal fundamentada", idempotencyKey: "ta-profile-v1" };
    const assessment = async (id: string, value = "100.00", taxId = "ta-iptu") => {
      const [row] = await db.insert(taxAssessments).values({ id, year: 2026, competence: taxAccountingDate, assessmentNumber: id, originalValue: Number(value), originalValueDecimal: new Decimal(value), finalValueDecimal: new Decimal(value), discountValueDecimal: new Decimal(0), taxId, taxpayerId: "ta-payer", status: "Lançado", calculationSnapshot: taxAccountingScope }).returning();
      return row;
    };
    const guide = async (id: string, assessmentId: string, value = "100.00") => {
      const [row] = await db.insert(taxGuides).values({ id, assessmentId, totalValue: Number(value), totalValueDecimal: new Decimal(value), dueDate: new Date("2026-12-31") }).returning();
      return row;
    };
    const payment = async (id: string, guideId: string, value = "100.00") => {
      const [row] = await db.insert(taxPayments).values({ id, guideId, idempotencyKey: `key:${id}`, paymentDate: taxAccountingDate, amountPaid: Number(value), amountPaidDecimal: new Decimal(value), paymentMethod: "Manual", bankAccountId: "ta-bank" }).returning();
      return row;
    };
    const seedPosting = async (id: string, sourceType: string, sourceId: string, value: string, options: { budgetUnitId?: string; reversalOfId?: string; sourceModule?: string } = {}) => withDatabaseTransaction(fixture.connection, async tx => {
      await tx.insert(accountingTransactions).values({ id, date: taxAccountingDate, financialYearId: "ta-year", ...taxAccountingScope, history: id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, status: "POSTADO", sourceModule: "TRIBUTACAO", sourceType, sourceId, eventType: id, ...options });
      await tx.insert(accountingEntries).values(["ta-right", "ta-vpa"].map((accountId, index) => ({ id: `${id}:${index}`, transactionId: id, accountId, date: taxAccountingDate, type: index ? "Crédito" : "Débito", value: Number(value), valueDecimal: new Decimal(value), history: id, authorId: "ta-employee", classificationSnapshot: { externalCode: index ? "TA.C" : "TA.D", nested: { amount: "001.00", date: "not-a-date" } } })));
    });
    return { ...fixture, db, actor, profileInput, assessment, guide, payment, seedPosting };
  } catch (error) { await fixture.close(); throw error; }
}

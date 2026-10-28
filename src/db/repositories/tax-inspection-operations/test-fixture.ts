import { readdir, readFile } from "node:fs/promises";
import { eq, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import { inspectionActivities, inspectionCredentials } from "@/db/schema/tax-inspection-operations";
import { taxAssessments, taxGuides } from "@/db/schema/taxation-core";
import { accountingPlans } from "@/db/schema/finance-accounting";
import { planningCatalogEntries, planningCatalogVersions } from "@/db/schema/planning-catalog";
import type { InspectionOperationsActor } from "@/lib/contracts/tax-inspection-operations";
import { createLocalDrizzleDatabase } from "../../../../tests/helpers/local-drizzle-database";

/** Only physical historical SQL creates the database. No generated metadata,
 * municipal connection, shared legacy fixture or synthetic baseline tables. */
export async function createInspectionOperationsFixture() {
  const fixture = await createLocalDrizzleDatabase();
  // PGlite has one backend: concurrent API calls queue through the real pool.
  // This verifies replay, not contention across independent PostgreSQL sessions.
  fixture.connection.pool.options.max = 1;
  try {
    const migrations = (await readdir("prisma/migrations-ibema", { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    if (migrations.length !== 156) throw new Error(`Histórico S4 divergente: esperadas 156 migrações, recebidas ${migrations.length}.`);
    for (const name of migrations) await fixture.database.exec(await readFile(`prisma/migrations-ibema/${name}/migration.sql`, "utf8"));
    const db = fixture.connection.db;
    await db.execute(sql`INSERT INTO "ConfiguracaoPerfil" (id,codigo,nome,permissoes,"updatedAt") VALUES ('s4-profile','S4_OPERATOR','Fiscal S4','{}',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "Employee" (id,name,"updatedAt") VALUES ('s4-employee','Fiscal S4',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "Usuario" (id,nome,email,"perfilId","employeeId","updatedAt") VALUES ('s4-user','Fiscal S4','s4@example.invalid','s4-profile','s4-employee',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "GovernmentEntity" (id,code,name,type,"updatedAt") VALUES ('s4-ente','S4-EXE','Executivo S4','PREFEITURA',CURRENT_TIMESTAMP),('s4-other-ente','S4-LEG','Legislativo S4','CAMARA',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "Secretariat" (id,name,"updatedAt") VALUES ('s4-secretariat','Fazenda S4',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "BudgetUnit" (id,code,name,"secretariatId","updatedAt") VALUES ('s4-ug','S4.01','UG S4','s4-secretariat',CURRENT_TIMESTAMP),('s4-other-ug','S4.02','Outra UG S4','s4-secretariat',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "PlanningEntityUnit" ("budgetUnitId","governmentEntityId") VALUES ('s4-ug','s4-ente'),('s4-other-ug','s4-other-ente')`);
    await db.execute(sql`INSERT INTO "Taxpayer" (id,"taxpayerType","updatedAt") VALUES ('s4-provider','PJ',CURRENT_TIMESTAMP),('s4-taker','PF',CURRENT_TIMESTAMP),('s4-other-provider','PJ',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "EconomicRegistration" (id,"municipalInsc","taxpayerId","updatedAt") VALUES ('s4-registration','S4-REG','s4-provider',CURRENT_TIMESTAMP),('s4-other-registration','S4-OTHER-REG','s4-other-provider',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "Tax" (id,name,"taxType","updatedAt") VALUES ('s4-tax','ISS S4','Imposto',CURRENT_TIMESTAMP),('s4-other-tax','Outro ISS S4','Imposto',CURRENT_TIMESTAMP)`);
    await db.insert(inspectionActivities).values([{ id: "s4-activity", taxId: "s4-tax", code: "S4-01", name: "Serviço S4", issRate: new Decimal("5.123456") }, { id: "s4-other-activity", taxId: "s4-other-tax", code: "S4-02", name: "Outro serviço S4", issRate: new Decimal("2") }]);
    await db.execute(sql`INSERT INTO "ResourceSource" (id,code,name,"updatedAt") VALUES ('s4-source','S4-LIVRE','Fonte S4',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "RevenueNature" (id,code,name,"updatedAt") VALUES ('s4-nature','S4-ISS','ISS S4',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "BankAccount" (id,"bankName",agency,"accountNumber","budgetUnitId","resourceSourceId","updatedAt") VALUES ('s4-bank','Banco S4','01','S4-01','s4-ug','s4-source',CURRENT_TIMESTAMP),('s4-other-bank','Banco S4','01','S4-02','s4-other-ug','s4-source',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "TaxFinancialMapping" (id,"taxId","revenueNatureId","resourceSourceId","defaultBankAccountId","updatedAt") VALUES ('s4-mapping','s4-tax','s4-nature','s4-source','s4-bank',CURRENT_TIMESTAMP),('s4-other-mapping','s4-other-tax','s4-nature','s4-source','s4-other-bank',CURRENT_TIMESTAMP)`);
    const year = new Date().getUTCFullYear();
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
    await db.execute(sql`INSERT INTO "FinancialYear" (id,year,status,"governmentEntityId","startDate","endDate","updatedAt") VALUES ('s4-year',${year},'Aberto','s4-ente',${start},${end},CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "TaxParameter" (id,"taxId",code,name,"calculationType",configuration,"effectiveFrom","effectiveUntil","updatedAt") VALUES ('s4-parameter','s4-tax','S4-PARAM','ISS S4','PERCENTUAL','{"nfseCancellationDays":7}'::jsonb,${start},${end},CURRENT_TIMESTAMP)`);
    const actor: InspectionOperationsActor = { usuarioId: "s4-user", employeeId: "s4-employee", allowedBudgetUnitIds: ["s4-ug"] };
    await db.insert(inspectionCredentials).values({ id: "s4-enabled", taxpayerId: "s4-provider", economicRegistrationId: "s4-registration", serviceActivityId: "s4-activity", status: "HABILITADO", termsAcceptedAt: start, enabledAt: start, createdByUsuarioId: actor.usuarioId });
    const scope = { governmentEntityId: "s4-ente", budgetUnitId: "s4-ug" };
    async function assessment(id: string, amount = "5.12", extra: Partial<typeof taxAssessments.$inferInsert> = {}) {
      return (await db.insert(taxAssessments).values({ id, year, competence: new Date(), taxId: "s4-tax", taxpayerId: "s4-provider", economicRegistrationId: "s4-registration", originalValue: Number(amount), originalValueDecimal: new Decimal(amount), finalValueDecimal: new Decimal(amount), rate: new Decimal("5.123456"), status: "Lançado", calculationSnapshot: scope, ...extra }).returning())[0];
    }
    async function guide(id: string, assessmentId: string, amount = "5.12") {
      return (await db.insert(taxGuides).values({ id, assessmentId, guideNumber: id, totalValue: Number(amount), totalValueDecimal: new Decimal(amount), dueDate: end, status: "Emitida" }).returning())[0];
    }
    async function accounting() {
      const accounts = [{ id: "s4-right", code: "1.1.2.1.1.01.01", name: "Direito S4", type: "Ativo" }, { id: "s4-vpa", code: "4.1.1.2.1.01.01", name: "VPA S4", type: "VPA" }, { id: "s4-deduction", code: "3.6.5.1.1.01.01", name: "Dedução S4", type: "VPD" }, { id: "s4-loss", code: "3.6.5.1.1.01.02", name: "Extinção S4", type: "VPD" }];
      await db.insert(accountingPlans).values(accounts);
      await db.insert(planningCatalogVersions).values({ id: "s4-catalog", year, label: "Classificação municipal S4", normativeReference: "Lei municipal da fixture isolada", sourceHash: "s4-independent-accounts", createdById: actor.usuarioId });
      await db.insert(planningCatalogEntries).values(accounts.map(account => ({ versionId: "s4-catalog", kind: "ACCOUNT", code: account.code, name: account.name, degree: 8, canonicalId: account.id, attributes: { operational: true, pocOnly: false, postingAllowed: true, informationNature: "P", balanceNature: account.id === "s4-vpa" ? "C" : "D", effectiveFrom: start.toISOString().slice(0, 10), effectiveUntil: end.toISOString().slice(0, 10), ...scope } })));
      await db.update(planningCatalogVersions).set({ status: "PUBLISHED" }).where(eq(planningCatalogVersions.id, "s4-catalog"));
      return { taxId: "s4-tax", budgetUnitId: "s4-ug", catalogVersionId: "s4-catalog", receivableAccountId: "s4-right", revenueAccountId: "s4-vpa", deductionAccountId: "s4-deduction", lossAccountId: "s4-loss", effectiveFrom: start, effectiveUntil: end, reason: "Classificação conferida", idempotencyKey: "s4-accounting" };
    }
    return { ...fixture, db, actor, scope, assessment, guide, accounting, migrationCount: migrations.length };
  } catch (error) { await fixture.close(); throw error; }
}

export function inspectionError(pattern: RegExp): (error: unknown) => boolean {
  return error => {
    const seen = new Set<unknown>();
    while (error instanceof Error && !seen.has(error)) { seen.add(error); if (pattern.test(error.message)) return true; error = error.cause; }
    return false;
  };
}

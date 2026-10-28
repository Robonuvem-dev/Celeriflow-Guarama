import { readdir, readFile } from "node:fs/promises";
import { eq, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import { taxAssessments, taxGuides } from "@/db/schema/taxation-core";
import { accountingEvents, accountingPlans, accountingRules } from "@/db/schema/finance-accounting";
import { planningCatalogEntries, planningCatalogVersions } from "@/db/schema/planning-catalog";
import { createLocalDrizzleDatabase } from "../../../../tests/helpers/local-drizzle-database";
import type { ActiveDebtActor } from "@/lib/contracts/tax-active-debt";

/** Full physical history, production Neon/WebSocket/Drizzle transport, local
 * PGlite only. No generated metadata and no municipal connection. */
export async function createActiveDebtDrizzleFixture() {
  const fixture = await createLocalDrizzleDatabase();
  // PGlite has one backend. Concurrent entrypoints are queued through the real
  // pool; this fixture verifies replay/atomicity rather than backend contention.
  fixture.connection.pool.options.max = 1;
  try {
    const migrations = (await readdir("prisma/migrations-ibema", { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    if (migrations.length !== 156) throw new Error(`Histórico da fixture DA divergente: esperadas 156 migrações, recebidas ${migrations.length}.`);
    for (const name of migrations) await fixture.database.exec(await readFile(`prisma/migrations-ibema/${name}/migration.sql`, "utf8"));
    const db = fixture.connection.db;
    await db.execute(sql`INSERT INTO "ConfiguracaoPerfil" (id,codigo,nome,permissoes,"updatedAt") VALUES ('debt-profile','DEBT_OPERATOR','Operador','{}',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "Employee" (id,name,"updatedAt") VALUES ('debt-employee','Fiscal DA',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "Usuario" (id,nome,email,"perfilId","employeeId","updatedAt") VALUES ('ana','Fiscal DA','debt@example.invalid','debt-profile','debt-employee',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "GovernmentEntity" (id,code,name,type,"updatedAt") VALUES ('ente','DEBT','Município DA','PREFEITURA',CURRENT_TIMESTAMP),('other-ente','OTHER-DEBT','Outro Município','PREFEITURA',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "Secretariat" (id,name,"updatedAt") VALUES ('secretaria','Fazenda',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "BudgetUnit" (id,code,name,"secretariatId","updatedAt") VALUES ('ug','01.01','UG municipal','secretaria',CURRENT_TIMESTAMP),('other-ug','02.01','Outra UG','secretaria',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "PlanningEntityUnit" ("budgetUnitId","governmentEntityId") VALUES ('ug','ente'),('other-ug','other-ente')`);
    await db.execute(sql`INSERT INTO "Person" (id,"fullName",cpf,"updatedAt") VALUES ('person','Titular & Histórico','52998224725',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "Taxpayer" (id,"taxpayerType","personId","updatedAt") VALUES ('payer','PF','person',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "Taxpayer" (id,"taxpayerType","updatedAt") VALUES ('unrelated','PJ',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "Address" (id,"streetName","personId","updatedAt") VALUES ('address','Rua da Memória','person',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "Tax" (id,name,"taxType","updatedAt") VALUES ('tax','Tributo DA','Imposto',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "RealEstate" (id,"municipalInsc","streetName",number,"taxpayerId","updatedAt") VALUES ('property','IM-DA','Rua da Memória','10','payer',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "EconomicRegistration" (id,"municipalInsc","taxpayerId","updatedAt") VALUES ('registration','EC-DA','payer',CURRENT_TIMESTAMP)`);
    const actor: ActiveDebtActor = { usuarioId: "ana", employeeId: "debt-employee", allowedBudgetUnitIds: ["ug"] };
    async function assessment(id: string, amount = "100.00", extra: Partial<typeof taxAssessments.$inferInsert> = {}) {
      return (await db.insert(taxAssessments).values({ id, year: 2026, originalValue: Number(amount), originalValueDecimal: new Decimal(amount), finalValueDecimal: new Decimal(amount), taxId: "tax", taxpayerId: "payer", status: "Lançado", calculationSnapshot: { governmentEntityId: "ente", budgetUnitId: "ug" }, ...extra }).returning())[0];
    }
    async function guide(id: string, assessmentId: string, amount = "100.00", extra: Partial<typeof taxGuides.$inferInsert> = {}) {
      return (await db.insert(taxGuides).values({ id, assessmentId, guideNumber: id, dueDate: new Date("2026-01-15T00:00:00Z"), totalValue: Number(amount), totalValueDecimal: new Decimal(amount), status: "Emitida", ...extra }).returning())[0];
    }
    async function financial() {
      const year = new Date().getUTCFullYear();
      const start = new Date(Date.UTC(year, 0, 1));
      const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
      await db.execute(sql`INSERT INTO "FinancialYear" (id,year,status,"governmentEntityId","startDate","endDate","updatedAt") VALUES ('debt-year',${year},'Aberto','ente',${start},${end},CURRENT_TIMESTAMP)`);
      const accounts = [
        { id: "ordinary", code: "1.1.2.1.1.01.01", name: "Direito tributário", type: "Ativo" },
        { id: "revenue", code: "4.1.1.2.1.01.01", name: "VPA tributária", type: "VPA" },
        { id: "deduction", code: "3.6.5.1.1.01.01", name: "Dedução tributária", type: "VPD" },
        { id: "loss", code: "3.6.5.1.1.01.02", name: "Extinção tributária", type: "VPD" },
        { id: "debt", code: "1.1.2.5.1.01.01", name: "Direito em dívida ativa", type: "Ativo" },
        { id: "debt-loss", code: "3.6.5.1.1.01.03", name: "Extinção de dívida ativa", type: "VPD" },
        { id: "cash", code: "1.1.1.1.1.01.01", name: "Banco arrecadador", type: "Ativo" },
      ];
      await db.insert(accountingPlans).values(accounts);
      await db.insert(planningCatalogVersions).values({ id: "debt-catalog", year, label: "Contas municipais DA", sourceHash: "debt-catalog-independent", normativeReference: "Lei municipal de teste", createdById: actor.usuarioId });
      await db.insert(planningCatalogEntries).values(accounts.map(account => ({ versionId: "debt-catalog", kind: "ACCOUNT", code: account.code, name: account.name, degree: 8, canonicalId: account.id, attributes: { operational: true, pocOnly: false, postingAllowed: true, informationNature: "P", balanceNature: account.type === "VPA" ? "C" : "D", effectiveFrom: start.toISOString().slice(0, 10), effectiveUntil: end.toISOString().slice(0, 10), governmentEntityId: "ente", budgetUnitId: "ug" } })));
      await db.update(planningCatalogVersions).set({ status: "PUBLISHED" }).where(eq(planningCatalogVersions.id, "debt-catalog"));
      await db.execute(sql`INSERT INTO "ResourceSource" (id,code,name,"updatedAt") VALUES ('debt-resource','000','Fonte livre',CURRENT_TIMESTAMP)`);
      await db.execute(sql`INSERT INTO "RevenueNature" (id,code,name,"updatedAt") VALUES ('debt-revenue','11120000','Tributo',CURRENT_TIMESTAMP)`);
      await db.execute(sql`INSERT INTO "BankAccount" (id,"bankName",agency,"accountNumber","resourceSourceId","budgetUnitId","accountingPlanId","currentBalanceDecimal","updatedAt") VALUES ('debt-bank','Banco','0001','DEBT-1','debt-resource','ug','cash',0,CURRENT_TIMESTAMP)`);
      await db.execute(sql`INSERT INTO "TaxFinancialMapping" (id,"taxId","revenueNatureId","resourceSourceId","defaultBankAccountId","updatedAt") VALUES ('debt-mapping','tax','debt-revenue','debt-resource','debt-bank',CURRENT_TIMESTAMP)`);
      for (const [code, debitAccountId, creditAccountId] of [["TAX_ACTIVE_DEBT:tax:ug", "debt", "ordinary"], ["TAX_ACTIVE_DEBT_EXTINCTION:tax:ug", "debt-loss", "debt"], ["RECEITA_ARRECADADA", "cash", "revenue"]]) {
        const [event] = await db.insert(accountingEvents).values({ code, name: code }).returning();
        await db.insert(accountingRules).values({ eventId: event.id, debitAccountId, creditAccountId, isReference: false });
      }
      return { year, start, end, catalogVersionId: "debt-catalog" };
    }
    return { ...fixture, db, actor, assessment, guide, financial, migrationCount: migrations.length };
  } catch (error) { await fixture.close(); throw error; }
}

export function activeDebtError(pattern: RegExp): (error: unknown) => boolean {
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

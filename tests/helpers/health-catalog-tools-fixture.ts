import { readFile, readdir } from "node:fs/promises";
import { eq, sql } from "drizzle-orm";
import { Decimal } from "../../src/db/decimal";
import { users, accessProfiles } from "../../src/db/schema/identity";
import { employees, secretariats } from "../../src/db/schema/administration";
import { governmentEntities } from "../../src/db/schema/master-data";
import { people } from "../../src/db/schema/people";
import { patients } from "../../src/db/schema/health-registration";
import { healthUnits } from "../../src/db/schema/health-workforce";
import { planningAppropriations, planningBudgetUnits, planningEntityUnits } from "../../src/db/schema/planning-budget";
import { planningExpenseNatures, planningResourceSources } from "../../src/db/schema/planning-legal";
import { financialYears } from "../../src/db/schema/finance-years";
import { createLocalDrizzleDatabase } from "./local-drizzle-database";

export const healthCatalogChangedTables = ["Patient", "HealthSusImportBatch", "HealthSusImportIssue", "HealthSusReference", "HealthSusProcedure", "HealthSusProcedureReference", "HealthCbo", "HealthService", "HealthSpecialty", "MaterialCategory", "Material", "CatalogItem", "CostCenter", "Warehouse", "HealthMaterialProfile", "Medicine", "HealthStockPolicy", "FinancialAuditLog", "AuditEvent"];
export const healthCatalogProtectedTables = ["Person", "HealthUnit", "PlanningEntityUnit", "BudgetUnit", "BudgetAppropriation", "BudgetMovement", "Commitment", "Settlement", "Payment", "MaterialStock", "MaterialMovement", "HealthPrescription", "MedicineDispensation"];

/** Domain-independent seeds and the complete original SQL history. Production
 * effects use the actual Neon pool/Drizzle transaction, never a fake client. */
export async function createHealthCatalogToolsFixture() {
  const fixture = await createLocalDrizzleDatabase();
  try {
    const migrations = (await readdir("prisma/migrations-ibema", { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    for (const name of migrations) {
      try { await fixture.database.exec(await readFile(`prisma/migrations-ibema/${name}/migration.sql`, "utf8")); }
      catch (error) { throw new Error(`Histórico SQL da fixture de catálogos Saúde: ${name}`, { cause: error }); }
    }
    const db = fixture.connection.db;
    await db.insert(accessProfiles).values({ id: "hct-profile", codigo: "HCT_ADMIN", nome: "Catálogos Saúde", permissoes: "{}" });
    await db.insert(employees).values({ id: "hct-employee", name: "Servidor dos catálogos" });
    // The official importer deliberately selects the oldest user even if inactive.
    await db.insert(users).values([
      { id: "hct-oldest", nome: "Autoria histórica", email: "oldest@health.invalid", ativo: false, perfilId: "hct-profile", createdAt: new Date("2020-01-01T00:00:00.123Z") },
      { id: "hct-admin", nome: "Administrador", email: "admin@email.com", perfilId: "hct-profile", employeeId: "hct-employee", createdAt: new Date("2026-01-01T00:00:00.000Z") },
    ]);
    await db.insert(secretariats).values({ id: "hct-secretariat", name: "Saúde municipal" });
    await db.insert(governmentEntities).values([
      { id: "p0-current-exe", code: "HCT-EXEC", name: "Executivo", type: "PREFEITURA" },
      { id: "hct-other", code: "HCT-OTHER", name: "Outro ente", type: "CAMARA" },
    ]);
    await db.insert(planningBudgetUnits).values({ id: "p0-current-exe-ug-1", code: "HCT.01", name: "Saúde", secretariatId: "hct-secretariat" });
    await db.insert(planningEntityUnits).values({ budgetUnitId: "p0-current-exe-ug-1", governmentEntityId: "p0-current-exe" });
    await db.insert(healthUnits).values({ id: "aurora-shared-catalogs-2026-v1:ubs", name: "UBS Central", type: "UBS", cnes: "HCT0001" });
    await db.insert(people).values([1, 2, 3, 4].map(index => ({ id: `p1-poc-person-${index}`, fullName: `Pessoa fictícia ${index}`, birthDate: new Date("1990-01-02T03:04:05.678Z") })));
    await db.insert(planningResourceSources).values({ id: "hct-source", code: "HCT.500", name: "Recursos livres" });
    await db.insert(planningExpenseNatures).values({ id: "hct-expense", code: "HCT.3", name: "Despesa preservada" });
    await db.insert(financialYears).values({ id: "hct-year", year: 2026, governmentEntityId: "p0-current-exe", startDate: new Date("2026-01-01T00:00:00.000Z"), endDate: new Date("2026-12-31T23:59:59.999Z") });
    await db.insert(planningAppropriations).values({ id: "hct-appropriation", code: "HCT-DOT", financialYearId: "hct-year", budgetUnitId: "p0-current-exe-ug-1", expenseNatureId: "hct-expense", resourceSourceId: "hct-source", initialValue: 123456789012345.67, updatedValue: 123456789012345.67, committedValue: 0.125, initialValueDecimal: new Decimal("123456789012345.67"), updatedValueDecimal: new Decimal("123456789012345.67"), committedValueDecimal: new Decimal("0.13") });

    async function reset() {
      // Only this isolated fixture's catalog effects; no shared fixture reset.
      await fixture.database.exec(`TRUNCATE "Patient", "HealthSusImportBatch", "HealthCbo", "HealthService", "HealthSpecialty", "MaterialCategory", "CatalogItem", "CostCenter", "Warehouse", "Medicine", "FinancialAuditLog", "AuditEvent" CASCADE`);
      await db.update(users).set({ ativo: true, employeeId: "hct-employee" }).where(eq(users.id, "hct-admin"));
      await db.update(healthUnits).set({ isActive: true }).where(eq(healthUnits.id, "aurora-shared-catalogs-2026-v1:ubs"));
      await db.update(planningEntityUnits).set({ governmentEntityId: "p0-current-exe" }).where(eq(planningEntityUnits.budgetUnitId, "p0-current-exe-ug-1"));
      await db.insert(patients).values([1, 2, 3].map(index => ({ id: `aurora-shared-catalogs-2026-v1:patient:p1-poc-person-${index}`, personId: `p1-poc-person-${index}`, referenceUnitId: "aurora-shared-catalogs-2026-v1:ubs" })));
    }
    async function snapshot(tables = healthCatalogChangedTables) {
      const rows: Record<string, string> = {};
      for (const table of tables) {
        const result = await db.execute<{ digest: string }>(sql`SELECT md5(COALESCE(string_agg(to_jsonb(t)::text, E'\n' ORDER BY to_jsonb(t)::text), '')) AS digest FROM ${sql.identifier(table)} t`);
        rows[table] = result.rows[0].digest;
      }
      return rows;
    }
    await reset();
    return { ...fixture, db, reset, snapshot, migrationCount: migrations.length };
  } catch (error) { await fixture.close(); throw error; }
}

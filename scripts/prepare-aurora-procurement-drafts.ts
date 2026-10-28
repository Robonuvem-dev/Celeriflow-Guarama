import { config } from "dotenv";
import { createHash } from "node:crypto";
import { Decimal } from "../src/db/decimal";
import { and, eq, inArray, sql } from "drizzle-orm";
import { withDatabaseTransaction } from "../src/db/transaction";
import type { JsonObject } from "../src/db/json";
import { users } from "../src/db/schema/identity";
import { employees, departments } from "../src/db/schema/administration";
import { financialAuditLogs } from "../src/db/schema/finance-identity";
import { financialYears } from "../src/db/schema/finance-years";
import { planningCatalogVersions, planningCatalogEntries, planningEntityUnits } from "../src/db/schema/planning-catalog";
import { procurementUnits, procurementResourceSources } from "../src/db/schema/procurement-budget";
import { materialCategories, materials as materialTable, warehouses } from "../src/db/schema/assets-stock";
import { assetCategories } from "../src/db/schema/assets";
import { catalogItems, costCenters } from "../src/db/schema/master-data";
import { purchaseRequests, purchaseRequestItems, purchaseRequestBudgetAllocations } from "../src/db/schema/procurement-requests";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const apply = process.argv.includes("--apply");
const key = "aurora-procurement-drafts-2026-v1";
const sourceVersionId = "p1-tce-pr-expense-2026-1.0h";
const sourceHash = "e98bff8e02c48e92c762ab425d64d219849754e4dab34f4be491dfa7f3ef4ecb";
const codes = ["3.3.90.30.16.00", "4.4.90.52.35.00"];
const decision = "Estrutura exemplificativa autorizada para as jornadas de suprimentos: dotações iniciais estimadas de R$ 10.000 para expediente e R$ 20.000 para equipamentos por ente, classificadas na referência TCE-PR; solicitações permanecem em rascunho. Sem lei, adjudicação, contratação, recebimento, incorporação ou pagamento presumidos.";
const hash = createHash("sha256").update(JSON.stringify({ key, sourceHash, codes, decision })).digest("hex");

async function main() {
  const { createDatabaseConnection } = await import("../src/db/connection");
  const connection = createDatabaseConnection(process.env.DATABASE_URL!);
  try {
    console.log(JSON.stringify(await withDatabaseTransaction(connection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`);
      const [actorRow] = await tx.select({ user: users, employee: employees }).from(users).leftJoin(employees, eq(employees.id, users.employeeId)).where(eq(users.email, "admin@email.com")).limit(1);
      if (!actorRow?.user.ativo || !actorRow.employee?.isActive) throw new Error("Solicitante autorizado indisponível.");
      const actor = actorRow.user;
      const [source] = await tx.select().from(planningCatalogVersions).where(eq(planningCatalogVersions.id, sourceVersionId)).limit(1);
      if (source?.sourceHash !== sourceHash || source.year !== 2026) throw new Error("Referência de despesa divergente.");
      const entries = await tx.select().from(planningCatalogEntries).where(and(eq(planningCatalogEntries.versionId, sourceVersionId), eq(planningCatalogEntries.kind, "EXPENSE"), inArray(planningCatalogEntries.code, codes)));
      if (entries.length !== 2 || entries.some(entry => (entry.attributes as JsonObject).postingAllowed !== true)) throw new Error("Naturezas analíticas de suprimentos incompletas.");
      if (!(await tx.select({ id: procurementResourceSources.id }).from(procurementResourceSources).where(eq(procurementResourceSources.id, "aurora-source-1500")).limit(1)).length) throw new Error("Fonte de recurso não encontrada.");
      const [prior] = await tx.select().from(financialAuditLogs).where(and(eq(financialAuditLogs.action, "PREPARE_PROCUREMENT_DRAFTS"), eq(financialAuditLogs.entityId, key))).limit(1);
      if (prior && (prior.payload as JsonObject).configurationHash !== hash) throw new Error("Preparação anterior divergente; preservar dotações e solicitações.");
      const scope = [];
      for (const suffix of ["exe", "leg"] as const) {
        const governmentEntityId = `p0-current-${suffix}`;
        const budgetUnitId = `${governmentEntityId}-ug-1`;
        const [binding] = await tx.select().from(planningEntityUnits).where(eq(planningEntityUnits.budgetUnitId, budgetUnitId)).limit(1);
        if (binding?.governmentEntityId !== governmentEntityId) throw new Error("UG de origem divergente.");
        const [unit] = await tx.select().from(procurementUnits).where(eq(procurementUnits.id, budgetUnitId)).limit(1);
        if (!unit) throw new Error("UG não encontrada.");
        const [year] = await tx.select().from(financialYears).where(and(eq(financialYears.governmentEntityId, governmentEntityId), eq(financialYears.year, 2026))).limit(1);
        if (year?.status !== "Aberto") throw new Error("Exercício indisponível para a jornada.");
        scope.push({ suffix, governmentEntityId, budgetUnitId, secretariatId: unit.secretariatId, financialYearId: year.id });
      }
      if (apply && !prior) {
        for (const entry of entries) await tx.execute(sql`INSERT INTO "ExpenseNature" (id, code, name, "updatedAt") VALUES (${`${key}:nature:${entry.code}`}, ${entry.code}, ${entry.name}, now())`);
        await tx.insert(planningCatalogVersions).values({ id: `${key}:catalog`, year: 2026, label: "Aurora das Veredas — despesas de suprimentos", status: "DRAFT", sourceHash: hash, normativeReference: decision, createdById: actor.id });
        await tx.insert(planningCatalogEntries).values(entries.map(entry => ({ versionId: `${key}:catalog`, kind: "EXPENSE", code: entry.code, name: entry.name, degree: entry.degree, canonicalId: `${key}:nature:${entry.code}`,
          attributes: { ...(entry.attributes as JsonObject), operational: true, mapped: true, pocOnly: false, sourceVersionId, sourceEntryId: entry.id, parameterOrigin: "OWNER_ESTIMATE", decision } })));
        await tx.update(planningCatalogVersions).set({ status: "PUBLISHED" }).where(eq(planningCatalogVersions.id, `${key}:catalog`));
        await tx.insert(materialCategories).values({ id: `${key}:material-category`, code: "AUR-INFORMATICA", name: "Equipamentos de informática" });
        await tx.insert(catalogItems).values({ id: `${key}:catalog-desktop`, code: "AUR-INF-001", name: "Computador desktop administrativo", description: "Computador desktop, 8 GB RAM e SSD 256 GB", specification: "8 GB RAM e SSD 256 GB", unit: "UN", category: "Equipamentos de informática", productKind: "MATERIAL", estimatedValue: 3500 });
        await tx.insert(materialTable).values({ id: `${key}:material-desktop`, code: "AUR-INF-001", name: "Computador desktop administrativo", description: "Computador desktop, 8 GB RAM e SSD 256 GB", type: "PATRIMONIO", categoryId: `${key}:material-category`, catalogItemId: `${key}:catalog-desktop` });
        await tx.insert(assetCategories).values({ id: `${key}:asset-category`, code: "AUR-INF", name: "Equipamentos de informática", lifeSpan: 60 });
        for (const entity of scope) {
          const departmentId = entity.suffix === "exe" ? "aurora-procurement-actors-2026-v1:department" : `${key}:department:leg`;
          if (entity.suffix === "leg") {
            await tx.insert(departments).values({ id: departmentId, name: "Departamento de Suprimentos da Câmara", secretariatId: entity.secretariatId });
            await tx.insert(employees).values({ id: `${key}:receiver:leg`, name: "Marina Ribeiro — Almoxarife", secretariatId: entity.secretariatId, departmentId });
          }
          const costCenterId = `${key}:cost-center:${entity.suffix}`;
          await tx.insert(costCenters).values({ id: costCenterId, code: `AUR-SUP-${entity.suffix.toUpperCase()}`, name: "Suprimentos e Almoxarifado", governmentEntityId: entity.governmentEntityId, secretariatId: entity.secretariatId, departmentId });
          await tx.insert(warehouses).values({ id: `${key}:warehouse:${entity.suffix}`, name: entity.suffix === "exe" ? "Almoxarifado Central da Prefeitura" : "Almoxarifado da Câmara", costCenterId, managerId: entity.suffix === "exe" ? "aurora-procurement-actors-2026-v1:receiver" : `${key}:receiver:leg` });
          for (const [index, code] of codes.entries()) {
            const value = index === 0 ? 10000 : 20000;
            await tx.execute(sql`INSERT INTO "BudgetAppropriation" (id, code, "financialYearId", "budgetUnitId", "expenseNatureId", "resourceSourceId", "initialValue", "initialValueDecimal", "updatedValue", "updatedValueDecimal", "committedValue", "committedValueDecimal", "updatedAt") VALUES (${`${key}:appropriation:${entity.suffix}:${index}`}, ${`AUR-SUP-2026-${entity.suffix.toUpperCase()}-${index + 1}`}, ${entity.financialYearId}, ${entity.budgetUnitId}, ${`${key}:nature:${code}`}, 'aurora-source-1500', ${value}, ${String(value)}, ${value}, ${String(value)}, 0, 0, now())`);
          }
          const materials = [
            { materialId: "aurora-shared-catalogs-2026-v1:material:AUR-EXP-001", catalogItemId: "aurora-shared-catalogs-2026-v1:catalog:AUR-EXP-001", quantity: 10, estimatedUnitValue: 28.5, appropriationIndex: 0 },
            { materialId: "aurora-shared-catalogs-2026-v1:material:AUR-EXP-002", catalogItemId: "aurora-shared-catalogs-2026-v1:catalog:AUR-EXP-002", quantity: 20, estimatedUnitValue: 2.5, appropriationIndex: 0 },
            { materialId: `${key}:material-desktop`, catalogItemId: `${key}:catalog-desktop`, quantity: 1, estimatedUnitValue: 3500, appropriationIndex: 1 },
          ];
          await tx.insert(purchaseRequests).values({ id: `${key}:request:${entity.suffix}`, number: `SUP-2026-${entity.suffix.toUpperCase()}-001`, object: "Material de expediente e equipamento administrativo", justification: "Reposição de material de expediente e equipamento para as atividades administrativas.", status: "Rascunho", estimatedValue: 3835, secretariatId: entity.secretariatId, departmentId, requesterId: actor.employeeId! });
          for (const { appropriationIndex, ...item } of materials) {
            const [created] = await tx.insert(purchaseRequestItems).values({ ...item, purchaseRequestId: `${key}:request:${entity.suffix}` }).returning({ id: purchaseRequestItems.id });
            await tx.insert(purchaseRequestBudgetAllocations).values({ purchaseRequestItemId: created.id, budgetAppropriationId: `${key}:appropriation:${entity.suffix}:${appropriationIndex}`, quantity: item.quantity, valueDecimal: new Decimal(item.estimatedUnitValue).mul(item.quantity) });
          }
        }
        await tx.insert(financialAuditLogs).values({ action: "PREPARE_PROCUREMENT_DRAFTS", entityType: "MUNICIPAL_CONFIGURATION", entityId: key, authorUsuarioId: actor.id, payload: { configurationHash: hash, decision, parameterOrigin: "OWNER_ESTIMATE", scope, requestStatus: "Rascunho", accountingMovementsCreated: false } });
      }
      return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", replay: Boolean(prior), configurationHash: hash, scope, requestTotalPerEntity: "3835.00", decision };
    }, { timeoutMs: 120000 }), null, 2));
  } finally { await connection.pool.end(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na preparação de suprimentos."); process.exitCode = 1; });

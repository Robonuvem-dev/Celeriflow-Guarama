import { config } from "dotenv";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { DatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { users } from "../src/db/schema/identity";
import { healthUnits } from "../src/db/schema/health-workforce";
import { planningBudgetUnits, planningEntityUnits } from "../src/db/schema/planning-budget";
import { financialAuditLogs } from "../src/db/schema/finance-identity";
import { catalogItems, costCenters } from "../src/db/schema/master-data";
import { materialCategories, materials, warehouses } from "../src/db/schema/assets-stock";
import { healthMaterialProfiles } from "../src/db/schema/health-pharmacy";
import { medicines } from "../src/db/schema/health-prescriptions";
import { healthCatalogStockPolicies } from "../src/db/schema/health-catalog-tools";
import { openCrossDomainDatabase } from "./lib/cross-domain-database";
import { healthCatalogConfigurationHash, healthCatalogRequired, lockHealthCatalogTool } from "./lib/health-catalog-tools";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const key = "aurora-pharmacy-catalogs-2026-v1";
const healthUnitId = "aurora-shared-catalogs-2026-v1:ubs";
const products = [
  { code: "AUR-FAR-001", name: "Paracetamol 500 mg", activePrinciple: "Paracetamol", concentration: "500 mg", presentation: "Comprimido" },
  { code: "AUR-FAR-002", name: "Solução de cloreto de sódio 0,9% 100 mL", activePrinciple: "Cloreto de sódio", concentration: "0,9%", presentation: "Frasco 100 mL" },
];
const decision = "Catálogo municipal exemplificativo autorizado, grupo específico de medicamentos, vínculo Compras/Material/Saúde e dois estoques vinculados à UBS. Mínimo 20 e máximo 200 unidades são estimativas ajustáveis. Sem DCB/BPS/RENAME oficiais, prescrição, dispensação, lote, saldo ou habilitação clínica presumidos.";
const hash = createHash("sha256").update(JSON.stringify({ key, healthUnitId, products, decision })).digest("hex");

export async function prepareAuroraPharmacyCatalogs(connection: DatabaseConnection, apply: boolean) {
  return withDatabaseTransaction(connection, async tx => {
    await lockHealthCatalogTool(tx, key);
    const actor = healthCatalogRequired((await tx.select({ id: users.id, ativo: users.ativo }).from(users).where(eq(users.email, "admin@email.com")).limit(1))[0], "Usuario");
    if (!actor.ativo) throw new Error("Operador autorizado inativo.");
    healthCatalogRequired((await tx.select({ id: healthUnits.id }).from(healthUnits).where(and(eq(healthUnits.id, healthUnitId), eq(healthUnits.isActive, true))).limit(1))[0], "HealthUnit");
    const binding = healthCatalogRequired((await tx.select().from(planningEntityUnits).where(eq(planningEntityUnits.budgetUnitId, "p0-current-exe-ug-1")).limit(1))[0], "PlanningEntityUnit");
    if (binding.governmentEntityId !== "p0-current-exe") throw new Error("UG da Saúde divergente do Executivo.");
    const unit = healthCatalogRequired((await tx.select({ secretariatId: planningBudgetUnits.secretariatId }).from(planningBudgetUnits).where(eq(planningBudgetUnits.id, binding.budgetUnitId)).limit(1))[0], "BudgetUnit");
    const [prior] = await tx.select({ payload: financialAuditLogs.payload }).from(financialAuditLogs).where(and(eq(financialAuditLogs.action, "PREPARE_PHARMACY_CATALOGS"), eq(financialAuditLogs.entityId, key))).limit(1);
    if (prior && healthCatalogConfigurationHash(prior.payload) !== hash) throw new Error("Preparação anterior divergente; preservar catálogo e saldos.");
    if (apply && !prior) {
      for (const product of products) if ((await tx.select({ id: materials.id }).from(materials).where(eq(materials.code, product.code)).limit(1))[0] || (await tx.select({ id: catalogItems.id }).from(catalogItems).where(eq(catalogItems.code, product.code)).limit(1))[0]) throw new Error("Código de medicamento já utilizado; preservar o cadastro existente.");
      await tx.insert(materialCategories).values({ id: `${key}:category`, code: "AUR-MEDICAMENTOS", name: "Medicamentos e soluções farmacêuticas" });
      await tx.insert(costCenters).values({ id: `${key}:cost-center`, code: "AUR-FARMACIA", name: "Assistência farmacêutica municipal", governmentEntityId: binding.governmentEntityId, secretariatId: unit.secretariatId });
      for (const suffix of ["central", "dispensing"]) await tx.insert(warehouses).values({ id: `${key}:warehouse:${suffix}`, name: suffix === "central" ? "Estoque Central de Medicamentos" : "Farmácia da UBS Central", healthUnitId, costCenterId: `${key}:cost-center` });
      for (const product of products) {
        const materialId = `${key}:material:${product.code}`;
        await tx.insert(catalogItems).values({ id: `${key}:catalog:${product.code}`, code: product.code, name: product.name, unit: "UN", category: "Medicamentos e soluções farmacêuticas", productKind: "MATERIAL", description: `${product.activePrinciple} — ${product.concentration}`, specification: product.presentation });
        await tx.insert(materials).values({ id: materialId, code: product.code, name: product.name, categoryId: `${key}:category`, catalogItemId: `${key}:catalog:${product.code}`, unitOfMeasure: "UN", isPerishable: true, minStock: 20, maxStock: 200 });
        await tx.insert(healthMaterialProfiles).values({ materialId, productKind: "MEDICINE", packaging: product.presentation });
        await tx.insert(medicines).values({ id: `${key}:medicine:${product.code}`, materialId, name: product.name, activePrinciple: product.activePrinciple, concentration: product.concentration, presentation: product.presentation, currentStock: 0, minStock: 20 });
        for (const suffix of ["central", "dispensing"]) await tx.insert(healthCatalogStockPolicies).values({ warehouseId: `${key}:warehouse:${suffix}`, materialId, minQuantity: 20, maxQuantity: 200 });
      }
      await tx.insert(financialAuditLogs).values({ action: "PREPARE_PHARMACY_CATALOGS", entityType: "MUNICIPAL_CONFIGURATION", entityId: key, authorUsuarioId: actor.id, payload: { configurationHash: hash, decision, parameterOrigin: "OWNER_ESTIMATE", products: products.map(item => item.code), healthUnitId, governmentEntityId: binding.governmentEntityId, stockBalancesCreated: false, clinicalRecordsCreated: false } });
    }
    return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", replay: Boolean(prior), configurationHash: hash, healthUnitId, products: products.map(item => item.code), decision };
  }, { timeoutMs: 120_000 });
}

async function main() {
  const connection = openCrossDomainDatabase();
  try { console.log(JSON.stringify(await prepareAuroraPharmacyCatalogs(connection, process.argv.includes("--apply")), null, 2)); }
  finally { await connection.pool.end(); }
}

if (require.main === module) main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na preparação da farmácia."); process.exitCode = 1; });

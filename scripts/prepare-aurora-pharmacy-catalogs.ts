import { config } from "dotenv";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const apply = process.argv.includes("--apply");
const key = "aurora-pharmacy-catalogs-2026-v1";
const healthUnitId = "aurora-shared-catalogs-2026-v1:ubs";
const products = [
  { code: "AUR-FAR-001", name: "Paracetamol 500 mg", activePrinciple: "Paracetamol", concentration: "500 mg", presentation: "Comprimido" },
  { code: "AUR-FAR-002", name: "Solução de cloreto de sódio 0,9% 100 mL", activePrinciple: "Cloreto de sódio", concentration: "0,9%", presentation: "Frasco 100 mL" },
];
const decision = "Catálogo municipal exemplificativo autorizado, grupo específico de medicamentos, vínculo Compras/Material/Saúde e dois estoques vinculados à UBS. Mínimo 20 e máximo 200 unidades são estimativas ajustáveis. Sem DCB/BPS/RENAME oficiais, prescrição, dispensação, lote, saldo ou habilitação clínica presumidos.";
const hash = createHash("sha256").update(JSON.stringify({ key, healthUnitId, products, decision })).digest("hex");

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  try {
    console.log(JSON.stringify(await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
      const actor = await tx.usuario.findUniqueOrThrow({ where: { email: "admin@email.com" } });
      if (!actor.ativo) throw new Error("Operador autorizado inativo.");
      await tx.healthUnit.findFirstOrThrow({ where: { id: healthUnitId, isActive: true } });
      const binding = await tx.planningEntityUnit.findUniqueOrThrow({ where: { budgetUnitId: "p0-current-exe-ug-1" } });
      if (binding.governmentEntityId !== "p0-current-exe") throw new Error("UG da Saúde divergente do Executivo.");
      const unit = await tx.budgetUnit.findUniqueOrThrow({ where: { id: binding.budgetUnitId } });
      const prior = await tx.financialAuditLog.findFirst({ where: { action: "PREPARE_PHARMACY_CATALOGS", entityId: key } });
      if (prior && (prior.payload as Prisma.JsonObject).configurationHash !== hash) throw new Error("Preparação anterior divergente; preservar catálogo e saldos.");
      if (apply && !prior) {
        for (const product of products) if (await tx.material.findUnique({ where: { code: product.code } }) || await tx.catalogItem.findUnique({ where: { code: product.code } })) throw new Error("Código de medicamento já utilizado; preservar o cadastro existente.");
        await tx.materialCategory.create({ data: { id: `${key}:category`, code: "AUR-MEDICAMENTOS", name: "Medicamentos e soluções farmacêuticas" } });
        await tx.costCenter.create({ data: { id: `${key}:cost-center`, code: "AUR-FARMACIA", name: "Assistência farmacêutica municipal", governmentEntityId: binding.governmentEntityId, secretariatId: unit.secretariatId } });
        for (const suffix of ["central", "dispensing"]) await tx.warehouse.create({ data: { id: `${key}:warehouse:${suffix}`, name: suffix === "central" ? "Estoque Central de Medicamentos" : "Farmácia da UBS Central", healthUnitId, costCenterId: `${key}:cost-center` } });
        for (const product of products) {
          const materialId = `${key}:material:${product.code}`;
          await tx.catalogItem.create({ data: { id: `${key}:catalog:${product.code}`, code: product.code, name: product.name, unit: "UN", category: "Medicamentos e soluções farmacêuticas", productKind: "MATERIAL", description: `${product.activePrinciple} — ${product.concentration}`, specification: product.presentation } });
          await tx.material.create({ data: { id: materialId, code: product.code, name: product.name, categoryId: `${key}:category`, catalogItemId: `${key}:catalog:${product.code}`, unitOfMeasure: "UN", isPerishable: true, minStock: 20, maxStock: 200 } });
          await tx.healthMaterialProfile.create({ data: { materialId, productKind: "MEDICINE", packaging: product.presentation } });
          await tx.medicine.create({ data: { id: `${key}:medicine:${product.code}`, materialId, name: product.name, activePrinciple: product.activePrinciple, concentration: product.concentration, presentation: product.presentation, currentStock: 0, minStock: 20 } });
          for (const suffix of ["central", "dispensing"]) await tx.healthStockPolicy.create({ data: { warehouseId: `${key}:warehouse:${suffix}`, materialId, minQuantity: 20, maxQuantity: 200 } });
        }
        await tx.financialAuditLog.create({ data: { action: "PREPARE_PHARMACY_CATALOGS", entityType: "MUNICIPAL_CONFIGURATION", entityId: key, authorUsuarioId: actor.id, payload: { configurationHash: hash, decision, parameterOrigin: "OWNER_ESTIMATE", products: products.map(item => item.code), healthUnitId, governmentEntityId: binding.governmentEntityId, stockBalancesCreated: false, clinicalRecordsCreated: false } } });
      }
      return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", replay: Boolean(prior), configurationHash: hash, healthUnitId, products: products.map(item => item.code), decision };
    }, { timeout: 120000 }), null, 2));
  } finally { await prisma.$disconnect(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na preparação da farmácia."); process.exitCode = 1; });

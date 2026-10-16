import { config } from "dotenv";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";

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
  const { prisma } = await import("../src/lib/prisma");
  try {
    console.log(JSON.stringify(await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
      const actor = await tx.usuario.findUniqueOrThrow({ where: { email: "admin@email.com" }, include: { employee: true } });
      if (!actor.ativo || !actor.employee?.isActive) throw new Error("Solicitante autorizado indisponível.");
      const source = await tx.planningCatalogVersion.findUniqueOrThrow({ where: { id: sourceVersionId } });
      if (source.sourceHash !== sourceHash || source.year !== 2026) throw new Error("Referência de despesa divergente.");
      const entries = await tx.planningCatalogEntry.findMany({ where: { versionId: sourceVersionId, kind: "EXPENSE", code: { in: codes } } });
      if (entries.length !== 2 || entries.some(entry => (entry.attributes as Prisma.JsonObject).postingAllowed !== true)) throw new Error("Naturezas analíticas de suprimentos incompletas.");
      await tx.resourceSource.findUniqueOrThrow({ where: { id: "aurora-source-1500" } });
      const prior = await tx.financialAuditLog.findFirst({ where: { action: "PREPARE_PROCUREMENT_DRAFTS", entityId: key } });
      if (prior && (prior.payload as Prisma.JsonObject).configurationHash !== hash) throw new Error("Preparação anterior divergente; preservar dotações e solicitações.");
      const scope = [];
      for (const suffix of ["exe", "leg"] as const) {
        const governmentEntityId = `p0-current-${suffix}`;
        const budgetUnitId = `${governmentEntityId}-ug-1`;
        const binding = await tx.planningEntityUnit.findUniqueOrThrow({ where: { budgetUnitId } });
        if (binding.governmentEntityId !== governmentEntityId) throw new Error("UG de origem divergente.");
        const unit = await tx.budgetUnit.findUniqueOrThrow({ where: { id: budgetUnitId } });
        const year = await tx.financialYear.findUniqueOrThrow({ where: { governmentEntityId_year: { governmentEntityId, year: 2026 } } });
        if (year.status !== "Aberto") throw new Error("Exercício indisponível para a jornada.");
        scope.push({ suffix, governmentEntityId, budgetUnitId, secretariatId: unit.secretariatId, financialYearId: year.id });
      }
      if (apply && !prior) {
        for (const entry of entries) await tx.expenseNature.create({ data: { id: `${key}:nature:${entry.code}`, code: entry.code, name: entry.name } });
        await tx.planningCatalogVersion.create({ data: { id: `${key}:catalog`, year: 2026, label: "Aurora das Veredas — despesas de suprimentos", status: "DRAFT", sourceHash: hash, normativeReference: decision, createdById: actor.id,
          entries: { create: entries.map(entry => ({ kind: "EXPENSE", code: entry.code, name: entry.name, degree: entry.degree, canonicalId: `${key}:nature:${entry.code}`,
            attributes: { ...(entry.attributes as Prisma.JsonObject), operational: true, mapped: true, pocOnly: false, sourceVersionId, sourceEntryId: entry.id, parameterOrigin: "OWNER_ESTIMATE", decision } })) },
        } });
        await tx.planningCatalogVersion.update({ where: { id: `${key}:catalog` }, data: { status: "PUBLISHED" } });
        await tx.materialCategory.create({ data: { id: `${key}:material-category`, code: "AUR-INFORMATICA", name: "Equipamentos de informática" } });
        await tx.catalogItem.create({ data: { id: `${key}:catalog-desktop`, code: "AUR-INF-001", name: "Computador desktop administrativo", description: "Computador desktop, 8 GB RAM e SSD 256 GB", specification: "8 GB RAM e SSD 256 GB", unit: "UN", category: "Equipamentos de informática", productKind: "MATERIAL", estimatedValue: 3500 } });
        await tx.material.create({ data: { id: `${key}:material-desktop`, code: "AUR-INF-001", name: "Computador desktop administrativo", description: "Computador desktop, 8 GB RAM e SSD 256 GB", type: "PATRIMONIO", categoryId: `${key}:material-category`, catalogItemId: `${key}:catalog-desktop` } });
        await tx.assetCategory.create({ data: { id: `${key}:asset-category`, code: "AUR-INF", name: "Equipamentos de informática", lifeSpan: 60 } });
        for (const entity of scope) {
          const departmentId = entity.suffix === "exe" ? "aurora-procurement-actors-2026-v1:department" : `${key}:department:leg`;
          if (entity.suffix === "leg") {
            await tx.department.create({ data: { id: departmentId, name: "Departamento de Suprimentos da Câmara", secretariatId: entity.secretariatId } });
            await tx.employee.create({ data: { id: `${key}:receiver:leg`, name: "Marina Ribeiro — Almoxarife", secretariatId: entity.secretariatId, departmentId } });
          }
          const costCenterId = `${key}:cost-center:${entity.suffix}`;
          await tx.costCenter.create({ data: { id: costCenterId, code: `AUR-SUP-${entity.suffix.toUpperCase()}`, name: "Suprimentos e Almoxarifado", governmentEntityId: entity.governmentEntityId, secretariatId: entity.secretariatId, departmentId } });
          await tx.warehouse.create({ data: { id: `${key}:warehouse:${entity.suffix}`, name: entity.suffix === "exe" ? "Almoxarifado Central da Prefeitura" : "Almoxarifado da Câmara", costCenterId, managerId: entity.suffix === "exe" ? "aurora-procurement-actors-2026-v1:receiver" : `${key}:receiver:leg` } });
          for (const [index, code] of codes.entries()) {
            const value = index === 0 ? 10000 : 20000;
            await tx.budgetAppropriation.create({ data: { id: `${key}:appropriation:${entity.suffix}:${index}`, code: `AUR-SUP-2026-${entity.suffix.toUpperCase()}-${index + 1}`, financialYearId: entity.financialYearId,
              budgetUnitId: entity.budgetUnitId, expenseNatureId: `${key}:nature:${code}`, resourceSourceId: "aurora-source-1500", initialValue: value, initialValueDecimal: value, updatedValue: value, updatedValueDecimal: value, committedValue: 0, committedValueDecimal: 0 } });
          }
          const materials = [
            { materialId: "aurora-shared-catalogs-2026-v1:material:AUR-EXP-001", catalogItemId: "aurora-shared-catalogs-2026-v1:catalog:AUR-EXP-001", quantity: 10, estimatedUnitValue: 28.5, appropriationIndex: 0 },
            { materialId: "aurora-shared-catalogs-2026-v1:material:AUR-EXP-002", catalogItemId: "aurora-shared-catalogs-2026-v1:catalog:AUR-EXP-002", quantity: 20, estimatedUnitValue: 2.5, appropriationIndex: 0 },
            { materialId: `${key}:material-desktop`, catalogItemId: `${key}:catalog-desktop`, quantity: 1, estimatedUnitValue: 3500, appropriationIndex: 1 },
          ];
          await tx.purchaseRequest.create({ data: { id: `${key}:request:${entity.suffix}`, number: `SUP-2026-${entity.suffix.toUpperCase()}-001`, object: "Material de expediente e equipamento administrativo", justification: "Reposição de material de expediente e equipamento para as atividades administrativas.", status: "Rascunho", estimatedValue: 3835,
            secretariatId: entity.secretariatId, departmentId, requesterId: actor.employeeId!, items: { create: materials.map(({ appropriationIndex, ...item }) => ({ ...item,
              budgetAllocations: { create: { budgetAppropriationId: `${key}:appropriation:${entity.suffix}:${appropriationIndex}`, quantity: item.quantity, valueDecimal: new Prisma.Decimal(item.estimatedUnitValue).mul(item.quantity) } },
            })) } } });
        }
        await tx.financialAuditLog.create({ data: { action: "PREPARE_PROCUREMENT_DRAFTS", entityType: "MUNICIPAL_CONFIGURATION", entityId: key, authorUsuarioId: actor.id, payload: { configurationHash: hash, decision, parameterOrigin: "OWNER_ESTIMATE", scope, requestStatus: "Rascunho", accountingMovementsCreated: false } } });
      }
      return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", replay: Boolean(prior), configurationHash: hash, scope, requestTotalPerEntity: "3835.00", decision };
    }, { timeout: 120000 }), null, 2));
  } finally { await prisma.$disconnect(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na preparação de suprimentos."); process.exitCode = 1; });

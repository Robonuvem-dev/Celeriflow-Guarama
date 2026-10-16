import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { nextEquipmentCode, nextMaterialCode, nextAssetPatrimonyNumber } from "../src/lib/patrimonio/identifiers";
import { nextYearlyCode } from "../src/lib/sequence";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
neonConfig.webSocketConstructor = ws;
const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connectionString) throw new Error("Conexão municipal não configurada.");
const db = new PrismaClient({ adapter: new PrismaNeon({ connectionString }), transactionOptions: { timeout: 120000 } });
const dataset = "patrimony-workflow-review-2026-10";

async function main() {
  try {
    if (!process.argv.includes("--apply") && !process.argv.includes("--verify")) {
      const [categories, units, warehouses, actors, requests] = await Promise.all([
        db.assetCategory.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true, lifeSpan: true } }),
        db.budgetUnit.findMany({ where: { planningEntityUnit: { isNot: null } }, select: { id: true, name: true, secretariatId: true } }),
        db.warehouse.findMany({ where: { isActive: true }, select: { id: true, name: true, _count: { select: { stocks: true } } } }),
        db.usuario.findMany({ where: { ativo: true, employeeId: { not: null } }, select: { id: true, employeeId: true, unidadesGestoras: { select: { budgetUnitId: true } } } }),
        db.materialRequest.findMany({ select: { id: true, number: true, status: true, sourceWarehouseId: true } }),
      ]);
      console.log(JSON.stringify({ mode: "PREVIEW", categories, units, warehouses, actors, requests, assetCount: await db.asset.count(), adjustmentEvents: await db.accountingEventCatalog.findMany({ where: { code: { startsWith: "ASSET_" } }, select: { code: true } }) }, null, 2));
      return;
    }
    if (process.argv.includes("--verify")) {
      const [assets, warehouses, requests, equipment] = await Promise.all([
        db.asset.findMany({ select: { id: true, code: true, status: true, currentValue: true, currentValueDecimal: true } }),
        db.warehouse.findMany({ where: { isActive: true }, select: { name: true, _count: { select: { stocks: true } } } }),
        db.materialRequest.findMany({ where: { idempotencyKey: { startsWith: dataset } }, include: { items: { include: { movements: { select: { quantity: true, type: true } } } } } }),
        db.equipmentCustody.count(),
      ]);
      if (assets.some(asset => !asset.code || !/^EQP\d{6}$/.test(asset.code))) throw new Error("Bem sem código EQP padronizado.");
      if (warehouses.some(warehouse => warehouse._count.stocks < 4)) throw new Error("Almoxarifado sem variedade mínima de estoques.");
      for (const request of requests) for (const item of request.items) if (item.movements.reduce((total, movement) => total + (movement.type === "Saída" ? movement.quantity : -movement.quantity), 0) !== item.quantityDelivered) throw new Error("Entrega divergente dos movimentos de estoque.");
      console.log(JSON.stringify({ verified: true, assets: assets.length, equipmentInUseWithoutPatrimony: equipment, requestExamples: requests.map(request => ({ code: request.number, status: request.status })), warehouses, writeOffs: await db.assetWriteOff.count(), adjustments: await db.assetValueAdjustment.count() }, null, 2));
      return;
    }
    const { createMaterialRequest, approveMaterialRequest, issueMaterialRequestItem, issueMaterialRequestInFull } = await import("../src/lib/compras/procurement-lifecycle");
    const { recordAssetValueAdjustment, recordAssetDisposal } = await import("../src/lib/patrimonio/asset-lifecycle");
    const base = await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${dataset}))`;
      const budgetUnit = await tx.budgetUnit.findFirstOrThrow({ where: { name: "Secretaria de Administração", planningEntityUnit: { isNot: null } }, select: { id: true, secretariatId: true } });
      const actor = await tx.usuario.findFirstOrThrow({ where: { ativo: true, employeeId: { not: null }, unidadesGestoras: { some: { budgetUnitId: budgetUnit.id } } }, select: { id: true, employeeId: true } });
      const department = await tx.department.findFirst({ where: { secretariatId: budgetUnit.secretariatId, isActive: true }, select: { id: true } }) || await tx.department.create({ data: { name: "Gestão de Patrimônio e Almoxarifado", secretariatId: budgetUnit.secretariatId }, select: { id: true } });
      const requester = await tx.employee.findFirstOrThrow({ where: { isActive: true, id: { not: actor.employeeId! }, department: { is: { isActive: true } } }, select: { id: true, departmentId: true }, orderBy: { name: "asc" } });
      const category = await tx.materialCategory.upsert({ where: { code: "ALM-SAUDE" }, create: { code: "ALM-SAUDE", name: "Insumos de saúde" }, update: {}, select: { id: true } });
      const maintenanceCategory = await tx.materialCategory.findUniqueOrThrow({ where: { code: "ALM-MAN" }, select: { id: true } });
      const extraItems = [
        { name: "Gaze estéril, pacote com 10", unit: "KT", cost: 7.4, health: true, perishable: true },
        { name: "Álcool 70%, frasco 100 ml", unit: "UN", cost: 4.8, health: true, perishable: true },
        { name: "Seringa descartável 5 ml", unit: "UN", cost: 0.8, health: true, perishable: true },
        { name: "Luvas para exame, pacote com 100", unit: "KT", cost: 28, health: true, perishable: true },
        { name: "Fita microporosa, rolo 25 mm", unit: "UN", cost: 5.9, health: true, perishable: true },
        { name: "Filtro de óleo para veículos leves", unit: "UN", cost: 32, health: false, perishable: false },
        { name: "Filtro de ar para veículos leves", unit: "UN", cost: 48, health: false, perishable: false },
        { name: "Enxada com cabo de madeira", unit: "UN", cost: 65, health: false, perishable: false },
        { name: "Pá de bico com cabo", unit: "UN", cost: 72, health: false, perishable: false },
        { name: "Kit de reparo para tubulação rural", unit: "KT", cost: 89, health: false, perishable: false },
      ];
      let extraMaterials = 0, newStocks = 0, normalizedAssetCodes = 0, normalizedRequestCodes = 0, newAssets = 0;
      for (const [index, item] of extraItems.entries()) {
        const id = `${dataset}-material-${index + 1}`;
        if (await tx.material.findUnique({ where: { id }, select: { id: true } })) continue;
        await tx.material.create({ data: { id, code: await nextMaterialCode(tx, "MATERIAL"), name: item.name, unitOfMeasure: item.unit, isPerishable: item.perishable, categoryId: item.health ? category.id : maintenanceCategory.id, minStock: 10, maxStock: 700 } });
        extraMaterials++;
      }
      const materials = await tx.material.findMany({ where: { isActive: true }, orderBy: { code: "asc" } });
      const warehouses = await tx.warehouse.findMany({ where: { isActive: true }, orderBy: [{ name: "asc" }, { id: "asc" }] });
      for (const [warehouseIndex, warehouse] of warehouses.entries()) {
        const pharmacy = /medicamentos|farmácia/i.test(warehouse.name);
        const workshop = /rural|manutenção|tanques/i.test(warehouse.name);
        const eligible = materials.filter(material => pharmacy ? material.categoryId === category.id || /paracetamol|cloreto de sódio/i.test(material.name) : workshop ? material.categoryId === maintenanceCategory.id : material.unitOfMeasure !== "L" && material.categoryId !== category.id && !/paracetamol|cloreto de sódio/i.test(material.name));
        const requestedNames = ["Envelope pardo A4", "Lápis grafite HB", "Monitor LED 24 polegadas", "Marcador de texto amarelo"];
        const generalSelection = [...eligible.filter(material => material.type === "MATERIAL").slice(0, 8), ...eligible.filter(material => material.type === "PATRIMONIO").slice(0, 4), ...eligible.filter(material => requestedNames.includes(material.name))];
        const selection = pharmacy ? eligible.slice(0, 7) : workshop ? eligible.slice(0, 12) : [...new Map(generalSelection.map(material => [material.id, material])).values()];
        for (const [position, material] of selection.entries()) {
          const batchNumber = `${dataset}-${warehouseIndex + 1}-${position + 1}`;
          if (await tx.materialStock.findUnique({ where: { warehouseId_materialId_batchNumber: { warehouseId: warehouse.id, materialId: material.id, batchNumber } }, select: { id: true } })) continue;
          const quantity = material.type === "PATRIMONIO" ? 5 + (warehouseIndex + position * 3) % 16 : 50 + (warehouseIndex * 47 + position * 31) % 650;
          const reference = extraItems.find(item => item.name === material.name);
          const otherStock = await tx.materialStock.findFirst({ where: { materialId: material.id, unitCost: { not: null } }, select: { unitCost: true } });
          const unitCost = reference?.cost || otherStock?.unitCost || 12;
          const expirationDate = material.isPerishable ? new Date(Date.now() + (60 + position * 21 + warehouseIndex * 7) * 86400000) : undefined;
          const stock = await tx.materialStock.create({ data: { warehouseId: warehouse.id, materialId: material.id, batchNumber, quantity, unitCost, expirationDate } });
          await tx.materialMovement.create({ data: { idempotencyKey: `${dataset}:opening:${stock.id}`, type: "Entrada", materialId: material.id, warehouseId: warehouse.id, stockId: stock.id, quantity, quantityDecimal: quantity, unitValue: unitCost, unitValueDecimal: unitCost, totalValueDecimal: (quantity * unitCost).toFixed(2), reason: "Distribuição inicial demonstrativa de estoques — revisão autorizada do Almoxarifado.", actorUsuarioId: actor.id, actorEmployeeId: actor.employeeId } });
          newStocks++;
        }
      }
      for (const asset of await tx.asset.findMany({ select: { id: true, code: true } })) if (!asset.code || !/^EQP\d{6}$/.test(asset.code)) {
        await tx.asset.update({ where: { id: asset.id }, data: { code: await nextEquipmentCode(tx) } });
        normalizedAssetCodes++;
      }
      const existingRequests = await tx.materialRequest.findMany({ include: { items: true } });
      for (const request of existingRequests) {
        const code = /^REQ-\d{4}-\d{6}$/.test(request.number) ? request.number : await nextYearlyCode({ prisma: tx, key: "patrimonio-requisicao-material", prefix: "REQ", padding: 6, existingCodes: (await tx.materialRequest.findMany({ select: { number: true } })).map(row => ({ code: row.number })) });
        const positions = request.sourceWarehouseId ? [] : await tx.materialStock.findMany({ where: { materialId: { in: request.items.map(item => item.materialId) }, quantity: { gt: 0 } }, select: { warehouseId: true, materialId: true, quantity: true } });
        const origin = request.sourceWarehouseId || warehouses.find(warehouse => request.items.length > 0 && request.items.every(item => positions.filter(stock => stock.warehouseId === warehouse.id && stock.materialId === item.materialId).reduce((total, stock) => total + stock.quantity, 0) >= item.quantityRequested))?.id;
        if (code !== request.number || origin !== request.sourceWarehouseId) {
          await tx.materialRequest.update({ where: { id: request.id }, data: { number: code, ...(origin ? { sourceWarehouseId: origin } : {}) } });
          if (code !== request.number) { normalizedRequestCodes++; await tx.financialAuditLog.create({ data: { action: "MATERIAL_REQUEST_CODE_NORMALIZED", entityType: "MaterialRequest", entityId: request.id, authorUsuarioId: actor.id, payload: { previousCode: request.number, code, dataset } } }); }
        }
      }
      const assetExamples = [
        { name: "Notebook Dell Latitude 5440 — atendimento administrativo", categoryId: "aurora-asset-category-it", value: 5400, status: "Em uso" },
        { name: "Impressora Brother HL-L6402DW — protocolo", categoryId: "aurora-asset-category-it", value: 3200, status: "Em uso" },
        { name: "Armário metálico Pandin — arquivo municipal", categoryId: "aurora-asset-category-furniture", value: 1450, status: "Em uso" },
        { name: "Monitor LG 24MP400 — substituído por defeito", categoryId: "aurora-asset-category-it", value: 680, status: "Ativo" },
        { name: "Cadeira de escritório Cavaletti — estrutura danificada", categoryId: "aurora-asset-category-furniture", value: 420, status: "Ativo" },
        { name: "Furadeira Bosch GSB 13 RE — manutenção predial", categoryId: "aurora-asset-category-machinery", value: 460, status: "Em uso" },
      ];
      for (const [index, item] of assetExamples.entries()) {
        const id = `${dataset}-asset-${index + 1}`;
        if (await tx.asset.findUnique({ where: { id }, select: { id: true } })) continue;
        await tx.asset.create({ data: { id, code: await nextEquipmentCode(tx), patrimonyNumber: await nextAssetPatrimonyNumber(tx), name: item.name, categoryId: item.categoryId, status: item.status, description: "Exemplo demonstrativo do ciclo patrimonial com equipamento plausível. Valores e ocorrências de referência.", serialNumber: `REV2026-${String(index + 1).padStart(4, "0")}`, acquisitionDate: new Date("2026-06-15T12:00:00Z"), incorporationDate: new Date("2026-06-15T12:00:00Z"), acquisitionValue: item.value, currentValue: item.value, acquisitionValueDecimal: item.value, currentValueDecimal: item.value, departmentId: department.id, responsibleId: actor.employeeId, budgetUnitId: budgetUnit.id } });
        newAssets++;
      }
      const totals = { extraMaterials, newStocks, normalizedAssetCodes, normalizedRequestCodes, newAssets };
      if (Object.values(totals).some(count => count > 0)) await tx.financialAuditLog.create({ data: { action: "PATRIMONY_REVIEW_BASE_POPULATED", entityType: "DATASET", entityId: dataset, authorUsuarioId: actor.id, payload: { dataset, fictional: true, totals } } });
      return { actor: { usuarioId: actor.id, employeeId: actor.employeeId! }, budgetUnitId: budgetUnit.id, requester, totals, originWarehouseId: warehouses.find(warehouse => warehouse.name === "Almoxarifado Central")!.id };
    }, { timeout: 240000, maxWait: 20000 });
    console.log(JSON.stringify({ stage: "BASE", ...base.totals }));
    const examples = [
      { key: "pending", name: "Envelope pardo A4", quantity: 12 },
      { key: "partial", name: "Lápis grafite HB", quantity: 10 },
      { key: "equipment", name: "Monitor LED 24 polegadas", quantity: 2 },
      { key: "complete", name: "Marcador de texto amarelo", quantity: 8 },
    ];
    for (const example of examples) {
      const material = await db.material.findFirstOrThrow({ where: { name: example.name }, select: { id: true } });
      const request = await createMaterialRequest(db, { ...base.actor, employeeId: base.requester.id }, { sourceWarehouseId: base.originWarehouseId, departmentId: base.requester.departmentId!, idempotencyKey: `${dataset}:${example.key}`, justification: `Exemplo de ${example.key === "partial" ? "entrega parcial" : example.key === "equipment" ? "equipamento em uso sem tombamento" : example.key === "complete" ? "atendimento integral" : "pedido pendente de aprovação"} — revisão do Almoxarifado.`, items: [{ materialId: material.id, quantityRequested: example.quantity }] });
      if (example.key === "pending") continue;
      const item = await db.materialRequestItem.findFirstOrThrow({ where: { requestId: request.id } });
      if (request.status === "Pendente") await approveMaterialRequest(db, base.actor, { requestId: request.id, quantities: [{ itemId: item.id, quantityApproved: example.quantity }] });
      const stock = await db.materialStock.findFirstOrThrow({ where: { materialId: material.id, warehouseId: base.originWarehouseId, quantity: { gte: example.quantity } }, select: { id: true } });
      if (example.key === "partial") await issueMaterialRequestItem(db, base.actor, { requestItemId: item.id, stockId: stock.id, quantity: 4, idempotencyKey: `${dataset}:partial-first` });
      else await issueMaterialRequestInFull(db, base.actor, { requestId: request.id, stockByItem: [{ requestItemId: item.id, stockId: stock.id }] });
    }
    const valuationContext = { actor: base.actor, budgetUnitId: base.budgetUnitId };
    for (const [index, value] of [4800, 2700, 1200].entries()) await recordAssetValueAdjustment(db, { assetId: `${dataset}-asset-${index + 1}`, date: new Date("2026-10-14T12:00:00Z"), type: "IMPAIRMENT", value, justification: "Redução ao valor recuperável conforme avaliação demonstrativa do estado de conservação.", evidence: `Memória de avaliação demonstrativa REV-PAT-2026-${index + 1}: pesquisa de referência e inspeção de conservação do equipamento.`, idempotencyKey: `${dataset}:impairment:${index + 1}` }, valuationContext);
    for (const index of [4, 5]) {
      const assetId = `${dataset}-asset-${index}`;
      if (await db.assetWriteOff.count({ where: { assetId } })) continue;
      await recordAssetDisposal(db, { assetId, date: new Date("2026-10-14T12:00:00Z"), type: "Baixa", reason: index === 4 ? "Inutilização — falha de painel eletrônico" : "Inutilização — dano estrutural", justification: "Exemplo demonstrativo de avaliação técnica: reparo superior ao valor de reposição; equipamento destinado ao descarte adequado.", actor: base.actor, financial: { budgetUnitId: base.budgetUnitId } });
    }
    console.log(JSON.stringify({ stage: "WORKFLOWS", requestExamples: 4, newEquipmentCustodies: await db.equipmentCustody.count(), writeOffExamples: 2, valueAdjustmentExamples: 3, assetTotal: await db.asset.count(), materialTotal: await db.material.count() }, null, 2));
  } finally { await db.$disconnect(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na carga patrimonial."); process.exitCode = 1; });

import { config } from "dotenv";
import { and, asc, count, eq, exists, gt, gte, inArray, isNotNull, like, ne, sql } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { assetCategories, assets as assetTable, assetValueAdjustments, assetWriteOffs } from "../src/db/schema/assets";
import { equipmentCustodies, materials as materialTable, materialCategories, materialMovements, materialStocks, warehouses as warehouseTable } from "../src/db/schema/assets-stock";
import { materialRequests, materialRequestItems } from "../src/db/schema/assets-requests";
import { departments, employees } from "../src/db/schema/administration";
import { users, userBudgetUnits } from "../src/db/schema/identity";
import { planningBudgetUnits, planningEntityUnits } from "../src/db/schema/planning-budget";
import { accountingEvents } from "../src/db/schema/finance-accounting";
import { financialAuditLogs } from "../src/db/schema/finance-identity";
import { nextEquipmentCode, nextMaterialCode, nextAssetPatrimonyNumber } from "../src/lib/patrimonio/identifiers";
import { nextYearlyCodeDrizzle } from "../src/db/repositories/platform/sequences";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connectionString) throw new Error("Conexão municipal não configurada.");
const connection = createDatabaseConnection(connectionString);
const db = connection.db;
const dataset = "patrimony-workflow-review-2026-10";
function requireRow<T>(rows: T[], label: string): T { if (!rows[0]) throw new Error(`${label} não encontrado.`); return rows[0]; }

async function main() {
  try {
    if (!process.argv.includes("--apply") && !process.argv.includes("--verify")) {
      const [categories, units, warehouses, actors, requests] = await Promise.all([
        db.select({ id: assetCategories.id, code: assetCategories.code, name: assetCategories.name, lifeSpan: assetCategories.lifeSpan }).from(assetCategories).where(eq(assetCategories.isActive, true)),
        db.select({ id: planningBudgetUnits.id, name: planningBudgetUnits.name, secretariatId: planningBudgetUnits.secretariatId }).from(planningBudgetUnits).innerJoin(planningEntityUnits, eq(planningEntityUnits.budgetUnitId, planningBudgetUnits.id)),
        db.select({ id: warehouseTable.id, name: warehouseTable.name, stocks: sql<number>`(SELECT COUNT(*)::integer FROM "MaterialStock" s WHERE s."warehouseId"=${warehouseTable.id})` }).from(warehouseTable).where(eq(warehouseTable.isActive, true)).then(rows => rows.map(({ stocks, ...row }) => ({ ...row, _count: { stocks } }))),
        db.select({ id: users.id, employeeId: users.employeeId }).from(users).where(and(eq(users.ativo, true), isNotNull(users.employeeId))).then(async rows => { const bindings = await db.select().from(userBudgetUnits).where(inArray(userBudgetUnits.usuarioId, rows.map(row => row.id))); return rows.map(row => ({ ...row, unidadesGestoras: bindings.filter(binding => binding.usuarioId === row.id).map(({ budgetUnitId }) => ({ budgetUnitId })) })); }),
        db.select({ id: materialRequests.id, number: materialRequests.number, status: materialRequests.status, sourceWarehouseId: materialRequests.sourceWarehouseId }).from(materialRequests),
      ]);
      console.log(JSON.stringify({ mode: "PREVIEW", categories, units, warehouses, actors, requests, assetCount: (await db.select({ value: count() }).from(assetTable))[0].value, adjustmentEvents: await db.select({ code: accountingEvents.code }).from(accountingEvents).where(like(accountingEvents.code, "ASSET_%")) }, null, 2));
      return;
    }
    if (process.argv.includes("--verify")) {
      const [assets, warehouses, requests, equipment] = await Promise.all([
        db.select({ id: assetTable.id, code: assetTable.code, status: assetTable.status, currentValue: assetTable.currentValue, currentValueDecimal: assetTable.currentValueDecimal }).from(assetTable),
        db.select({ name: warehouseTable.name, stocks: sql<number>`(SELECT COUNT(*)::integer FROM "MaterialStock" s WHERE s."warehouseId"=${warehouseTable.id})` }).from(warehouseTable).where(eq(warehouseTable.isActive, true)).then(rows => rows.map(({ stocks, ...row }) => ({ ...row, _count: { stocks } }))),
        db.select().from(materialRequests).where(like(materialRequests.idempotencyKey, `${dataset}%`)).then(async rows => { const items = await db.select().from(materialRequestItems).where(inArray(materialRequestItems.requestId, rows.map(row => row.id))); const movements = await db.select({ materialRequestItemId: materialMovements.materialRequestItemId, quantity: materialMovements.quantity, type: materialMovements.type }).from(materialMovements).where(inArray(materialMovements.materialRequestItemId, items.map(item => item.id))); return rows.map(row => ({ ...row, items: items.filter(item => item.requestId === row.id).map(item => ({ ...item, movements: movements.filter(movement => movement.materialRequestItemId === item.id) })) })); }),
        db.select({ value: count() }).from(equipmentCustodies).then(rows => rows[0].value),
      ]);
      if (assets.some(asset => !asset.code || !/^EQP\d{6}$/.test(asset.code))) throw new Error("Bem sem código EQP padronizado.");
      if (warehouses.some(warehouse => warehouse._count.stocks < 4)) throw new Error("Almoxarifado sem variedade mínima de estoques.");
      for (const request of requests) for (const item of request.items) if (item.movements.reduce((total, movement) => total + (movement.type === "Saída" ? movement.quantity : -movement.quantity), 0) !== item.quantityDelivered) throw new Error("Entrega divergente dos movimentos de estoque.");
      console.log(JSON.stringify({ verified: true, assets: assets.length, equipmentInUseWithoutPatrimony: equipment, requestExamples: requests.map(request => ({ code: request.number, status: request.status })), warehouses, writeOffs: (await db.select({ value: count() }).from(assetWriteOffs))[0].value, adjustments: (await db.select({ value: count() }).from(assetValueAdjustments))[0].value }, null, 2));
      return;
    }
    const { createMaterialRequest, approveMaterialRequest, issueMaterialRequestItem, issueMaterialRequestInFull } = await import("../src/lib/compras/procurement-lifecycle");
    const { recordAssetValueAdjustment, recordAssetDisposal } = await import("../src/lib/patrimonio/asset-lifecycle");
    const base = await withDatabaseTransaction(connection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${dataset}))`);
      const budgetUnit = requireRow(await tx.select({ id: planningBudgetUnits.id, secretariatId: planningBudgetUnits.secretariatId }).from(planningBudgetUnits).innerJoin(planningEntityUnits, eq(planningEntityUnits.budgetUnitId, planningBudgetUnits.id)).where(eq(planningBudgetUnits.name, "Secretaria de Administração")).limit(1), "Unidade gestora");
      const actor = requireRow(await tx.select({ id: users.id, employeeId: users.employeeId }).from(users).where(and(eq(users.ativo, true), isNotNull(users.employeeId), exists(tx.select({ id: userBudgetUnits.id }).from(userBudgetUnits).where(and(eq(userBudgetUnits.usuarioId, users.id), eq(userBudgetUnits.budgetUnitId, budgetUnit.id)))))).limit(1), "Responsável");
      const department = (await tx.select({ id: departments.id }).from(departments).where(and(eq(departments.secretariatId, budgetUnit.secretariatId), eq(departments.isActive, true))).limit(1))[0] || (await tx.insert(departments).values({ name: "Gestão de Patrimônio e Almoxarifado", secretariatId: budgetUnit.secretariatId }).returning({ id: departments.id }))[0];
      const requester = requireRow(await tx.select({ id: employees.id, departmentId: employees.departmentId }).from(employees).innerJoin(departments, eq(departments.id, employees.departmentId)).where(and(eq(employees.isActive, true), ne(employees.id, actor.employeeId!), eq(departments.isActive, true))).orderBy(asc(employees.name)).limit(1), "Solicitante");
      await tx.insert(materialCategories).values({ code: "ALM-SAUDE", name: "Insumos de saúde" }).onConflictDoNothing({ target: materialCategories.code });
      const category = requireRow(await tx.select({ id: materialCategories.id }).from(materialCategories).where(eq(materialCategories.code, "ALM-SAUDE")).limit(1), "Categoria de saúde");
      const maintenanceCategory = requireRow(await tx.select({ id: materialCategories.id }).from(materialCategories).where(eq(materialCategories.code, "ALM-MAN")).limit(1), "Categoria de manutenção");
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
        if ((await tx.select({ id: materialTable.id }).from(materialTable).where(eq(materialTable.id, id)).limit(1)).length) continue;
        await tx.insert(materialTable).values({ id, code: await nextMaterialCode(tx, "MATERIAL"), name: item.name, unitOfMeasure: item.unit, isPerishable: item.perishable, categoryId: item.health ? category.id : maintenanceCategory.id, minStock: 10, maxStock: 700 });
        extraMaterials++;
      }
      const materials = await tx.select().from(materialTable).where(eq(materialTable.isActive, true)).orderBy(asc(materialTable.code));
      const warehouses = await tx.select().from(warehouseTable).where(eq(warehouseTable.isActive, true)).orderBy(asc(warehouseTable.name), asc(warehouseTable.id));
      for (const [warehouseIndex, warehouse] of warehouses.entries()) {
        const pharmacy = /medicamentos|farmácia/i.test(warehouse.name);
        const workshop = /rural|manutenção|tanques/i.test(warehouse.name);
        const eligible = materials.filter(material => pharmacy ? material.categoryId === category.id || /paracetamol|cloreto de sódio/i.test(material.name) : workshop ? material.categoryId === maintenanceCategory.id : material.unitOfMeasure !== "L" && material.categoryId !== category.id && !/paracetamol|cloreto de sódio/i.test(material.name));
        const requestedNames = ["Envelope pardo A4", "Lápis grafite HB", "Monitor LED 24 polegadas", "Marcador de texto amarelo"];
        const generalSelection = [...eligible.filter(material => material.type === "MATERIAL").slice(0, 8), ...eligible.filter(material => material.type === "PATRIMONIO").slice(0, 4), ...eligible.filter(material => requestedNames.includes(material.name))];
        const selection = pharmacy ? eligible.slice(0, 7) : workshop ? eligible.slice(0, 12) : [...new Map(generalSelection.map(material => [material.id, material])).values()];
        for (const [position, material] of selection.entries()) {
          const batchNumber = `${dataset}-${warehouseIndex + 1}-${position + 1}`;
          if ((await tx.select({ id: materialStocks.id }).from(materialStocks).where(and(eq(materialStocks.warehouseId, warehouse.id), eq(materialStocks.materialId, material.id), eq(materialStocks.batchNumber, batchNumber))).limit(1)).length) continue;
          const quantity = material.type === "PATRIMONIO" ? 5 + (warehouseIndex + position * 3) % 16 : 50 + (warehouseIndex * 47 + position * 31) % 650;
          const reference = extraItems.find(item => item.name === material.name);
          const [otherStock] = await tx.select({ unitCost: materialStocks.unitCost }).from(materialStocks).where(and(eq(materialStocks.materialId, material.id), isNotNull(materialStocks.unitCost))).limit(1);
          const unitCost = reference?.cost || otherStock?.unitCost || 12;
          const expirationDate = material.isPerishable ? new Date(Date.now() + (60 + position * 21 + warehouseIndex * 7) * 86400000) : undefined;
          const [stock] = await tx.insert(materialStocks).values({ warehouseId: warehouse.id, materialId: material.id, batchNumber, quantity, unitCost, expirationDate }).returning();
          await tx.insert(materialMovements).values({ idempotencyKey: `${dataset}:opening:${stock.id}`, type: "Entrada", materialId: material.id, warehouseId: warehouse.id, stockId: stock.id, quantity, quantityDecimal: quantity, unitValue: unitCost, unitValueDecimal: unitCost, totalValueDecimal: (quantity * unitCost).toFixed(2), reason: "Distribuição inicial demonstrativa de estoques — revisão autorizada do Almoxarifado.", actorUsuarioId: actor.id, actorEmployeeId: actor.employeeId });
          newStocks++;
        }
      }
      for (const asset of await tx.select({ id: assetTable.id, code: assetTable.code }).from(assetTable)) if (!asset.code || !/^EQP\d{6}$/.test(asset.code)) {
        await tx.update(assetTable).set({ code: await nextEquipmentCode(tx) }).where(eq(assetTable.id, asset.id));
        normalizedAssetCodes++;
      }
      const requestRows = await tx.select().from(materialRequests);
      const requestItems = await tx.select().from(materialRequestItems).where(inArray(materialRequestItems.requestId, requestRows.map(row => row.id)));
      const existingRequests = requestRows.map(row => ({ ...row, items: requestItems.filter(item => item.requestId === row.id) }));
      for (const request of existingRequests) {
        const code = /^REQ-\d{4}-\d{6}$/.test(request.number) ? request.number : await nextYearlyCodeDrizzle({ db: tx, key: "patrimonio-requisicao-material", prefix: "REQ", padding: 6, existingCodes: (await tx.select({ number: materialRequests.number }).from(materialRequests)).map(row => ({ code: row.number })) });
        const positions = request.sourceWarehouseId ? [] : await tx.select({ warehouseId: materialStocks.warehouseId, materialId: materialStocks.materialId, quantity: materialStocks.quantity }).from(materialStocks).where(and(inArray(materialStocks.materialId, request.items.map(item => item.materialId)), gt(materialStocks.quantity, 0)));
        const origin = request.sourceWarehouseId || warehouses.find(warehouse => request.items.length > 0 && request.items.every(item => positions.filter(stock => stock.warehouseId === warehouse.id && stock.materialId === item.materialId).reduce((total, stock) => total + stock.quantity, 0) >= item.quantityRequested))?.id;
        if (code !== request.number || origin !== request.sourceWarehouseId) {
          await tx.update(materialRequests).set({ number: code, ...(origin ? { sourceWarehouseId: origin } : {}) }).where(eq(materialRequests.id, request.id));
          if (code !== request.number) { normalizedRequestCodes++; await tx.insert(financialAuditLogs).values({ action: "MATERIAL_REQUEST_CODE_NORMALIZED", entityType: "MaterialRequest", entityId: request.id, authorUsuarioId: actor.id, payload: { previousCode: request.number, code, dataset } }); }
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
        if ((await tx.select({ id: assetTable.id }).from(assetTable).where(eq(assetTable.id, id)).limit(1)).length) continue;
        await tx.insert(assetTable).values({ id, code: await nextEquipmentCode(tx), patrimonyNumber: await nextAssetPatrimonyNumber(tx), name: item.name, categoryId: item.categoryId, status: item.status, description: "Exemplo demonstrativo do ciclo patrimonial com equipamento plausível. Valores e ocorrências de referência.", serialNumber: `REV2026-${String(index + 1).padStart(4, "0")}`, acquisitionDate: new Date("2026-06-15T12:00:00Z"), incorporationDate: new Date("2026-06-15T12:00:00Z"), acquisitionValue: item.value, currentValue: item.value, acquisitionValueDecimal: item.value, currentValueDecimal: item.value, departmentId: department.id, responsibleId: actor.employeeId, budgetUnitId: budgetUnit.id });
        newAssets++;
      }
      const totals = { extraMaterials, newStocks, normalizedAssetCodes, normalizedRequestCodes, newAssets };
      if (Object.values(totals).some(count => count > 0)) await tx.insert(financialAuditLogs).values({ action: "PATRIMONY_REVIEW_BASE_POPULATED", entityType: "DATASET", entityId: dataset, authorUsuarioId: actor.id, payload: { dataset, fictional: true, totals } });
      return { actor: { usuarioId: actor.id, employeeId: actor.employeeId! }, budgetUnitId: budgetUnit.id, requester, totals, originWarehouseId: warehouses.find(warehouse => warehouse.name === "Almoxarifado Central")!.id };
    }, { timeoutMs: 240000, lockTimeoutMs: 20000 });
    console.log(JSON.stringify({ stage: "BASE", ...base.totals }));
    const examples = [
      { key: "pending", name: "Envelope pardo A4", quantity: 12 },
      { key: "partial", name: "Lápis grafite HB", quantity: 10 },
      { key: "equipment", name: "Monitor LED 24 polegadas", quantity: 2 },
      { key: "complete", name: "Marcador de texto amarelo", quantity: 8 },
    ];
    for (const example of examples) {
      const material = requireRow(await db.select({ id: materialTable.id }).from(materialTable).where(eq(materialTable.name, example.name)).limit(1), "Material");
      const request = await createMaterialRequest(connection, { ...base.actor, employeeId: base.requester.id }, { sourceWarehouseId: base.originWarehouseId, departmentId: base.requester.departmentId!, idempotencyKey: `${dataset}:${example.key}`, justification: `Exemplo de ${example.key === "partial" ? "entrega parcial" : example.key === "equipment" ? "equipamento em uso sem tombamento" : example.key === "complete" ? "atendimento integral" : "pedido pendente de aprovação"} — revisão do Almoxarifado.`, items: [{ materialId: material.id, quantityRequested: example.quantity }] });
      if (example.key === "pending") continue;
      const item = requireRow(await db.select().from(materialRequestItems).where(eq(materialRequestItems.requestId, request.id)).limit(1), "Item da requisição");
      if (request.status === "Pendente") await approveMaterialRequest(connection, base.actor, { requestId: request.id, quantities: [{ itemId: item.id, quantityApproved: example.quantity }] });
      const stock = requireRow(await db.select({ id: materialStocks.id }).from(materialStocks).where(and(eq(materialStocks.materialId, material.id), eq(materialStocks.warehouseId, base.originWarehouseId), gte(materialStocks.quantity, example.quantity))).limit(1), "Estoque");
      if (example.key === "partial") await issueMaterialRequestItem(connection, base.actor, { requestItemId: item.id, stockId: stock.id, quantity: 4, idempotencyKey: `${dataset}:partial-first` });
      else await issueMaterialRequestInFull(connection, base.actor, { requestId: request.id, stockByItem: [{ requestItemId: item.id, stockId: stock.id }] });
    }
    const valuationContext = { actor: base.actor, budgetUnitId: base.budgetUnitId };
    for (const [index, value] of [4800, 2700, 1200].entries()) await recordAssetValueAdjustment(connection, { assetId: `${dataset}-asset-${index + 1}`, date: new Date("2026-10-14T12:00:00Z"), type: "IMPAIRMENT", value, justification: "Redução ao valor recuperável conforme avaliação demonstrativa do estado de conservação.", evidence: `Memória de avaliação demonstrativa REV-PAT-2026-${index + 1}: pesquisa de referência e inspeção de conservação do equipamento.`, idempotencyKey: `${dataset}:impairment:${index + 1}` }, valuationContext);
    for (const index of [4, 5]) {
      const assetId = `${dataset}-asset-${index}`;
      if ((await db.select({ id: assetWriteOffs.id }).from(assetWriteOffs).where(eq(assetWriteOffs.assetId, assetId)).limit(1)).length) continue;
      await recordAssetDisposal(connection, { assetId, date: new Date("2026-10-14T12:00:00Z"), type: "Baixa", reason: index === 4 ? "Inutilização — falha de painel eletrônico" : "Inutilização — dano estrutural", justification: "Exemplo demonstrativo de avaliação técnica: reparo superior ao valor de reposição; equipamento destinado ao descarte adequado.", actor: base.actor, financial: { budgetUnitId: base.budgetUnitId } });
    }
    console.log(JSON.stringify({ stage: "WORKFLOWS", requestExamples: 4, newEquipmentCustodies: (await db.select({ value: count() }).from(equipmentCustodies))[0].value, writeOffExamples: 2, valueAdjustmentExamples: 3, assetTotal: (await db.select({ value: count() }).from(assetTable))[0].value, materialTotal: (await db.select({ value: count() }).from(materialTable))[0].value }, null, 2));
  } finally { await connection.pool.end(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na carga patrimonial."); process.exitCode = 1; });

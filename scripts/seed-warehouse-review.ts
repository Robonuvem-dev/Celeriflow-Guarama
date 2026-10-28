import { config } from "dotenv";
import { and, asc, count, eq, ilike, isNull, like, sql } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { Decimal } from "../src/db/decimal";
import { materials as materialTable, materialCategories, materialStocks, materialMovements, warehouses as warehouseTable } from "../src/db/schema/assets-stock";
import { employees } from "../src/db/schema/administration";
import { users, accessProfiles } from "../src/db/schema/identity";
import { financialAuditLogs } from "../src/db/schema/finance-identity";
import { nextMaterialCode } from "../src/lib/patrimonio/identifiers";
import { normalizeMaterialUnit } from "../src/lib/patrimonio/material-units";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connectionString) throw new Error("Conexão municipal não configurada.");
const connection = createDatabaseConnection(connectionString);
const { db } = connection;
const dataset = "warehouse-review-2026-10";

type Item = { name: string; category: string; unit: "UN" | "KG" | "m" | "KT"; cost: number; perishable?: boolean; equipment?: boolean };
const items: Item[] = [
  { name: "Lápis grafite HB", category: "EXP", unit: "UN", cost: 1.2 },
  { name: "Borracha branca escolar", category: "EXP", unit: "UN", cost: 0.9 },
  { name: "Apontador com depósito", category: "EXP", unit: "UN", cost: 2.5 },
  { name: "Marcador de texto amarelo", category: "EXP", unit: "UN", cost: 3.8 },
  { name: "Grampeador de mesa pequeno", category: "EXP", unit: "UN", cost: 24 },
  { name: "Grampos 26/6, pacote com 5.000", category: "EXP", unit: "KT", cost: 8.5 },
  { name: "Clipes metálicos, pacote com 100", category: "EXP", unit: "KT", cost: 4.2 },
  { name: "Envelope pardo A4", category: "EXP", unit: "UN", cost: 0.7 },
  { name: "Etiqueta adesiva A4, pacote com 100 folhas", category: "EXP", unit: "KT", cost: 36 },
  { name: "Fita adesiva transparente, rolo 48 mm", category: "EXP", unit: "UN", cost: 6.4 },
  { name: "Detergente neutro, frasco 500 ml", category: "LIMP", unit: "UN", cost: 2.7, perishable: true },
  { name: "Água sanitária, frasco 1 litro", category: "LIMP", unit: "UN", cost: 3.2, perishable: true },
  { name: "Desinfetante, frasco 2 litros", category: "LIMP", unit: "UN", cost: 7.9, perishable: true },
  { name: "Sabão em pó", category: "LIMP", unit: "KG", cost: 10.5, perishable: true },
  { name: "Esponja multiuso, pacote com 3", category: "LIMP", unit: "KT", cost: 4.5 },
  { name: "Saco para lixo 100 litros, pacote com 10", category: "LIMP", unit: "KT", cost: 12 },
  { name: "Pano de limpeza em algodão", category: "LIMP", unit: "UN", cost: 5.8 },
  { name: "Vassoura de nylon", category: "LIMP", unit: "UN", cost: 17 },
  { name: "Rodo de borracha 60 cm", category: "LIMP", unit: "UN", cost: 22 },
  { name: "Papel toalha interfolhado, pacote com 1.000", category: "LIMP", unit: "KT", cost: 19 },
  { name: "Arroz branco tipo 1", category: "ALIM", unit: "KG", cost: 6.5, perishable: true },
  { name: "Feijão carioca tipo 1", category: "ALIM", unit: "KG", cost: 8.9, perishable: true },
  { name: "Açúcar cristal", category: "ALIM", unit: "KG", cost: 4.6, perishable: true },
  { name: "Farinha de trigo", category: "ALIM", unit: "KG", cost: 5.2, perishable: true },
  { name: "Café torrado e moído, pacote 500 g", category: "ALIM", unit: "KT", cost: 18, perishable: true },
  { name: "Leite em pó integral", category: "ALIM", unit: "KG", cost: 32, perishable: true },
  { name: "Macarrão espaguete, pacote 500 g", category: "ALIM", unit: "KT", cost: 4.5, perishable: true },
  { name: "Óleo de soja, frasco 900 ml", category: "ALIM", unit: "UN", cost: 7.5, perishable: true },
  { name: "Biscoito água e sal, pacote 400 g", category: "ALIM", unit: "KT", cost: 6.2, perishable: true },
  { name: "Extrato de tomate, lata 340 g", category: "ALIM", unit: "UN", cost: 5.8, perishable: true },
  { name: "Cabo elétrico flexível 2,5 mm²", category: "MAN", unit: "m", cost: 2.8 },
  { name: "Cabo de rede CAT6", category: "MAN", unit: "m", cost: 4.1 },
  { name: "Mangueira de jardim 1/2 polegada", category: "MAN", unit: "m", cost: 6.7 },
  { name: "Tubo PVC soldável 25 mm", category: "MAN", unit: "m", cost: 8.4 },
  { name: "Parafusos e buchas, kit com 50", category: "MAN", unit: "KT", cost: 16 },
  { name: "Luva de proteção nitrílica, par", category: "MAN", unit: "KT", cost: 12.5 },
  { name: "Máscara descartável, pacote com 50", category: "MAN", unit: "KT", cost: 18, perishable: true },
  { name: "Óculos de proteção transparente", category: "MAN", unit: "UN", cost: 9 },
  { name: "Tinta acrílica branca, lata 18 litros", category: "MAN", unit: "UN", cost: 230, perishable: true },
  { name: "Massa corrida, embalagem 25 kg", category: "MAN", unit: "UN", cost: 65, perishable: true },
  { name: "Monitor LED 24 polegadas", category: "EQP", unit: "UN", cost: 720, equipment: true },
  { name: "Scanner de documentos duplex", category: "EQP", unit: "UN", cost: 2400, equipment: true },
  { name: "Projetor multimídia 4.000 lumens", category: "EQP", unit: "UN", cost: 3600, equipment: true },
  { name: "Nobreak 1.200 VA", category: "EQP", unit: "UN", cost: 980, equipment: true },
  { name: "Roteador corporativo dual band", category: "EQP", unit: "UN", cost: 540, equipment: true },
  { name: "Switch de rede 24 portas", category: "EQP", unit: "UN", cost: 1350, equipment: true },
  { name: "Furadeira de impacto 750 W", category: "EQP", unit: "UN", cost: 420, equipment: true },
  { name: "Balança digital de bancada 30 kg", category: "EQP", unit: "UN", cost: 650, equipment: true },
  { name: "Ventilador de coluna 50 cm", category: "EQP", unit: "UN", cost: 290, equipment: true },
  { name: "Armário metálico de duas portas", category: "EQP", unit: "UN", cost: 1100, equipment: true },
];
const categories = { EXP: "Material de expediente", LIMP: "Limpeza e higiene", ALIM: "Gêneros alimentícios", MAN: "Manutenção e proteção", EQP: "Equipamentos" };

async function main() {
  try {
    if (process.argv.includes("--verify")) {
      const [catalog, stocks, movements] = await Promise.all([
        db.select().from(materialTable).orderBy(asc(materialTable.code)), db.select().from(materialStocks),
        db.select({ stockId: materialMovements.stockId, quantity: materialMovements.quantity, type: materialMovements.type }).from(materialMovements),
      ]);
      const materials = catalog.map(material => ({ ...material, stocks: stocks.filter(stock => stock.materialId === material.id).map(stock => ({ ...stock, movements: movements.filter(movement => movement.stockId === stock.id) })) }));
      const seeded = materials.filter(material => material.id.startsWith(`${dataset}-material-`));
      const lots = materials.flatMap(material => material.stocks).filter(stock => stock.id.startsWith(`${dataset}-stock-`));
      if (seeded.length !== 50) throw new Error("O catálogo deve conter os 50 novos itens.");
      if (materials.some(material => !(material.type === "PATRIMONIO" ? /^EQP\d{6}$/ : /^MAT\d{6}$/).test(material.code))) throw new Error("Código fora do padrão.");
      if (seeded.some(material => !material.stocks.length)) throw new Error("Novo material sem estoque inicial.");
      if (materials.some(material => material.isPerishable && material.stocks.some(stock => stock.quantity > 0 && !stock.expirationDate))) throw new Error("Perecível sem validade.");
      if (lots.some(stock => stock.movements.reduce((total, movement) => total + (movement.type === "Entrada" ? movement.quantity : -movement.quantity), 0) !== stock.quantity)) throw new Error("Saldo inicial divergente do histórico de movimentos.");
      const pages = [];
      for (let page = 0; page < Math.ceil(materials.length / 20); page++) pages.push((await db.select({ id: materialTable.id }).from(materialTable).offset(page * 20).limit(20).orderBy(asc(materialTable.code), asc(materialTable.id))).length);
      console.log(JSON.stringify({ verified: true, catalogTotal: materials.length, newItems: seeded.length, pageSizes: pages, newPerishables: seeded.filter(material => material.isPerishable).length, initialLots: lots.length, quantityRange: [Math.min(...lots.map(stock => stock.quantity)), Math.max(...lots.map(stock => stock.quantity))], activeEmployees: (await db.select({ count: count() }).from(employees).where(eq(employees.isActive, true)))[0].count, legacyUnits: [...new Set(materials.map(material => material.unitOfMeasure))] }, null, 2));
      return;
    }
    if (!process.argv.includes("--apply")) {
      const [materials, warehouses] = await Promise.all([
        db.select({ id: materialTable.id, code: materialTable.code, name: materialTable.name, type: materialTable.type, unitOfMeasure: materialTable.unitOfMeasure,
          stocks: sql<number>`(SELECT count(*)::int FROM "MaterialStock" WHERE "materialId"=${materialTable.id})`, movements: sql<number>`(SELECT count(*)::int FROM "MaterialMovement" WHERE "materialId"=${materialTable.id})`, receiptItems: sql<number>`(SELECT count(*)::int FROM "PurchaseReceiptItem" WHERE "materialId"=${materialTable.id})`,
        }).from(materialTable).orderBy(asc(materialTable.code)).then(rows => rows.map(({ stocks, movements, receiptItems, ...material }) => ({ ...material, _count: { stocks, movements, receiptItems } }))),
        db.select({ id: warehouseTable.id, name: warehouseTable.name }).from(warehouseTable).where(eq(warehouseTable.isActive, true)).orderBy(asc(warehouseTable.name)),
      ]);
      console.log(JSON.stringify({ mode: "PREVIEW", newMaterials: items.length, perishable: items.filter(item => item.perishable).length, warehouses, existingMaterials: materials }, null, 2));
      return;
    }
    const result = await withDatabaseTransaction(connection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${dataset}))`);
      const [actor] = await tx.select({ id: users.id }).from(users).innerJoin(accessProfiles, eq(accessProfiles.id, users.perfilId)).where(and(eq(users.ativo, true), eq(accessProfiles.codigo, "SYSTEM_ADMINISTRATOR"))).limit(1);
      if (!actor) throw new Error("Administrador ativo não encontrado.");
      let warehouses = await tx.select({ id: warehouseTable.id, name: warehouseTable.name, type: warehouseTable.type }).from(warehouseTable).where(eq(warehouseTable.isActive, true)).orderBy(asc(warehouseTable.type), asc(warehouseTable.name));
      if (!warehouses.length) {
        const [manager] = await tx.select({ id: employees.id }).from(employees).where(eq(employees.isActive, true)).limit(1);
        if (!manager) throw new Error("Servidor responsável ativo não encontrado.");
        warehouses = await tx.insert(warehouseTable).values({ id: `${dataset}-central`, name: "Almoxarifado Central", type: "Central", managerId: manager.id }).returning({ id: warehouseTable.id, name: warehouseTable.name, type: warehouseTable.type });
      }
      const totals = { materialsCreated: 0, codesNormalized: 0, unitsNormalized: 0, stocksCreated: 0, movementsCreated: 0, perishableLots: 0 };
      const categoryIds = new Map<string, string>();
      for (const [key, name] of Object.entries(categories)) {
        const [existing] = await tx.select({ id: materialCategories.id }).from(materialCategories).where(and(ilike(materialCategories.name, name), eq(materialCategories.isActive, true))).limit(1);
        let category = existing;
        if (!category) {
          const [created] = await tx.insert(materialCategories).values({ code: `ALM-${key}`, name }).onConflictDoNothing({ target: materialCategories.code }).returning({ id: materialCategories.id });
          category = created ?? (await tx.select({ id: materialCategories.id }).from(materialCategories).where(eq(materialCategories.code, `ALM-${key}`)).limit(1))[0];
        }
        categoryIds.set(key, category.id);
      }
      const existing = await tx.select({ material: materialTable, unlinked: sql<boolean>`NOT EXISTS (SELECT 1 FROM "MaterialMovement" WHERE "materialId"=${materialTable.id}) AND NOT EXISTS (SELECT 1 FROM "PurchaseReceiptItem" WHERE "materialId"=${materialTable.id}) AND NOT EXISTS (SELECT 1 FROM "MaterialRequestItem" WHERE "materialId"=${materialTable.id}) AND NOT EXISTS (SELECT 1 FROM "PurchaseRequestItem" WHERE "materialId"=${materialTable.id}) AND NOT EXISTS (SELECT 1 FROM "PurchaseProcessItem" WHERE "materialId"=${materialTable.id})` }).from(materialTable).orderBy(asc(materialTable.createdAt), asc(materialTable.id)).then(rows => rows.map(row => ({ ...row.material, unlinked: row.unlinked })));
      for (const material of existing) {
        const equipmentByName = /^(computador|notebook|impressora|cadeira|mesa de escritório|monitor|scanner|projetor|nobreak|roteador|switch|furadeira|balança|ventilador|armário)/i.test(material.name);
        const unlinked = material.unlinked;
        const type = material.type === "PATRIMONIO" || (equipmentByName && unlinked) ? "PATRIMONIO" : "MATERIAL";
        const pattern = type === "PATRIMONIO" ? /^EQP\d{6}$/ : /^MAT\d{6}$/;
        const code = pattern.test(material.code) ? material.code : await nextMaterialCode(tx, type);
        const unitOfMeasure = /resma|kit de ferramentas/i.test(material.name) ? "KT" : normalizeMaterialUnit(material.unitOfMeasure);
        if (code !== material.code || unitOfMeasure !== material.unitOfMeasure || type !== material.type) {
          await tx.update(materialTable).set({ code, type, unitOfMeasure }).where(eq(materialTable.id, material.id));
          if (code !== material.code) totals.codesNormalized++;
          if (unitOfMeasure !== material.unitOfMeasure) totals.unitsNormalized++;
        }
      }
      for (const [index, item] of items.entries()) {
        const id = `${dataset}-material-${String(index + 1).padStart(2, "0")}`;
        if ((await tx.select({ id: materialTable.id }).from(materialTable).where(eq(materialTable.id, id)).limit(1)).length) continue;
        const type = item.equipment ? "PATRIMONIO" : "MATERIAL";
        await tx.insert(materialTable).values({ id, code: await nextMaterialCode(tx, type), name: item.name, description: `${item.name}. Unidade de fornecimento: ${item.unit}. Cadastro de referência para revisão do almoxarifado.`, type, unitOfMeasure: item.unit, categoryId: categoryIds.get(item.category)!, isPerishable: Boolean(item.perishable), minStock: item.equipment ? 3 : 20, maxStock: item.equipment ? 40 : 600 });
        totals.materialsCreated++;
      }
      const materials = await tx.select({ material: materialTable, hasStocks: sql<boolean>`EXISTS (SELECT 1 FROM "MaterialStock" WHERE "materialId"=${materialTable.id})` }).from(materialTable).where(eq(materialTable.isActive, true)).orderBy(asc(materialTable.code)).then(rows => rows.map(row => ({ ...row.material, hasStocks: row.hasStocks })));
      for (const [index, material] of materials.entries()) {
        // A carga inicial só adiciona saldo a itens sem lotes: nunca repõe consumo nem sobrescreve saldo existente.
        if (material.hasStocks) continue;
        const itemIndex = items.findIndex((_, position) => material.id === `${dataset}-material-${String(position + 1).padStart(2, "0")}`);
        const item = itemIndex >= 0 ? items[itemIndex] : undefined;
        const pharmacyMaterial = /paracetamol|cloreto de sódio/i.test(material.name);
        const eligible = warehouses.filter(warehouse => pharmacyMaterial ? /medicamentos|farmácia/i.test(warehouse.name) : item?.category === "ALIM" ? /escolar|central/i.test(warehouse.name) && !/medicamentos|farmácia/i.test(warehouse.name) : !/medicamentos|farmácia|tanques/i.test(warehouse.name));
        const destinations = eligible.length ? eligible : warehouses;
        const selected = [destinations[index % destinations.length]];
        if (destinations.length > 1 && index % 4 === 0) selected.push(destinations[(index + 1) % destinations.length]);
        for (const [position, warehouse] of selected.entries()) {
          const quantity = material.type === "PATRIMONIO" ? 2 + (index * 7 + position * 3) % 24 : 8 + (index * 37 + position * 61) % 480;
          const unitCost = item?.cost || (material.type === "PATRIMONIO" ? 850 + index * 35 : 3.5 + index % 19);
          const expirationDate = material.isPerishable ? new Date(Date.now() + (45 + index * 13 % 320) * 86400000) : undefined;
          const [stock] = await tx.insert(materialStocks).values({ id: `${dataset}-stock-${material.id}-${position}`, materialId: material.id, warehouseId: warehouse.id, batchNumber: `${dataset}-${index + 1}-${position + 1}`, quantity, unitCost, expirationDate }).returning({ id: materialStocks.id });
          await tx.insert(materialMovements).values({ idempotencyKey: `${dataset}:${stock.id}`, type: "Entrada", quantity, quantityDecimal: new Decimal(quantity), unitValue: unitCost, unitValueDecimal: new Decimal(unitCost), totalValueDecimal: new Decimal((quantity * unitCost).toFixed(2)), reason: "Saldo inicial demonstrativo — revisão do Almoxarifado autorizada pelo responsável.", materialId: material.id, warehouseId: warehouse.id, stockId: stock.id });
          totals.stocksCreated++;
          totals.movementsCreated++;
          if (expirationDate) totals.perishableLots++;
        }
      }
      if (Object.values(totals).some(value => value > 0)) await tx.insert(financialAuditLogs).values({ action: "WAREHOUSE_REVIEW_POPULATED", entityType: "DATASET", entityId: dataset, authorUsuarioId: actor.id, payload: { dataset, fictional: true, totals, source: "OWNER_AUTHORIZED_REFERENCE" } });
      const invalidCodes = (await tx.select({ code: materialTable.code, type: materialTable.type }).from(materialTable)).filter(material => !(material.type === "PATRIMONIO" ? /^EQP\d{6}$/ : /^MAT\d{6}$/).test(material.code));
      if (invalidCodes.length) throw new Error("A verificação encontrou códigos fora do padrão.");
      return { ...totals, materialTotal: (await tx.select({ count: count() }).from(materialTable))[0].count, datasetMaterials: (await tx.select({ count: count() }).from(materialTable).where(like(materialTable.id, `${dataset}-material-%`)))[0].count, warehouses: warehouses.length, perishableWithoutExpiration: (await tx.select({ count: count() }).from(materialStocks).innerJoin(materialTable, eq(materialTable.id, materialStocks.materialId)).where(and(eq(materialTable.isPerishable, true), sql`${materialStocks.quantity}>0`, isNull(materialStocks.expirationDate))))[0].count };
    }, { timeoutMs: 240000 });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await connection.pool.end();
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na carga do Almoxarifado."); process.exitCode = 1; });

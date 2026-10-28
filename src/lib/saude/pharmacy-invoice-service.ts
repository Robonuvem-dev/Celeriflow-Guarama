import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import type { DatabaseConnection } from "@/db/connection";
import { suppliers, companies } from "@/db/schema/registry";
import { pharmacyStockReceipts } from "@/db/schema/health-pharmacy";
import { pharmacyRecord, readPharmacyWarehouse } from "@/db/repositories/health-pharmacy/records";
import type { HealthPharmacyContext } from "@/lib/contracts/health-pharmacy";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import { parsePharmacyInvoice } from "./pharmacy-invoice";
import { postHealthStockReceipt } from "./health-stock-service";

export async function importPharmacyInvoice(context: HealthPharmacyContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ content: z.string().min(1), warehouseId: z.string().min(1), supplierId: z.string().min(1), mappings: z.array(z.object({ sourceKey: z.string().min(1), materialId: z.string().min(1), conversionFactor: z.number().positive().max(1000000), batchNumber: z.string().trim().min(1), productionDate: z.coerce.date().nullable(), expirationDate: z.coerce.date(), manufacturerName: z.string().trim().nullable() }).strict()).min(1).max(5000) }).strict().parse(raw);
  const invoice = parsePharmacyInvoice(input.content);
  const executor = context.database ?? connection.db;
  const row = pharmacyRecord((await executor.select({ supplier: suppliers, company: companies }).from(suppliers).leftJoin(companies, eq(companies.id, suppliers.companyId)).where(and(eq(suppliers.id, input.supplierId), eq(suppliers.status, "Ativo"))).limit(1))[0]);
  const supplier = { ...row.supplier, company: row.company };
  if (supplier.company?.cnpj.replace(/\D/g, "") !== invoice.supplierCnpj) throw new Error("Selecione o fornecedor com o CNPJ emitente da NF-e.");
  const warehouse = await readPharmacyWarehouse(executor, input.warehouseId);
  if (!warehouse.healthUnitId) throw new Error("Estoque sem vínculo com unidade de saúde.");
  assertHealthUnitAccess(context.user, warehouse.healthUnitId);
  const [duplicate] = await executor.select().from(pharmacyStockReceipts).where(eq(pharmacyStockReceipts.invoiceKey, invoice.invoiceKey)).limit(1);
  if (duplicate && duplicate.warehouseId !== warehouse.id) throw new Error("Esta NF-e já foi registrada em outro estoque. Consulte a entrada original.");
  if (input.mappings.length !== invoice.items.length || new Set(input.mappings.map(mapping => mapping.sourceKey)).size !== input.mappings.length) throw new Error("Mapeie cada item/lote da NF-e exatamente uma vez.");
  const items = invoice.items.map(item => {
    const mapping = input.mappings.find(mapping => mapping.sourceKey === item.key);
    if (!mapping) throw new Error(`Mapeamento ausente para o item ${item.line}.`);
    if (item.batchNumber && item.batchNumber !== mapping.batchNumber || item.expirationDate && item.expirationDate.slice(0, 10) !== mapping.expirationDate.toISOString().slice(0, 10) || item.productionDate && item.productionDate.slice(0, 10) !== mapping.productionDate?.toISOString().slice(0, 10)) throw new Error(`Lote/validade/fabricação do item ${item.line} diferem do XML.`);
    return { materialId: mapping.materialId, batchNumber: mapping.batchNumber, productionDate: mapping.productionDate, expirationDate: mapping.expirationDate, manufacturerName: mapping.manufacturerName, quantity: item.quantity * mapping.conversionFactor, unitCost: item.unitCost / mapping.conversionFactor };
  });
  return postHealthStockReceipt(context, { warehouseId: warehouse.id, supplierId: supplier.id, entryType: "Fornecedor", invoiceNumber: invoice.invoiceNumber, invoiceKey: invoice.invoiceKey, invoiceIssuedAt: invoice.invoiceIssuedAt, invoiceXmlHash: invoice.invoiceXmlHash, idempotencyKey: `HEALTH_NFE:${invoice.invoiceKey}`, items }, connection);
}

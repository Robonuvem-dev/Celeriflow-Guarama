import { and, asc, eq, gte, ilike, lte, or } from "drizzle-orm";
import { db } from "@/db/client";
import { assets, assetMaintenances, assetCategories } from "@/db/schema/assets";
import { assetCatalogRecords } from "@/db/schema/assets-catalogs";
import { purchaseProcesses, purchaseProcessItems } from "@/db/schema/procurement-core";
import { materials, materialStocks, warehouses } from "@/db/schema/assets-stock";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { assetOperationWhere } from "@/lib/patrimonio/asset-operations";
import { renderAssetReport } from "@/lib/patrimonio/catalog-report";
import { z } from "zod";

const querySchema = z.object({ report: z.enum(["bens", "manutencoes", "estoque", "aquisicao"]).default("bens"), format: z.enum(["csv", "html"]).default("html"), q: z.string().max(200).default(""), status: z.string().max(80).default(""), category: z.string().max(100).default(""), from: z.union([z.iso.date(), z.literal("")]).default(""), to: z.union([z.iso.date(), z.literal("")]).default("") });
export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ error: "Filtros inválidos." }, { status: 400 });
  const query = parsed.data;
  if (query.from && query.to && query.from > query.to) return Response.json({ error: "Período inválido." }, { status: 400 });
  const context = await getTenantContextForModuleOperation("PATRIMONIO", "issueReports"), database = context.database ?? db;
  const scope = assetOperationWhere(context);
  let columns: string[], rows: unknown[][];
  const from = query.from ? new Date(query.from + "T00:00:00.000Z") : undefined;
  const to = query.to ? new Date(query.to + "T23:59:59.999Z") : undefined;
  if (query.report === "aquisicao") {
    const records = await database.select({ code: materials.code, name: materials.name, unit: materials.unitOfMeasure, quantity: purchaseProcessItems.quantity, process: purchaseProcesses.number, status: purchaseProcesses.status }).from(purchaseProcessItems).innerJoin(materials, eq(materials.id, purchaseProcessItems.materialId)).innerJoin(purchaseProcesses, eq(purchaseProcesses.id, purchaseProcessItems.purchaseProcessId)).where(and(scope.departmentId ? eq(purchaseProcesses.secretariatId, context.user.secretariatId || "__unassigned__") : undefined, query.q ? or(ilike(materials.name, `%${query.q}%`), ilike(materials.code, `%${query.q}%`)) : undefined, query.status ? eq(purchaseProcesses.status, query.status) : undefined, from ? gte(purchaseProcesses.createdAt, from) : undefined, to ? lte(purchaseProcesses.createdAt, to) : undefined)).orderBy(asc(materials.code));
    columns = ["Código", "Material", "Unidade", "Quantidade em aquisição", "Processo de compra", "Situação"]; rows = records.map(r => [r.code, r.name, r.unit, r.quantity, r.process, r.status]);
  } else if (query.report === "estoque") {
    // Warehouse managers own stock scope; global stock is reserved for admins.
    const records = await database.select({ code: materials.code, name: materials.name, unit: materials.unitOfMeasure, quantity: materialStocks.quantity, warehouse: warehouses.name }).from(materialStocks).innerJoin(materials, eq(materials.id, materialStocks.materialId)).innerJoin(warehouses, eq(warehouses.id, materialStocks.warehouseId)).where(and(scope.departmentId ? eq(warehouses.managerId, context.user.employeeId || "__unassigned__") : undefined, query.q ? or(ilike(materials.name, `%${query.q}%`), ilike(materials.code, `%${query.q}%`)) : undefined)).orderBy(asc(materials.code));
    columns = ["Código", "Material", "Unidade", "Quantidade", "Almoxarifado"]; rows = records.map(r => [r.code, r.name, r.unit, r.quantity, r.warehouse]);
  } else if (query.report === "manutencoes") {
    const records = await database.select({ code: assets.patrimonyNumber, name: assets.name, description: assetMaintenances.description, start: assetMaintenances.startDate, end: assetMaintenances.endDate, cost: assetMaintenances.cost, status: assetMaintenances.status }).from(assetMaintenances).innerJoin(assets, eq(assets.id, assetMaintenances.assetId)).where(and(scope.departmentId ? eq(assets.departmentId, scope.departmentId) : undefined, query.q ? or(ilike(assets.name, `%${query.q}%`), ilike(assetMaintenances.description, `%${query.q}%`)) : undefined, from ? gte(assetMaintenances.startDate, from) : undefined, to ? lte(assetMaintenances.startDate, to) : undefined, query.status ? eq(assetMaintenances.status, query.status) : undefined)).orderBy(asc(assetMaintenances.startDate));
    columns = ["Tombamento", "Bem", "Manutenção", "Início", "Fim", "Custo", "Situação"]; rows = records.map(r => [r.code, r.name, r.description, r.start.toISOString().slice(0, 10), r.end?.toISOString().slice(0, 10), r.cost, r.status]);
  } else {
    const records = await database.select({ code: assets.patrimonyNumber, name: assets.name, category: assetCategories.name, status: assets.status, date: assets.acquisitionDate, value: assets.currentValue }).from(assets).innerJoin(assetCategories, eq(assetCategories.id, assets.categoryId)).where(and(scope.departmentId ? eq(assets.departmentId, scope.departmentId) : undefined, query.q ? or(ilike(assets.name, `%${query.q}%`), ilike(assets.patrimonyNumber, `%${query.q}%`)) : undefined, query.category ? eq(assets.categoryId, query.category) : undefined, query.status ? eq(assets.status, query.status) : undefined, from ? gte(assets.acquisitionDate, from) : undefined, to ? lte(assets.acquisitionDate, to) : undefined)).orderBy(asc(assets.patrimonyNumber));
    columns = ["Tombamento", "Bem", "Categoria", "Situação", "Aquisição", "Valor atual"]; rows = records.map(r => [r.code, r.name, r.category, r.status, r.date.toISOString().slice(0, 10), r.value]);
  }
  const settings = await database.select().from(assetCatalogRecords).where(and(eq(assetCatalogRecords.kind, "assinaturas"), eq(assetCatalogRecords.active, true), eq(assetCatalogRecords.year, new Date().getUTCFullYear()), scope.departmentId ? eq(assetCatalogRecords.departmentId, scope.departmentId) : undefined));
  const signatures = settings.filter(r => r.details.report === query.report).sort((a,b) => Number(a.details.position) - Number(b.details.position)).map(r => ({ name: r.details.signer, role: r.details.role }));
  const title = { bens: "Relação de bens patrimoniais", manutencoes: "Manutenções preventivas e corretivas", estoque: "Materiais em estoque", aquisicao: "Materiais em aquisição" }[query.report];
  return new Response(renderAssetReport(title, columns, rows, signatures, query.format), { headers: { "Content-Type": query.format === "csv" ? "text/csv; charset=utf-8" : "text/html; charset=utf-8", "Content-Disposition": `${query.format === "csv" ? "attachment" : "inline"}; filename="patrimonio-${query.report}.${query.format}"`, "Cache-Control": "no-store" } });
}

import { AccessError, canPerformModuleOperation, getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { and, asc, count, eq, gt, gte, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { departments, employees as employeeTable } from "@/db/schema/administration";
import { materials as materialTable, materialCategories, materialStocks, warehouses } from "@/db/schema/assets-stock";

export async function GET(request: Request) {
  try {
    const { user } = await getTenantContextForModule("PATRIMONIO");
    if (!canPerformModuleOperation(user, "PATRIMONIO", "create") && !canPerformModuleOperation(user, "PATRIMONIO", "update")) throw new AccessError("Sem permissão para pesquisar referências de requisições.", 403);
    const params = new URL(request.url).searchParams;
    const contains = `%${(params.get("q") || "").trim().slice(0, 100)}%`;
    const page = Math.min(100000, Math.max(1, Number.parseInt(params.get("page") || "1", 10) || 1));
    const window = { take: 20, skip: (page - 1) * 20 };
    const headers = { "Cache-Control": "private, no-store" };
    if (params.get("kind") === "employees") {
      const departmentId = (params.get("departmentId") || "").slice(0, 100);
      const units = isSystemAdministrator(user) ? null : (await db.execute<{ secretariatId: string | null }>(sql`SELECT "secretariatId" FROM "BudgetUnit" WHERE ${inArray(sql`id`, user.allowedBudgetUnitIds)}`)).rows;
      const where = and(eq(employeeTable.isActive, true), eq(departments.isActive, true), units ? inArray(departments.secretariatId, units.flatMap(unit => unit.secretariatId ? [unit.secretariatId] : [])) : undefined,
        or(ilike(employeeTable.name, contains), ilike(employeeTable.registration, contains)), departmentId ? eq(employeeTable.departmentId, departmentId) : undefined);
      const [total, employees] = await Promise.all([
        db.select({ count: count() }).from(employeeTable).innerJoin(departments, eq(departments.id, employeeTable.departmentId)).where(where).then(rows => rows[0].count),
        db.select({ id: employeeTable.id, name: employeeTable.name, registration: employeeTable.registration, departmentId: employeeTable.departmentId, department: { name: departments.name } }).from(employeeTable)
          .innerJoin(departments, eq(departments.id, employeeTable.departmentId)).where(where).orderBy(asc(employeeTable.name), asc(employeeTable.id)).limit(window.take).offset(window.skip),
      ]);
      return Response.json({ total, records: employees.map(employee => ({ id: employee.id, label: employee.name, detail: [employee.registration ? `Matrícula ${employee.registration}` : null, employee.department?.name].filter(Boolean).join(" · "), departmentId: employee.departmentId, departmentName: employee.department?.name })) }, { headers });
    }
    if (params.get("kind") === "materials") {
      const warehouseId = (params.get("warehouseId") || "").slice(0, 100);
      const categoryId = (params.get("categoryId") || "").slice(0, 100);
      const type = params.get("type");
      const stockWhere = and(gt(materialStocks.quantity, 0), isNull(materialStocks.blockedAt), eq(warehouses.isActive, true), warehouseId ? eq(materialStocks.warehouseId, warehouseId) : undefined, or(isNull(materialStocks.expirationDate), gte(materialStocks.expirationDate, new Date())));
      const availableStocks = db.select({ materialId: materialStocks.materialId }).from(materialStocks).innerJoin(warehouses, eq(warehouses.id, materialStocks.warehouseId)).where(stockWhere);
      const where = and(eq(materialTable.isActive, true), or(ilike(materialTable.code, contains), ilike(materialTable.name, contains), ilike(materialTable.description, contains)), categoryId ? eq(materialTable.categoryId, categoryId) : undefined,
        type === "MATERIAL" || type === "PATRIMONIO" ? eq(materialTable.type, type) : undefined, params.get("inStock") === "true" ? inArray(materialTable.id, availableStocks) : undefined);
      const [total, materials] = await Promise.all([
        db.select({ count: count() }).from(materialTable).where(where).then(rows => rows[0].count),
        db.select({ id: materialTable.id, code: materialTable.code, name: materialTable.name, unitOfMeasure: materialTable.unitOfMeasure, category: { name: materialCategories.name } }).from(materialTable)
          .innerJoin(materialCategories, eq(materialCategories.id, materialTable.categoryId)).where(where).orderBy(asc(materialTable.name), asc(materialTable.id)).limit(window.take).offset(window.skip)
          .then(async rows => {
            const stocks = rows.length ? await db.select({ materialId: materialStocks.materialId, quantity: materialStocks.quantity }).from(materialStocks).innerJoin(warehouses, eq(warehouses.id, materialStocks.warehouseId)).where(and(stockWhere, inArray(materialStocks.materialId, rows.map(row => row.id)))) : [];
            return rows.map(row => ({ ...row, stocks: stocks.filter(stock => stock.materialId === row.id) }));
          }),
      ]);
      return Response.json({ total, records: materials.map(material => ({ id: material.id, label: `${material.code} · ${material.name}`, unitOfMeasure: material.unitOfMeasure, quantity: material.stocks.reduce((sum, stock) => sum + stock.quantity, 0), detail: `${material.category.name} · ${material.unitOfMeasure} · Disponível: ${material.stocks.reduce((sum, stock) => sum + stock.quantity, 0).toLocaleString("pt-BR")}` })) }, { headers });
    }
    return Response.json({ error: "Tipo de pesquisa inválido." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof AccessError ? error.message : "Não foi possível pesquisar os registros." }, { status: error instanceof AccessError ? error.status : 500 });
  }
}

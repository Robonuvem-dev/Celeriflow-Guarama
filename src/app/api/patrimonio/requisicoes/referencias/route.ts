import { AccessError, canPerformModuleOperation, getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import type { Prisma } from "@prisma/client";

export async function GET(request: Request) {
  try {
    const { prisma, user } = await getTenantContextForModule("PATRIMONIO");
    if (!canPerformModuleOperation(user, "PATRIMONIO", "create") && !canPerformModuleOperation(user, "PATRIMONIO", "update")) throw new AccessError("Sem permissão para pesquisar referências de requisições.", 403);
    const params = new URL(request.url).searchParams;
    const contains = { contains: (params.get("q") || "").trim().slice(0, 100), mode: "insensitive" as const };
    const page = Math.min(100000, Math.max(1, Number.parseInt(params.get("page") || "1", 10) || 1));
    const window = { take: 20, skip: (page - 1) * 20 };
    const headers = { "Cache-Control": "private, no-store" };
    if (params.get("kind") === "employees") {
      const departmentId = (params.get("departmentId") || "").slice(0, 100);
      const units = isSystemAdministrator(user) ? null : await prisma.budgetUnit.findMany({ where: { id: { in: user.allowedBudgetUnitIds } }, select: { secretariatId: true } });
      const where: Prisma.EmployeeWhereInput = { isActive: true, department: { is: { isActive: true, ...(units ? { secretariatId: { in: units.flatMap(unit => unit.secretariatId ? [unit.secretariatId] : []) } } : {}) } }, OR: [{ name: contains }, { registration: contains }], ...(departmentId ? { departmentId } : {}) };
      const [total, employees] = await Promise.all([prisma.employee.count({ where }), prisma.employee.findMany({ where, ...window, orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true, registration: true, departmentId: true, department: { select: { name: true } } } })]);
      return Response.json({ total, records: employees.map(employee => ({ id: employee.id, label: employee.name, detail: [employee.registration ? `Matrícula ${employee.registration}` : null, employee.department?.name].filter(Boolean).join(" · "), departmentId: employee.departmentId, departmentName: employee.department?.name })) }, { headers });
    }
    if (params.get("kind") === "materials") {
      const warehouseId = (params.get("warehouseId") || "").slice(0, 100);
      const categoryId = (params.get("categoryId") || "").slice(0, 100);
      const type = params.get("type");
      const stockWhere: Prisma.MaterialStockWhereInput = { quantity: { gt: 0 }, blockedAt: null, warehouse: { isActive: true }, ...(warehouseId ? { warehouseId } : {}), OR: [{ expirationDate: null }, { expirationDate: { gte: new Date() } }] };
      const where: Prisma.MaterialWhereInput = { isActive: true, OR: [{ code: contains }, { name: contains }, { description: contains }], ...(categoryId ? { categoryId } : {}), ...(type === "MATERIAL" || type === "PATRIMONIO" ? { type } : {}), ...(params.get("inStock") === "true" ? { stocks: { some: stockWhere } } : {}) };
      const [total, materials] = await Promise.all([prisma.material.count({ where }), prisma.material.findMany({ where, ...window, orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, code: true, name: true, unitOfMeasure: true, category: { select: { name: true } }, stocks: { where: stockWhere, select: { quantity: true } } } })]);
      return Response.json({ total, records: materials.map(material => ({ id: material.id, label: `${material.code} · ${material.name}`, unitOfMeasure: material.unitOfMeasure, quantity: material.stocks.reduce((sum, stock) => sum + stock.quantity, 0), detail: `${material.category.name} · ${material.unitOfMeasure} · Disponível: ${material.stocks.reduce((sum, stock) => sum + stock.quantity, 0).toLocaleString("pt-BR")}` })) }, { headers });
    }
    return Response.json({ error: "Tipo de pesquisa inválido." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof AccessError ? error.message : "Não foi possível pesquisar os registros." }, { status: error instanceof AccessError ? error.status : 500 });
  }
}

import { AccessError, canPerformModuleOperation, getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { and, asc, eq, ilike, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { departments, employees } from "@/db/schema/administration";
import { assets } from "@/db/schema/assets";

export async function GET(request: Request) {
  try {
    const context = await getTenantContextForModule("PATRIMONIO"), p = new URL(request.url).searchParams;
    const contains = `%${(p.get("q") || "").slice(0, 100)}%`;
    const allowed = isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds;
    const units = allowed ? (await db.execute<{ secretariatId: string | null }>(sql`SELECT u."secretariatId" FROM "BudgetUnit" u WHERE ${inArray(sql`u.id`, allowed)} AND EXISTS (SELECT 1 FROM "PlanningEntityUnit" p WHERE p."budgetUnitId"=u.id)`)).rows : [];
    const departmentScope = allowed ? inArray(departments.secretariatId, units.flatMap(unit => unit.secretariatId ? [unit.secretariatId] : [])) : undefined;
    let options: { id: string; label: string }[] = [];
    if (p.get("kind") === "departments") {
      options = (await db.select({ id: departments.id, name: departments.name }).from(departments).where(and(eq(departments.isActive, true), ilike(departments.name, contains), departmentScope)).orderBy(asc(departments.name), asc(departments.id)).limit(20)).map(v => ({ id: v.id, label: v.name }));
    } else if (p.get("kind") === "employees" || p.get("kind") === "patrimonioEmployees") {
      if (!canPerformModuleOperation(context.user, "PATRIMONIO", "update") && !canPerformModuleOperation(context.user, "PATRIMONIO", "create")) throw new AccessError("Seu perfil não permite consultar responsáveis para transferência.", 403);
      const departmentId = (p.get("departmentId") || "").slice(0, 100);
      const specialistsOnly = p.get("kind") === "patrimonioEmployees";
      options = (await db.select({ id: employees.id, name: employees.name, registration: employees.registration, department: { name: departments.name } }).from(employees).leftJoin(departments, eq(departments.id, employees.departmentId))
        .where(and(eq(employees.isActive, true), or(ilike(employees.name, contains), ilike(employees.registration, contains)), departmentScope,
          departmentId ? eq(employees.departmentId, departmentId) : undefined,
          specialistsOnly ? or(ilike(departments.name, "%patrimônio%"), ilike(departments.name, "%almoxarifado%"),
            sql`EXISTS (SELECT 1 FROM "Warehouse" w WHERE w."managerId"=${employees.id})`, sql`EXISTS (SELECT 1 FROM "Asset" a WHERE a."responsibleId"=${employees.id})`) : undefined))
        .orderBy(asc(employees.name), asc(employees.id)).limit(20)).map(v => ({ id: v.id, label: [v.name, v.registration ? `Matrícula ${v.registration}` : null, v.department?.name].filter(Boolean).join(" · ") }));
    } else if (p.get("kind") === "assets") {
      if (!canPerformModuleOperation(context.user, "PATRIMONIO", "update")) throw new AccessError("Seu perfil não permite consultar bens patrimoniais.", 403);
      const q = (p.get("q") || "").slice(0, 100);
      options = (await db.select({ id: assets.id, patrimonyNumber: assets.patrimonyNumber, name: assets.name }).from(assets).leftJoin(departments, eq(departments.id, assets.departmentId))
        .where(and(notInArray(assets.status, ["Baixado", "Inativo"]), q ? or(ilike(assets.patrimonyNumber, contains), ilike(assets.name, contains)) : undefined,
          allowed ? or(inArray(assets.budgetUnitId, allowed), and(isNull(assets.budgetUnitId), sql`EXISTS (SELECT 1 FROM "PurchaseReceiptItem" i JOIN "PurchaseReceipt" r ON r.id=i."purchaseReceiptId" JOIN "Commitment" c ON c."purchaseReceiptId"=r.id JOIN "BudgetAppropriation" b ON b.id=c."appropriationId" WHERE i.id=${assets.purchaseReceiptItemId} AND ${inArray(sql`b."budgetUnitId"`, allowed)})`), and(isNull(assets.budgetUnitId), isNull(assets.purchaseReceiptItemId), departmentScope)) : undefined))
        .orderBy(asc(assets.patrimonyNumber), asc(assets.id)).limit(20)).map(v => ({ id: v.id, label: `${v.patrimonyNumber} · ${v.name}` }));
    }
    return Response.json({ options }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return Response.json({ error: error instanceof AccessError ? error.message : "Não foi possível consultar os registros." }, { status: error instanceof AccessError ? error.status : 500 }); }
}

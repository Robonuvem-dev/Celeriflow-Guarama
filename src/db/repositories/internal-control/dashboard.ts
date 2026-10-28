import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { employees } from "@/db/schema/administration";
import { documents } from "@/db/schema/registry";
import { listControlPlans } from "./records";

export type ControlUnit = { id: string; name: string; secretariatId: string; planningEntityUnit: { governmentEntityId: string; governmentEntity: { name: string } } };
export type ControlDiagnosticYear = { id: string; year: number; governmentEntity: { name: string; planningUnits: Array<{ budgetUnitId: string }> } };
export async function listControlUnits(db: DatabaseExecutor, allowedBudgetUnitIds?: string[]): Promise<ControlUnit[]> {
  if (allowedBudgetUnitIds && !allowedBudgetUnitIds.length) return [];
  return (await db.execute<ControlUnit>(sql`SELECT b.id, b.name, b."secretariatId", jsonb_build_object('governmentEntityId', p."governmentEntityId", 'governmentEntity', jsonb_build_object('name', e.name)) AS "planningEntityUnit" FROM "BudgetUnit" b JOIN "PlanningEntityUnit" p ON p."budgetUnitId"=b.id JOIN "GovernmentEntity" e ON e.id=p."governmentEntityId" ${allowedBudgetUnitIds ? sql`WHERE b.id IN (${sql.join(allowedBudgetUnitIds.map(id => sql`${id}`), sql`, `)})` : sql``} ORDER BY b.code ASC`)).rows;
}
export async function getControlDashboardSource(db: DatabaseExecutor, allowedBudgetUnitIds?: string[]) {
  const units = await listControlUnits(db, allowedBudgetUnitIds);
  const unitIds = units.map(unit => unit.id);
  const selectedUnits = unitIds.length ? sql.join(unitIds.map(id => sql`${id}`), sql`, `) : sql`NULL`;
  const entityIds = [...new Set(units.map(unit => unit.planningEntityUnit.governmentEntityId))];
  const [plans, staff, evidence, recipients, centers, diagnosticYears] = await Promise.all([
    listControlPlans(db, { allowedBudgetUnitIds: allowedBudgetUnitIds ? unitIds : undefined, descending: true }),
    db.select({ id: employees.id, name: employees.name }).from(employees).where(and(eq(employees.isActive, true), allowedBudgetUnitIds ? inArray(employees.secretariatId, units.map(unit => unit.secretariatId)) : undefined)).orderBy(asc(employees.name)),
    db.select({ id: documents.id, title: documents.title }).from(documents).where(eq(documents.status, "Válido")).orderBy(desc(documents.createdAt)).limit(100),
    db.execute<{ id: string; nome: string; unidadesGestoras: Array<{ budgetUnitId: string }> }>(sql`SELECT u.id, u.nome, COALESCE((SELECT jsonb_agg(jsonb_build_object('budgetUnitId', b."budgetUnitId")) FROM "UsuarioUnidadeGestora" b WHERE b."usuarioId"=u.id), '[]'::jsonb) AS "unidadesGestoras" FROM "Usuario" u WHERE u.ativo AND EXISTS (SELECT 1 FROM "UsuarioUnidadeGestora" b WHERE b."usuarioId"=u.id AND b."budgetUnitId" IN (${selectedUnits})) ORDER BY u.nome ASC`).then(result => result.rows),
    db.execute<{ id: string; name: string; secretariatId: string | null; governmentEntityId: string | null }>(sql`SELECT c.id, c.name, c."secretariatId", c."governmentEntityId" FROM "CostCenter" c WHERE c."isActive" AND (${units.length ? sql.join(units.map(unit => sql`(c."secretariatId"=${unit.secretariatId} AND c."governmentEntityId"=${unit.planningEntityUnit.governmentEntityId})`), sql` OR `) : sql`false`}) ORDER BY c.code ASC`).then(result => result.rows),
    db.execute<ControlDiagnosticYear>(sql`SELECT y.id, y.year, jsonb_build_object('name', e.name, 'planningUnits', COALESCE((SELECT jsonb_agg(jsonb_build_object('budgetUnitId', p."budgetUnitId")) FROM "PlanningEntityUnit" p WHERE p."governmentEntityId"=e.id), '[]'::jsonb)) AS "governmentEntity" FROM "FinancialYear" y JOIN "GovernmentEntity" e ON e.id=y."governmentEntityId" WHERE y."governmentEntityId" IN (${entityIds.length ? sql.join(entityIds.map(id => sql`${id}`), sql`, `) : sql`NULL`}) ORDER BY y.year DESC`).then(result => result.rows),
  ]);
  return { units, plans, employees: staff, documents: evidence, recipients, centers, diagnosticYears };
}

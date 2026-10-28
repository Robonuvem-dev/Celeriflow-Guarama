import { sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { documents } from "@/db/schema/registry";
import { and, eq, inArray } from "drizzle-orm";

export async function controlUnitBinding(db: DatabaseExecutor, budgetUnitId: string): Promise<{ budgetUnitId: string; governmentEntityId: string } | null> {
  const result = await db.execute<{ budgetUnitId: string; governmentEntityId: string }>(sql`SELECT "budgetUnitId", "governmentEntityId" FROM "PlanningEntityUnit" WHERE "budgetUnitId"=${budgetUnitId}`); return result.rows[0] ?? null;
}
export async function controlBudgetUnit(db: DatabaseExecutor, id: string): Promise<{ secretariatId: string; planningEntityUnit: { governmentEntityId: string } | null }> {
  const result = await db.execute<{ secretariatId: string; governmentEntityId: string | null }>(sql`SELECT b."secretariatId", p."governmentEntityId" FROM "BudgetUnit" b LEFT JOIN "PlanningEntityUnit" p ON p."budgetUnitId"=b.id WHERE b.id=${id}`);
  const row = result.rows[0]; if (!row) throw new Error("Unidade gestora não encontrada."); return { secretariatId: row.secretariatId, planningEntityUnit: row.governmentEntityId ? { governmentEntityId: row.governmentEntityId } : null };
}
export async function controlCostCenter(db: DatabaseExecutor, id: string): Promise<{ id: string; isActive: boolean; governmentEntityId: string | null; secretariatId: string | null } | null> {
  const result = await db.execute<{ id: string; isActive: boolean; governmentEntityId: string | null; secretariatId: string | null }>(sql`SELECT id, "isActive", "governmentEntityId", "secretariatId" FROM "CostCenter" WHERE id=${id}`); return result.rows[0] ?? null;
}
export async function controlUnitUsers(db: DatabaseExecutor, budgetUnitId: string, ids?: string[]): Promise<Array<{ id: string; nome: string }>> {
  if (ids && !ids.length) return [];
  const result = await db.execute<{ id: string; nome: string }>(sql`SELECT u.id, u.nome FROM "Usuario" u WHERE u.ativo AND EXISTS (SELECT 1 FROM "UsuarioUnidadeGestora" b WHERE b."usuarioId"=u.id AND b."budgetUnitId"=${budgetUnitId}) ${ids ? sql`AND u.id IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})` : sql``}`); return result.rows;
}
export async function controlDocumentSnapshots(db: DatabaseExecutor, ids: string[]): Promise<Array<{ id: string; title: string; fileUrl: string; updatedAt: Date }>> { return db.select({ id: documents.id, title: documents.title, fileUrl: documents.fileUrl, updatedAt: documents.updatedAt }).from(documents).where(and(inArray(documents.id, ids), eq(documents.status, "Válido"))); }
export async function controlBankAccountSources(db: DatabaseExecutor, budgetUnitId: string): Promise<Array<{ id: string; resourceSourceId: string | null }>> {
  return (await db.execute<{ id: string; resourceSourceId: string | null }>(sql`SELECT id, "resourceSourceId" FROM "BankAccount" WHERE "budgetUnitId"=${budgetUnitId} AND "isActive" ORDER BY id ASC`)).rows;
}
export async function controlCurrentCenters(db: DatabaseExecutor, usuarioId: string, now: Date): Promise<string[]> {
  return (await db.execute<{ costCenterId: string | null }>(sql`SELECT c."costCenterId" FROM "HrEmploymentContract" c JOIN "Usuario" u ON u."employeeId"=c."employeeId" WHERE u.id=${usuarioId} AND c.status='ATIVO' AND c."admittedAt" <= ${now} AND (c."endsAt" IS NULL OR c."endsAt" >= ${now})`)).rows.flatMap(row => row.costCenterId ? [row.costCenterId] : []);
}
export async function controlAgendaRecipients(db: DatabaseExecutor, budgetUnitId: string, ids: string[], costCenterId: string | null, now: Date): Promise<Array<{ id: string }>> {
  const selected = ids.length ? sql`u.id IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})` : sql`false`;
  return (await db.execute<{ id: string }>(sql`SELECT u.id FROM "Usuario" u WHERE u.ativo AND EXISTS (SELECT 1 FROM "UsuarioUnidadeGestora" b WHERE b."usuarioId"=u.id AND b."budgetUnitId"=${budgetUnitId}) AND (${selected} OR ${costCenterId ? sql`EXISTS (SELECT 1 FROM "HrEmploymentContract" c WHERE c."employeeId"=u."employeeId" AND c."costCenterId"=${costCenterId} AND c.status='ATIVO' AND c."admittedAt" <= ${now} AND (c."endsAt" IS NULL OR c."endsAt" >= ${now}))` : sql`false`})`)).rows;
}

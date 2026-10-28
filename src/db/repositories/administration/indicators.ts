import { sql, type SQL } from "drizzle-orm";
import { Decimal } from "../../decimal";
import type { DatabaseExecutor } from "../../transaction";

function budgetScope(column: SQL, budgetUnitIds: string[] | undefined): SQL {
  if (budgetUnitIds === undefined) return sql`TRUE`;
  if (!budgetUnitIds.length) return sql`FALSE`;
  return sql`${column} IN (${sql.join(budgetUnitIds.map(id => sql`${id}`), sql`, `)})`;
}

export async function countIndicatorControlPlans(db: DatabaseExecutor, start: Date, end: Date, budgetUnitIds?: string[]): Promise<number> {
  const result = await db.execute<{ value: number }>(sql`SELECT count(*)::int AS value FROM "InternalControlPlan" p WHERE ${budgetScope(sql`p."budgetUnitId"`, budgetUnitIds)} AND p."createdAt" >= ${start.toISOString()}::timestamp AND p."createdAt" <= ${end.toISOString()}::timestamp`);
  return result.rows[0].value;
}

export async function countIndicatorPendingFindings(db: DatabaseExecutor, budgetUnitIds?: string[]): Promise<number> {
  const result = await db.execute<{ value: number }>(sql`SELECT count(*)::int AS value FROM "InternalControlFinding" f JOIN "InternalControlPlan" p ON p.id=f."planId" WHERE ${budgetScope(sql`p."budgetUnitId"`, budgetUnitIds)} AND f.status <> 'RESOLVIDO'`);
  return result.rows[0].value;
}

export async function sumIndicatorPayments(db: DatabaseExecutor, start: Date, end: Date, budgetUnitIds?: string[]): Promise<{ _sum: { valueDecimal: Decimal | null } }> {
  const result = await db.execute<{ value: string | null }>(sql`SELECT sum(p."valueDecimal")::text AS value FROM "Payment" p JOIN "Commitment" c ON c.id=p."commitmentId" JOIN "BudgetAppropriation" a ON a.id=c."appropriationId" WHERE ${budgetScope(sql`a."budgetUnitId"`, budgetUnitIds)} AND p.date >= ${start.toISOString()}::timestamp AND p.date <= ${end.toISOString()}::timestamp AND p.status IN ('Emitida','Paga')`);
  return { _sum: { valueDecimal: result.rows[0].value === null ? null : new Decimal(result.rows[0].value) } };
}

export async function countIndicatorSocialBenefits(db: DatabaseExecutor, start: Date, end: Date): Promise<number> {
  const result = await db.execute<{ value: number }>(sql`SELECT count(*)::int AS value FROM "SocialBenefitConcession" WHERE "createdAt" >= ${start.toISOString()}::timestamp AND "createdAt" <= ${end.toISOString()}::timestamp`);
  return result.rows[0].value;
}

export async function countIndicatorEnvironmentalLicenses(db: DatabaseExecutor, start: Date, end: Date): Promise<number> {
  const result = await db.execute<{ value: number }>(sql`SELECT count(*)::int AS value FROM "EnvironmentalLicense" WHERE "createdAt" >= ${start.toISOString()}::timestamp AND "createdAt" <= ${end.toISOString()}::timestamp`);
  return result.rows[0].value;
}

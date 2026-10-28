import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "@/db/transaction";
import { controlEvents, controlFindings, controlPlans } from "@/db/schema/internal-control";
import type { ControlEvent, ControlFinding, ControlPlan, ControlPlanView } from "@/lib/contracts/internal-control";
import type { JsonValue } from "@/db/json";

export async function lockControlPlan(tx: DatabaseTransaction, id: string): Promise<void> { await tx.execute(sql`SELECT id FROM "InternalControlPlan" WHERE id=${id} FOR UPDATE`); }
export async function lockControlFinding(tx: DatabaseTransaction, id: string): Promise<void> { await tx.execute(sql`SELECT id FROM "InternalControlFinding" WHERE id=${id} FOR UPDATE`); }
export async function getControlPlan(db: DatabaseExecutor, id: string): Promise<ControlPlan | null> { return (await db.select().from(controlPlans).where(eq(controlPlans.id, id)))[0] ?? null; }
export async function requireControlPlan(db: DatabaseExecutor, id: string): Promise<ControlPlan> { const plan = await getControlPlan(db, id); if (!plan) throw new Error("Plano de controle não encontrado."); return plan; }
export async function getControlFinding(db: DatabaseExecutor, id: string): Promise<(ControlFinding & { plan: ControlPlan }) | null> {
  const [row] = await db.select({ finding: controlFindings, plan: controlPlans }).from(controlFindings).innerJoin(controlPlans, eq(controlFindings.planId, controlPlans.id)).where(eq(controlFindings.id, id));
  return row ? { ...row.finding, plan: row.plan } : null;
}
export async function requireControlFinding(db: DatabaseExecutor, id: string): Promise<ControlFinding & { plan: ControlPlan }> { const finding = await getControlFinding(db, id); if (!finding) throw new Error("Apontamento não encontrado."); return finding; }
export async function getControlEvent(db: DatabaseExecutor, id: string): Promise<ControlEvent | null> { return (await db.select().from(controlEvents).where(eq(controlEvents.id, id)))[0] ?? null; }
export async function requireControlEvent(db: DatabaseExecutor, id: string): Promise<ControlEvent> { const event = await getControlEvent(db, id); if (!event) throw new Error("Evento de controle não encontrado."); return event; }
export async function listControlEvents(db: DatabaseExecutor, filter: { planId?: string; findingId?: string; eventTypes?: string[]; snapshotKey?: string; snapshotValue?: string } = {}): Promise<ControlEvent[]> {
  return db.select().from(controlEvents).where(and(filter.planId ? eq(controlEvents.planId, filter.planId) : undefined, filter.findingId ? eq(controlEvents.findingId, filter.findingId) : undefined, filter.eventTypes ? inArray(controlEvents.eventType, filter.eventTypes) : undefined, filter.snapshotKey ? sql`${controlEvents.snapshot} ->> ${filter.snapshotKey} = ${filter.snapshotValue}` : undefined));
}
export async function firstControlEvent(db: DatabaseExecutor, filter: Parameters<typeof listControlEvents>[1]): Promise<ControlEvent | null> { return (await listControlEvents(db, filter))[0] ?? null; }
export async function appendControlEvent(db: DatabaseExecutor, input: { planId: string; findingId?: string | null; eventType: string; actorId: string; reason: string; snapshot: JsonValue }): Promise<ControlEvent> { return (await db.insert(controlEvents).values(input).returning())[0]; }
export async function insertControlFinding(db: DatabaseExecutor, input: { planId: string; title: string; description: string; status?: string; dueAt?: Date; responsibleId?: string | null; evidenceDocumentId?: string | null }): Promise<ControlFinding> { return (await db.insert(controlFindings).values(input).returning())[0]; }
export async function unresolvedControlFindings(db: DatabaseExecutor, planId?: string, ids?: string[]): Promise<ControlFinding[]> { return db.select().from(controlFindings).where(and(planId ? eq(controlFindings.planId, planId) : undefined, ids ? inArray(controlFindings.id, ids) : undefined, ne(controlFindings.status, "RESOLVIDO"))); }
export async function listControlPlans(db: DatabaseExecutor, filter: { allowedBudgetUnitIds?: string[]; ownerId?: string; planId?: string; descending?: boolean } = {}): Promise<ControlPlanView[]> {
  const rows = await db.select().from(controlPlans).where(and(filter.allowedBudgetUnitIds ? inArray(controlPlans.budgetUnitId, filter.allowedBudgetUnitIds) : undefined, filter.ownerId ? eq(controlPlans.ownerId, filter.ownerId) : undefined, filter.planId ? eq(controlPlans.id, filter.planId) : undefined)).orderBy(filter.descending ? desc(controlPlans.createdAt) : asc(controlPlans.id));
  if (!rows.length) return [];
  const ids = rows.map(row => row.id);
  const unitIds = rows.flatMap(row => row.budgetUnitId ? [sql`${row.budgetUnitId}`] : []);
  const [findings, events, units] = await Promise.all([
    db.select().from(controlFindings).where(inArray(controlFindings.planId, ids)).orderBy(filter.descending ? desc(controlFindings.createdAt) : asc(controlFindings.createdAt), asc(controlFindings.id)),
    db.select().from(controlEvents).where(inArray(controlEvents.planId, ids)).orderBy(filter.descending ? desc(controlEvents.createdAt) : asc(controlEvents.createdAt), filter.descending ? desc(controlEvents.id) : asc(controlEvents.id)),
    db.execute<{ id: string; name: string; entityName: string | null; governmentEntityId: string | null }>(sql`SELECT b.id, b.name, e.name AS "entityName", p."governmentEntityId" FROM "BudgetUnit" b LEFT JOIN "PlanningEntityUnit" p ON p."budgetUnitId"=b.id LEFT JOIN "GovernmentEntity" e ON e.id=p."governmentEntityId" WHERE b.id IN (${sql.join(unitIds.length ? unitIds : [sql`NULL`], sql`, `)})`),
  ]);
  return rows.map(row => { const unit = units.rows.find(unit => unit.id === row.budgetUnitId); return { ...row, findings: findings.filter(finding => finding.planId === row.id), events: events.filter(event => event.planId === row.id), budgetUnit: unit ? { name: unit.name, planningEntityUnit: unit.entityName && unit.governmentEntityId ? { governmentEntityId: unit.governmentEntityId, governmentEntity: { name: unit.entityName } } : null } : null }; });
}

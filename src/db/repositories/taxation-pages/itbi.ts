import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { pageItbiDeclarations, pageItbiTypes, pageItbiParties, pageItbiEvents } from "@/db/schema/taxation-pages";
import { processCitizenAccesses } from "@/db/schema/citizen-access";
import { users } from "@/db/schema/identity";
import type { Decimal } from "@/db/decimal";
import type { JsonValue } from "@/db/json";
import type { ItbiDeclarationRow, ItbiTypeRow } from "@/lib/contracts/taxation-pages";

export async function listPageItbiTypes(database: DatabaseExecutor, order = false): Promise<ItbiTypeRow[]> {
  const query = database.select().from(pageItbiTypes).where(eq(pageItbiTypes.isActive, true)).$dynamic();
  if (order) query.orderBy(asc(pageItbiTypes.name));
  return query;
}
export async function listPageItbiDeclarations(database: DatabaseExecutor, selection: { allowedBudgetUnitIds?: string[]; limit?: number; order?: "created-desc" | "created-id"; status?: string }): Promise<ItbiDeclarationRow[]> {
  const predicates: SQL[] = [];
  if (selection.allowedBudgetUnitIds !== undefined) predicates.push(selection.allowedBudgetUnitIds.length ? sql`${pageItbiDeclarations.calculationSnapshot}->'budgetUnitId' IN (${sql.join(selection.allowedBudgetUnitIds.map(id => sql`${JSON.stringify(id)}::jsonb`), sql`, `)})` : sql`false`);
  if (selection.status) predicates.push(eq(pageItbiDeclarations.status, selection.status));
  const query = database.select().from(pageItbiDeclarations).where(and(...predicates)).$dynamic();
  if (selection.limit !== undefined) query.limit(selection.limit);
  if (selection.order === "created-desc") query.orderBy(desc(pageItbiDeclarations.createdAt));
  if (selection.order === "created-id") query.orderBy(asc(pageItbiDeclarations.createdAt), asc(pageItbiDeclarations.id));
  return query;
}
type Party = { id: string; declarationId: string; taxpayerId: string; role: string; participationPercent: Decimal | null; liabilityType: string | null; sortOrder: number; createdAt: Date };
type Event = { id: string; declarationId: string; eventType: string; description: string; payload: JsonValue | null; actorUsuarioId: string; createdAt: Date };
export async function readPageItbiWorkspace(database: DatabaseExecutor, allowedBudgetUnitIds?: string[]): Promise<(ItbiDeclarationRow & { transactionType: ItbiTypeRow; parties: Party[]; events: Event[] })[]> {
  const rows = await listPageItbiDeclarations(database, { allowedBudgetUnitIds, order: "created-desc", limit: 300 });
  const ids = rows.map(row => row.id);
  const [types, parties, events] = await Promise.all([database.select().from(pageItbiTypes).where(inArray(pageItbiTypes.id, rows.map(row => row.transactionTypeId))), database.select().from(pageItbiParties).where(inArray(pageItbiParties.declarationId, ids)), database.select().from(pageItbiEvents).where(inArray(pageItbiEvents.declarationId, ids)).orderBy(desc(pageItbiEvents.createdAt))]);
  return rows.map(row => { const transactionType = types.find(type => type.id === row.transactionTypeId); if (!transactionType) throw new Error("Tipo de transmissão não encontrado."); return { ...row, transactionType, parties: parties.filter(party => party.declarationId === row.id), events: events.filter(event => event.declarationId === row.id).slice(0, 20) }; });
}
export async function readPageItbiBuyers(database: DatabaseExecutor, declarationId: string): Promise<Party[]> {
  return database.select().from(pageItbiParties).where(and(eq(pageItbiParties.declarationId, declarationId), eq(pageItbiParties.role, "ADQUIRENTE")));
}
export async function readPageItbiGrants(database: DatabaseExecutor, processId: string): Promise<{ id: string; revokedAt: Date | null; expiresAt: Date | null; usuario: { nome: string } }[]> {
  const rows = await database.select({ grant: processCitizenAccesses, usuario: { nome: users.nome } }).from(processCitizenAccesses).innerJoin(users, eq(users.id, processCitizenAccesses.usuarioId)).where(eq(processCitizenAccesses.processId, processId)).orderBy(desc(processCitizenAccesses.grantedAt));
  return rows.map(row => ({ ...row.grant, usuario: row.usuario }));
}

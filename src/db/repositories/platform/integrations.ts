import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { IntegrationConnectionInput, IntegrationConnectionRecord, IntegrationConnectionWithRuns, IntegrationRunRecord } from "@/lib/contracts/integrations";
import type { SanitizedEnvelope } from "@/lib/integrations/contract";
import { JsonNull } from "../../json";
import { integrationConnections, integrationRuns } from "../../schema/integrations";
import type { DatabaseExecutor } from "../../transaction";

export async function findIntegrationConnection(db: DatabaseExecutor, field: "code" | "id", value: string): Promise<IntegrationConnectionRecord | null> {
  const [row] = await db.select().from(integrationConnections).where(eq(integrationConnections[field], value)).limit(1);
  return row ?? null;
}

export async function listIntegrationConnections(db: DatabaseExecutor): Promise<IntegrationConnectionWithRuns[]> {
  const connections = await db.select().from(integrationConnections).orderBy(asc(integrationConnections.category));
  if (!connections.length) return [];
  // Rank before loading the payloads: the UI receives only its last three runs
  // per connection, without an N+1 query or the complete integration history.
  const recent = db.select({ id: integrationRuns.id, rank: sql<number>`row_number() over (partition by ${integrationRuns.connectionId} order by ${integrationRuns.createdAt} desc)`.as("rank") }).from(integrationRuns).where(inArray(integrationRuns.connectionId, connections.map(row => row.id))).as("recent");
  const runs = await db.select({ run: integrationRuns }).from(integrationRuns).innerJoin(recent, eq(integrationRuns.id, recent.id)).where(sql`${recent.rank} <= 3`).orderBy(desc(integrationRuns.createdAt));
  return connections.map(connection => ({ ...connection, runs: runs.filter(({ run }) => run.connectionId === connection.id).map(({ run }) => run) }));
}

export async function saveIntegrationConfiguration(db: DatabaseExecutor, input: IntegrationConnectionInput): Promise<IntegrationConnectionRecord> {
  const { configuration, mockScenario, ...values } = input;
  const [row] = await db.insert(integrationConnections).values({ ...values, configuration: configuration === null ? JsonNull : configuration, mockScenario: mockScenario === null ? JsonNull : mockScenario }).onConflictDoUpdate({
    target: integrationConnections.code,
    set: { ...values, configuration: configuration ?? JsonNull, mockScenario: mockScenario ?? JsonNull },
  }).returning();
  return row;
}

export async function updateIntegrationTestResult(db: DatabaseExecutor, id: string, result: { status: string; message: string }): Promise<void> {
  await db.update(integrationConnections).set({ status: result.status === "SUCESSO" ? "ATIVA" : "CONFIGURANDO", lastTestedAt: new Date(), lastTestStatus: result.status, lastTestMessage: result.message }).where(eq(integrationConnections.id, id));
}

export async function listActiveIntegrationRuns(db: DatabaseExecutor, connectionId: string): Promise<Pick<IntegrationRunRecord, "payload">[]> {
  return db.select({ payload: integrationRuns.payload }).from(integrationRuns).where(and(eq(integrationRuns.connectionId, connectionId), eq(integrationRuns.status, "EXECUTANDO")));
}

export async function startIntegrationRun(db: DatabaseExecutor, input: { connectionId: string; operation: string; environment: string; payload: SanitizedEnvelope }): Promise<{ id: string }> {
  const [row] = await db.insert(integrationRuns).values({ ...input, status: "EXECUTANDO", message: "Execução iniciada pelo contrato C1-005.", payload: sql`${JSON.stringify(input.payload)}::jsonb` }).returning({ id: integrationRuns.id });
  return row;
}

export async function completeIntegrationRun(db: DatabaseExecutor, id: string, input: { status: string; message: string; externalId?: string; payload: SanitizedEnvelope }): Promise<void> {
  await db.update(integrationRuns).set({ ...input, payload: sql`${JSON.stringify(input.payload)}::jsonb` }).where(eq(integrationRuns.id, id));
}

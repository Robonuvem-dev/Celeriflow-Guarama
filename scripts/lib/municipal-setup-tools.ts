import { and, asc, eq, sql } from 'drizzle-orm';
import { createDatabaseConnection } from '../../src/db/connection';
import type { DatabaseExecutor, DatabaseTransaction } from '../../src/db/transaction';
import type { JsonObject, JsonValue } from '../../src/db/json';
import * as t from '../../src/db/schema/municipal-setup-tools';

export function openMunicipalSetupConnection(url = process.env.DATABASE_URL) {
  if (!url) throw new Error('DATABASE_URL não configurada.');
  return createDatabaseConnection(url);
}
export const municipalJson = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value));
export const municipalObject = (value: JsonValue | null): JsonObject => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
export function municipalRequired<T>(value: T | undefined | null, label: string): T {
  if (value == null) throw new Error(`${label} não encontrado.`);
  return value;
}
export async function firstMunicipalActor(db: DatabaseExecutor) {
  return municipalRequired((await db.select({ id: t.users.id }).from(t.users).where(eq(t.users.ativo, true)).orderBy(asc(t.users.createdAt)).limit(1))[0], 'Usuário ativo');
}
export async function municipalEdition(db: DatabaseExecutor, id: string) {
  const [version] = await db.select().from(t.versions).where(eq(t.versions.id, id)).limit(1);
  if (!version) return null;
  return { ...version, entries: await db.select().from(t.entries).where(eq(t.entries.versionId, id)) };
}
export async function createMunicipalEdition(tx: DatabaseTransaction, version: typeof t.versions.$inferInsert, entries: Array<Omit<typeof t.entries.$inferInsert, 'versionId'>>) {
  await tx.insert(t.versions).values(version);
  if (entries.length) await tx.insert(t.entries).values(entries.map(entry => ({ ...entry, versionId: version.id! })));
  await tx.update(t.versions).set({ status: 'PUBLISHED' }).where(eq(t.versions.id, version.id!));
}
export async function municipalAccountingEvent(db: DatabaseExecutor, code: string) {
  const [event] = await db.select().from(t.events).where(eq(t.events.code, code)).limit(1);
  return event ? { ...event, rules: await db.select().from(t.postingRules).where(eq(t.postingRules.eventId, event.id)) } : null;
}
export async function municipalTechnicalActor(db: DatabaseExecutor, actorId: string) {
  const [actor] = await db.select({ id: t.users.id, codigo: t.profiles.codigo }).from(t.users).innerJoin(t.profiles, eq(t.profiles.id, t.users.perfilId)).where(and(eq(t.users.id, actorId), eq(t.users.ativo, true))).limit(1);
  if (!actor || actor.codigo !== 'SYSTEM_ADMINISTRATOR') throw new Error('Selecione um administrador técnico ativo da base de destino.');
  return actor;
}
export async function lockMunicipal(tx: DatabaseTransaction, key: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))::text`);
}

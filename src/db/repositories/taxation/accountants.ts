import { and, desc, eq, sql } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { companies, taxpayers } from "../../schema/registry";
import { people } from "../../schema/people";
import { taxRegistryEntries } from "../../schema/taxation-registry";
import { taxAuditLogs } from "../../schema/taxation-audit";
import { insertAuditEvent } from "../platform/audit";
import type { AccountantDirectory, TaxRegistryEntryRecord } from "@/lib/contracts/taxation-registry";
import { taxRegistrySnapshot } from "@/lib/tributacao/registry-data";

export async function publishAccountantInTransaction(tx: DatabaseTransaction, actor: { usuarioId: string; employeeId?: string | null }, input: {
  taxpayerId: string; crc: string; expectedVersion: number; reason: string;
}): Promise<TaxRegistryEntryRecord> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`ACCOUNTANT:${input.taxpayerId}`},0))::text`);
  const [taxpayer] = await tx.select({ id: taxpayers.id }).from(taxpayers).where(and(eq(taxpayers.id, input.taxpayerId), eq(taxpayers.status, "Ativo"))).limit(1);
  if (!taxpayer) throw new Error("Selecione um contribuinte ativo do cadastro único.");
  const [previous] = await tx.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "TAXPAYER"), eq(taxRegistryEntries.entityId, input.taxpayerId), eq(taxRegistryEntries.category, "ACCOUNTANT"))).orderBy(desc(taxRegistryEntries.version)).limit(1);
  if ((previous?.version ?? 0) !== input.expectedVersion) throw new Error("O cadastro do contador foi alterado. Recarregue antes de salvar.");
  const [entry] = await tx.insert(taxRegistryEntries).values({ entityType: "TAXPAYER", entityId: input.taxpayerId, category: "ACCOUNTANT", title: input.crc, version: input.expectedVersion + 1, actorUsuarioId: actor.usuarioId, data: { crc: input.crc, reason: input.reason, previousId: previous?.id ?? null } }).returning();
  await tx.insert(taxAuditLogs).values({ action: "PUBLISH_ACCOUNTANT", entityType: "Taxpayer", entityId: input.taxpayerId, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { before: previous ? taxRegistrySnapshot(previous.data) : null, after: entry.data } });
  await insertAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: "ADMINISTRATIVE_MUTATION", targetType: "TaxRegistryEntry", targetId: entry.id });
  return entry;
}

export async function readAccountantDirectory(db: DatabaseExecutor): Promise<AccountantDirectory> {
  const [rows, entries] = await Promise.all([
    db.select({ id: taxpayers.id, person: { fullName: people.fullName }, company: { corporateName: companies.corporateName } }).from(taxpayers).leftJoin(people, eq(people.id, taxpayers.personId)).leftJoin(companies, eq(companies.id, taxpayers.companyId)).where(eq(taxpayers.status, "Ativo")),
    db.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "TAXPAYER"), eq(taxRegistryEntries.category, "ACCOUNTANT"))).orderBy(desc(taxRegistryEntries.version), desc(taxRegistryEntries.createdAt)),
  ]);
  return { taxpayers: rows, entries };
}

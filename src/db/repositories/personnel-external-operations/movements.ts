import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { DatabaseExecutor, DatabaseTransaction } from '../../transaction';
import { hrEmploymentContracts, hrIntegrationEvents, hrMovements } from '../../schema/personnel-workforce';
import { hrEmploymentRegimes, hrPayrollRubrics } from '../../schema/personnel-configuration';
import type { ExternalPayrollMovement } from '@/lib/contracts/personnel-external-operations';

export async function lockExternalOperation(tx: DatabaseTransaction, key: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))::text`);
}
export async function findExternalMovement(db: DatabaseExecutor, sourceKey: string): Promise<ExternalPayrollMovement | null> {
  return (await db.select().from(hrMovements).where(eq(hrMovements.sourceKey, sourceKey)).limit(1))[0] ?? null;
}
export async function createExternalMovement(tx: DatabaseTransaction, data: Omit<ExternalPayrollMovement, 'id' | 'createdAt'>): Promise<ExternalPayrollMovement> {
  return (await tx.insert(hrMovements).values(data).returning())[0];
}
export async function findImportedMovementFile(db: DatabaseExecutor, hash: string) {
  return (await db.select().from(hrIntegrationEvents).where(and(eq(hrIntegrationEvents.domain, 'AUDITORIA'), eq(hrIntegrationEvents.eventType, 'IMPORTACAO_MOVIMENTOS'), sql`${hrIntegrationEvents.payload} -> 'hash' = ${JSON.stringify(hash)}::jsonb`)).limit(1))[0] ?? null;
}
export function readImportContracts(db: DatabaseExecutor, registrations: string[]) {
  return db.select().from(hrEmploymentContracts).where(and(inArray(hrEmploymentContracts.registration, registrations), eq(hrEmploymentContracts.status, 'ATIVO'))).orderBy(asc(hrEmploymentContracts.id));
}
export function readImportRegimes(db: DatabaseExecutor, ids: string[]) {
  return db.select().from(hrEmploymentRegimes).where(and(inArray(hrEmploymentRegimes.id, ids), eq(hrEmploymentRegimes.isActive, true)));
}
export function readImportRubrics(db: DatabaseExecutor, ruleSetIds: string[]) {
  return db.select().from(hrPayrollRubrics).where(and(inArray(hrPayrollRubrics.ruleSetId, ruleSetIds), eq(hrPayrollRubrics.isActive, true)));
}

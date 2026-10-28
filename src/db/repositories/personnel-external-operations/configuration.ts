import { asc, inArray } from 'drizzle-orm';
import type { DatabaseExecutor, DatabaseTransaction } from '../../transaction';
import { externalConnections } from '../../schema/personnel-external-operations';
import type { ExternalConnection, ExternalConnectionWrite } from '@/lib/contracts/personnel-external-operations';

export async function upsertExternalConfiguration(tx: DatabaseTransaction, code: string, data: ExternalConnectionWrite): Promise<ExternalConnection> {
  const [connection] = await tx.insert(externalConnections).values({ code, ...data }).onConflictDoUpdate({
    target: externalConnections.code,
    set: { ...data, lastTestedAt: null, lastTestStatus: null, lastTestMessage: 'Configuração preparada. Nenhuma assinatura, conexão ou transmissão realizada.', updatedAt: new Date() },
  }).returning();
  return connection;
}
export function readExternalConfigurations(db: DatabaseExecutor): Promise<ExternalConnection[]> {
  return db.select().from(externalConnections).where(inArray(externalConnections.code, ['ESOCIAL_RH_PRODUCAO_RESTRITA', 'ESOCIAL_RH_PRODUCAO'])).orderBy(asc(externalConnections.code));
}

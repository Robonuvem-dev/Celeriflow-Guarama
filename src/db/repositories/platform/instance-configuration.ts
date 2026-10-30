import { and, asc, eq, ne, sql } from "drizzle-orm";
import type { SystemInstanceWithParameters } from "@/lib/contracts/system-administration";
import { auditEventTypes } from "@/lib/contracts/audit";
import type { InstanceConfigurationValues } from "@/lib/platform/instance-configuration";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { accessProfiles, modules } from "../../schema/identity";
import { instanceParameters, systemInstances } from "../../schema/instance-configuration";
import { insertAuditEvent } from "./audit";

export async function loadConfigurationTotals(db: DatabaseExecutor): Promise<{ instancias: number; totalModulosAtivos: number; totalPerfis: number }> {
  const [[instances], [activeModules], [profiles]] = await Promise.all([
    db.select({ value: sql<number>`count(*)::int` }).from(systemInstances),
    db.select({ value: sql<number>`count(*)::int` }).from(modules).where(and(eq(modules.ativo, true), ne(modules.codigo, "DOCUMENTOS"), ne(modules.codigo, "AUDITORIA"))),
    db.select({ value: sql<number>`count(*)::int` }).from(accessProfiles),
  ]);
  return { instancias: instances.value, totalModulosAtivos: activeModules.value, totalPerfis: profiles.value };
}

export async function findOperationalInstance(db: DatabaseExecutor): Promise<SystemInstanceWithParameters | null> {
  const [instance] = await db.select().from(systemInstances).orderBy(asc(systemInstances.createdAt)).limit(1);
  if (!instance) return null;
  const parametros = await db.select({ chave: instanceParameters.chave, valor: instanceParameters.valor }).from(instanceParameters).where(eq(instanceParameters.configuracaoInstanciaId, instance.id));
  return { ...instance, parametros };
}

export async function saveInstanceParameterChanges(tx: DatabaseTransaction, instanceId: string, changes: [string, InstanceConfigurationValues[keyof InstanceConfigurationValues]][], actorId: string): Promise<void> {
  for (const [chave, valor] of changes) {
    await tx.insert(instanceParameters).values({ configuracaoInstanciaId: instanceId, chave, valor })
      .onConflictDoUpdate({ target: [instanceParameters.configuracaoInstanciaId, instanceParameters.chave], set: { valor } });
    await insertAuditEvent(tx, { actorUsuarioId: actorId, eventType: auditEventTypes.instanceConfigurationChanged, targetType: "INSTANCE_CONFIGURATION", targetId: `${instanceId}:${chave}` });
  }
}

import { and, asc, eq } from "drizzle-orm";
import { instanceParameters, systemInstances } from "../../schema/instance-configuration";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { externalAdhesionSchema, type ExternalAdhesion } from "@/lib/compras/external-adhesion";
export async function loadExternalAdhesion(db: DatabaseExecutor, requestId: string): Promise<ExternalAdhesion | null> {
  const [owner] = await db.select({ id: systemInstances.id }).from(systemInstances).orderBy(asc(systemInstances.createdAt)).limit(1);
  if (!owner) return null;
  const [row] = await db.select().from(instanceParameters).where(and(eq(instanceParameters.configuracaoInstanciaId, owner.id), eq(instanceParameters.chave, `COMPRAS_ADESAO:${requestId}`))).limit(1);
  return row ? externalAdhesionSchema.parse(row.valor) : null;
}
export async function saveExternalAdhesion(tx: DatabaseTransaction, requestId: string, value: ExternalAdhesion | null) {
  const [owner] = await tx.select({ id: systemInstances.id }).from(systemInstances).orderBy(asc(systemInstances.createdAt)).limit(1);
  if (!owner) { if (value) throw new Error("Configure a instância municipal para registrar a adesão externa."); return; }
  const predicate = and(eq(instanceParameters.configuracaoInstanciaId, owner.id), eq(instanceParameters.chave, `COMPRAS_ADESAO:${requestId}`));
  if (!value) { await tx.delete(instanceParameters).where(predicate); return; }
  const input = externalAdhesionSchema.parse(value);
  await tx.insert(instanceParameters).values({ configuracaoInstanciaId: owner.id, chave: `COMPRAS_ADESAO:${requestId}`, valor: input }).onConflictDoUpdate({ target: [instanceParameters.configuracaoInstanciaId, instanceParameters.chave], set: { valor: input } });
}

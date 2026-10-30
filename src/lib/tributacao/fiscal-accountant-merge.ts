import { sql } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import { createId } from "@/db/ids";
import { taxRegistrySnapshot } from "./registry-data";

/** Move accountant assignments, not debts or ownership of the taxpayers. */
export async function mergeFiscalAccountants(tx: DatabaseTransaction, actorId: string, sourceId: string, targetId: string, reason: string) {
  const taxpayers = await tx.execute<{ id: string; document: string }>(sql`SELECT t.id,COALESCE(p.cpf,c.cnpj) AS document FROM "Taxpayer" t LEFT JOIN "Person" p ON p.id=t."personId" LEFT JOIN "Company" c ON c.id=t."companyId" WHERE t.id IN (${sourceId},${targetId}) AND t.status='Ativo'`);
  const source = taxpayers.rows.find(row => row.id === sourceId), target = taxpayers.rows.find(row => row.id === targetId);
  const clean = (value: string) => (value || "").replace(/\D/g, "");
  if (!source || !target || ![11,14].includes(clean(source.document).length) || clean(source.document) !== clean(target.document)) throw new Error("Contadores fiscais devem pertencer à mesma pessoa/empresa (CPF/CNPJ) e estar ativos.");
  for (const id of [sourceId,targetId].sort()) await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`ACCOUNTANT:${id}`},0))`);
  const accountants = await tx.execute<{ id: string; entityId: string; version: number; data: Record<string,string>; status: string }>(sql`SELECT DISTINCT ON ("entityId") id,"entityId",version,data,status FROM "TaxRegistryEntry" WHERE "entityType"='TAXPAYER' AND category='ACCOUNTANT' AND "entityId" IN (${sourceId},${targetId}) ORDER BY "entityId",version DESC`);
  const origin = accountants.rows.find(row => row.entityId === sourceId), destination = accountants.rows.find(row => row.entityId === targetId);
  if (!origin || !destination || origin.status === "AGRUPADO" || destination.status !== "ATIVO") throw new Error("Selecione dois contadores fiscais registrados e ainda não agrupados.");
  const profiles = await tx.execute<{ id: string; entityId: string; version: number; data: Record<string,unknown> }>(sql`SELECT * FROM (SELECT DISTINCT ON ("entityId") id,"entityId",version,data FROM "TaxRegistryEntry" WHERE "entityType"='ECONOMIC_REGISTRATION' AND category='ECONOMIC_PROFILE' ORDER BY "entityId",version DESC) latest WHERE data->>'accountantTaxpayerId'=${sourceId}`);
  let changed = 0;
  for (const candidate of profiles.rows) {
    await tx.execute(sql`SELECT id FROM "EconomicRegistration" WHERE id=${candidate.entityId} FOR UPDATE`);
    const latest = await tx.execute<{ id: string; entityId: string; version: number; data: Record<string,unknown> }>(sql`SELECT id,"entityId",version,data FROM "TaxRegistryEntry" WHERE "entityType"='ECONOMIC_REGISTRATION' AND category='ECONOMIC_PROFILE' AND "entityId"=${candidate.entityId} ORDER BY version DESC LIMIT 1`);
    const profile = latest.rows[0];
    if (!profile || profile.data.accountantTaxpayerId !== sourceId) continue;
    const data = { ...profile.data, accountantTaxpayerId: targetId, accountantCrc: taxRegistrySnapshot(destination.data).crc, previousId: profile.id, reason };
    await tx.execute(sql`INSERT INTO "TaxRegistryEntry" (id,"entityType","entityId",category,title,data,status,source,"actorUsuarioId",version,"updatedAt") VALUES (${createId()},'ECONOMIC_REGISTRATION',${profile.entityId},'ECONOMIC_PROFILE','Agrupamento de contador',${JSON.stringify(data)}::jsonb,'ATIVO','INTERNO',${actorId},${profile.version + 1},CURRENT_TIMESTAMP)`);
    changed++;
  }
  const data = { ...origin.data, mergedInto: targetId, reason, previousId: origin.id };
  await tx.execute(sql`INSERT INTO "TaxRegistryEntry" (id,"entityType","entityId",category,title,data,status,source,"actorUsuarioId",version,"updatedAt") VALUES (${createId()},'TAXPAYER',${sourceId},'ACCOUNTANT','Contador agrupado',${JSON.stringify(data)}::jsonb,'AGRUPADO','INTERNO',${actorId},${origin.version + 1},CURRENT_TIMESTAMP)`);
  const id = createId(), moved = { economicProfiles: changed };
  await tx.execute(sql`INSERT INTO "TaxRegistryMerge" (id,kind,"sourceId","targetId",reason,"actorId",snapshot,moved) VALUES (${id},'contador',${sourceId},${targetId},${reason},${actorId},${JSON.stringify({ origin,destination })}::jsonb,${JSON.stringify(moved)}::jsonb)`);
  return { id, moved };
}

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import type { Artifact, Command, DemoState } from "@/lib/rh/esocial/contract";
import { applyCommand, newDemoState } from "@/lib/rh/esocial/engine";
import { digest } from "@/lib/rh/esocial/xml";

/** Called after authorization, within the caller's transaction. */
export async function runPersistedDemoCommand(
  tx: DatabaseTransaction, tenant: string, actorId: string, command: Command,
  store: (runId: string, artifact: Artifact) => Promise<string>, now = new Date().toISOString(),
) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`CF06:${tenant}:${command.employerId}:${command.period}`}))`);
  const requestHash = digest(JSON.stringify(command));
  const [prior] = (await tx.execute<{runId:string;requestHash:string;actorId:string}>(sql`SELECT "runId","requestHash","actorId" FROM "HrEsocialDemoCommand" WHERE "tenantId"=${tenant} AND "employerId"=${command.employerId} AND "idempotencyKey"=${command.idempotencyKey}`)).rows;
  if (prior) {
    if (prior.requestHash !== requestHash || prior.actorId !== actorId) throw new Error('Chave idempotente reutilizada com outra intenção.');
    return {runId:prior.runId,replayed:true};
  }
  const [existing] = (await tx.execute<{id:string;state:DemoState}>(sql`SELECT id,state FROM "HrEsocialDemoRun" WHERE "tenantId"=${tenant} AND "employerId"=${command.employerId} AND period=${command.period} ORDER BY generation DESC LIMIT 1 FOR UPDATE`)).rows;
  const before = existing?.state ?? newDemoState(tenant,command.employerId,command.period);
  const next = applyCommand(before,command,actorId,now), newGeneration = command.action === 'RESET';
  const id = !existing || newGeneration ? randomUUID() : existing.id;
  const fresh = next.artifacts.filter(a=>!a.objectUrl);
  for (let i=0;i<fresh.length;i+=4) await Promise.all(fresh.slice(i,i+4).map(async artifact=>{artifact.objectUrl=await store(id,artifact);}));
  if (!existing || newGeneration) await tx.execute(sql`INSERT INTO "HrEsocialDemoRun"(id,"tenantId","employerId",period,generation,state) VALUES(${id},${tenant},${command.employerId},${command.period},${next.generation},${JSON.stringify(next)}::jsonb)`);
  else await tx.execute(sql`UPDATE "HrEsocialDemoRun" SET state=${JSON.stringify(next)}::jsonb,"updatedAt"=now() WHERE id=${id}`);
  for (const a of fresh) await tx.execute(sql`INSERT INTO "HrEsocialDemoArtifact"("runId",id,kind,hash,"objectUrl") VALUES(${id},${a.id},${a.kind},${a.hash},${a.objectUrl!})`);
  await tx.execute(sql`INSERT INTO "HrEsocialDemoCommand"(id,"tenantId","employerId",period,"idempotencyKey","requestHash","actorId",action,"runId","beforeHash","afterHash") VALUES(${randomUUID()},${tenant},${command.employerId},${command.period},${command.idempotencyKey},${requestHash},${actorId},${command.action},${id},${digest(JSON.stringify(before))},${digest(JSON.stringify(next))})`);
  return {runId:id,replayed:false};
}

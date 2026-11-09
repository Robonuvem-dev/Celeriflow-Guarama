import "server-only";
import { sql } from "drizzle-orm";
import { put } from "@vercel/blob";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import { AccessError, assertBudgetUnitAccess, canViewModule, canPerformModuleOperation, isSystemAdministrator, getTenantContextForModule, type AppContext } from "@/lib/platform/tenant-context";
import { getCeleriFlowInstanceId } from "@/lib/platform/instance";
import { getBlobDocumentPrefix, getFile } from "@/lib/platform/blob";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { commandSchema, permissionFor, permissions, type DemoState, type Permission } from "./contract";
import { z } from "zod";
import { newDemoState } from "./engine";
import { digest } from "./xml";
import { demoCommandSchema } from "./input";
import { presentDemo } from "./presenter";
import { readEsocialPermissions } from "./access";
import { runPersistedDemoCommand } from "@/db/repositories/personnel-esocial-demo";

export async function assertEsocialAccess(context: AppContext, employerId: string, permission: Permission, executor: DatabaseExecutor = context.database ?? databaseConnection.db) {
  if(!canViewModule(context.user,"RH"))throw new AccessError("Sem acesso ao RH.",403);
  if(!['ESOCIAL_VIEW','ESOCIAL_AUDIT'].includes(permission)&&!canPerformModuleOperation(context.user,'RH','update'))throw new AccessError('O perfil RH é somente leitura.',403);
  assertBudgetUnitAccess(context.user,employerId);
  const tenantId=getCeleriFlowInstanceId();
  const [environment]=(await executor.execute<{enabled:boolean}>(sql`SELECT enabled FROM "HrEsocialDemoEnvironment" WHERE "tenantId"=${tenantId} AND "employerId"=${employerId} AND mode='DEMO'`)).rows;
  if(!environment?.enabled)throw new AccessError("Demonstração eSocial não habilitada para esta unidade.",403);
  if(!isSystemAdministrator(context.user)){
    const grants=(await executor.execute<{permission:Permission}>(sql`SELECT permission FROM "HrEsocialDemoGrant" WHERE "tenantId"=${tenantId} AND "employerId"=${employerId} AND "userId"=${context.user.id}`)).rows;
    if(!grants.some(g=>g.permission===permission||g.permission==='ESOCIAL_ADMIN'))throw new AccessError(`Permissão ${permission} necessária.`,403);
  }
  return tenantId;
}
export async function demoEmployers(context: AppContext){
  const executor=context.database??databaseConnection.db,tenantId=getCeleriFlowInstanceId();
  return (await executor.execute<{id:string;name:string}>(sql`SELECT u.id,u.name FROM "HrEsocialDemoEnvironment" e JOIN "BudgetUnit" u ON u.id=e."employerId" WHERE e."tenantId"=${tenantId} AND e.enabled ${isSystemAdministrator(context.user)?sql``:sql`AND u.id=ANY(${sql.param(context.user.allowedBudgetUnitIds)}::text[]) AND EXISTS(SELECT 1 FROM "HrEsocialDemoGrant" g WHERE g."tenantId"=e."tenantId" AND g."employerId"=u.id AND g."userId"=${context.user.id} AND g.permission IN ('ESOCIAL_VIEW','ESOCIAL_ADMIN'))`} ORDER BY u.name`)).rows;
}
export async function readDemo(context:AppContext,employerId:string,period:string){
  z.enum(['2026-10','2026']).parse(period);
  const tenant=await assertEsocialAccess(context,employerId,'ESOCIAL_VIEW');
  const [row]=(await (context.database??databaseConnection.db).execute<{id:string;state:DemoState}>(sql`SELECT id,state FROM "HrEsocialDemoRun" WHERE "tenantId"=${tenant} AND "employerId"=${employerId} AND period=${period} ORDER BY generation DESC LIMIT 1`)).rows;
  return row??null;
}

export async function readDemoConsole(context: AppContext, employerId: string, period: string) {
  const record = await readDemo(context, employerId, period);
  const grants = await readEsocialPermissions(context, employerId);
  return presentDemo(record?.state ?? newDemoState(getCeleriFlowInstanceId(), employerId, period), record?.id ?? null, context.user.id, grants.includes('ESOCIAL_ADMIN') || grants.includes('ESOCIAL_AUDIT'));
}

export async function executeAuthorizedDemoCommand(raw: unknown) {
  const input = demoCommandSchema.parse(raw), context = await getTenantContextForModule('RH');
  const actions = { ARCHIVE: 'ARCHIVE_ERRORS', AUTOMATION: 'SCHEDULE', RUN_AUTOMATION: 'RUN_SCHEDULE' } as const;
  await executeDemoCommand(context, {
    action: input.action in actions ? actions[input.action as keyof typeof actions] : input.action,
    employerId: input.employerId, period: input.period, idempotencyKey: input.idempotencyKey,
    targetId: input.eventId || input.batchId || undefined,
    scenario: input.scenario === 'SCHEMA_INVALIDO' ? 'ERRO_SCHEMA' : input.scenario,
    rubric: input.rubric, dueAt: input.dueAt, enabled: input.enabled, stage: input.stage, files: input.files,
  });
  return readDemoConsole(context, input.employerId, input.period);
}
export async function executeDemoCommand(context:AppContext,raw:unknown){
  const command=commandSchema.parse(raw);
  return withDatabaseTransaction(databaseConnection,async tx=>{
    const tenant=await assertEsocialAccess(context,command.employerId,permissionFor(command.action),tx);
    const result = await runPersistedDemoCommand(tx,tenant,context.user.id,command,async (runId,item)=>{
      const stored=await put(`${getBlobDocumentPrefix()}esocial-demo/${runId}/${item.hash}.xml`,item.xml,{access:'private',contentType:'application/xml; charset=utf-8',addRandomSuffix:false});
      return stored.url;
    });
    if(!result.replayed)await insertAuditEvent(tx,{actorUsuarioId:context.user.id,eventType:'ADMINISTRATIVE_MUTATION',targetType:'ESOCIAL_DEMO_COMMAND',targetId:result.runId});
    return result;
  },{timeoutMs:120000});
}
export async function downloadDemoArtifact(context:AppContext,runId:string,artifactId:string){
  const executor=context.database??databaseConnection.db,tenant=getCeleriFlowInstanceId();
  const [row]=(await executor.execute<{employerId:string;hash:string;objectUrl:string;kind:string}>(sql`SELECT r."employerId",a.hash,a."objectUrl",a.kind FROM "HrEsocialDemoArtifact" a JOIN "HrEsocialDemoRun" r ON r.id=a."runId" WHERE r.id=${runId} AND a.id=${artifactId} AND r."tenantId"=${tenant}`)).rows;
  if(!row)throw new AccessError('Arquivo não encontrado.',404);
  await assertEsocialAccess(context,row.employerId,'ESOCIAL_VIEW');
  const file=await getFile(row.objectUrl);if(!file?.stream)throw new Error('Arquivo indisponível.');
  const bytes=await new Response(file.stream).text();if(digest(bytes)!==row.hash)throw new Error('Integridade documental inválida.');
  await insertAuditEvent(executor,{actorUsuarioId:context.user.id,eventType:'DOCUMENT_DOWNLOAD',targetType:'ESOCIAL_DEMO_ARTIFACT',targetId:artifactId});
  return {xml:bytes,kind:row.kind};
}

export async function configureDemoPermission(context:AppContext,raw:unknown){
 const input=z.object({employerId:z.string().min(1),email:z.email(),permission:z.enum(permissions),enabled:z.boolean()}).strict().parse(raw);
 return withDatabaseTransaction(databaseConnection,async tx=>{
  const tenant=await assertEsocialAccess(context,input.employerId,'ESOCIAL_ADMIN',tx);
  const [user]=(await tx.execute<{id:string}>(sql`SELECT id FROM "Usuario" WHERE lower(email)=${input.email.toLowerCase()} AND ativo`)).rows;
  if(!user)throw new Error('Usuário ativo não encontrado.');
  if(input.enabled)await tx.execute(sql`INSERT INTO "HrEsocialDemoGrant"("tenantId","employerId","userId",permission,"grantedById") VALUES(${tenant},${input.employerId},${user.id},${input.permission},${context.user.id}) ON CONFLICT DO NOTHING`);
  else await tx.execute(sql`DELETE FROM "HrEsocialDemoGrant" WHERE "tenantId"=${tenant} AND "employerId"=${input.employerId} AND "userId"=${user.id} AND permission=${input.permission}`);
  await insertAuditEvent(tx,{actorUsuarioId:context.user.id,eventType:'ADMINISTRATIVE_MUTATION',targetType:`ESOCIAL_DEMO_${input.enabled?'GRANT':'REVOKE'}`,targetId:`${user.id}:${input.permission}`});
 });
}

import {randomUUID} from "node:crypto";
import {sql} from "drizzle-orm";
import type {DatabaseConnection} from "@/db/connection";
import {withDatabaseTransaction} from "@/db/transaction";
import {actionOriginExists, insertActionAudit, insertActionRegistryEntries, latestActionRegistryEntry} from "@/db/repositories/tax-actions/registry";
import {taxReferenceSchema} from "./reference-catalog";
import type {TaxActor} from "./index";

export async function saveTaxReference(connection:DatabaseConnection, actor:TaxActor, raw:unknown, expectedVersion:number, id?:string, remove=false) {
 const data=taxReferenceSchema.parse(raw);
 if(!Number.isSafeInteger(expectedVersion)||expectedVersion<0) throw new Error("Versão inválida.");
 if(actor.allowedBudgetUnitIds&&!actor.allowedBudgetUnitIds.includes(data.budgetUnitId))throw new Error("UG fora do acesso autorizado.");
 return withDatabaseTransaction(connection,async tx=>{
  if(!await actionOriginExists(tx,data.governmentEntityId,data.budgetUnitId))throw new Error("UG não pertence ao ente selecionado.");
  if(data.kind==="usuario-municipal"){const user=await tx.execute(sql`SELECT id FROM "Usuario" WHERE id=${data.userId} AND ativo=true LIMIT 1`);if(!user.rows.length)throw new Error("Usuário cadastrado não está ativo.");}
  if(data.kind==="equipamento-credenciado"){
   const credential=await tx.execute(sql`SELECT id FROM "NfseCredentialRequest" WHERE "taxpayerId"=${data.taxpayerId} AND status='HABILITADO' LIMIT 1`);
   if(!credential.rows.length)throw new Error("Contribuinte não possui credenciamento habilitado.");
  }
  const entityId=id||randomUUID();
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`TAX_REFERENCE:${data.budgetUnitId}:${data.kind}:${data.code}`}))`);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`TAX_REFERENCE_ID:${entityId}`}))`);
  const previous=await latestActionRegistryEntry(tx,"TAX_REFERENCE",entityId,"TAX_REFERENCE");
  if((previous?.version??0)!==expectedVersion)throw new Error("Registro alterado por outro usuário. Recarregue a página.");
  if(previous){const old=taxReferenceSchema.parse(previous.data);if(old.budgetUnitId!==data.budgetUnitId||old.governmentEntityId!==data.governmentEntityId||old.kind!==data.kind||old.code!==data.code)throw new Error("Origem, tipo e código são imutáveis.");if(previous.status==="EXCLUIDO")throw new Error("Registro já excluído.");}
  if(remove&&!previous)throw new Error("Registro não encontrado.");
  const duplicates=await tx.execute(sql`SELECT 1 FROM "TaxRegistryEntry" e WHERE e."entityType"='TAX_REFERENCE' AND e.category='TAX_REFERENCE' AND e."entityId"<>${entityId} AND e.data->>'budgetUnitId'=${data.budgetUnitId} AND e.data->>'kind'=${data.kind} AND e.data->>'code'=${data.code} AND e.status<>'EXCLUIDO' AND NOT EXISTS (SELECT 1 FROM "TaxRegistryEntry" n WHERE n."entityType"='TAX_REFERENCE' AND n.category='TAX_REFERENCE' AND n."entityId"=e."entityId" AND n.version>e.version) LIMIT 1`);
  if(duplicates.rows.length)throw new Error("Código já cadastrado nesta tabela e UG.");
  await insertActionRegistryEntries(tx,[{entityType:"TAX_REFERENCE",entityId,category:"TAX_REFERENCE",title:data.name,data,status:remove?"EXCLUIDO":"ATIVO",actorUsuarioId:actor.usuarioId,version:expectedVersion+1}]);
  await insertActionAudit(tx,{action:remove?"DELETE_TAX_REFERENCE":previous?"UPDATE_TAX_REFERENCE":"CREATE_TAX_REFERENCE",entityType:"TAX_REFERENCE",entityId,authorUsuarioId:actor.usuarioId,authorEmployeeId:actor.employeeId??null,payload:{kind:data.kind,code:data.code,version:expectedVersion+1,budgetUnitId:data.budgetUnitId}});
  return entityId;
 });
}

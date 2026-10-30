import {z} from "zod";
import {randomUUID} from "node:crypto";
import {sql} from "drizzle-orm";
import {Decimal} from "@/db/decimal";
import type {DatabaseConnection} from "@/db/connection";
import {withDatabaseTransaction} from "@/db/transaction";
import {actionFiscalEntityExists,actionOriginExists,insertActionAudit,insertActionRegistryEntries,latestActionRegistryEntry} from "@/db/repositories/tax-actions/registry";
import type {TaxActor} from "./index";
export const complementaryDeclarationSchema=z.object({
 type:z.enum(["DIVERSOS","CARTORIO"]),taxpayerId:z.string().min(1),competence:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
 protocol:z.string().trim().min(1).max(100),status:z.enum(["REGISTRADA","RETIFICADA","CANCELADA"]),
 amount:z.string().refine(value=>{try{const n=new Decimal(value);return n.isFinite()&&!n.isNegative()&&n.decimalPlaces()<=2&&n.lessThan("10000000000000000");}catch{return false;}},"Valor monetário inválido."),
 documentRef:z.string().trim().max(500),description:z.string().trim().min(1).max(4000),governmentEntityId:z.string().min(1),budgetUnitId:z.string().min(1),
});
export async function saveComplementaryDeclaration(connection:DatabaseConnection,actor:TaxActor,raw:unknown,version:number,id?:string){
 const data=complementaryDeclarationSchema.parse(raw);data.amount=new Decimal(data.amount).toFixed(2);
 if(!Number.isSafeInteger(version)||version<0)throw new Error("Versão inválida.");
 if(actor.allowedBudgetUnitIds&&!actor.allowedBudgetUnitIds.includes(data.budgetUnitId))throw new Error("UG não autorizada.");
 return withDatabaseTransaction(connection,async tx=>{
  if(!await actionOriginExists(tx,data.governmentEntityId,data.budgetUnitId))throw new Error("Origem inválida.");
  if(!await actionFiscalEntityExists(tx,"TAXPAYER",data.taxpayerId))throw new Error("Contribuinte não encontrado.");
  const entityId=id??randomUUID();
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`DECLARACAO_COMPLEMENTAR:${entityId}`}))`);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`DECLARACAO_COMPLEMENTAR:${data.budgetUnitId}:${data.protocol}`}))`);
  const previous=await latestActionRegistryEntry(tx,"DECLARACAO_COMPLEMENTAR",entityId,"DECLARACAO_COMPLEMENTAR");
  if((previous?.version??0)!==version)throw new Error("Declaração alterada. Recarregue a página.");
  if(previous){const old=complementaryDeclarationSchema.parse(previous.data);if(old.taxpayerId!==data.taxpayerId||old.budgetUnitId!==data.budgetUnitId||old.governmentEntityId!==data.governmentEntityId||old.type!==data.type||old.protocol!==data.protocol)throw new Error("Titular, origem, tipo e protocolo são imutáveis.");if(old.status==="CANCELADA")throw new Error("Declaração cancelada não pode ser alterada.");}
  const duplicate=await tx.execute(sql`SELECT 1 FROM "TaxRegistryEntry" WHERE "entityType"='DECLARACAO_COMPLEMENTAR' AND category='DECLARACAO_COMPLEMENTAR' AND "entityId"<>${entityId} AND data->>'budgetUnitId'=${data.budgetUnitId} AND data->>'protocol'=${data.protocol} LIMIT 1`);
  if(duplicate.rows.length)throw new Error("Protocolo já cadastrado nesta UG.");
  await insertActionRegistryEntries(tx,[{entityType:"DECLARACAO_COMPLEMENTAR",entityId,category:"DECLARACAO_COMPLEMENTAR",title:data.protocol,data,status:data.status,version:version+1,actorUsuarioId:actor.usuarioId}]);
  await insertActionAudit(tx,{entityType:"DECLARACAO_COMPLEMENTAR",entityId,action:"SAVE_COMPLEMENTARY_DECLARATION",authorUsuarioId:actor.usuarioId,authorEmployeeId:actor.employeeId??null,payload:{type:data.type,taxpayerId:data.taxpayerId,protocol:data.protocol,version:version+1}});
  return entityId;
 });
}

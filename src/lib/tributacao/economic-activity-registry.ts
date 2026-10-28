import { randomUUID } from "node:crypto";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { appendEconomicAudit, appendEconomicEntry, listEconomicActivityDefinitions, lockEconomicKey } from "@/db/repositories/tax-economic/registry";
import { hasEconomicOrigin, listEconomicCbos, readEconomicService } from "@/db/repositories/tax-economic/registrations";
import { economicSnapshot } from "@/db/repositories/tax-economic/snapshot";
import { z } from "zod";
import type { TaxActor } from "./index";
import { resolveTaxAssessmentScope, taxScopeSnapshot } from "./scope";

export const economicActivitySchema=z.object({activityId:z.string().optional(),expectedVersion:z.number().int().nonnegative(),governmentEntityId:z.string().min(1),budgetUnitId:z.string().min(1),cnae:z.string().regex(/^\d{7}$/),name:z.string().trim().min(1).max(240),risk:z.enum(["BAIXO","MEDIO","ALTO","DEPENDENTE"]),active:z.boolean(),serviceActivityIds:z.array(z.string().min(1)).max(100),cboCodes:z.array(z.string().regex(/^\d{6}$/)).max(100),legalBasis:z.string().trim().min(1).max(4000)}).refine(input=>new Set(input.serviceActivityIds).size===input.serviceActivityIds.length && new Set(input.cboCodes).size===input.cboCodes.length,"Serviços e ocupações não podem se repetir.");

export async function readEconomicActivitiesInTransaction(tx:DatabaseTransaction,governmentEntityId:string,budgetUnitId:string) {
  const entries=await listEconomicActivityDefinitions(tx,governmentEntityId,budgetUnitId);
  const latest=new Map<string,typeof entries[number]>();for(const entry of entries) if(!latest.has(entry.entityId)) latest.set(entry.entityId,entry);
  return [...latest.values()];
}

export async function resolveEconomicActivityCode(tx:DatabaseTransaction,governmentEntityId:string,budgetUnitId:string,code:string) {
  const entries=await readEconomicActivitiesInTransaction(tx,governmentEntityId,budgetUnitId);
  let current=code;const visited=new Set<string>();
  while(true) {
    if(visited.has(current)) throw new Error("Unificação de atividades possui ciclo; concilie o cadastro.");visited.add(current);
    const entry=entries.find(entry=>taxScopeSnapshot(entry.data).cnae===current);
    if(!entry) return current;
    const data=taxScopeSnapshot(entry.data);
    if(entry.status==="UNIFICADA") {if(typeof data.unifiedIntoCode!=="string") throw new Error("Unificação de atividade sem destino conciliado.");current=data.unifiedIntoCode;continue;}
    if(data.active!==true) throw new Error("Atividade econômica desativada: selecione o código vigente.");
    return current;
  }
}

export async function publishEconomicActivity(db:DatabaseConnection,actor:TaxActor,raw:z.input<typeof economicActivitySchema>) {
  const input=economicActivitySchema.parse(raw);
  return withDatabaseTransaction(db,async tx=>{
    if(actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(input.budgetUnitId)) throw new Error("UG fora do acesso autorizado.");
    if(!await hasEconomicOrigin(tx,input)) throw new Error("Ente/UG não conciliados.");
    await lockEconomicKey(tx,`ECONOMIC_ACTIVITY:${input.budgetUnitId}`);
    const definitions=await readEconomicActivitiesInTransaction(tx,input.governmentEntityId,input.budgetUnitId);
    const previous=input.activityId ? definitions.find(entry=>entry.entityId===input.activityId) : undefined;
    if(input.activityId && !previous) throw new Error("Atividade fora da origem selecionada.");
    if((previous?.version ?? 0)!==input.expectedVersion) throw new Error("A atividade foi alterada. Recarregue antes de publicar.");
    if(previous && (taxScopeSnapshot(previous.data).cnae!==input.cnae || previous.status==="UNIFICADA")) throw new Error("Código da atividade é imutável; utilize a rotina de unificação.");
    if(definitions.some(entry=>entry.entityId!==input.activityId && taxScopeSnapshot(entry.data).cnae===input.cnae)) throw new Error("CNAE já cadastrado nesta origem.");
    const serviceNames:Record<string,string>={};
    for(const id of input.serviceActivityIds) {
      const service=await readEconomicService(tx,id);
      if(!service || service.tax.name.toUpperCase()!=="ISS") throw new Error("Selecione itens ativos da lista de serviços ISS.");
      const scope=await resolveTaxAssessmentScope(tx,actor,service.taxId);
      if(scope.governmentEntityId!==input.governmentEntityId || scope.budgetUnitId!==input.budgetUnitId) throw new Error("Serviço vinculado pertence a outra origem.");
      serviceNames[id]=`${service.code} · ${service.name}`;
    }
    const cbos=await listEconomicCbos(tx,input.cboCodes);
    if(cbos.length!==input.cboCodes.length) throw new Error("Selecione ocupações CBO ativas do cadastro único.");
    const id=input.activityId ?? randomUUID();
    const entry=await appendEconomicEntry(tx,{entityType:"ECONOMIC_ACTIVITY",entityId:id,category:"ECONOMIC_ACTIVITY_DEFINITION",title:`${input.budgetUnitId}:${input.cnae}`,version:input.expectedVersion+1,status:input.active ? "ATIVO" : "INATIVO",actorUsuarioId:actor.usuarioId,data:economicSnapshot({...input,activityId:id,serviceNames,cboNames:Object.fromEntries(cbos.map(cbo=>[cbo.code,cbo.description])),previousId:previous?.id ?? null})});
    await appendEconomicAudit(tx,{action:"PUBLISH_ECONOMIC_ACTIVITY",entityType:"TaxRegistryEntry",entityId:entry.id,authorUsuarioId:actor.usuarioId,authorEmployeeId:actor.employeeId,payload:{before:previous?.data ?? null,after:entry.data}});
    return entry;
  },{isolationLevel:"serializable",timeoutMs:60000});
}

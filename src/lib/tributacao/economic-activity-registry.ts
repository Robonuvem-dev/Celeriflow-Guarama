import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { TaxActor } from "./index";
import { resolveTaxAssessmentScope, taxScopeSnapshot } from "./scope";

export const economicActivitySchema=z.object({activityId:z.string().optional(),expectedVersion:z.number().int().nonnegative(),governmentEntityId:z.string().min(1),budgetUnitId:z.string().min(1),cnae:z.string().regex(/^\d{7}$/),name:z.string().trim().min(1).max(240),risk:z.enum(["BAIXO","MEDIO","ALTO","DEPENDENTE"]),active:z.boolean(),serviceActivityIds:z.array(z.string().min(1)).max(100),cboCodes:z.array(z.string().regex(/^\d{6}$/)).max(100),legalBasis:z.string().trim().min(1).max(4000)}).refine(input=>new Set(input.serviceActivityIds).size===input.serviceActivityIds.length && new Set(input.cboCodes).size===input.cboCodes.length,"Serviços e ocupações não podem se repetir.");

export async function readEconomicActivitiesInTransaction(tx:Prisma.TransactionClient,governmentEntityId:string,budgetUnitId:string) {
  const entries=await tx.taxRegistryEntry.findMany({where:{entityType:"ECONOMIC_ACTIVITY",category:"ECONOMIC_ACTIVITY_DEFINITION",AND:[{data:{path:["governmentEntityId"],equals:governmentEntityId}},{data:{path:["budgetUnitId"],equals:budgetUnitId}}]},orderBy:{version:"desc"}});
  const latest=new Map<string,typeof entries[number]>();for(const entry of entries) if(!latest.has(entry.entityId)) latest.set(entry.entityId,entry);
  return [...latest.values()];
}

export async function resolveEconomicActivityCode(tx:Prisma.TransactionClient,governmentEntityId:string,budgetUnitId:string,code:string) {
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

export async function publishEconomicActivity(db:PrismaClient,actor:TaxActor,raw:z.input<typeof economicActivitySchema>) {
  const input=economicActivitySchema.parse(raw);
  return db.$transaction(async tx=>{
    if(actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(input.budgetUnitId)) throw new Error("UG fora do acesso autorizado.");
    if(!await tx.planningEntityUnit.findFirst({where:{governmentEntityId:input.governmentEntityId,budgetUnitId:input.budgetUnitId}})) throw new Error("Ente/UG não conciliados.");
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ECONOMIC_ACTIVITY:${input.budgetUnitId}`},0))::text`;
    const definitions=await readEconomicActivitiesInTransaction(tx,input.governmentEntityId,input.budgetUnitId);
    const previous=input.activityId ? definitions.find(entry=>entry.entityId===input.activityId) : undefined;
    if(input.activityId && !previous) throw new Error("Atividade fora da origem selecionada.");
    if((previous?.version ?? 0)!==input.expectedVersion) throw new Error("A atividade foi alterada. Recarregue antes de publicar.");
    if(previous && (taxScopeSnapshot(previous.data).cnae!==input.cnae || previous.status==="UNIFICADA")) throw new Error("Código da atividade é imutável; utilize a rotina de unificação.");
    if(definitions.some(entry=>entry.entityId!==input.activityId && taxScopeSnapshot(entry.data).cnae===input.cnae)) throw new Error("CNAE já cadastrado nesta origem.");
    const serviceNames:Record<string,string>={};
    for(const id of input.serviceActivityIds) {
      const service=await tx.taxServiceActivity.findFirst({where:{id,isActive:true},include:{tax:true}});
      if(!service || service.tax.name.toUpperCase()!=="ISS") throw new Error("Selecione itens ativos da lista de serviços ISS.");
      const scope=await resolveTaxAssessmentScope(tx,actor,service.taxId);
      if(scope.governmentEntityId!==input.governmentEntityId || scope.budgetUnitId!==input.budgetUnitId) throw new Error("Serviço vinculado pertence a outra origem.");
      serviceNames[id]=`${service.code} · ${service.name}`;
    }
    const cbos=await tx.healthCbo.findMany({where:{code:{in:input.cboCodes},isActive:true},select:{code:true,description:true}});
    if(cbos.length!==input.cboCodes.length) throw new Error("Selecione ocupações CBO ativas do cadastro único.");
    const id=input.activityId ?? randomUUID();
    const entry=await tx.taxRegistryEntry.create({data:{entityType:"ECONOMIC_ACTIVITY",entityId:id,category:"ECONOMIC_ACTIVITY_DEFINITION",title:`${input.budgetUnitId}:${input.cnae}`,version:input.expectedVersion+1,status:input.active ? "ATIVO" : "INATIVO",actorUsuarioId:actor.usuarioId,data:{...input,activityId:id,serviceNames,cboNames:Object.fromEntries(cbos.map(cbo=>[cbo.code,cbo.description])),previousId:previous?.id ?? null}}});
    await tx.taxAuditLog.create({data:{action:"PUBLISH_ECONOMIC_ACTIVITY",entityType:"TaxRegistryEntry",entityId:entry.id,authorUsuarioId:actor.usuarioId,authorEmployeeId:actor.employeeId,payload:{before:previous?.data ?? null,after:entry.data} as Prisma.InputJsonObject}});
    return entry;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:60000});
}

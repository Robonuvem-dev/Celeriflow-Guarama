import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { appendEconomicAudit, appendEconomicEntry, listEconomicCatalogs, listEconomicProfiles, lockEconomicKey } from "@/db/repositories/tax-economic/registry";
import { countUnscopedEconomicRegistrations, hasEconomicOrigin, hasEconomicProcess, lockEconomicRegistration, readEconomicRegistration } from "@/db/repositories/tax-economic/registrations";
import { economicSnapshot } from "@/db/repositories/tax-economic/snapshot";
import { z } from "zod";
import type { TaxActor } from "./index";
import { economicActivitySchema,readEconomicActivitiesInTransaction } from "./economic-activity-registry";
import { economicProfileSchema } from "./economic-profile";
import { updateEconomicRegistrationWithHistoryInTransaction } from "./economic-history";
import { enforceEconomicProfileDebtPolicy } from "./economic-debt-policy";
import { taxScopeSnapshot } from "./scope";
import { fiscalCatalogSchema, publishFiscalCatalogInTransaction } from "./configurable-cadastres";

const unificationSchema=z.object({governmentEntityId:z.string().min(1),budgetUnitId:z.string().min(1),sourceId:z.string().min(1),sourceVersion:z.number().int().positive(),targetId:z.string().min(1),targetVersion:z.number().int().positive(),processId:z.string().nullable(),reason:z.string().trim().min(1).max(4000)}).refine(input=>input.sourceId!==input.targetId,"Selecione atividades distintas.");

export async function unifyEconomicActivities(db:DatabaseConnection,actor:TaxActor,raw:z.input<typeof unificationSchema>) {
  const input=unificationSchema.parse(raw);
  return withDatabaseTransaction(db,async tx=>{
    if(actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(input.budgetUnitId)) throw new Error("UG fora do acesso autorizado.");
    if(!await hasEconomicOrigin(tx,input)) throw new Error("Ente/UG não conciliados.");
    if(input.processId && !await hasEconomicProcess(tx,input.processId)) throw new Error("Protocolo não encontrado.");
    await lockEconomicKey(tx,`ECONOMIC_ACTIVITY:${input.budgetUnitId}`);
    const definitions=await readEconomicActivitiesInTransaction(tx,input.governmentEntityId,input.budgetUnitId);
    const source=definitions.find(entry=>entry.entityId===input.sourceId);const target=definitions.find(entry=>entry.entityId===input.targetId);
    if(!source || !target || source.version!==input.sourceVersion || target.version!==input.targetVersion) throw new Error("A seleção de atividades foi alterada ou pertence a outra origem. Recarregue antes de unificar.");
    const from=economicActivitySchema.parse(source.data);const to=economicActivitySchema.parse(target.data);
    if(source.status==="UNIFICADA" || target.status!=="ATIVO" || !to.active) throw new Error("A origem não pode estar unificada e o destino deve estar ativo.");
    const catalogs = await listEconomicCatalogs(tx, input.budgetUnitId, input.governmentEntityId, "ZONEAMENTO");
    const latestCatalogs = new Map<string, typeof catalogs[number]>(); for (const catalog of catalogs) if (!latestCatalogs.has(catalog.entityId)) latestCatalogs.set(catalog.entityId, catalog);
    const affectedZoningCatalogIds: string[] = [];
    for (const [id, entry] of [...latestCatalogs].sort(([a], [b]) => a.localeCompare(b))) {
      const catalog = fiscalCatalogSchema.parse(entry.data);
      const sourceRule = catalog.zoningActivities?.find(rule => rule.cnae === from.cnae); if (!sourceRule) continue;
      const targetRule = catalog.zoningActivities?.find(rule => rule.cnae === to.cnae);
      if (targetRule && (targetRule.treatment !== sourceRule.treatment || targetRule.condition !== sourceRule.condition)) throw new Error(`O zoneamento ${catalog.name} tem tratamentos ou condições distintos para os CNAEs. Concilie a regra urbanística antes de unificar.`);
      const zoningActivities = catalog.zoningActivities!.filter(rule => rule.cnae !== from.cnae);
      if (!targetRule) zoningActivities.push({ ...sourceRule, cnae: to.cnae });
      await publishFiscalCatalogInTransaction(tx, actor, { ...catalog, catalogId: id, expectedVersion: entry.version, zoningActivities });
      affectedZoningCatalogIds.push(id);
    }
    const profiles=await listEconomicProfiles(tx,{governmentEntityId:input.governmentEntityId,budgetUnitId:input.budgetUnitId});
    const latest=new Map<string,typeof profiles[number]>();for(const profile of profiles) if(!latest.has(profile.entityId)) latest.set(profile.entityId,profile);
    const affected:string[]=[];
    for(const [id,entry] of [...latest].sort(([a],[b])=>a.localeCompare(b))) {
      await lockEconomicRegistration(tx,id);
      const row=await readEconomicRegistration(tx,id);const profile=economicProfileSchema.parse(entry.data);
      if(row.primaryCnae!==from.cnae && !profile.secondaryCnaes.includes(from.cnae)) continue;
      await enforceEconomicProfileDebtPolicy(tx,actor,id);
      const primaryCnae=row.primaryCnae===from.cnae ? to.cnae : row.primaryCnae ?? profile.primaryCnae;
      const secondaryCnaes=[...new Set(profile.secondaryCnaes.map(code=>code===from.cnae ? to.cnae : code))].filter(code=>code!==primaryCnae);
      await updateEconomicRegistrationWithHistoryInTransaction(tx,actor,id,{primaryCnae},{profileManaged:true});
      const after=economicProfileSchema.parse({...profile,primaryCnae,secondaryCnaes,registrationId:id,expectedVersion:entry.version,processId:input.processId,reason:input.reason});
      const snapshot=await appendEconomicEntry(tx,{entityType:"ECONOMIC_REGISTRATION",entityId:id,category:"ECONOMIC_PROFILE",title:"Perfil econômico",version:entry.version+1,actorUsuarioId:actor.usuarioId,processId:input.processId,source:"UNIFICACAO_ATIVIDADES",data:economicSnapshot({...taxScopeSnapshot(entry.data),...after,previousId:entry.id,activityUnificationSourceId:source.id,activityUnificationTargetId:target.id})});
      await appendEconomicAudit(tx,{action:"UNIFY_ECONOMIC_REGISTRATION_ACTIVITY",entityType:"EconomicRegistration",entityId:id,authorUsuarioId:actor.usuarioId,authorEmployeeId:actor.employeeId,payload:{beforeProfileId:entry.id,afterProfileId:snapshot.id,from:from.cnae,to:to.cnae,reason:input.reason}});
      affected.push(id);
    }
    const unscoped=await countUnscopedEconomicRegistrations(tx,from.cnae,[...latest.keys()]);
    await appendEconomicEntry(tx,{entityType:"ECONOMIC_ACTIVITY",entityId:source.entityId,category:"ECONOMIC_ACTIVITY_DEFINITION",title:source.title,version:source.version+1,status:"UNIFICADA",actorUsuarioId:actor.usuarioId,processId:input.processId,data:economicSnapshot({...taxScopeSnapshot(source.data),active:false,previousId:source.id,unifiedIntoId:target.entityId,unifiedIntoCode:to.cnae,reason:input.reason})});
    const operation=await appendEconomicEntry(tx,{entityType:"ECONOMIC_ACTIVITY",entityId:source.entityId,category:"ECONOMIC_ACTIVITY_UNIFICATION",title:`${from.cnae} → ${to.cnae}`,actorUsuarioId:actor.usuarioId,processId:input.processId,data:{governmentEntityId:input.governmentEntityId,budgetUnitId:input.budgetUnitId,sourceId:source.id,targetId:target.id,from:from.cnae,to:to.cnae,affectedRegistrationIds:affected,affectedZoningCatalogIds,unscopedRegistrationsNotAttributed:unscoped,reason:input.reason}});
    return {count:affected.length,operationId:operation.id,unscopedRegistrationsNotAttributed:unscoped};
  },{isolationLevel:"serializable",timeoutMs:60000});
}

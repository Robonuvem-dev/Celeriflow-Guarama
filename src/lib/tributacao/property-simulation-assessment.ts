import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { appendPropertyRegistryEntry, hasPropertyAssessment, listPropertyAssessedSimulations, lockProperty, propertyProcessExists, readProperty, readPropertyRegistryEntry, readPropertyTax } from "@/db/repositories/tax-property/records";
import { propertySnapshot } from "@/db/repositories/tax-property/snapshot";
import type { PropertyAssessmentRecord } from "@/db/repositories/tax-property/contracts";
import { z } from "zod";
import { createTaxAssessmentInTransaction,type TaxActor } from "./index";
import { simulatePropertyInTransaction,propertySimulationSchema } from "./property-group-simulation";
import { propertyValuationRuleSchema } from "./property-valuation";
import { taxScopeSnapshot } from "./scope";

const commitSchema=z.object({simulation:propertySimulationSchema,expectedPreviewHash:z.string().regex(/^[0-9a-f]{64}$/),reason:z.string().trim().min(1).max(4000),processId:z.string().nullable()});
export async function assessPropertySimulation(connection:DatabaseConnection,actor:TaxActor,raw:z.input<typeof commitSchema>): Promise<PropertyAssessmentRecord> {
  const input=commitSchema.parse(raw);
  return withDatabaseTransaction(connection,async tx=>{
    const ids=[input.simulation.parentId,...input.simulation.unitIds].sort();
    for(const id of ids) await lockProperty(tx,id);
    const preview=await simulatePropertyInTransaction(tx,actor,input.simulation);
    if(preview.previewHash!==input.expectedPreviewHash) throw new Error("Cadastro, regra ou simulação alterados. Recalcule a prévia antes de efetivar.");
    const rule=await readPropertyRegistryEntry(tx,input.simulation.ruleId);const config=propertyValuationRuleSchema.parse(rule.data);
    const tax=await readPropertyTax(tx,config.taxId);
    if(tax.name.toUpperCase()!=="IPTU") throw new Error("A efetivação da simulação exige regra de IPTU.");
    const property=await readProperty(tx,input.simulation.parentId);
    if(!property.taxpayerId) throw new Error("Imóvel sem titular fiscal conciliado.");
    if(await hasPropertyAssessment(tx,{taxId:config.taxId,year:config.year,ids})) throw new Error("Já existe lançamento vigente no exercício para um dos imóveis simulados.");
    const prior=await listPropertyAssessedSimulations(tx,config.year);
    for(const entry of prior) {const data=taxScopeSnapshot(entry.data);if(Array.isArray(data.propertyIds) && data.propertyIds.some(id=>typeof id==="string" && ids.includes(id)) && await hasPropertyAssessment(tx,{assessmentId:entry.entityId})) throw new Error("Imóvel já incluído em lançamento de englobamento deste exercício.");}
    if(input.processId && !await propertyProcessExists(tx,input.processId)) throw new Error("Protocolo não encontrado.");
    const assessment=await createTaxAssessmentInTransaction(tx,actor,{year:config.year,taxId:config.taxId,taxpayerId:property.taxpayerId,realEstateId:property.id,taxableBase:preview.venalValue,rate:input.simulation.taxRate});
    const scope=taxScopeSnapshot(assessment.calculationSnapshot);
    await appendPropertyRegistryEntry(tx,{entityType:"TAX_ASSESSMENT",entityId:assessment.id,category:"PROPERTY_SIMULATION_ASSESSMENT",title:"Lançamento sobre simulação imobiliária",actorUsuarioId:actor.usuarioId,processId:input.processId,data:propertySnapshot({governmentEntityId:scope.governmentEntityId,budgetUnitId:scope.budgetUnitId,year:config.year,propertyIds:ids,previewHash:preview.previewHash,simulation:input.simulation,memory:preview.memory,venalValue:preview.venalValue,estimatedTax:preview.estimatedTax,reason:input.reason})});
    return assessment;
  },{isolationLevel:"serializable",timeoutMs:60000});
}

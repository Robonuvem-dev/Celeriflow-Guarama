import { Prisma,type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { createTaxAssessmentInTransaction,type TaxActor } from "./index";
import { simulatePropertyInTransaction,propertySimulationSchema } from "./property-group-simulation";
import { propertyValuationRuleSchema } from "./property-valuation";
import { taxScopeSnapshot } from "./scope";

const commitSchema=z.object({simulation:propertySimulationSchema,expectedPreviewHash:z.string().regex(/^[0-9a-f]{64}$/),reason:z.string().trim().min(1).max(4000),processId:z.string().nullable()});
export async function assessPropertySimulation(db:PrismaClient,actor:TaxActor,raw:z.input<typeof commitSchema>) {
  const input=commitSchema.parse(raw);
  return db.$transaction(async tx=>{
    const ids=[input.simulation.parentId,...input.simulation.unitIds].sort();
    for(const id of ids) await tx.$queryRaw`SELECT id FROM "RealEstate" WHERE id=${id} FOR UPDATE`;
    const preview=await simulatePropertyInTransaction(tx,actor,input.simulation);
    if(preview.previewHash!==input.expectedPreviewHash) throw new Error("Cadastro, regra ou simulação alterados. Recalcule a prévia antes de efetivar.");
    const rule=await tx.taxRegistryEntry.findUniqueOrThrow({where:{id:input.simulation.ruleId}});const config=propertyValuationRuleSchema.parse(rule.data);
    const tax=await tx.tax.findUniqueOrThrow({where:{id:config.taxId}});
    if(tax.name.toUpperCase()!=="IPTU") throw new Error("A efetivação da simulação exige regra de IPTU.");
    const property=await tx.realEstate.findUniqueOrThrow({where:{id:input.simulation.parentId}});
    if(!property.taxpayerId) throw new Error("Imóvel sem titular fiscal conciliado.");
    if(await tx.taxAssessment.count({where:{taxId:config.taxId,year:config.year,realEstateId:{in:ids},status:{not:"Cancelado"}}})) throw new Error("Já existe lançamento vigente no exercício para um dos imóveis simulados.");
    const prior=await tx.taxRegistryEntry.findMany({where:{entityType:"TAX_ASSESSMENT",category:"PROPERTY_SIMULATION_ASSESSMENT",data:{path:["year"],equals:config.year}}});
    for(const entry of prior) {const data=taxScopeSnapshot(entry.data);if(Array.isArray(data.propertyIds) && data.propertyIds.some(id=>typeof id==="string" && ids.includes(id)) && await tx.taxAssessment.count({where:{id:entry.entityId,status:{not:"Cancelado"}}})) throw new Error("Imóvel já incluído em lançamento de englobamento deste exercício.");}
    if(input.processId && !await tx.process.findUnique({where:{id:input.processId}})) throw new Error("Protocolo não encontrado.");
    const assessment=await createTaxAssessmentInTransaction(tx,actor,{year:config.year,taxId:config.taxId,taxpayerId:property.taxpayerId,realEstateId:property.id,taxableBase:preview.venalValue,rate:input.simulation.taxRate});
    const scope=taxScopeSnapshot(assessment.calculationSnapshot);
    await tx.taxRegistryEntry.create({data:{entityType:"TAX_ASSESSMENT",entityId:assessment.id,category:"PROPERTY_SIMULATION_ASSESSMENT",title:"Lançamento sobre simulação imobiliária",actorUsuarioId:actor.usuarioId,processId:input.processId,data:{governmentEntityId:scope.governmentEntityId,budgetUnitId:scope.budgetUnitId,year:config.year,propertyIds:ids,previewHash:preview.previewHash,simulation:input.simulation,memory:preview.memory,venalValue:preview.venalValue,estimatedTax:preview.estimatedTax,reason:input.reason} as Prisma.InputJsonObject}});
    return assessment;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:60000});
}

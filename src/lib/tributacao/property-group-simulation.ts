import { Prisma, type PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { TaxActor } from "./index";
import { resolveTaxAssessmentScope, taxScopeSnapshot } from "./scope";
import { propertyProfileSchema } from "./property-profile-schema";
import { evaluateConfiguredPropertyValuation,propertyValuationRuleSchema } from "./property-valuation";

const area=z.string().regex(/^\d+(?:\.\d{1,6})?$/).max(24);
export const propertySimulationSchema=z.object({parentId:z.string().min(1),unitIds:z.array(z.string().min(1)).max(1000),ruleId:z.string().min(1),includeParentConstruction:z.boolean(),taxRate:z.string().trim().refine(value=>{try{const rate=new Prisma.Decimal(value);return rate.isFinite() && rate.gte(0) && rate.lte(100);}catch{return false;}},"Alíquota inválida."),landAreaOverride:area.optional(),parentBuiltAreaOverride:area.optional(),unitBuiltAreaOverrides:z.record(z.string(),area).optional()}).refine(input=>new Set(input.unitIds).size===input.unitIds.length,"Unidades repetidas na simulação.").refine(input=>Object.keys(input.unitBuiltAreaOverrides ?? {}).every(id=>input.unitIds.includes(id)),"Overrides devem pertencer às unidades selecionadas.");

export async function simulateGroupedPropertyValuation(db:PrismaClient,actor:TaxActor,raw:z.input<typeof propertySimulationSchema>) {
  return db.$transaction(tx=>simulatePropertyInTransaction(tx,actor,raw),{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:60000});
}

export async function simulatePropertyInTransaction(tx:Prisma.TransactionClient,actor:TaxActor,raw:z.input<typeof propertySimulationSchema>) {
  const input=propertySimulationSchema.parse(raw);
    const rule=await tx.taxRegistryEntry.findUniqueOrThrow({where:{id:input.ruleId}});
    if(rule.category!=="PROPERTY_VALUATION_RULE" || rule.entityType!=="TAX") throw new Error("Selecione uma regra de avaliação imobiliária.");
    const configuration=propertyValuationRuleSchema.parse(rule.data);
    const scope=await resolveTaxAssessmentScope(tx,actor,configuration.taxId,rule.data);
    if(!scope.governmentEntityId || !scope.budgetUnitId) throw new Error("Avaliação sem ente/UG conciliados.");
    const latest=await tx.taxRegistryEntry.findFirst({where:{entityType:"TAX",entityId:rule.entityId,category:rule.category,title:rule.title},orderBy:{version:"desc"}});
    if(latest?.id!==rule.id) throw new Error("Regra substituída. Recarregue a simulação.");
    const parent=await tx.realEstate.findUniqueOrThrow({where:{id:input.parentId}});
    if(parent.landArea===null || parent.landArea<=0 || ["Baixado","Inativo","Desmembrado","Remembrado"].includes(parent.status)) throw new Error("O terreno deve estar ativo e possuir área territorial positiva.");
    const parentEntry=await tx.taxRegistryEntry.findFirst({where:{entityType:"REAL_ESTATE",entityId:parent.id,category:"PROPERTY_PROFILE"},orderBy:{version:"desc"}});
    const parentProfile=parentEntry ? propertyProfileSchema.parse(parentEntry.data) : null;
    if(!parentProfile || input.unitIds.length>0 && parentProfile.kind!=="Terreno" || parentProfile.governmentEntityId!==scope.governmentEntityId || parentProfile.budgetUnitId!==scope.budgetUnitId) throw new Error("Selecione um imóvel conciliado na origem da avaliação; englobamento exige terreno principal.");
    let built=new Prisma.Decimal(0);
    if(input.includeParentConstruction) {if(parent.builtArea===null && input.parentBuiltAreaOverride===undefined) throw new Error("Informe a área construída do imóvel antes de incluí-la.");built=built.plus(input.parentBuiltAreaOverride ?? String(parent.builtArea));}
    const units:{id:string;inscription:string|null;profileId:string;updatedAt:string;builtArea:string;unitMode:string|null}[]=[];
    for(const id of [...input.unitIds].sort()) {
      const property=await tx.realEstate.findUniqueOrThrow({where:{id}});
      const entry=await tx.taxRegistryEntry.findFirst({where:{entityType:"REAL_ESTATE",entityId:id,category:"PROPERTY_PROFILE"},orderBy:{version:"desc"}});
      const profile=entry ? propertyProfileSchema.parse(entry.data) : null;
      if(!entry || profile?.kind!=="Unidade" || profile.parentId!==parent.id || profile.governmentEntityId!==scope.governmentEntityId || profile.budgetUnitId!==scope.budgetUnitId || ["Baixado","Inativo","Desmembrado","Remembrado"].includes(property.status)) throw new Error("Selecione somente unidades ativas vinculadas ao terreno na mesma origem.");
      const simulatedArea=input.unitBuiltAreaOverrides?.[id] ?? (property.builtArea===null ? undefined : String(property.builtArea));
      if(simulatedArea===undefined) throw new Error("Toda unidade deve possuir área construída para simular englobamento.");
      built=built.plus(simulatedArea);
      units.push({id,inscription:property.municipalInsc,profileId:entry.id,updatedAt:property.updatedAt.toISOString(),builtArea:simulatedArea,unitMode:profile.unitMode});
    }
    const evaluated=await evaluateConfiguredPropertyValuation(tx,configuration,{id:parent.id,landArea:input.landAreaOverride ?? String(parent.landArea),builtArea:built.toString()},scope);
    const estimatedTax=evaluated.value.mul(input.taxRate).div(100).toDecimalPlaces(2,Prisma.Decimal.ROUND_HALF_UP);
    const result={venalValue:evaluated.value.toFixed(2),estimatedTax:estimatedTax.toFixed(2),memory:{...evaluated.memory,parentId:parent.id,parentProfileId:parentEntry!.id,parentUpdatedAt:parent.updatedAt.toISOString(),units,ruleId:rule.id,ruleVersion:rule.version,taxRate:input.taxRate,includeParentConstruction:input.includeParentConstruction,overrides:{landArea:input.landAreaOverride ?? null,parentBuiltArea:input.parentBuiltAreaOverride ?? null,unitBuiltAreas:input.unitBuiltAreaOverrides ?? {}},effect:"SIMULATION_ONLY",scope:taxScopeSnapshot(rule.data)}};
    return {...result,previewHash:createHash("sha256").update(JSON.stringify(result)).digest("hex")};
}

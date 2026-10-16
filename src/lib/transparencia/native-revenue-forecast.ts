import "server-only";
import {createHash} from "node:crypto";
import {Prisma,type PrismaClient} from "@prisma/client";
import type {PublicRecord,TransparencyQuery} from "./query-contract";
const code=(value:string)=>value.replace(/[.\s-]/g,"");
export function isRevenueHierarchyParent(parent:string,children:string[]){const key=code(parent),prefix=key.replace(/0+$/,"");return prefix.length>0&&children.some(child=>{const other=code(child);return other!==key&&other.startsWith(prefix);});}
export async function nativeRevenueForecasts(db:PrismaClient,entity:"prefeitura"|"camara",entityIds:string[],query:TransparencyQuery,movements:PublicRecord[]){
 const asOf=new Date(Math.min(query.until?new Date(`${query.until}T23:59:59.999Z`).getTime():Date.UTC(query.year+1,0,1)-1,Date.now()));
 const forecasts=await db.annualBudgetRevenueForecast.findMany({where:{annualBudgetLaw:{financialYear:{governmentEntityId:{in:entityIds},year:query.year},publishedAt:{not:null,lte:asOf}}},include:{annualBudgetLaw:{select:{id:true,lawNumber:true,updatedAt:true,financialYear:{select:{governmentEntityId:true,governmentEntity:{select:{code:true}}}}}}},orderBy:[{code:"asc"},{id:"asc"}]});
 const laws=new Map<string,Set<string>>();for(const row of forecasts){const owner=row.annualBudgetLaw.financialYear.governmentEntityId||"";const set=laws.get(owner)||new Set<string>();set.add(row.annualBudgetLawId);laws.set(owner,set);}if([...laws.values()].some(set=>set.size>1))throw new Error("Mais de uma LOA publicada no mesmo ente/exercício: concilie a fonte antes de somar previsões.");
 const lines=await db.planningBudgetLine.findMany({where:{kind:"REVENUE",year:query.year,instrument:{governmentEntityId:{in:entityIds},kind:"LOA",annualBudgetLawId:{in:forecasts.map(row=>row.annualBudgetLawId)}}},include:{revenueNature:{select:{code:true}},movements:{where:{effectiveAt:{lte:asOf}},select:{value:true}},instrument:{select:{annualBudgetLawId:true}}}});
 return forecasts.map((row):PublicRecord=>{
  const children=forecasts.filter(other=>other.annualBudgetLawId===row.annualBudgetLawId).map(other=>other.code),parent=isRevenueHierarchyParent(row.code,children);
  const matching=lines.filter(line=>line.instrument.annualBudgetLawId===row.annualBudgetLawId&&code(line.revenueNature?.code||line.code)===code(row.code));
  const revised=matching.length?matching.reduce((sum,line)=>sum.add(line.originalValue).add(line.movements.reduce((sum,move)=>sum.add(move.value),new Prisma.Decimal(0))),new Prisma.Decimal(0)):null;
  const realized=movements.filter(move=>move.values.nativeEntityCode===row.annualBudgetLaw.financialYear.governmentEntity?.code&&code(String(move.values.number))===code(row.code)).reduce((sum,move)=>sum.add(String(move.values.value??0)),new Prisma.Decimal(0));
  return {key:createHash("sha256").update(`forecast:${entity}:${row.id}:${query.year}`).digest("hex").slice(0,40),entity,year:query.year,periodIndependent:true,excludedFromTotals:parent?["predicted","updated","value"]:movements.length?["value"]:[],values:{number:row.code,name:row.name,date:asOf.toISOString().slice(0,10),sourceCode:null,stage:parent?"Subtotal hierárquico — fora das somas":"PREVISAO_ANUAL",type:"ORCAMENTARIA",predicted:row.estimatedValue.toFixed(2),updated:revised?.toFixed(2)||null,value:realized.toFixed(2),legalReference:row.annualBudgetLaw.lawNumber,reference:"Previsão anual; arrecadação do recorte. Previsões e movimentos não são somados como fatos novos.",nativeUpdatedAt:row.annualBudgetLaw.updatedAt.toISOString()}};
 });
}

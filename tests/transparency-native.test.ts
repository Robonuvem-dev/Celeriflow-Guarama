import assert from "node:assert/strict";
import test from "node:test";
import {Prisma,type PrismaClient,type TransparencyNativeBinding} from "@prisma/client";
import {readNativePublicBinding} from "../src/lib/transparencia/native-domain-provider";
import {nativeBindingSchema} from "../src/lib/transparencia/native-binding-policy";
import {defaultTransparencySettings} from "../src/lib/transparencia/presentation-settings";
import {parseTransparencyQuery,filterPublicDataset} from "../src/lib/transparencia/query-contract";
import {getTransparencyCollection} from "../src/lib/transparencia/consultation-catalog";
import {isRevenueHierarchyParent,nativeRevenueForecasts} from "../src/lib/transparencia/native-revenue-forecast";
import {pntpApplicableEntities,pntpEvidenceSchema} from "../src/lib/transparencia/pntp-policy";
import {auroraPublicModels} from "../src/lib/transparencia/aurora-models";

const query=parseTransparencyQuery(new URLSearchParams("source=NATIVO&year=2026"));
const binding=(sourceType:string,collectionSlug:string)=>({id:"binding-private",publicKey:"opaque-public",sourceType,collectionSlug,sourceId:"source-private",governmentEntityId:"government-one",enabled:true,sourceReference:"Documento de origem de teste",details:{},createdById:"actor-private",createdAt:new Date(),updatedAt:new Date()} as TransparencyNativeBinding);

test("vínculos rejeitam tabela/família e campos privados arbitrários",()=>{
 const common={sourceId:"source",governmentEntityId:"one",enabled:true,sourceReference:"Documento público",details:{}};
 assert.equal(nativeBindingSchema.safeParse({...common,sourceType:"ASSET",collectionSlug:"patrimonio"}).success,true);
 assert.equal(nativeBindingSchema.safeParse({...common,sourceType:"SQL",collectionSlug:"patrimonio"}).success,false);
 assert.equal(nativeBindingSchema.safeParse({...common,sourceType:"ASSET",collectionSlug:"servidores"}).success,false);
 assert.equal(nativeBindingSchema.safeParse({...common,sourceType:"ASSET",collectionSlug:"patrimonio",details:{cpf:"123",bankAccount:"456"}}).success,false);
});

test("compra mensal mantém grão de item e documento fiscal, sem CPF/GED privado",async()=>{
 const db={transparencyPublication:{findMany:async()=>[]},purchaseReceipt:{findUniqueOrThrow:async()=>({id:"source-private",number:"RC-1",documentId:"private-document",status:"APPROVED",receivedAt:new Date("2026-07-03"),updatedAt:new Date(),items:[{id:"item-one",quantity:3,unitCost:1.25,material:{name:"Material público"}},{id:"item-two",quantity:2,unitCost:2.1,material:{name:"Segundo material"}}],contract:{number:"CT-1",sourceBudgetUnitId:null,supplier:{company:{corporateName:"Empresa pública"},person:null}},commitment:{number:"EMP-1",settlements:[{documentId:"private-document",fiscalDocumentNumber:"NF-88",fiscalDocumentSeries:"1"}]}})}} as unknown as PrismaClient;
 const rows=await readNativePublicBinding(db,binding("PURCHASE_RECEIPT","compras"),"prefeitura",query,defaultTransparencySettings());assert.equal(rows.length,2);assert.equal(rows[0].values.invoice,"NF-88");assert.equal(rows[0].values.value,"3.75");assert.equal(rows[1].values.value,"4.20");assert.ok(!JSON.stringify(rows).includes("private-document")&&!JSON.stringify(rows).includes("source-private"));
});

test("estoque lê movimentos e recusa centro de outra entidade",async()=>{
 let period:unknown;
 const db={transparencyPublication:{findMany:async()=>[]},warehouse:{findUniqueOrThrow:async()=>({name:"Depósito",costCenterId:"center"})},costCenter:{findUniqueOrThrow:async()=>({governmentEntityId:"government-one"})},materialMovement:{findMany:async({where}:{where:{date:unknown}})=>{period=where.date;return[{id:"move-private",date:new Date("2026-07-03"),updatedAt:new Date(),type:"Entrada",operation:"REGULAR",quantity:2,unitValue:3,material:{code:"MAT-1",name:"Material",unitOfMeasure:"UN"},patientName:"não publicar",reason:"narrativa privada"}];}}} as unknown as PrismaClient;
 const rows=await readNativePublicBinding(db,binding("WAREHOUSE","estoque"),"prefeitura",{...query,from:"2026-07-01",until:"2026-07-31"},defaultTransparencySettings());assert.ok(period);assert.equal(rows[0].values.value,"6.00");assert.ok(!JSON.stringify(rows).includes("patientName")&&!JSON.stringify(rows).includes("narrativa privada"));
 db.costCenter.findUniqueOrThrow=async()=>({governmentEntityId:"other"}) as never;
 await assert.rejects(readNativePublicBinding(db,binding("WAREHOUSE","estoque"),"prefeitura",query,defaultTransparencySettings()),/outra entidade/);
});

test("obras expõem medições e itens com referências, sem criar execução/pagamento fictícios",async()=>{
 const selected=binding("WORK","obras");selected.details={startDate:"2026-01-01",endDate:"2026-12-31",inspector:"Fiscal identificado",progress:25,items:[{description:"Item contratual",quantity:"3",unitPrice:"12.50"}]};
 const db={transparencyPublication:{findMany:async()=>[]},obrasObra:{findUniqueOrThrow:async()=>({numero:"OB-1",nome:"Obra",descricao:"Objeto",local:"Local público",tipo:"Reforma",status:"Em Execução",createdAt:new Date(),updatedAt:new Date(),valorEstimado:1000,medicoes:[{numero:1,data:new Date("2026-05-01"),valorMedido:250,status:"Aprovada"}]})}} as unknown as PrismaClient;
 const [row]=await readNativePublicBinding(db,selected,"prefeitura",query,defaultTransparencySettings());assert.equal(row.items?.[0].total,"37.50");assert.equal(row.events?.[0].stage,"Medição");assert.equal(row.values.progress,25);assert.ok(row.values.complementOrigin);assert.equal(row.values.paid,undefined);
});

test("renúncia agrega concessões, não dívida; nomes só com publicação nominal configurada",async()=>{
 let nameLookups=0;
 const db={transparencyPublication:{findMany:async()=>[]},taxBenefitGrant:{findUniqueOrThrow:async()=>({grantedAt:new Date("2026-07-01"),status:"CONCEDIDO",taxpayerId:"private-taxpayer",renunciationDecimal:new Prisma.Decimal(125),rule:{code:"BEN-1",benefitType:"Redução",legalReference:"Lei específica"},calculationSnapshot:{cpf:"não divulgar"}})},taxpayer:{findUnique:async()=>{nameLookups++;return{person:{fullName:"Beneficiário publicável"},company:null};}}} as unknown as PrismaClient;
 const selected=binding("TAX_BENEFIT_GRANT","renuncia"),[anonymous]=await readNativePublicBinding(db,selected,"prefeitura",query,defaultTransparencySettings());assert.equal(nameLookups,0);assert.equal(anonymous.values.value,"125.00");assert.ok(!JSON.stringify(anonymous).includes("private-taxpayer")&&!JSON.stringify(anonymous).includes("cpf"));selected.details={nominalPublication:true};assert.equal((await readNativePublicBinding(db,selected,"prefeitura",query,defaultTransparencySettings()))[0].values.beneficiary,"Beneficiário publicável");
});

test("previsão anual e arrecadação ficam em grãos distintos sem duplicar soma",async()=>{
 const db={annualBudgetRevenueForecast:{findMany:async()=>[{id:"forecast-parent",annualBudgetLawId:"law",code:"1.0.0.0",name:"Subtotal",estimatedValue:new Prisma.Decimal(100),annualBudgetLaw:{lawNumber:"Lei 1",updatedAt:new Date(),financialYear:{governmentEntityId:"one",governmentEntity:{code:"EXEC"}}}},{id:"forecast-leaf",annualBudgetLawId:"law",code:"1.1.1.1",name:"Analítica",estimatedValue:new Prisma.Decimal(100),annualBudgetLaw:{lawNumber:"Lei 1",updatedAt:new Date(),financialYear:{governmentEntityId:"one",governmentEntity:{code:"EXEC"}}}}]},planningBudgetLine:{findMany:async()=>[]}} as unknown as PrismaClient;
 const movement={key:"income",entity:"prefeitura" as const,year:2026,excludedFromTotals:["predicted","updated"],values:{number:"1.1.1.1",nativeEntityCode:"EXEC",date:"2026-07-01",value:"20.00",predicted:null,updated:null}};
 const forecasts=await nativeRevenueForecasts(db,"prefeitura",["one"],query,[movement]),result=filterPublicDataset(getTransparencyCollection("receitas")!,{records:[movement,...forecasts],source:"NATIVO",status:"AVAILABLE",updatedAt:null,provenance:"Teste",complete:true},query);
 assert.equal(result.totals.predicted,"100.00");assert.equal(result.totals.value,"20.00");assert.equal(result.totals.updated,null);assert.ok(isRevenueHierarchyParent("1.0.0.0",["1.1.1.1"]));assert.equal(isRevenueHierarchyParent("1.1.1.1",["1.1.1.2"]),false);
});

test("PNTP aplica exceções de estatais ao município e exige evidência, sem selo automático",()=>{
 assert.deepEqual(pntpApplicableEntities("COMUM (EXCETO ESTATAIS)"),["prefeitura","camara"]);assert.deepEqual(pntpApplicableEntities("EXECUTIVO e CONSÓRCIOS"),["prefeitura"]);assert.deepEqual(pntpApplicableEntities("PODER LEGISLATIVO"),["camara"]);assert.deepEqual(pntpApplicableEntities("PODER JUDICIÁRIO"),[]);
 assert.equal(pntpEvidenceSchema.safeParse({criterionId:"one",entity:"prefeitura",year:2026,status:"SATISFIED",urls:[],notes:"Critério ainda sem documento verificável"}).success,false);
});

test("modelos próprios distinguem minuta/PAS/situação das contas sem simular ato ou julgamento",()=>{
 assert.equal(auroraPublicModels.length,8);const lai=auroraPublicModels.find(model=>model.code==="lai-regulamento")!,pas=auroraPublicModels.find(model=>model.code==="pas-2026")!,accounts=auroraPublicModels.find(model=>model.code==="situacao-contas")!;
 assert.match(lai.sections[0][1],/Não é lei promulgada/);assert.match(pas.sections[0][1],/não produção SUS comprovada/);assert.match(accounts.sections[0][1],/Não é acórdão/);
 assert.ok(!auroraPublicModels.some(model=>/Aprovadas definitivamente/.test(model.title)));
});

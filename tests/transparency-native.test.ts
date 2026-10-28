import assert from "node:assert/strict";
import test from "node:test";
import type {TransparencyNativeBinding} from "../src/lib/contracts/transparency";
import {createProcessesPortalsDatabase} from "./helpers/processes-portals-database";
import {readNativePublicBinding} from "../src/lib/transparencia/native-domain-provider";
import {nativeBindingSchema} from "../src/lib/transparencia/native-binding-policy";
import {defaultTransparencySettings} from "../src/lib/transparencia/presentation-settings";
import {parseTransparencyQuery,filterPublicDataset} from "../src/lib/transparencia/query-contract";
import {getTransparencyCollection} from "../src/lib/transparencia/consultation-catalog";
import {isRevenueHierarchyParent,nativeRevenueForecasts} from "../src/lib/transparencia/native-revenue-forecast";
import {pntpApplicableEntities,pntpEvidenceSchema} from "../src/lib/transparencia/pntp-policy";
import {auroraPublicModels} from "../src/lib/transparencia/aurora-models";

const query=parseTransparencyQuery(new URLSearchParams("source=NATIVO&year=2026"));
const binding=(sourceType:string,collectionSlug:string,sourceId:string):TransparencyNativeBinding=>({id:"binding-private",publicKey:"opaque-public",sourceType,collectionSlug,sourceId,governmentEntityId:"government-one",enabled:true,sourceReference:"Documento de origem de teste",details:{},createdById:"actor-private",createdAt:new Date(),updatedAt:new Date()});

test("vínculos rejeitam tabela/família e campos privados arbitrários",()=>{
 const common={sourceId:"source",governmentEntityId:"one",enabled:true,sourceReference:"Documento público",details:{}};
 assert.equal(nativeBindingSchema.safeParse({...common,sourceType:"ASSET",collectionSlug:"patrimonio"}).success,true);
 assert.equal(nativeBindingSchema.safeParse({...common,sourceType:"SQL",collectionSlug:"patrimonio"}).success,false);
 assert.equal(nativeBindingSchema.safeParse({...common,sourceType:"ASSET",collectionSlug:"servidores"}).success,false);
 assert.equal(nativeBindingSchema.safeParse({...common,sourceType:"ASSET",collectionSlug:"patrimonio",details:{cpf:"123",bankAccount:"456"}}).success,false);
});

test("PostgreSQL: fontes nativas preservam grão, recorte, sigilo e precisão",{timeout:240000},async t=>{
 const {database,connection,close}=await createProcessesPortalsDatabase(),db=connection.db;
 try{
  await database.exec(`
   INSERT INTO "GovernmentEntity" (id,code,name,type,"updatedAt") VALUES ('government-one','EXEC','Executivo','PREFEITURA',now()),('government-other','OTHER','Outro ente','PREFEITURA',now());
   INSERT INTO "Secretariat" (id,name,"updatedAt") VALUES ('sec','Administração',now());
   INSERT INTO "Employee" (id,name,"updatedAt") VALUES ('employee','Servidor de teste',now());
   INSERT INTO "Company" (id,"corporateName",cnpj,"updatedAt") VALUES ('company','Empresa pública','12345678000100',now());
   INSERT INTO "Supplier" (id,"companyId","updatedAt") VALUES ('supplier','company',now());
   INSERT INTO "FinancialYear" (id,year,"startDate","endDate","governmentEntityId","updatedAt") VALUES ('year',2026,'2026-01-01','2026-12-31','government-one',now());
   INSERT INTO "BudgetUnit" (id,code,name,"secretariatId","updatedAt") VALUES ('unit','02.001','Administração','sec',now());
   INSERT INTO "ExpenseNature" (id,code,name,"updatedAt") VALUES ('nature','3.3.90.30','Material de consumo',now());
   INSERT INTO "ResourceSource" (id,code,name,"updatedAt") VALUES ('resource','500','Recursos livres',now());
   INSERT INTO "BudgetAppropriation" (id,code,"financialYearId","budgetUnitId","expenseNatureId","resourceSourceId","updatedAt") VALUES ('appropriation','02.001.339030','year','unit','nature','resource',now());
   INSERT INTO "PurchaseProcess" (id,number,object,type,"secretariatId","updatedAt") VALUES ('purchase','PROC-1','Compra pública','Compra','sec',now());
   INSERT INTO "Contract" (id,number,object,"initialValue","updatedValue","startDate","endDate","processId","supplierId","secretariatId","updatedAt") VALUES ('contract','CT-1','Compra pública',10,10,'2026-01-01','2026-12-31','purchase','supplier','sec',now());
   INSERT INTO "Document" (id,title,"documentType","fileUrl","updatedAt") VALUES ('private-document','Documento fiscal','Fiscal','https://private.invalid/document',now());
   INSERT INTO "CostCenter" (id,code,name,"governmentEntityId","updatedAt") VALUES ('center','CENTER','Centro','government-one',now());
   INSERT INTO "Warehouse" (id,name,"costCenterId","updatedAt") VALUES ('warehouse','Depósito','center',now());
   INSERT INTO "MaterialCategory" (id,code,name,"updatedAt") VALUES ('category','CAT','Materiais',now());
   INSERT INTO "Material" (id,code,name,"categoryId","updatedAt") VALUES ('material-one','MAT-1','Material público','category',now()),('material-two','MAT-2','Segundo material','category',now());
   INSERT INTO "PurchaseProcessItem" (id,"purchaseProcessId",quantity,"materialId","updatedAt") VALUES ('purchase-item-one','purchase',3,'material-one',now()),('purchase-item-two','purchase',2,'material-two',now());
   INSERT INTO "MaterialMovement" (id,type,quantity,"unitValue",date,"warehouseId","materialId",reason,"updatedAt") VALUES ('move-one','Entrada',2,3,'2026-07-03','warehouse','material-one','narrativa privada',now()),('move-two','Entrada',2,4,'2026-08-01','warehouse','material-two','fora do período',now());
   INSERT INTO "PurchaseReceipt" (id,number,"receivedAt","contractId","purchaseProcessId","documentId","receiverId","attesterId","idempotencyKey","sourceId","updatedAt") VALUES ('receipt-private','RC-1','2026-07-03','contract','purchase','private-document','employee','employee','receipt-key','contract',now());
   INSERT INTO "PurchaseReceiptItem" (id,"purchaseReceiptId","purchaseProcessItemId","materialId","warehouseId",quantity,"unitCost","stockMovementId","updatedAt") VALUES ('item-one','receipt-private','purchase-item-one','material-one','warehouse',3,1.25,'move-one',now()),('item-two','receipt-private','purchase-item-two','material-two','warehouse',2,2.1,'move-two',now());
   INSERT INTO "Commitment" (id,number,value,history,"appropriationId","supplierId","purchaseReceiptId","updatedAt") VALUES ('commitment','EMP-1',10,'Histórico privado','appropriation','supplier','receipt-private',now());
   INSERT INTO "Settlement" (id,value,"commitmentId","authorId","documentId","fiscalDocumentNumber","fiscalDocumentSeries","updatedAt") VALUES ('settlement',10,'commitment','employee','private-document','NF-88','1',now());
   INSERT INTO "ObrasObra" (id,numero,nome,tipo,descricao,local,"valorEstimado","updatedAt") VALUES ('work','OB-1','Obra','Reforma','Objeto','Local público',1000,now());
   INSERT INTO "ObrasMedicao" (id,numero,data,"valorMedido","obraId",status,"updatedAt") VALUES ('measurement',1,'2026-05-01',250,'work','Aprovada',now());
   INSERT INTO "Person" (id,"fullName",cpf,"updatedAt") VALUES ('person','Beneficiário publicável','12345678901',now());
   INSERT INTO "Taxpayer" (id,"taxpayerType","personId","updatedAt") VALUES ('private-taxpayer','Pessoa Física','person',now());
   INSERT INTO "TaxBenefitRule" (id,code,name,"benefitType","legalReference",eligibility,calculation,"effectiveFrom","createdByUsuarioId","updatedAt") VALUES ('benefit-rule','BEN-1','Benefício','Redução','Lei específica','{}','{}','2026-01-01','actor-private',now());
   INSERT INTO "TaxBenefitGrant" (id,"ruleId","taxpayerId","sourceType","sourceId","originalAmountDecimal","finalAmountDecimal","renunciationDecimal","calculationSnapshot","grantedByUsuarioId","grantedAt") VALUES ('grant','benefit-rule','private-taxpayer','TEST','grant',200,75,125,'{"cpf":"não divulgar"}','actor-private','2026-07-01');
   INSERT INTO "AnnualBudgetLaw" (id,"lawNumber","financialYearId","totalRevenue","totalExpense","publishedAt","updatedAt") VALUES ('law','Lei 1','year',100,100,'2026-01-01',now());
   INSERT INTO "AnnualBudgetRevenueForecast" (id,"annualBudgetLawId",code,name,"estimatedValue") VALUES ('forecast-parent','law','1.0.0.0','Subtotal',100),('forecast-leaf','law','1.1.1.1','Analítica',100);
  `);
  await t.test("compra mensal mantém grão de item e documento fiscal, sem CPF/GED privado",async()=>{
   const rows=await readNativePublicBinding(db,binding("PURCHASE_RECEIPT","compras","receipt-private"),"prefeitura",query,defaultTransparencySettings());
   assert.equal(rows.length,2);assert.equal(rows[0].values.invoice,"NF-88");assert.deepEqual(rows.map(row=>row.values.value).sort(),["3.75","4.20"]);assert.ok(!JSON.stringify(rows).includes("private-document")&&!JSON.stringify(rows).includes("receipt-private"));
  });
  await t.test("estoque aplica período e recusa centro de outra entidade",async()=>{
   const selected=binding("WAREHOUSE","estoque","warehouse"),rows=await readNativePublicBinding(db,selected,"prefeitura",{...query,from:"2026-07-01",until:"2026-07-31"},defaultTransparencySettings());
   assert.equal(rows.length,1);assert.equal(rows[0].values.value,"6.00");assert.ok(!JSON.stringify(rows).includes("narrativa privada"));
   await database.exec(`UPDATE "CostCenter" SET "governmentEntityId"='government-other' WHERE id='center'`);
   await assert.rejects(readNativePublicBinding(db,selected,"prefeitura",query,defaultTransparencySettings()),/outra entidade/);
  });
  await t.test("obras expõem medições e itens sem pagamento fictício",async()=>{
   const selected=binding("WORK","obras","work");selected.details={startDate:"2026-01-01",endDate:"2026-12-31",inspector:"Fiscal identificado",progress:25,items:[{description:"Item contratual",quantity:"3",unitPrice:"12.50"}]};
   const [row]=await readNativePublicBinding(db,selected,"prefeitura",query,defaultTransparencySettings());assert.equal(row.items?.[0].total,"37.50");assert.equal(row.events?.[0].stage,"Medição");assert.equal(row.values.progress,25);assert.ok(row.values.complementOrigin);assert.equal(row.values.paid,undefined);
  });
  await t.test("renúncia preserva anonimização e valor agregado da concessão",async()=>{
   const selected=binding("TAX_BENEFIT_GRANT","renuncia","grant"),[anonymous]=await readNativePublicBinding(db,selected,"prefeitura",query,defaultTransparencySettings());assert.equal(anonymous.values.value,"125.00");assert.ok(!JSON.stringify(anonymous).includes("private-taxpayer")&&!JSON.stringify(anonymous).includes("cpf")&&!JSON.stringify(anonymous).includes("Beneficiário publicável"));
   selected.details={nominalPublication:true};assert.equal((await readNativePublicBinding(db,selected,"prefeitura",query,defaultTransparencySettings()))[0].values.beneficiary,"Beneficiário publicável");
   const [aggregate]=await readNativePublicBinding(db,binding("TAX_BENEFIT_RULE","renuncia","benefit-rule"),"prefeitura",query,defaultTransparencySettings());assert.equal(aggregate.values.value,"125.00");
  });
  await t.test("previsão anual e arrecadação não duplicam soma",async()=>{
   const movement={key:"income",entity:"prefeitura" as const,year:2026,excludedFromTotals:["predicted","updated"],values:{number:"1.1.1.1",nativeEntityCode:"EXEC",date:"2026-07-01",value:"20.00",predicted:null,updated:null}};
   const forecasts=await nativeRevenueForecasts(db,"prefeitura",["government-one"],query,[movement]),result=filterPublicDataset(getTransparencyCollection("receitas")!,{records:[movement,...forecasts],source:"NATIVO",status:"AVAILABLE",updatedAt:null,provenance:"Teste",complete:true},query);
   assert.equal(result.totals.predicted,"100.00");assert.equal(result.totals.value,"20.00");assert.equal(result.totals.updated,null);assert.ok(isRevenueHierarchyParent("1.0.0.0",["1.1.1.1"]));assert.equal(isRevenueHierarchyParent("1.1.1.1",["1.1.1.2"]),false);
  });
 }finally{await close();}
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

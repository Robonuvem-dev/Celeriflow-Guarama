import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { getTransparencyCollection } from "../src/lib/transparencia/consultation-catalog";
import { parseTransparencyQuery, filterPublicDataset, publicQueryHref } from "../src/lib/transparencia/query-contract";
import { exampleTransparencyDataset } from "../src/lib/transparencia/example-provider";
import { exportTransparencyCsv } from "../src/lib/transparencia/consultation-export";
import { verifiedPublicationBytes, publicationMetadataSchema } from "../src/lib/transparencia/publication-policy";
import { loadIbemaTransparencyDataset } from "../src/lib/transparencia/ibema-provider";
import { defaultTransparencySettings } from "../src/lib/transparencia/presentation-settings";
import { transparencyCatalog } from "../src/lib/transparencia/consultation-catalog";
import { renderTransparencyFile,byteStream } from "../src/lib/transparencia/export-files";
import { isPublicationPublic } from "../src/lib/transparencia/publication-policy";
import { publicPublicationValues } from "../src/lib/transparencia/document-provider";
import { monthlyTransparencyTotals } from "../src/lib/transparencia/dashboard";
import { createCitizenRequest,consultCitizenRequest } from "../src/lib/transparencia/citizen-service";
import type {PrismaClient} from "@prisma/client";
import {isSameOriginRequest} from "../src/lib/transparencia/request-origin";
import {publishedTransparencyCatalog,runTransparencyConsultation} from "../src/lib/transparencia/consultation-service";

const collection = getTransparencyCollection("despesas")!;
const query = parseTransparencyQuery(new URLSearchParams("source=EXEMPLO&year=2026&page=3&pageSize=20&sort=committed&direction=desc"));

test("paginação intermediária conserva totais e exporta mais de 125 registros", () => {
  const dataset = exampleTransparencyDataset(collection, query), result = filterPublicDataset(collection, dataset, query);
  assert.equal(result.total, 180); assert.equal(result.records.length, 20); assert.equal(result.page, 3);
  assert.equal(result.totals.committed, dataset.records.reduce((sum, row) => sum.add(String(row.values.committed)), new Prisma.Decimal(0)).toFixed(2));
  const csv = exportTransparencyCsv(collection, dataset, query);
  assert.equal(csv.trim().split("\r\n").length, 181);
  assert.ok(new Prisma.Decimal(String(result.rows[0].values.committed)).gte(String(result.rows[1].values.committed)));
});

test("filtros combinados, entidade e URL compartilhada usam o mesmo conjunto", () => {
  const filtered = parseTransparencyQuery(new URLSearchParams("source=EXEMPLO&entity=consolidado&year=2026&f.unit=Saúde&from=2026-01-01&until=2026-06-30&f.minimum=1000"));
  const result = filterPublicDataset(collection, exampleTransparencyDataset(collection, filtered), filtered);
  assert.ok(result.total > 0);
  assert.ok(result.rows.every(row => row.entity === "prefeitura" && row.values.unit === "Saúde" && String(row.values.date) <= "2026-06-30" && new Prisma.Decimal(String(row.values.committed)).gte(1000)));
  assert.deepEqual(parseTransparencyQuery(new URLSearchParams(publicQueryHref(filtered))), filtered);
});

test("campo ausente e fonte indisponível não produzem zero financeiro", () => {
  const dataset = exampleTransparencyDataset(collection, query); dataset.records[0].values.paid = null;
  assert.equal(filterPublicDataset(collection, dataset, query).totals.paid, null);
  const unavailable = { ...dataset, records: [], status: "UNAVAILABLE" as const, complete: false };
  assert.equal(filterPublicDataset(collection, unavailable, query).totals.committed, null);
  assert.throws(() => exportTransparencyCsv(collection, unavailable, query));
  assert.throws(() => filterPublicDataset(collection, dataset, { ...query, filters: { sql: "drop" } }));
});

test("CSV protege fórmulas e conserva a indicação de origem fictícia", () => {
  const dataset = exampleTransparencyDataset(collection, query); dataset.records[0].values.beneficiary = "\t=1+1";
  const csv = exportTransparencyCsv(collection, dataset, query);
  assert.ok(csv.includes("'\t=1+1")); assert.ok(csv.includes("Dados fictícios de exemplo"));
});

test("falha externa e Câmara sem código confirmado não acionam fallback", async () => {
  const failure = await loadIbemaTransparencyDataset(collection, query, defaultTransparencySettings(), async () => { throw new Error("offline"); });
  assert.equal(failure.status, "UNAVAILABLE"); assert.equal(failure.records.length, 0); assert.equal(failure.source, "API_IBEMA");
  const unconfigured=defaultTransparencySettings();unconfigured.entities[1].externalCode=null;
  const camera = await loadIbemaTransparencyDataset(collection, { ...query, entity: "camara" }, unconfigured, async () => { throw new Error("não deve chamar"); });
  assert.equal(camera.status, "UNAVAILABLE"); assert.match(camera.message!, /Código externo/);
});

test("download valida hash dos bytes e metadados não aceitam entidade/consulta arbitrária", () => {
  const bytes = new Uint8Array([1, 2, 3]), hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
  assert.equal(verifiedPublicationBytes(bytes, hash(bytes), hash), bytes);
  assert.throws(() => verifiedPublicationBytes(new Uint8Array([4]), hash(bytes), hash));
  assert.equal(publicationMetadataSchema.safeParse({ title: "Documento", collectionSlug: "sql", entity: "privado", year: 2026, group: "Saúde", referencePeriod: "2026" }).success, false);
});

test("todas as famílias têm cenários próprios nos dois Poderes e consolidado",()=>{
 for(const collection of transparencyCatalog)for(const entity of ["prefeitura","camara","consolidado"] as const){const input={...query,entity,sort:""};const result=filterPublicDataset(collection,exampleTransparencyDataset(collection,input),input);assert.ok(result.total>=180);assert.equal(result.records.length,20);assert.ok(result.records.every(row=>row.key.startsWith("exemplo-")&&row.links?.[0].url.includes("/exemplos/")));}
});

test("remuneração usa competência, não data de admissão; diária conserva unitário × quantidade",()=>{
 const collection=getTransparencyCollection("servidores")!,input={...query,from:"2026-07-01",until:"2026-07-31",sort:""};const data=exampleTransparencyDataset(collection,input);data.records.forEach(row=>{row.values.date="2001-01-01";});const result=filterPublicDataset(collection,data,input);assert.equal(result.total,15);assert.ok(result.rows.every(row=>row.values.competence==="07/2026"));
 const diarias=exampleTransparencyDataset(getTransparencyCollection("diarias")!,query);assert.ok(diarias.records.every(row=>new Prisma.Decimal(String(row.values.unitPrice)).mul(String(row.values.quantity)).eq(String(row.values.value))));
});

test("arquivos PDF/XLSX/DOCX/TXT são binários reais e contêm o conjunto completo",async()=>{
 const dataset=exampleTransparencyDataset(collection,query);
 const pdf=await renderTransparencyFile(collection,dataset,query,"pdf");assert.equal(pdf.bytes.subarray(0,5).toString(),"%PDF-");
 const xlsx=await renderTransparencyFile(collection,dataset,query,"xlsx");assert.equal(xlsx.bytes.subarray(0,2).toString(),"PK");const {default:ExcelJS}=await import("exceljs");const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(xlsx.bytes);assert.equal(workbook.getWorksheet("Consulta")!.rowCount,181);
 const docx=await renderTransparencyFile(collection,dataset,query,"docx");assert.equal(docx.bytes.subarray(0,2).toString(),"PK");
 const txt=await renderTransparencyFile(collection,dataset,query,"txt");assert.ok(txt.bytes.toString().includes("180 registros"));
 assert.deepEqual(Buffer.from(await new Response(byteStream(pdf.bytes)).arrayBuffer()),pdf.bytes);
});

test("rascunho, retirada, consulta desabilitada e entidade desabilitada bloqueiam publicidade",()=>{
 const settings=defaultTransparencySettings(),entry={status:"PUBLISHED",collectionSlug:"publicacoes",year:2026,entity:"prefeitura"};assert.equal(isPublicationPublic(entry,settings),true);
 for(const status of ["DRAFT","WITHDRAWN"])assert.equal(isPublicationPublic({...entry,status},settings),false);
 settings.queries.publicacoes={enabled:false};assert.equal(isPublicationPublic(entry,settings),false);settings.queries={};settings.entities[0].enabled=false;assert.equal(isPublicationPublic(entry,settings),false);
 assert.deepEqual(publicPublicationValues({name:"Documento",uploadedBy:"usuario-interno",bankAccount:"000123",sha256:"hash"}),{name:"Documento",sha256:"hash"});
});

test("gráfico mensal não transforma data/valor ausente em zero",()=>{
 const data=exampleTransparencyDataset(collection,query),totals=monthlyTransparencyTotals(data.records,"paid");assert.equal(totals.undated,0);assert.equal(totals.months.length,12);
 data.records[0].values.date=null;assert.ok(monthlyTransparencyTotals(data.records,"paid").months.every(row=>row.value===null));
});

test("solicitação usa chave privada hasheada; resposta nunca inclui identidade ou narrativa",async()=>{
 let stored:Record<string,unknown>|null=null;
 const fake={configuracaoParametroInstancia:{findFirst:async()=>null},transparencyCitizenRequest:{create:async({data}:{data:Record<string,unknown>})=>{stored=data;return data;},findFirst:async({where,select}:{where:Record<string,unknown>;select:Record<string,unknown>})=>{assert.ok(!("name"in select)&&!("email"in select)&&!("message"in select)&&!("accessHash"in select));if(!stored||stored.accessHash!==where.accessHash||stored.protocol!==where.protocol)return null;return {protocol:stored.protocol,status:"RESPONDIDO",response:"Resposta reservada",appeals:[],nativeTicket:null,nativeOmbudsman:null};}}};
  const channel={...fake,processType:{upsert:async()=>({id:"channel-type",isActive:true})},subject:{upsert:async()=>({id:"channel-subject",isActive:true})},processSequence:{upsert:async()=>({nextNumber:2})},process:{create:async()=>({id:"channel-process",protocolNumber:"PROC-TEST-000001"})}};
  const db={...channel,$transaction:async(callback:(tx:unknown)=>unknown)=>callback(channel)} as unknown as PrismaClient;
 const receipt=await createCitizenRequest(db,{type:"ESIC",name:"Solicitante de teste",email:"teste@example.test",subject:"Solicitação de teste",message:"Solicito informação pública para testar o acompanhamento."});
 assert.ok(stored);assert.notEqual(stored!["accessHash"],receipt.token);assert.equal(await consultCitizenRequest(db,receipt.protocol,"0".repeat(64)),null);assert.equal((await consultCitizenRequest(db,receipt.protocol,receipt.token))?.status,"RESPONDIDO");
 await assert.rejects(createCitizenRequest(db,{type:"ESIC",subject:"Teste",message:"Pedido sem nome e sem email para conferência."}));
});

test("origem usa Host público mesmo com URL normalizada pelo servidor, sem aceitar outro domínio",()=>{
 assert.equal(isSameOriginRequest(new Request("http://localhost:3000/api",{headers:{host:"www.ibema.celeriflow.com.br",origin:"https://www.ibema.celeriflow.com.br"}})),true);
 assert.equal(isSameOriginRequest(new Request("http://localhost:3000/api",{headers:{host:"www.ibema.celeriflow.com.br",origin:"https://evil.example"}})),false);
 assert.equal(isSameOriginRequest(new Request("http://localhost:3000/api",{headers:{host:"localhost:3000",origin:"http://localhost:3001"}})),false);
});

test("nova consulta documental cria grupo, consulta a biblioteca e deixa de publicar quando desativada",async()=>{
 const settings=defaultTransparencySettings();settings.customQueries=[{slug:"doc-saude-planos",title:"Planos de Saúde",group:"Saúde e Conselhos",description:"Documentos setoriais",enabled:true}];
 assert.ok(publishedTransparencyCatalog(settings).some(collection=>collection.slug==="doc-saude-planos"&&collection.group==="Saúde e Conselhos"));
 const db={transparencyPublication:{findMany:async({where}:{where:Record<string,unknown>})=>{assert.equal(where.collectionSlug,"doc-saude-planos");return [{publicKey:"arquivo-publico",entity:"prefeitura",year:2026,title:"Plano de teste",group:"PMS",publishedAt:new Date(),updatedAt:new Date(),values:{},contentType:"application/pdf",referencePeriod:"2026–2029",version:1,fileUrl:"private-blob"}];}}} as unknown as PrismaClient;
 const result=await runTransparencyConsultation(db,"doc-saude-planos",{...query,source:"DOCUMENTOS",sort:""},settings);assert.equal(result.total,1);assert.equal(result.records[0].values.name,"Plano de teste");
 settings.customQueries[0].enabled=false;await assert.rejects(runTransparencyConsultation(db,"doc-saude-planos",query,settings));
});

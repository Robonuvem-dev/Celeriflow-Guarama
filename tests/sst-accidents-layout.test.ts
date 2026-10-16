import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { PDFDocument } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { catLayoutFields, catLayoutProvenance, validateCatLayoutFields } from "../src/lib/sst/accident-layout-policy";
import { loadOfficialCatTemplate, renderOfficialCatPdf } from "../src/lib/sst/accident-layout-pdf";
import { saveCatLayout, readLatestCatLayout, readCatLayoutRegistration, type CatLayoutRow } from "../src/lib/sst/accident-layout-service";
import { configuredRestrictionEmailSender, restrictionCronAuthorized } from "../src/lib/sst/restriction-email-provider";
import { runRestrictionExpiryCron, restrictionCronScope } from "../src/lib/sst/restriction-cron-service";
import type { AppContext } from "../src/lib/platform/tenant-context";
import type { PrismaClient } from "@prisma/client";

test("official INSS source hash and all 64 fields match; filled draft preserves template and never invents registration", async () => {
  const template = await loadOfficialCatTemplate();
  assert.equal(catLayoutFields.length,64);
  const source = await PDFDocument.load(template);
  assert.equal(source.getPageCount(),1);
  assert.deepEqual(source.getForm().getFields().map(f => f.getName()).sort(),catLayoutFields.map(f => f.pdf).sort());
  const bytes = await renderOfficialCatPdf({ fields: { employeeName:"Servidor Exemplo", employerName:"Entidade Exemplo", accidentDate:"2026-10-01", death:"N", generatingSituation:"Texto detalhado da situação geradora. ".repeat(50) }, medicalFields:{ medicalUnit:"Unidade ocupacional", cidCodes:"M54.5; S61.0" }, internalId:"internal-only", revision:1, requestHash:"source-hash", registration:null },template);
  const filled = await PDFDocument.load(bytes);
  assert.equal(filled.getForm().getFields().length,0);
  assert.equal(filled.getPageCount()>1,true,"overflow is preserved in supplement, not silently cut");
  assert.match(filled.getSubject()!,new RegExp(catLayoutProvenance.sha256));
  const doc = await getDocument({ data:bytes.slice(),useSystemFonts:true }).promise;
  const content = (await (await doc.getPage(1)).getTextContent()).items.map(item => "str" in item ? item.str : "").join(" ");
  assert.match(content,/MINUTA FORMATADA INSS/); assert.match(content,/NÃO REGISTRADA/);
  assert.match(content,/Servidor Exemplo/); assert.match(content,/M54.5; S61.0/);
  assert.doesNotMatch(content,/CAT REGISTRADA — recibo/);
  await doc.cleanup();
});
test("layout validates typed codes, dates, conditional death facts and administrative/clinical separation", () => {
  assert.doesNotThrow(() => validateCatLayoutFields({ cnae:"8411600",cbo:"411010",nit:"12345678901",remuneration:"1500.25",employerDocument:"CNPJ 12345678000199",sex:"F",accidentState:"PR" },false));
  for (const input of [{ cnae:"foo" },{ cbo:"123" },{ birthDate:"2026-02-31" },{ sex:"OTHER" },{ employerDocument:"1234" },{ death:"S" },{ death:"N",deathDate:"2026-10-01" },{ death:"S",deathDate:"2026-09-01",accidentDate:"2026-10-01" },{ medicalUnit:"Leaked clinical field" }]) assert.throws(() => validateCatLayoutFields(input,false));
  assert.throws(() => validateCatLayoutFields({},false,true),/Preencha/);
  assert.throws(() => validateCatLayoutFields({ hospitalized:"yes" },true),/inválido/);
  assert.throws(() => validateCatLayoutFields({ medicalSignature:"fabricated signature" },true),/desconhecido/);
});
const user: AppContext["user"] = { id:"actor",name:"SST",email:"sst@example.invalid",firebaseUid:"actor",profileCode:"SST_OPERATOR",role:"SST",modulePermissions:[],allowedBudgetUnitIds:["ug"],employeeId:"employee",departmentId:null,secretariatId:null,permissions:JSON.stringify({modules:{SST:{blocked:false,create:true,issueReports:true}}}) };
test("layout derives canonical identity, retries without duplicate revision, rejects clinical or cross-UG access", async () => {
  const records: { id:string; version:number; requestHash:string; createdById:string; fields:Record<string,string> }[] = [];
  const cat = { id:"cat",budgetUnitId:"ug",employeeId:"employee",kind:"TYPICAL",occurredAt:new Date("2026-10-01T12:00:00Z"),snapshot:{employeeName:"Canonical employee",registration:"123"},data:{generatingStatus:"INITIAL",location:"Oficina",agent:"Máquina",bodyParts:["Mão"]} };
  const tx = {
    employee:{findUniqueOrThrow:async () => ({id:"employee",name:"Employee",person:{id:"person",cpf:"12345678901",motherName:"Canonical mother",birthDate:new Date("1980-01-01")}})},
    auditEvent:{create:async () => ({})},
    $queryRaw:async (strings:TemplateStringsArray) => { const sql=strings.join("?"); return sql.includes('FROM "SstCat"') ? [cat] : sql.includes('MAX("version")') ? [{version:records.length}] : sql.includes('"submissionKey"') ? records.slice(0,1) : []; },
    $executeRaw:async (strings:TemplateStringsArray,...values:unknown[]) => { if(strings.join("?").includes('INSERT INTO "SstCatLayoutVersion"')) records.push({id:String(values[0]),version:Number(values[2]),fields:JSON.parse(String(values[7])),createdById:String(values[10]),requestHash:String(values[12])});return 1; },
  };
  const context = {user:{...user},prisma:{...tx,$transaction:async (fn:(db:typeof tx)=>Promise<unknown>)=>fn(tx),sstAccessGrant:{findUnique:async()=>null}}} as unknown as AppContext;
  const input = {catId:"cat",submissionKey:"779b172f-10c2-4325-bc32-d33cba4fdeaa",expectedVersion:0,mode:"DRAFT",fields:{employeeName:"Browser impostor"}};
  assert.equal(await saveCatLayout(context,input),"cat"); assert.equal(await saveCatLayout(context,input),"cat");
  assert.equal(records.length,1); assert.equal(records[0].fields.employeeName,"Canonical employee"); assert.equal(records[0].fields.motherName,"Canonical mother");
  await assert.rejects(saveCatLayout(context,{...input,fields:{employerName:"Changed request"}}),/outros dados/);
  await assert.rejects(readLatestCatLayout(context,"cat",true),/clínica/);
  context.user.allowedBudgetUnitIds=[];
  await assert.rejects(readLatestCatLayout(context,"cat"),/Unidade Gestora/);
});
test("registration lookup requires accepted production evidence and exact layout snapshot, never a declared number", async () => {
  const queries:string[]=[], values:unknown[][]=[];let counter=0;
  const context={user:{...user},prisma:{$queryRaw:async(strings:TemplateStringsArray,...parameters:unknown[])=>{queries.push(strings.join("?"));values.push(parameters);counter++;return counter===1?[{id:"cat",budgetUnitId:"ug"}]:counter===2?[{available:true}]:[];}}} as unknown as AppContext;
  const row={id:"layout",catId:"cat",requestHash:"exact-version",originalReceipt:"DECLARED-ORIGINAL-NUMBER"} as CatLayoutRow;
  assert.equal(await readCatLayoutRegistration(context,row),null);
  assert.match(queries[2],/PRODUCTION/);assert.match(queries[2],/ACCEPTED/);assert.match(queries[2],/sourceSnapshot.*catLayout.*requestHash/);
  assert.ok(values[2].includes("exact-version"));assert.ok(!values[2].includes(row.originalReceipt));
});
test("additive layout migration freezes revisions, binds attendance to CAT and extends outbox without touching historical migration", async () => {
  const db=new PGlite();
  try {
    await db.exec(`CREATE TABLE "BudgetUnit"("id" text primary key);CREATE TABLE "Employee"("id" text primary key);CREATE TABLE "Usuario"("id" text primary key);CREATE TABLE "Person"("id" text primary key);CREATE TABLE "Role"("id" text primary key);CREATE TABLE "SstProfessionalRole"("id" text primary key);INSERT INTO "BudgetUnit" VALUES ('ug');INSERT INTO "Employee" VALUES ('employee');INSERT INTO "Usuario" VALUES ('actor');`);
    await db.exec(readFileSync(new URL("../prisma/migrations-ibema/20261011030000_add_sst_accidents/migration.sql",import.meta.url),"utf8"));
    await db.exec(readFileSync(new URL("../prisma/migrations-ibema/20261011100000_complete_sst_cat_layout/migration.sql",import.meta.url),"utf8"));
    await db.exec(`INSERT INTO "SstCat"("id","budgetUnitId","employeeId","submissionKey","requestHash","createdById","occurredAt","kind","source","data","snapshot") VALUES ('cat','ug','employee','k','h','actor','2026-10-01','TYPICAL','SST','{}','{}'),('other','ug','employee','k2','h','actor','2026-10-01','TYPICAL','SST','{}','{}');INSERT INTO "SstCatEvidence"("id","catId","kind","version","clinical","data","createdById","submissionKey","requestHash") VALUES ('att','cat','ATTENDANCE',1,true,'{}','actor','att','h'),('foreign','other','ATTENDANCE',1,true,'{}','actor','foreign','h');`);
    await db.exec(`INSERT INTO "SstCatLayoutVersion"("id","catId","version","mode","layoutVersion","templateSha256","provenance","fields","canonicalSnapshot","createdById","submissionKey","requestHash") VALUES ('layout','cat',1,'DRAFT','v','${catLayoutProvenance.sha256}','{}','{}','{}','actor','lk','h');`);
    await assert.rejects(db.exec(`INSERT INTO "SstCatLayoutMedical" VALUES ('layout','foreign','{}','actor')`),/same CAT/);
    await db.exec(`INSERT INTO "SstCatLayoutMedical" VALUES ('layout','att','{}','actor')`);
    await assert.rejects(db.exec(`INSERT INTO "SstCatLayoutVersion"("id","catId","version","mode","layoutVersion","templateSha256","provenance","fields","canonicalSnapshot","createdById","submissionKey","requestHash") VALUES ('incomplete','cat',2,'COMPLETE','v','${catLayoutProvenance.sha256}','{}','{}','{}','actor','incomplete','h');`),/requires same-transaction/);
    await assert.rejects(db.exec(`UPDATE "SstCatLayoutVersion" SET "fields"='{}'`),/immutable/);
    await assert.rejects(db.exec(`DELETE FROM "SstCatLayoutMedical"`),/immutable/);
    const columns=await db.query<{column_name:string}>(`SELECT column_name FROM information_schema.columns WHERE table_name='SstRestrictionEmailOutbox'`);
    assert.ok(columns.rows.some(c=>c.column_name==="attempts"));assert.ok(columns.rows.some(c=>c.column_name==="claimedAt"));
  } finally {await db.close();}
});
test("cron secret and real provider configuration fail closed; HTTP sends use idempotency and require a real acceptance ID", async () => {
  const secret="x".repeat(32);
  assert.equal(restrictionCronAuthorized(`Bearer ${secret}`,secret),true);
  assert.equal(restrictionCronAuthorized("Bearer wrong",secret),false);
  assert.equal(restrictionCronAuthorized("Bearer short","short"),false);
  assert.throws(()=>configuredRestrictionEmailSender({}),/Configure/);
  let called=0;
  const env={SST_RESTRICTION_EMAIL_PROVIDER:"RESEND",RESEND_API_KEY:"test-key",SST_RESTRICTION_EMAIL_FROM:"sst@example.invalid"};
  const send=configuredRestrictionEmailSender(env,async (url,init)=>{called++;assert.equal(url,"https://api.resend.com/emails");assert.equal((init!.headers as Record<string,string>)["Idempotency-Key"],"sst-restriction/outbox");const body=JSON.parse(String(init!.body));assert.deepEqual(body.to,["responsible@example.invalid"]);return Response.json({id:"actual-provider-response"});});
  assert.deepEqual(await send({to:"responsible@example.invalid",subject:"Vencimento",text:"Consulte a ficha autorizada",idempotencyKey:"outbox"}),{receipt:"actual-provider-response"});
  assert.equal(called,1);
  const bad=configuredRestrictionEmailSender(env,async()=>Response.json({}));
  await assert.rejects(bad({to:"responsible@example.invalid",subject:"Vencimento",text:"Ficha",idempotencyKey:"outbox"}));
});
test("cron claims scoped pending work, records accepted receipt and leaves unconfirmed sends FAILED", async () => {
  let available=true;const statements:string[]=[];
  const tx={$queryRaw:async()=>{if(!available)return [];available=false;return [{id:"mail",recipient:"responsible@example.invalid",restrictionId:"restriction",attempts:0}];},$executeRaw:async (strings:TemplateStringsArray)=>{statements.push(strings.join("?"));return 1;}};
  const prisma={...tx,$transaction:async(fn:(db:typeof tx)=>Promise<unknown>)=>fn(tx),$queryRaw:async()=>[{count:0}]} as unknown as PrismaClient;
  const scope={actorId:"actor",unitIds:["ug"]};
  assert.equal((await runRestrictionExpiryCron(prisma,scope,async()=>({receipt:"provider-receipt"}))).sent,1);
  assert.ok(statements.some(s=>s.includes("'SENDING'")));assert.ok(statements.some(s=>s.includes("'SENT'")));
  available=true;statements.length=0;
  const failed=await runRestrictionExpiryCron(prisma,scope,async()=>{throw new Error("Timeout");});
  assert.equal(failed.sent,0);assert.equal(failed.failed,1);assert.ok(statements.some(s=>s.includes("'FAILED'")));assert.ok(!statements.some(s=>s.includes("'SENT'")));
});
test("scheduled actor is canonical and must have active module/profile and explicit clinical scope", async () => {
  let active=true,grant=false;
  const actor={id:"actor",nome:"Service account",email:"service@example.invalid",firebaseUid:"actual-firebase-link",ativo:true,perfil:{ativo:true,nome:"SST",codigo:"SST_OPERATOR",permissoes:user.permissions},employee:null,permissoesModulo:[],unidadesGestoras:[{budgetUnitId:"ug"}]};
  const prisma={usuario:{findUnique:async()=>({...actor,ativo:active})},configuracaoModulo:{findUnique:async()=>({ativo:true})},$queryRaw:async()=>grant?[{budgetUnitId:"ug"}]:[]} as unknown as PrismaClient;
  await assert.rejects(restrictionCronScope(prisma,undefined),/não configurado/);
  active=false;await assert.rejects(restrictionCronScope(prisma,"actor"),/inativo/);
  active=true;await assert.rejects(restrictionCronScope(prisma,"actor"),/explicitamente/);
  grant=true;assert.deepEqual(await restrictionCronScope(prisma,"actor"),{actorId:"actor",unitIds:["ug"]});
});
test("secure cron HTTP route reports and logs configuration block before any delivery", async () => {
  const {GET}=await import("../src/app/api/sst/restricoes/expiracao/route");
  const previousSecret=process.env.SST_RESTRICTION_CRON_SECRET,previousProvider=process.env.SST_RESTRICTION_EMAIL_PROVIDER;
  const logs:unknown[][]=[],originalLog=console.error,secret="test-configuration-block-secret-32";
  try {
    process.env.SST_RESTRICTION_CRON_SECRET=secret;delete process.env.SST_RESTRICTION_EMAIL_PROVIDER;
    console.error=(...args:unknown[])=>{logs.push(args);};
    assert.equal((await GET(new Request("https://example.invalid/api/sst/restricoes/expiracao"))).status,401);
    const response=await GET(new Request("https://example.invalid/api/sst/restricoes/expiracao",{headers:{authorization:`Bearer ${secret}`}}));
    assert.equal(response.status,503);assert.equal((await response.json()).status,"BLOCKED");
    assert.ok(logs.some(l=>l[0]==="SST_RESTRICTION_EMAIL_CONFIGURATION_BLOCKED"));
    assert.ok(!JSON.stringify(logs).includes(secret));
  } finally {
    console.error=originalLog;
    if(previousSecret===undefined)delete process.env.SST_RESTRICTION_CRON_SECRET;else process.env.SST_RESTRICTION_CRON_SECRET=previousSecret;
    if(previousProvider===undefined)delete process.env.SST_RESTRICTION_EMAIL_PROVIDER;else process.env.SST_RESTRICTION_EMAIL_PROVIDER=previousProvider;
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { PDFDocument } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { catLayoutFields, catLayoutProvenance, validateCatLayoutFields } from "../src/lib/sst/accident-layout-policy";
import { loadOfficialCatTemplate, renderOfficialCatPdf } from "../src/lib/sst/accident-layout-pdf";
import { saveCatLayout, readLatestCatLayout, readCatLayoutRegistration } from "../src/lib/sst/accident-layout-service";
import { configuredRestrictionEmailSender, restrictionCronAuthorized } from "../src/lib/sst/restriction-email-provider";
import { runRestrictionExpiryCron, restrictionCronScope } from "../src/lib/sst/restriction-cron-service";
import type { AppContext } from "../src/lib/platform/tenant-context";
import { createSstAccidentFixture } from "./helpers/sst-accident-fixture";

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
  const f=await createSstAccidentFixture();
  try {
    await f.seedCat(); await f.db.exec(`UPDATE "Person" SET "motherName"='Canonical mother',"birthDate"='1980-01-01' WHERE id='worker'`);
    const input = {catId:"cat",submissionKey:"779b172f-10c2-4325-bc32-d33cba4fdeaa",expectedVersion:0,mode:"DRAFT",fields:{employeeName:"Browser impostor"}};
    assert.equal(await saveCatLayout(f.context,input),"cat"); assert.equal(await saveCatLayout(f.context,input),"cat");
    const record=await readLatestCatLayout(f.context,"cat"); assert.ok(record);
    assert.equal(record.layout.fields.employeeName,"Canonical employee"); assert.equal(record.layout.fields.motherName,"Canonical mother");
    assert.equal((await f.db.query('SELECT id FROM "SstCatLayoutVersion"')).rows.length,1);
    await assert.rejects(saveCatLayout(f.context,{...input,fields:{employerName:"Changed request"}}),/outros dados/);
    await f.db.exec('UPDATE "SstAccessGrant" SET "canReadClinical"=false');
    await assert.rejects(readLatestCatLayout(f.context,"cat",true),/clínica/);
    f.context.user.allowedBudgetUnitIds=[];
    await assert.rejects(readLatestCatLayout(f.context,"cat"),/Unidade Gestora/);
  } finally {await f.close();}
});
test("registration lookup requires accepted production evidence and exact layout snapshot, never a declared number", async () => {
  const f=await createSstAccidentFixture();
  try {
    await f.seedCat();
    await saveCatLayout(f.context,{catId:"cat",submissionKey:"779b172f-10c2-4325-bc32-d33cba4fdeaa",expectedVersion:0,mode:"DRAFT",fields:{},originalReceipt:"DECLARED-ORIGINAL-NUMBER"});
    const latest=await readLatestCatLayout(f.context,"cat"); assert.ok(latest);
    assert.equal(await readCatLayoutRegistration(f.context,latest.layout),null);
    await f.db.exec(`CREATE TABLE "SstEsocialEvent" (id TEXT,"sourceId" TEXT,"budgetUnitId" TEXT,kind TEXT,environment TEXT,"sourceSnapshot" JSONB);
      CREATE TABLE "SstEsocialEvidence" (id TEXT,"eventId" TEXT,environment TEXT,status TEXT,receipt TEXT,"processedAt" TIMESTAMP,"receivedAt" TIMESTAMP DEFAULT now());`);
    await f.db.query(`INSERT INTO "SstEsocialEvent" VALUES ('event','cat','ug','S2210','PRODUCTION',$1)`,[JSON.stringify({catLayout:{layout:{requestHash:latest.layout.requestHash}}})]);
    await f.db.exec(`INSERT INTO "SstEsocialEvidence" (id,"eventId",environment,status,receipt,"processedAt") VALUES ('evidence','event','TEST','ACCEPTED','receipt','2026-10-01')`);
    assert.equal(await readCatLayoutRegistration(f.context,latest.layout),null);
    await f.db.exec(`UPDATE "SstEsocialEvidence" SET environment='PRODUCTION',status='REJECTED'`);
    assert.equal(await readCatLayoutRegistration(f.context,latest.layout),null);
    await f.db.exec(`UPDATE "SstEsocialEvidence" SET status='ACCEPTED'`);
    const accepted=await readCatLayoutRegistration(f.context,latest.layout); assert.ok(accepted);
    assert.equal(accepted.receipt,"receipt");assert.equal(accepted.processedAt.toISOString(),"2026-10-01T00:00:00.000Z");
    assert.equal(await readCatLayoutRegistration(f.context,{...latest.layout,requestHash:"other-version"}),null);
  } finally {await f.close();}
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
  assert.throws(()=>configuredRestrictionEmailSender({NODE_ENV:"test"}),/Configure/);
  let called=0;
  const env={NODE_ENV:"test" as const,SST_RESTRICTION_EMAIL_PROVIDER:"RESEND",RESEND_API_KEY:"test-key",SST_RESTRICTION_EMAIL_FROM:"sst@example.invalid"};
  const send=configuredRestrictionEmailSender(env,async (url,init)=>{called++;assert.equal(url,"https://api.resend.com/emails");assert.equal((init!.headers as Record<string,string>)["Idempotency-Key"],"sst-restriction/outbox");const body=JSON.parse(String(init!.body));assert.deepEqual(body.to,["responsible@example.invalid"]);return Response.json({id:"actual-provider-response"});});
  assert.deepEqual(await send({to:"responsible@example.invalid",subject:"Vencimento",text:"Consulte a ficha autorizada",idempotencyKey:"outbox"}),{receipt:"actual-provider-response"});
  assert.equal(called,1);
  const bad=configuredRestrictionEmailSender(env,async()=>Response.json({}));
  await assert.rejects(bad({to:"responsible@example.invalid",subject:"Vencimento",text:"Ficha",idempotencyKey:"outbox"}));
});
test("cron claims scoped pending work, records accepted receipt and leaves unconfirmed sends FAILED", async () => {
  const f=await createSstAccidentFixture();
  try {
    await f.seedRestriction(); const scope={actorId:"user",unitIds:["ug"]};
    assert.equal((await runRestrictionExpiryCron(f.connection,scope,async()=>({receipt:"provider-receipt"}))).sent,1);
    assert.deepEqual((await f.db.query('SELECT status,attempts,"providerReceipt" FROM "SstRestrictionEmailOutbox"')).rows,[{status:"SENT",attempts:1,providerReceipt:"provider-receipt"}]);
    await f.db.exec(`UPDATE "SstRestrictionEmailOutbox" SET status='PENDING',"providerReceipt"=NULL,"sentAt"=NULL`);
    const failed=await runRestrictionExpiryCron(f.connection,scope,async()=>{throw new Error("Timeout");});
    assert.equal(failed.sent,0);assert.equal(failed.failed,1);
    assert.deepEqual((await f.db.query('SELECT status,attempts,"providerReceipt" FROM "SstRestrictionEmailOutbox"')).rows,[{status:"FAILED",attempts:2,providerReceipt:null}]);
  } finally {await f.close();}
});
test("scheduled actor is canonical and must have active module/profile and explicit clinical scope", async () => {
  const f=await createSstAccidentFixture();
  try {
    await f.db.query(`INSERT INTO "ConfiguracaoPerfil" (id,codigo,nome,permissoes,"updatedAt") VALUES ('profile','SST_OPERATOR','SST',$1,now())`,[user.permissions]);
    await f.db.exec(`INSERT INTO "ConfiguracaoModulo" (id,codigo,nome,ativo,"updatedAt") VALUES ('sst','SST','SST',true,now());
      INSERT INTO "UsuarioUnidadeGestora" (id,"usuarioId","budgetUnitId") VALUES ('binding','user','ug');
      UPDATE "Usuario" SET "firebaseUid"='actual-firebase-link',ativo=false WHERE id='user'`);
    await assert.rejects(restrictionCronScope(f.connection.db,undefined),/não configurado/);
    await assert.rejects(restrictionCronScope(f.connection.db,"user"),/inativo/);
    await f.db.exec(`UPDATE "Usuario" SET ativo=true; UPDATE "SstAccessGrant" SET "canAssess"=false`);
    await assert.rejects(restrictionCronScope(f.connection.db,"user"),/explicitamente/);
    await f.db.exec('UPDATE "SstAccessGrant" SET "canAssess"=true');
    assert.deepEqual(await restrictionCronScope(f.connection.db,"user"),{actorId:"user",unitIds:["ug"]});
  } finally {await f.close();}
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

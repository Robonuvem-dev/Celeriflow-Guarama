import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { applyCommand, newDemoState } from "../src/lib/rh/esocial/engine";
import { presentDemo } from "../src/lib/rh/esocial/presenter";
import { reconcileDemo } from "../src/lib/rh/esocial/queries";
import { assertDemoPermission } from "../src/lib/rh/esocial/access";
import { OfficialEsocialTransport } from "../src/lib/rh/esocial/demo-transport";
import { commandSchema, type Command, type DemoState } from "../src/lib/rh/esocial/contract";
import { demoCommandSchema } from "../src/lib/rh/esocial/input";

const now='2026-11-08T20:00:00.000Z';
const fresh=()=>newDemoState('guarama','administracao','2026-10');
const run=(state:DemoState,action:Command['action'],extra:Partial<Command>={})=>applyCommand(state,commandSchema.parse({action,employerId:state.employerId,period:state.period,idempotencyKey:randomUUID(),...extra}),'operator',now);

test('console projeta os mesmos nove retornos, links de XML e conciliação do motor persistido',()=>{
  const domain=run(fresh(),'COMPLETE'),view=presentDemo(domain,'run','operator');
  assert.equal(view.totalizers.length,9);assert.equal(view.runId,'run');assert.equal(view.employerId,'administracao');
  assert.deepEqual(reconcileDemo(view).map(r=>[r.expected,r.received,r.difference,r.status]),[[108000,107500,-500,'DIVERGENTE'],[47000,47000,0,'CONCILIADO'],[83200,83200,0,'CONCILIADO']]);
  for(const total of view.totalizers){assert.ok(view.artifacts.some(a=>a.id===total.id&&a.xml===total.xml));assert.equal(view.events.find(e=>e.id===total.originEventId)!.receipt,total.originReceipt);}
  for(const e of view.events.filter(e=>e.sentArtifactId))assert.equal(view.artifacts.find(a=>a.id===e.sentArtifactId)!.xml,e.sentXml);
  assert.ok(!JSON.stringify(view).includes('objectUrl'));
});
test('cenários alternativos, correção, arquivamento e histórico compartilham um único motor',()=>{
  let state=run(fresh(),'COMPLETE',{scenario:'ERRO_RUBRICA'});const id='DEMO-EVT-1200-ERR-003';
  assert.equal(state.events.find(e=>e.id===id)!.status,'REJECTED');assert.equal(state.totalizers.length,0);
  state=run(state,'CORRECT',{targetId:id,rubric:'RUB-999'});state=run(state,'COMPLETE',{scenario:'ERRO_RUBRICA'});state=run(state,'ARCHIVE_ERRORS');
  const view=presentDemo(state,'run','operator');assert.equal(view.events.find(e=>e.id===id)!.status,'ACCEPTED');
  const old=view.events.find(e=>e.logicalId===id&&e.historical)!;assert.equal(old.status,'REJECTED');assert.equal(old.archived,true);assert.equal(old.receipt,null);assert.ok(old.returnXml);
  assert.equal(run(fresh(),'COMPLETE',{scenario:'ADVERTENCIA'}).events.find(e=>e.id==='DEMO-EVT-2200-WARN')!.status,'ACCEPTED_WITH_WARNING');
});
test('importação com prévia, confirmação, duplicidade e conflito preserva matrícula existente',()=>{
  const xml=readFileSync('docs/esocial/kit/fixtures/concorrente-novo.xml','utf8');
  let state=run(fresh(),'IMPORT_PREVIEW',{files:[{name:'novo.xml',xml}]});assert.equal(state.imports[0].status,'NEW');assert.ok(!state.events.some(e=>e.id==='DEMO-EXTERNO-001'));
  state=run(state,'IMPORT_CONFIRM');assert.equal(state.imports[0].status,'IMPORTED');assert.equal(state.events.find(e=>e.id==='DEMO-EXTERNO-001')!.status,'IMPORTED_EXTERNAL');
  state=run(state,'IMPORT_PREVIEW',{files:[{name:'repetido.xml',xml}]});assert.equal(state.imports.length,1);
  const conflicting=xml.replace('DEMO-EXTERNAL-001','DEMO-EXTERNAL-999');state=run(state,'IMPORT_PREVIEW',{files:[{name:'divergente.xml',xml:conflicting}]});assert.equal(state.imports[1].status,'CONFLICT');
  state=run(state,'IMPORT_CONFIRM');assert.equal(state.imports[1].status,'KEPT');assert.equal(state.events.filter(e=>e.sourceKind==='IMPORTED_EXTERNAL').length,1);
  assert.equal(state.artifacts.find(a=>a.id===state.imports[0].artifactId)!.xml,xml);
  assert.throws(()=>run(state,'IMPORT_PREVIEW',{files:[{name:'xxe.xml',xml:'<!DOCTYPE eSocial SYSTEM "http://example.com"><eSocial/>'}]}));
});
test('agendamento de pré-validação não transmite e assinatura filtra notificações por usuário',()=>{
  let state=run(fresh(),'SCHEDULE',{dueAt:now,stage:'VALIDATE'});state=run(state,'RUN_SCHEDULE');assert.equal(state.batches.length,0);assert.ok(state.events.every(e=>e.status==='VALIDATED'));assert.equal(state.schedule!.enabled,false);
  state=run(state,'SUBSCRIBE');state=run(state,'COMPLETE');assert.ok(presentDemo(state,'run','operator').notifications.length);assert.equal(presentDemo(state,'run','other').notifications.length,0);
  state=run(state,'SUBSCRIBE',{enabled:false});assert.deepEqual(state.subscribers,[]);
});
test('contratos negam tenant injetado, leitura não concede envio e transporte não usa fetch',()=>{
  assert.equal(demoCommandSchema.safeParse({action:'COMPLETE',employerId:'administracao',period:'2026-10',idempotencyKey:randomUUID(),tenantId:'other'}).success,false);
  assert.throws(()=>assertDemoPermission(['ESOCIAL_VIEW'],'ESOCIAL_SEND'),{status:403});assert.throws(()=>new OfficialEsocialTransport().sendBatch());
  const old=globalThis.fetch;globalThis.fetch=(()=>{throw new Error('Conexão externa proibida');}) as typeof fetch;
  try{assert.equal(run(fresh(),'COMPLETE').totalizers.length,9);}finally{globalThis.fetch=old;}
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { applyCommand, newDemoState, reconciliation } from "../src/lib/rh/esocial/engine";
import { commandSchema, type DemoState, type Command } from "../src/lib/rh/esocial/contract";
import { parseDemoXml } from "../src/lib/rh/esocial/xml";
import { OfficialEsocialTransport, parseConsultation } from "../src/lib/rh/esocial/demo-transport";
const now="2026-11-08T20:00:00.000Z";
const fresh=(period='2026-10')=>newDemoState('guarama','administracao',period);
function run(s:DemoState,action:Command['action'],extra:Partial<Command>={}){return applyCommand(s,commandSchema.parse({action,period:s.period,employerId:s.employerId,idempotencyKey:randomUUID(),...extra}),'operator',now);}
test('ciclo completo registra consultas 101/201 e nove retornos dos seis tipos com conciliação exata',()=>{
 const s=run(fresh(),'COMPLETE');assert.equal(s.totalizers.length,9);
 assert.deepEqual(Object.fromEntries(['S-5001','S-5002','S-5003','S-5011','S-5012','S-5013'].map(t=>[t,s.totalizers.filter(r=>r.type===t).length])),{'S-5001':2,'S-5002':2,'S-5003':2,'S-5011':1,'S-5012':1,'S-5013':1});
 assert.equal(s.consultations.filter(c=>c.code===101).length,5);assert.equal(s.consultations.filter(c=>c.code===201).length,5);
 assert.deepEqual(reconciliation(s).map(r=>[r.metric,r.expected,r.received,r.difference,r.status]),[['CP',108000,107500,-500,'DIVERGENTE'],['IRRF',47000,47000,0,'CONCILIADO'],['FGTS',83200,83200,0,'CONCILIADO']]);
 for(const t of s.totalizers){const e=s.events.find(e=>e.id===t.eventId)!;assert.equal(e.attempts.find(a=>a.id===t.attemptId)!.receipt,t.receipt);assert.ok(t.receipt.startsWith('DEMO-REC-'));}
 assert.equal(s.totalizers.filter(t=>t.registration==='VA-0001').length,0);
 assert.equal(s.totalizers.find(t=>t.type==='S-5002'&&t.registration==='VA-0003')!.value,0);
 for(const a of s.artifacts)assert.doesNotThrow(()=>parseDemoXml(a.xml));
 assert.equal(run(s,'COMPLETE').totalizers.length,9);
});
test('recepção e primeira consulta não produzem recibos; fechamento respeita precedência',()=>{
 let s=fresh();assert.throws(()=>run(s,'SEND',{targetId:'DEMO-EVT-1299-001'}),/grupos anteriores/);
 s=run(s,'SEND');assert.ok(s.batches[0].protocol);assert.equal(s.events.flatMap(e=>e.attempts).filter(a=>a.receipt).length,0);
 s=run(s,'CONSULT');assert.equal(s.batches[0].status,'PROCESSING');assert.equal(s.consultations[0].code,101);assert.equal(s.totalizers.length,0);
});
test('rejeição de rubrica, correção e nova tentativa preservam retorno anterior',()=>{
 let s=run(fresh(),'COMPLETE');s=run(s,'SEND',{scenario:'ERRO_RUBRICA'});s=run(s,'CONSULT');s=run(s,'CONSULT');
 const id='DEMO-EVT-1200-ERR-003',old=structuredClone(s.events.find(e=>e.id===id)!.attempts[0]);
 assert.equal(old.status,'REJECTED');assert.equal(old.receipt,null);assert.equal(s.totalizers.filter(t=>t.eventId===id).length,0);
 s=run(s,'CORRECT',{targetId:id});s=run(s,'SEND',{targetId:id});s=run(s,'CONSULT');s=run(s,'CONSULT');
 const e=s.events.find(e=>e.id===id)!;assert.equal(e.status,'ACCEPTED');assert.deepEqual(e.attempts[0],old);assert.equal(e.attempts.length,2);assert.equal(s.totalizers.filter(t=>t.eventId===id).length,2);
});
test('advertência possui recibo, duplicidade recupera recibo sem multiplicar totalizadores',()=>{
 let s=run(fresh(),'COMPLETE');const e=s.events.find(e=>e.type==='S-2200')!;assert.equal(e.status,'ACCEPTED_WITH_WARNING');assert.ok(e.attempts[0].receipt);
 s=run(s,'DUPLICATE',{targetId:e.id});assert.equal(s.events.find(v=>v.id===e.id)!.attempts.at(-1)!.receipt,e.attempts[0].receipt);assert.equal(s.totalizers.length,9);
});
test('reabertura preserva revisões e exclusão ocorre somente por S-3000 aceito',()=>{
 let s=run(fresh(),'COMPLETE');assert.throws(()=>run(s,'EXCLUDE',{targetId:'DEMO-EVT-1200-002'}),/Reabra/);
 s=run(s,'REOPEN');assert.equal(s.closed,false);assert.ok(s.events.some(e=>e.type==='S-1298'&&e.status==='ACCEPTED'));const old=s.totalizers.map(t=>t.id);
 s=run(s,'COMPLETE');assert.equal(s.totalizers.length,18);assert.ok(old.every(id=>s.totalizers.some(t=>t.id===id)));
 s=run(s,'REOPEN');const admission=s.events.find(e=>e.type==='S-2200')!;s=run(s,'EXCLUDE',{targetId:admission.id});assert.equal(s.events.find(e=>e.id===admission.id)!.status,'EXCLUDED');assert.ok(s.events.some(e=>e.type==='S-3000'&&e.status==='ACCEPTED'));
});
test('13º possui valores próprios e pagamento mensal com referência anual',()=>{
 const s=run(fresh('2026'),'COMPLETE');assert.ok(s.events.filter(e=>e.type==='S-1210').every(e=>e.period==='2026-12'&&e.reference==='2026'));
 assert.equal(s.events.find(e=>e.type==='S-1200')!.amounts.base,360000);assert.equal(s.totalizers.filter(t=>t.type==='S-5001').length,1);
});
test('falhas de transporte e schema não inventam protocolo ou recibo',()=>{
 for(const scenario of ['FALHA_CONEXAO','ERRO_SCHEMA'] as const){const s=run(fresh(),'SEND',{scenario});assert.equal(s.batches[0].protocol,null);assert.equal(s.totalizers.length,0);assert.throws(()=>run(s,'CONSULT'),/Selecione um lote/);}
 assert.throws(()=>new OfficialEsocialTransport().sendBatch(),/desativado/);
});
test('XML fornecido do kit é parseável e vinculado ao protocolo; importações não são reenviadas',()=>{
 const xml=readFileSync('docs/esocial/kit/fixtures/retornos-por-comando/03-retorno-remuneracoes.xml','utf8');assert.equal(parseConsultation(xml,'DEMO-PROT-202610-0001').events.length,3);assert.throws(()=>parseConsultation(xml,'outro'),/incompatível/);
 const imported=readFileSync('docs/esocial/kit/fixtures/concorrente-novo.xml','utf8');let s=run(fresh(),'IMPORT',{xml:imported});s=run(s,'IMPORT',{xml:imported});assert.deepEqual(s.imports.map(i=>i.status),['NEW','EXISTING']);assert.equal(s.events.filter(e=>e.sourceKind==='IMPORTED_EXTERNAL').length,1);assert.throws(()=>run(s,'SEND',{targetId:'DEMO-EXTERNO-001'}),/ativa ou aceita/);
 assert.throws(()=>parseDemoXml('<!DOCTYPE eSocial [<!ENTITY x SYSTEM "file:///etc/passwd">]><eSocial/>'),/inválido/);
});
test('agendamento exige autorização temporal e reset é nova geração',()=>{
 let s=fresh();assert.throws(()=>run(s,'RUN_SCHEDULE'),/não autorizado/);s=run(s,'SCHEDULE',{dueAt:'2026-11-09T00:00:00Z'});assert.throws(()=>run(s,'RUN_SCHEDULE'),/não autorizado/);
 s=run(s,'SCHEDULE',{dueAt:now});s=run(s,'RUN_SCHEDULE');assert.equal(s.totalizers.length,9);assert.equal(s.schedule!.enabled,false);const reset=run(s,'RESET');assert.equal(reset.generation,2);assert.equal(reset.totalizers.length,0);assert.equal(s.totalizers.length,9);
});

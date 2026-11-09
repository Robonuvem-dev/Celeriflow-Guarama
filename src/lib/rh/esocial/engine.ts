import municipality from "./fixtures/municipio.json";
import returns from "./fixtures/retornos.json";
import { accepted, type Amounts, type Batch, type Command, type DemoState, type Event, type Status, type TotalizerType } from "./contract";
import { array, artifact, buildXml, digest, parseDemoXml } from "./xml";
import { DemoEsocialTransport, parseConsultation, validateEvent } from "./demo-transport";

const emptyAmounts = (): Amounts => ({ base: 0, cp: 0, irrf: 0, fgts: 0, expectedCp: 0 });
const cents = (value: number | undefined) => Math.round((value || 0) * 100);
function initialEvents(period: string): Event[] {
  const events: Event[] = [];
  for (const result of returns.results.slice(0, 3)) for (const input of result.consultaFinal.eventos) {
    // Annual values are an explicit independent synthetic scenario (half-year entitlement), not October copied as 13th.
    if (period === "2026" && input.matricula === "VA-0003") continue;
    const person = municipality.servidores.find(p => p.id === input.matricula), factor = period === "2026" ? 0.5 : 1;
    const values = Object.assign({}, ...input.totalizers.map(t => t.values)) as Record<string, number>;
    const cp = cents(values.contribuicaoSegurado) * factor;
    events.push({ id: input.originEventId, type: input.originType, period: input.originType === "S-1210" && period === "2026" ? "2026-12" : period, reference: period,
      registration: input.matricula, name: person?.nome || municipality.declarante, regime: person ? person.regime as "RGPS" | "RPPS" : null,
      status: "DRAFT", amounts: { base: cents(person?.baseIlustrativa || 0) * factor, cp, fgts: cents(values.valorFGTS) * factor, irrf: cents(values.valorIRRF) * factor, expectedCp: cp + (input.originType === "S-1200" && input.matricula === "VA-0002" && period === "2026-10" ? 500 : 0) },
      rubric: "RUB-001", warning: false, alternative: false, sourceId: null, sourceUrl: "/rh/esocial?tab=origens", sourceKind: "FIXTURE", attempts: [], revision: 1 });
  }
  // Table and non-periodic groups precede payroll; never mix them in a lot.
  for (const type of ["S-1000", "S-1005", "S-1010", "S-1020", "S-2200"]) events.unshift({ id: `DEMO-EVT-${type.slice(2)}-BASE`, type, period, reference: period, registration: type === "S-2200" ? "VA-0004" : null, name: type === "S-2200" ? "Elisa Oliveira" : municipality.declarante, regime: type === "S-2200" ? "RPPS" : null, status: "DRAFT", amounts: emptyAmounts(), rubric: "RUB-001", warning: type === "S-2200", alternative: false, sourceId: null, sourceUrl: "/rh/esocial?tab=origens", sourceKind: "FIXTURE", attempts: [], revision: 1 });
  return events.sort((a,b)=>categories.indexOf(category(a))-categories.indexOf(category(b)));
}
export function newDemoState(tenantId: string, employerId: string, period: string, generation = 1): DemoState {
  if (!["2026-10", "2026"].includes(period)) throw new Error("Competência não configurada no kit.");
  return { version: 1, mode: "DEMO", source: "SIMULATED", tenantId, employerId, period, generation, events: initialEvents(period), batches: [], consultations: [], totalizers: [], artifacts: [], timeline: [], rubrics: ["RUB-001"], notifications: [], subscribers: [], closed: false, imports: [], schedule: null };
}
function note(state: DemoState, actor: string, at: string, action: string, target: string, message: string) {
  state.timeline.push({ id: `DEMO-LOG-${state.generation}-${state.timeline.length + 1}`, actorId: actor, at, action, target, message });
}
function category(event: Event) { return event.type === "S-1299" ? "FECHAMENTO" : event.type === "S-1210" ? "PAGAMENTOS" : ["S-1200", "S-1202"].includes(event.type) ? "REMUNERACAO" : event.type.startsWith("S-10") ? "TABELAS" : "NAO_PERIODICOS"; }
const categories = ["TABELAS", "NAO_PERIODICOS", "REMUNERACAO", "PAGAMENTOS", "FECHAMENTO"];
function assertPrecedence(state: DemoState, group: string) {
  const prior = categories.slice(0, categories.indexOf(group));
  if (state.events.some(e => !e.alternative && prior.includes(category(e)) && !accepted(e.status) && e.status !== "EXCLUDED")) throw new Error("Resolva e processe os grupos anteriores antes deste lote.");
}
function notify(state: DemoState, event: Event, at: string) {
  for (const recipientId of state.subscribers) for (const channel of ["IN_APP", "EMAIL_OUTBOX"] as const) {
    const id = `${event.id}:${event.revision}:${event.status}:${recipientId}:${channel}`;
    if (!state.notifications.some(n => n.id === id)) state.notifications.push({ id, eventId: event.id, recipientId, channel, status: event.status, subject: `eSocial DEMO: ${event.type} / ${state.period} / ${event.status}`, source: "SIMULATED", createdAt: at });
  }
}
function send(state: DemoState, eventIds: string[], actor: string, now: string, scenario: Command["scenario"]): Batch {
  const events = eventIds.map(id => state.events.find(e => e.id === id)!);
  if (!events.length || events.length > 50 || events.some(e => !e)) throw new Error("Selecione de 1 a 50 eventos existentes.");
  const group = category(events[0]);
  if (events.some(e => category(e) !== group)) throw new Error("Lotes não podem misturar grupos.");
  if (!events.every(e => e.alternative)) assertPrecedence(state, group);
  if (state.closed && events.some(e => !e.alternative && ["S-1200", "S-1202", "S-1210"].includes(e.type))) throw new Error("Competência fechada: reabra com S-1298 antes de retificar.");
  if (events.some(e => !["DRAFT", "VALIDATED", "REJECTED", "TRANSPORT_ERROR"].includes(e.status))) throw new Error("O evento já possui tentativa ativa ou aceita.");
  const batch: Batch = { id: `DEMO-LOTE-${state.generation}-${state.batches.length + 1}`, category: group, eventIds, status: "RECEIVED", protocol: null, queries: 0, receiptArtifactId: null, consultations: [], createdAt: now };
  for (const event of events) {
    const issues = validateEvent(event, state.rubrics);
    if (issues.some(i => i.tipo === 1) && scenario !== "ERRO_RUBRICA") throw new Error("Pré-validação impeditiva: corrija a origem antes de enviar.");
    const xml = buildXml({ evento: { "@_Id": event.id, tipo: event.type, ideEvento: { tpAmb: 2, perApur: event.period, perRef: event.reference }, ideEmpregador: { nrInsc: "00000000000000" }, matricula: event.registration || "", codRubr: event.rubric, valoresCentavos: event.amounts, ...(event.type === 'S-3000' ? { exclusao: { eventoOrigem: event.sourceId, reciboOrigem: state.events.find(e=>e.id===event.sourceId)?.attempts.at(-1)?.receipt } } : {}) } });
    const id = `${event.id}:g${state.generation}:r${event.revision}:a${event.attempts.length + 1}`;
    event.attempts.push({ id, batchId: batch.id, revision: event.revision, hash: digest(xml), sentArtifactId: artifact(state, "SENT", xml, now), returnArtifactId: null, receipt: null, status: "RECEIVED", occurrences: [], duplicated: false, createdAt: now, processedAt: null });
    event.status = "RECEIVED";
  }
  if (scenario === "FALHA_CONEXAO" || scenario === "ERRO_SCHEMA") {
    batch.status = scenario === "FALHA_CONEXAO" ? "TRANSPORT_ERROR" : "REJECTED";
    for (const e of events) { e.status = batch.status; e.attempts.at(-1)!.status = batch.status; notify(state, e, now); }
    if (scenario === "ERRO_SCHEMA") batch.receiptArtifactId = artifact(state, "RECEPTION", buildXml({ retornoEnvioLoteEventos: { status: { cdResposta: 402, descResposta: "Estrutura inválida (cenário simulado)." } } }), now);
    note(state, actor, now, scenario, batch.id, "Sem protocolo válido, recibos ou totalizadores.");
  } else {
    batch.protocol = `DEMO-PROT-${state.generation}-${batch.id}`;
    batch.receiptArtifactId = artifact(state, "RECEPTION", buildXml({ retornoEnvioLoteEventos: { status: { cdResposta: 201, descResposta: "Recepção do lote; não representa aceite dos eventos." }, dadosRecepcaoLote: { protocoloEnvio: batch.protocol, dhRecepcao: now } } }), now);
    note(state, actor, now, "RECEIVED", batch.id, "201 de recepção: aguardando consulta, sem recibos de eventos.");
  }
  state.batches.push(batch);
  return batch;
}
function consult(state: DemoState, batch: Batch, actor: string, now: string) {
  if (accepted(batch.status)) { note(state, actor, now, "REPLAY", batch.id, "Processamento anterior recuperado sem duplicar totalizadores."); return; }
  if (!["RECEIVED", "PROCESSING"].includes(batch.status) || !batch.protocol) throw new Error("Lote sem recepção válida para consulta.");
  const xml = new DemoEsocialTransport().consultBatch(state, batch, now), parsed = parseConsultation(xml, batch.protocol);
  const consultationId = `DEMO-CONSULTA-${batch.id}-${batch.queries + 1}`;
  const xmlId = artifact(state, "CONSULTATION", xml, now);
  state.consultations.push({ id: consultationId, batchId: batch.id, protocol: batch.protocol, index: ++batch.queries, code: parsed.code, artifactId: xmlId, createdAt: now });
  batch.consultations.push(consultationId);
  if (parsed.code === 101) { batch.status = "PROCESSING"; for (const id of batch.eventIds) { const e = state.events.find(e => e.id === id)!; e.status = "PROCESSING"; e.attempts.at(-1)!.status = "PROCESSING"; } note(state, actor, now, "PROCESSING", batch.id, "101: aguardando processamento, sem recibos e sem S-5xxx."); return; }
  if (parsed.events.length !== batch.eventIds.length || new Set(parsed.events.map(e=>e["@_Id"])).size !== parsed.events.length) throw new Error("Retorno incompleto ou duplicado.");
  for (const returned of parsed.events) {
    const e = state.events.find(e => e.id === returned["@_Id"] && batch.eventIds.includes(e.id));
    if (!e) throw new Error("Evento retornado não pertence ao lote.");
    const a = e.attempts.at(-1)!, result = returned.retornoEvento, code = Number(result.processamento.cdResposta), receipt = result.recibo?.nrRecibo || null;
    if (![201, 202, 401].includes(code) || ((code === 201 || code === 202) !== Boolean(receipt))) throw new Error("Código e recibo incompatíveis.");
    e.status = code === 401 ? "REJECTED" : code === 202 ? "ACCEPTED_WITH_WARNING" : "ACCEPTED";
    a.status = e.status; a.receipt = receipt; a.processedAt = now;
    a.occurrences = array<Record<string, string>>(result.ocorrencias?.ocorrencia).map(i => ({ tipo: Number(i.tipo) as 1 | 2 | 3, codigo: i.codigo, descricao: i.descricao, localizacao: i.localizacao, correctionUrl: i.correctionUrl }));
    a.returnArtifactId = artifact(state, "RETURN", buildXml({ evento: returned }), now);
    for (const tot of array<Record<string, any>>(returned.tot)) {
      if (!receipt || !accepted(e.status)) throw new Error("Rejeição não pode possuir totalizador.");
      const type = tot["@_tipo"] as TotalizerType, body = Object.values(tot.eSocial).find(v => typeof v === "object") as Record<string, any>;
      if (body.ideEvento.nrRecArqBase !== receipt || body.referenciaSimulacao.eventoOrigem !== e.id) throw new Error("Totalizador sem vínculo com recibo de origem.");
      const value = Number(body.resumoDemonstrativo.valorCentavos), base = Number(body.resumoDemonstrativo.baseCentavos);
      if (!Number.isSafeInteger(value) || !Number.isSafeInteger(base)) throw new Error("Valor de retorno inválido.");
      const id = `DEMO-TOT-${a.id}-${type}`;
      if (!state.totalizers.some(t=>t.id===id)) state.totalizers.push({ id, type, eventId:e.id, attemptId:a.id, receipt, batchId:batch.id, consultationId, registration:e.registration, name:e.name, regime:e.regime, period:e.period, revision:e.revision, value, base, artifactId:artifact(state,"TOTALIZER",buildXml({ totalizador:tot }),now), receivedAt:now, source:"SIMULATED" });
    }
    if (e.type === "S-1299" && accepted(e.status)) state.closed = true;
    if (e.type === "S-1298" && accepted(e.status)) state.closed = false;
    if (e.type === "S-3000" && accepted(e.status)) { const target = state.events.find(t=>t.id===e.sourceId)!; target.status="EXCLUDED";target.excludedBy=e.id;notify(state,target,now); }
    notify(state,e,now);
  }
  batch.status="ACCEPTED";
  note(state,actor,now,"PROCESSED",batch.id,"201 de processamento: resultados individuais e totalizadores recebidos preservados.");
}
export function reconciliation(state: DemoState) {
  const current = state.totalizers.filter(t=>{const e=state.events.find(e=>e.id===t.eventId)!;return !e.alternative && e.revision===t.revision && accepted(e.status);});
  return ([['CP','S-5001','S-5011','expectedCp'],['IRRF','S-5002','S-5012','irrf'],['FGTS','S-5003','S-5013','fgts']] as const).map(([metric,individual,consolidated,field])=>{
    const origins=state.events.filter(e=>!e.alternative && e.status!=="EXCLUDED" && (metric==='IRRF'?e.type==='S-1210':e.type==='S-1200'));
    const expected=origins.reduce((n,e)=>n+e.amounts[field],0), rows=current.filter(t=>t.type===individual), received=rows.reduce((n,t)=>n+t.value,0);
    const closing=current.find(t=>t.type===consolidated);
    return {metric,expected,received,consolidated:closing?.value??null,difference:received-expected,status:rows.length<origins.length||!closing?"PENDENTE":received!==expected||closing.value!==received?"DIVERGENTE":"CONCILIADO"};
  });
}
export function applyCommand(previous: DemoState, command: Command, actor: string, now: string): DemoState {
  const state=structuredClone(previous);
  if(state.mode!=="DEMO"||state.source!=="SIMULATED"||state.employerId!==command.employerId||state.period!==command.period)throw new Error("Comando fora do ambiente/declarante/competência.");
  const target=()=>{const e=state.events.find(e=>e.id===command.targetId);if(!e)throw new Error("Evento não encontrado.");return e;};
  const finish=(batch:Batch)=>{while(["RECEIVED","PROCESSING"].includes(batch.status))consult(state,batch,actor,now);};
  switch(command.action){
    case "PREPARE": note(state,actor,now,"PREPARE",state.period,"Origens do kit preparadas; nenhum retorno pré-carregado.");break;
    case "VALIDATE": for(const e of state.events.filter(e=>["DRAFT","VALIDATED","REJECTED"].includes(e.status))){if(!validateEvent(e,state.rubrics).some(i=>i.tipo===1))e.status="VALIDATED";}note(state,actor,now,"VALIDATE",state.period,"Pré-validação local executada. Não equivale a XSD oficial.");break;
    case "SEND": {
      if(command.scenario==='ERRO_RUBRICA'&&!state.events.some(e=>e.id==='DEMO-EVT-1200-ERR-003')){const source=state.events.find(e=>e.type==='S-1200')!;state.events.push({...structuredClone(source),id:'DEMO-EVT-1200-ERR-003',status:'DRAFT',alternative:true,rubric:'RUB-999',attempts:[],revision:1});}
      const selected=command.targetId?target():command.scenario==='ERRO_RUBRICA'?state.events.find(e=>e.id==='DEMO-EVT-1200-ERR-003')!:state.events.find(e=>["DRAFT","VALIDATED"].includes(e.status)&&!e.alternative);
      if(!selected)throw new Error("Nenhum evento a enviar.");
      send(state,[selected.id],actor,now,command.scenario);break;
    }
    case "CONSULT": {const b=state.batches.find(b=>b.id===command.targetId)||state.batches.find(b=>["RECEIVED","PROCESSING"].includes(b.status));if(!b)throw new Error("Selecione um lote recebido.");consult(state,b,actor,now);break;}
    case "COMPLETE":
    case "RUN_SCHEDULE": {
      if(command.action==='RUN_SCHEDULE'&&(!state.schedule?.enabled||state.schedule.dueAt>now))throw new Error("Agendamento não autorizado ou ainda não vencido.");
      if(command.action==='RUN_SCHEDULE'&&state.schedule?.stage==='VALIDATE'){
        const validated=applyCommand(state,{...command,action:'VALIDATE'},actor,now);validated.schedule!.lastRun=now;validated.schedule!.enabled=false;return validated;
      }
      if(command.action==='COMPLETE'&&command.scenario!=='NORMAL'){
        let prepared=state;
        if(command.scenario==='ERRO_RUBRICA'||command.scenario==='ADVERTENCIA'){
          const id=command.scenario==='ERRO_RUBRICA'?'DEMO-EVT-1200-ERR-003':'DEMO-EVT-2200-WARN';
          if(!prepared.events.some(e=>e.id===id)){const source=prepared.events.find(e=>e.type===(command.scenario==='ERRO_RUBRICA'?'S-1200':'S-2200'))!;prepared.events.push({...structuredClone(source),id,status:'DRAFT',alternative:true,rubric:command.scenario==='ERRO_RUBRICA'?'RUB-999':source.rubric,warning:command.scenario==='ADVERTENCIA',attempts:[],revision:1});}
          const e=prepared.events.find(e=>e.id===id)!;
          if(['DRAFT','VALIDATED'].includes(e.status))prepared=applyCommand(prepared,{...command,action:'SEND',targetId:id},actor,now);
        }else prepared=applyCommand(prepared,{...command,action:'SEND'},actor,now);
        for(const b of prepared.batches.filter(b=>['RECEIVED','PROCESSING'].includes(b.status)))while(['RECEIVED','PROCESSING'].includes(b.status))consult(prepared,b,actor,now);
        return prepared;
      }
      for(const group of categories){
        for(const b of state.batches.filter(b=>b.category===group&&["RECEIVED","PROCESSING"].includes(b.status)&&b.eventIds.every(id=>!state.events.find(e=>e.id===id)!.alternative)))finish(b);
        const eligible=state.events.filter(e=>category(e)===group&&!e.alternative&&["DRAFT","VALIDATED"].includes(e.status));
        for(let i=0;i<eligible.length;i+=50)finish(send(state,eligible.slice(i,i+50).map(e=>e.id),actor,now,"NORMAL"));
      }
      if(command.action==='RUN_SCHEDULE'){state.schedule!.lastRun=now;state.schedule!.enabled=false;}break;
    }
    case "CORRECT": {const e=target();if(e.status!=="REJECTED")throw new Error("Selecione um evento rejeitado.");if(state.closed&&!e.alternative)throw new Error("Reabra a competência antes de corrigir.");e.rubric=command.rubric||e.rubric;if(!state.rubrics.includes(e.rubric))state.rubrics.push(e.rubric);e.revision++;e.status="DRAFT";note(state,actor,now,"CORRECT",e.id,"Rubrica do cenário cadastrada; tentativa rejeitada preservada.");break;}
    case "DUPLICATE": {const e=target();if(!accepted(e.status))throw new Error("Duplicidade exige evento aceito.");const old=e.attempts.at(-1)!;e.attempts.push({...structuredClone(old),id:`${old.id}:replay:${e.attempts.length}`,duplicated:true,createdAt:now});note(state,actor,now,"DUPLICATE",e.id,`Mesmo conteúdo: recibo original recuperado ${old.receipt}.`);break;}
    case "REOPEN":
    case "EXCLUDE": {
      const excluding=command.action==='EXCLUDE', original=excluding?target():null;
      if(excluding&&(!original||!accepted(original.status)||!['S-1200','S-1202','S-1210','S-2200'].includes(original.type)))throw new Error("Evento não elegível à exclusão demonstrativa.");
      if(excluding&&state.closed)throw new Error("Reabra a competência antes de excluir.");
      if(!excluding&&!state.closed)throw new Error("A competência não está fechada.");
      const e:Event={id:`DEMO-EVT-${excluding?'3000':'1298'}-${state.events.length}`,type:excluding?'S-3000':'S-1298',period:state.period,reference:state.period,registration:original?.registration||null,name:original?.name||municipality.declarante,regime:original?.regime||null,status:'DRAFT',amounts:emptyAmounts(),rubric:'',warning:false,alternative:true,sourceId:original?.id||null,sourceUrl:'/rh/esocial?tab=eventos',sourceKind:'FIXTURE',attempts:[],revision:1};state.events.push(e);finish(send(state,[e.id],actor,now,'NORMAL'));
      if(!excluding){for(const item of state.events.filter(e=>['S-1200','S-1202','S-1210','S-1299'].includes(e.type)&&!e.alternative&&accepted(e.status))){item.revision++;item.status='DRAFT';}note(state,actor,now,'REOPEN',e.id,'S-1298 aceito; novas revisões preservam os retornos anteriores.');}break;
    }
    case "RESET": return newDemoState(state.tenantId,state.employerId,state.period,state.generation+1);
    case "ARCHIVE_ERRORS": for(const e of state.events.filter(e=>accepted(e.status)))for(const a of e.attempts.filter(a=>a.status==='REJECTED'))a.archived=true;note(state,actor,now,'ARCHIVE_ERRORS',state.period,'Erros de tentativas resolvidas arquivados da visão operacional; arquivos e ocorrências preservados.');break;
    case "SUBSCRIBE": state.subscribers=command.enabled===false?state.subscribers.filter(id=>id!==actor):[...new Set([...state.subscribers,actor])];note(state,actor,now,'SUBSCRIBE',actor,'Preferência de notificações atualizada. E-mails apenas em outbox DEMO.');break;
    case "SCHEDULE": if(command.enabled===false&&state.schedule){state.schedule.enabled=false;break;}if(!command.dueAt)throw new Error('Informe o instante de execução.');state.schedule={dueAt:command.dueAt,authorizedBy:actor,enabled:command.enabled!==false,lastRun:null,stage:command.stage||'COMPLETE'};note(state,actor,now,'SCHEDULE',state.period,'Execução autorizada para acionamento pelo operador/worker.');break;
    case "IMPORT_PREVIEW": {
      if(!command.files?.length)throw new Error('Selecione XMLs demonstrativos.');
      if(Buffer.byteLength(JSON.stringify(command.files))>1_800_000)throw new Error('Importação acima do limite de 1,8 MB.');
      for(const file of command.files){
        const body=parseDemoXml(file.xml).evtAdmissao;
        if(!body||body.ideEmpregador?.nrInsc!=='00000000000000'||!String(body['@_Id']).startsWith('DEMO-')||!String(body.vinculo?.reciboDemonstrativo).startsWith('DEMO-')||!body.vinculo?.matricula||!body.trabalhador?.identificadorFicticio)throw new Error('XML sem identidade/recibo demonstrativo reconhecido.');
        const eventId=String(body['@_Id']),registration=String(body.vinculo.matricula),receipt=String(body.vinculo.reciboDemonstrativo),hash=digest(file.xml);
        if(state.imports.some(i=>i.hash===hash))continue;
        const prior=state.imports.find(i=>i.eventId===eventId||i.registration===registration),existing=state.events.find(e=>e.id===eventId||e.registration===registration);
        const status=prior?(prior.eventId===eventId&&prior.registration===registration&&prior.receipt===receipt?'EXISTING':'CONFLICT'):existing?'CONFLICT':'NEW';
        state.imports.push({id:`DEMO-IMPORT-${state.imports.length+1}`,eventId,registration,receipt,filename:file.name,hash,status,artifactId:artifact(state,'IMPORT',file.xml,now),at:now});
      }
      note(state,actor,now,'IMPORT_PREVIEW',state.period,'Prévia persistida; nenhuma matrícula importada antes da confirmação.');break;
    }
    case "IMPORT_CONFIRM": {
      for(const item of state.imports){
        if(item.status==='NEW'){
          if(state.events.some(e=>e.id===item.eventId||e.registration===item.registration)){item.status='CONFLICT';continue;}
          state.events.push({id:item.eventId,type:'S-2200',period:state.period,reference:state.period,registration:item.registration!,name:`Registro importado ${item.registration}`,regime:null,status:'IMPORTED_EXTERNAL',amounts:emptyAmounts(),rubric:'',warning:false,alternative:true,sourceId:item.id,sourceUrl:'/rh/esocial?tab=importacao',sourceKind:'IMPORTED_EXTERNAL',attempts:[],revision:1});item.status='IMPORTED';
        }else if(item.status==='EXISTING'||item.status==='CONFLICT')item.status='KEPT';
      }
      note(state,actor,now,'IMPORT_CONFIRM',state.period,'Novos confirmados; conflitos mantidos sem sobrescrita ou reenvio.');break;
    }
    case "IMPORT": {
      if(!command.xml)throw new Error('Selecione um XML do kit.');const root=parseDemoXml(command.xml), body=root.evtAdmissao;
      if(!body||body.ideEmpregador?.nrInsc!=='00000000000000'||!String(body['@_Id']).startsWith('DEMO-')||!String(body.vinculo?.reciboDemonstrativo).startsWith('DEMO-'))throw new Error('XML sem identidade/recibo demonstrativo reconhecido.');
      const id=String(body['@_Id']), registration=String(body.vinculo.matricula), hash=digest(command.xml), prior=state.imports.find(i=>i.eventId===id);
      const status=prior?(prior.hash===hash?'EXISTING':'CONFLICT'):'NEW';
      state.imports.push({id:`DEMO-IMPORT-${state.imports.length+1}`,eventId:id,hash,status,artifactId:artifact(state,'IMPORT',command.xml,now),at:now});
      if(status==='NEW')state.events.push({id,type:'S-2200',period:state.period,reference:state.period,registration,name:`Registro importado ${registration}`,regime:null,status:'IMPORTED_EXTERNAL',amounts:emptyAmounts(),rubric:'',warning:false,alternative:true,sourceId:id,sourceUrl:'/rh/esocial?tab=importacao',sourceKind:'IMPORTED_EXTERNAL',attempts:[],revision:1});
      note(state,actor,now,'IMPORT',id,`${status}: original preservado, sem reenvio automático.`);break;
    }
  }
  return state;
}

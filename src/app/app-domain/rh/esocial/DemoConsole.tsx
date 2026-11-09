"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Eye, Play, RotateCcw } from "lucide-react";
import { OperationalTable, OperationalPagination, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import { OperationalFilters, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import styles from "@/components/app-ui/operational/operational.module.css";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import { commandPermission, DEMO_LABEL, type DemoCommand, type DemoEvent, type DemoScenario, type DemoState, type EsocialPermission } from "@/lib/rh/esocial/contracts";
import { reconcileDemo } from "@/lib/rh/esocial/queries";
import classifications from "@/lib/rh/esocial/fixtures/diarias-prestadores.json";
import { saveEsocialPermission } from "./demonstracao/actions";
import { ESOCIAL_PERMISSIONS } from "@/lib/rh/esocial/contracts";
import type { JSZipObject, JSZipStreamHelper } from "jszip";

const tabs = { geral: "Visão geral", origens: "Origens demonstrativas", validacao: "Pré-validação", eventos: "Eventos enviados", lotes: "Lotes e transmissão", retornos: "Retornos recebidos", conciliacao: "Totalizadores e conciliação", diarias: "Diárias e prestadores", importacao: "Importação / migração", automacao: "Automação e notificações", auditoria: "Configurações e auditoria" };
type Tab = keyof typeof tabs;
const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (value: string) => new Date(value).toLocaleString("pt-BR");
const column = (key: string, label: string, width = 150, minWidth = 75): OperationalColumn => ({ key, label, type: key === "actions" ? "actions" : "text", initialWidth: width, minWidth, maxWidth: 600, resizable: true, sortable: false, details: key === "actions" ? "none" : "overflow" });

export function EsocialDemoConsole({ initialState, permissions, actorId, employers, initialTab = "retornos", initialMessage = "" }: { initialState: DemoState; permissions: EsocialPermission[]; actorId: string; employers: {id:string;name:string}[]; initialTab?: string; initialMessage?: string }) {
  const router = useRouter();
  const [state, setState] = useState(initialState), [tab, setTab] = useState<Tab>(initialTab in tabs ? initialTab as Tab : "retornos");
  const [page, setPage] = useState(1), [search, setSearch] = useState(""), [type, setType] = useState(""), [status, setStatus] = useState(""), [scenario, setScenario] = useState<DemoScenario>("NORMAL");
  const [batchId, setBatchId] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState(initialMessage);
  const [details, setDetails] = useState<{ title: string; text: string; event?: DemoEvent } | null>(null), [detailPage, setDetailPage] = useState(0);
  const [rubric, setRubric] = useState("RUB-999"), [dueAt, setDueAt] = useState(""), [stage, setStage] = useState<"VALIDATE" | "COMPLETE">("VALIDATE");
  const inFlight = useRef(false);
  const can = (action: DemoCommand["action"]) => permissions.includes("ESOCIAL_ADMIN") || permissions.includes(commandPermission[action]);
  const switchTab = (next: Tab) => { setTab(next); setPage(1); setSearch(""); setType(""); setStatus(""); };
  async function run(action: DemoCommand["action"], extra: Partial<DemoCommand> = {}) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage("Processando comando local DEMO…");
    try {
      const response = await fetch("/api/rh/esocial/demo/command", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, employerId:state.employerId, period: state.period, scenario, idempotencyKey: crypto.randomUUID(), ...extra }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setState(result.state); setDetails(null); setMessage(action === "COMPLETE" || action === "CONSULT" ? "Resposta do eSocial recebida (simulação)." : "Operação DEMO registrada.");
      if (action === "COMPLETE") switchTab("retornos");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha na operação."); }
    finally { setBusy(false); inFlight.current = false; }
  }
  const command = (label: string, action: DemoCommand["action"], extra: Partial<DemoCommand> = {}) => can(action) ? <button type="button" className={styles.filterButton} disabled={busy} onClick={() => void run(action, extra)}>{label}</button> : null;
  const open = (title: string, text: string, event?: DemoEvent) => { setDetailPage(0); setDetails({ title, text, event }); };
  const download = (id: string) => {
    const alias = state.artifacts.find(a=>a.id===id);
    const canonical = alias && state.artifacts.find(a=>a.id.startsWith('DEMO-XML-')&&a.hash===alias.hash&&a.kind===alias.kind);
    return canonical&&state.runId ? `/api/rh/esocial/arquivos/${state.runId}/${encodeURIComponent(canonical.id)}` : '#';
  };
  const view = (title: string, text: string, event?: DemoEvent) => <button type="button" className={styles.iconButton} aria-label={`Visualizar ${title}`} onClick={() => open(title, text, event)}><Eye size={15} /></button>;
  let columns: OperationalColumn[] = [], rows: OperationalRow[] = [];
  const eventRows = state.events.filter(event => !event.archived && (tab !== "validacao" || event.occurrences.length > 0));
  if (["eventos", "validacao", "origens"].includes(tab)) {
    columns = [column("type", "Evento", 95), column("period", "Competência", 110), column("name", "Servidor", 200), column("registration", "Matrícula", 100), column("status", "Situação", 145), column("receipt", "Recibo / ocorrência", 240), column("actions", "Ações", 100)];
    rows = eventRows.map(event => ({ id: event.id, label: event.id, values: { type: event.type, period: event.period, name: event.name, registration: event.registration ?? "—", status: `${event.status}${event.historical ? ' · histórico' : ''}`, receipt: event.receipt ?? event.occurrences.map(o => `${o.codigo}: ${o.descricao}`).join("; ") }, actions: <>{view(event.id, JSON.stringify({ ...event, sentXml: undefined, returnXml: undefined }, null, 2), event)}{event.sentArtifactId && <a href={download(event.sentArtifactId)} aria-label={`Baixar XML enviado de ${event.id}`}><Download size={15} /></a>}</> }));
  } else if (tab === "lotes") {
    columns = [column("id", "Lote", 250), column("category", "Grupo", 150), column("status", "Situação", 140), column("protocol", "Protocolo", 260), column("count", "Eventos", 80), column("actions", "Ações", 110)];
    rows = state.batches.map(batch => ({ id: batch.id, label: batch.id, values: { id: batch.id, category: batch.category, status: `${batch.status} (${batch.statusCode ?? "—"})`, protocol: batch.protocol ?? "Sem protocolo", count: String(batch.eventIds.length) }, actions: <>{view(batch.id, JSON.stringify({ ...batch, receptionXml: undefined, consultas: state.consultations.filter(c => c.batchId === batch.id).map(c => ({ ...c, xml: undefined })) }, null, 2))}{can("CONSULT") && batch.protocol && batch.status !== "PROCESSED" && <button type="button" disabled={busy} aria-label={`Consultar ${batch.id}`} onClick={() => void run("CONSULT", { batchId: batch.id })}><Play size={15} /></button>}{batch.receptionXml && <a href={download(`${batch.id}-reception`)} aria-label="Baixar recepção"><Download size={15} /></a>}</> }));
  } else if (tab === "retornos") {
    columns = [column("type", "Recebido", 100), column("period", "Competência", 105), column("name", "Servidor / regime", 190), column("origin", "Evento de origem", 160), column("value", "Valor", 100), column("status", "Conciliação", 120), column("receipt", "Recibo de origem", 180), column("actions", "Ações", 80)];
    rows = state.totalizers.map(total => ({ id: total.id, label: total.id, values: { type: total.type, period: total.period, name: `${total.name} / ${total.regime}`, origin: total.originEventId, value: money(total.valueCents), status: total.valueCents === total.expectedCents ? "CONCILIADO" : "DIVERGENTE", receipt: total.originReceipt }, actions: <>{view(total.type, `${DEMO_LABEL}\nRecebido: ${date(total.receivedAt)}\nLote: ${total.batchId}\nConsulta: ${total.consultationId}\nMatrícula: ${total.registration ?? "Consolidado"}\nRevisão: ${total.revision}\nPrevisto: ${money(total.expectedCents)}\nRecebido: ${money(total.valueCents)}\nDiferença: ${money(total.valueCents - total.expectedCents)}\nSHA-256: ${total.hash}\n\n${total.xml}`, state.events.find(e => e.id === total.originEventId))}<a href={download(total.id)} aria-label={`Baixar XML ${total.type} de ${total.name}`}><Download size={15} /></a></> }));
  } else if (tab === "conciliacao") {
    columns = [column("metric", "Componente", 180), column("expected", "Previsto", 120), column("received", "Individual recebido", 150), column("closing", "Fechamento recebido", 160), column("difference", "Diferença", 100), column("status", "Situação", 140)];
    rows = reconcileDemo(state).map(item => ({ id: item.metric, label: item.label, values: { metric: item.label, expected: money(item.expected), received: money(item.received), closing: item.consolidatedValue === null ? "Aguardando S-1299" : money(item.consolidatedValue), difference: money(item.difference), status: item.status } }));
  } else if (tab === "geral") {
    columns = [column("status", "Situação", 220), column("count", "Quantidade", 150), column("source", "Natureza", 300)];
    const counts = new Map<string, number>();
    for (const event of state.events.filter(e=>!e.historical)) counts.set(event.status, (counts.get(event.status) ?? 0) + 1);
    counts.set("TOTALIZADORES RECEBIDOS", state.totalizers.length); counts.set("CONSULTAS PERSISTIDAS", state.consultations.length);
    rows = [...counts].map(([key, count]) => ({ id: key, label: key, values: { status: key, count: String(count), source: "DEMO — SIMULATED" }, cells: { status: <button onClick={() => { switchTab(key.includes("TOTALIZADORES") ? "retornos" : "eventos"); if (!key.includes("TOTALIZADORES")) setStatus(key); }}>{key}</button> } }));
  } else if (tab === "diarias") {
    columns = [column("kind", "Origem", 100), column("name", "Beneficiário / prestador", 230), column("classification", "Classificação", 220), column("reason", "Enquadramento", 350)];
    rows = [...classifications.diarias.map(item => ({ id: item.id, label: item.favorecido, values: { kind: "Diária DEMO", name: item.favorecido, classification: item.elegibilidade, reason: `${item.destino} · ${money(item.valor * 100)}` } })), ...classifications.prestadores.map(item => ({ id: item.id, label: item.nome, values: { kind: `Prestador ${item.tipoPessoa}`, name: item.nome, classification: item.classificacao, reason: item.observacao } }))];
  } else if (tab === "importacao") {
    columns = [column("file", "Arquivo", 200), column("event", "ID de origem", 230), column("registration", "Matrícula", 110), column("receipt", "Recibo externo", 200), column("status", "Resultado", 120), column("actions", "Ações", 75)];
    rows = state.imports.map(item => ({ id: item.id, label: item.filename, values: { file: item.filename, event: item.eventId, registration: item.registration, receipt: item.receipt, status: item.status }, actions: view(item.filename, item.xml) }));
  } else if (tab === "automacao") {
    columns = [column("at", "Data", 160), column("state", "Transição", 180), column("subject", "Assunto sem CPF", 400), column("status", "Entrega", 140)];
    rows = state.notifications.filter(n => n.userId === actorId || permissions.includes("ESOCIAL_ADMIN")).map(item => ({ id: item.id, label: item.id, values: { at: date(item.at), state: item.state, subject: item.subject, status: item.status } }));
  } else {
    columns = [column("at", "Data/hora", 150), column("action", "Operação", 180), column("reference", "Referência", 300), column("actor", "Autor", 200), column("actions", "Evidência", 80)];
    rows = [...state.timeline.map(item => ({ id: item.id, label: item.id, values: { at: date(item.at), action: item.action, reference: item.reference, actor: item.actor }, actions: view(item.action, JSON.stringify(item, null, 2)) })), ...state.consultations.map(item => ({ id: item.id, label: item.id, values: { at: date(item.at), action: `CONSULTA ${item.statusCode}`, reference: item.protocol, actor: "SIMULATED" }, actions: <>{view(item.id, item.xml)}<a href={download(item.id)} aria-label="Baixar consulta"><Download size={15} /></a></> }))];
  }
  const allTypes = [...new Set(rows.map(row => row.values.type).filter(Boolean))];
  rows = rows.filter(row => (!type || row.values.type === type) && (!status || row.values.status?.includes(status)) && (!search || Object.values(row.values).join(" ").toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"))));
  const total = rows.length, activePage = Math.min(page, Math.max(1, Math.ceil(total / OPERATIONAL_PAGE_SIZE)));
  const detailText = details?.text ?? "", detailChunks = detailText.match(/[\s\S]{1,1500}/g) ?? [""];
  async function importFiles(files: FileList | null) {
    try {
      if (!files?.length) return;
      const payload: { name: string; xml: string }[] = [];
      for (const file of Array.from(files)) {
         if (file.size > 1_800_000) throw new Error("Arquivo acima de 1,8 MB.");
        if (file.name.toLowerCase().endsWith(".zip")) {
          const JSZip = (await import("jszip")).default;
          const zip = await JSZip.loadAsync(await file.arrayBuffer());
          const entries = Object.values(zip.files).filter(entry => !entry.dir && entry.name.endsWith(".xml"));
          if (entries.length > 20) throw new Error("ZIP limitado a 20 XMLs.");
           for (const entry of entries) {
             let size = 0;
             // JSZip 3.10 exposes this streaming API on ZipObject but omits it from its typings.
             const source = entry as JSZipObject & {internalStream(type:'string'):JSZipStreamHelper<string>};
             const xml = await new Promise<string>((resolve,reject)=>{const chunks:string[]=[];const stream=source.internalStream('string');stream.on('data',chunk=>{size+=new TextEncoder().encode(chunk).length;if(size>500_000){stream.pause();reject(new Error('XML descompactado acima de 500 KB.'));return;}chunks.push(chunk);}).on('error',reject).on('end',()=>resolve(chunks.join(''))).resume();});
             payload.push({ name: entry.name, xml });
           }
        } else payload.push({ name: file.name, xml: await file.text() });
      }
      if (JSON.stringify(payload).length > 1_800_000) throw new Error("Importação acima do limite de 2 MB.");
      await run("IMPORT_PREVIEW", { files: payload });
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha na importação."); }
  }
  return <>
    <OperationalListFrame label="eSocial DEMO" actions={<>
      <strong className="text-xs" title={DEMO_LABEL}>DEMO · SEM COMUNICAÇÃO COM O GOVERNO</strong>
      {command("Simular recebimento do eSocial", "COMPLETE")}
      <OperationalFilters label="Comandos eSocial">
        <p>{DEMO_LABEL}</p><p>Município: Aurora das Veredas · CNPJ sintético 00000000000000 · S-1.3 · XML conceitual, sem validação XSD oficial.</p>
        <label>Cenário <select value={scenario} onChange={e => setScenario(e.target.value as DemoScenario)}>{["NORMAL", "ERRO_RUBRICA", "ADVERTENCIA", "FALHA_CONEXAO", "SCHEMA_INVALIDO"].map(value => <option key={value}>{value}</option>)}</select></label>
        <div className="flex flex-wrap gap-2">{command("Preparar eventos", "PREPARE")}{command("Validar novamente", "VALIDATE")}{command("Simular envio (próximo lote)", "SEND")}{command("Arquivar erros resolvidos", "ARCHIVE")}{command("Reabrir competência (S-1298)", "REOPEN")}</div>
        <label>Lote <select value={batchId} onChange={e => setBatchId(e.target.value)}><option value="">Selecione</option>{state.batches.filter(b => b.protocol).map(b => <option key={b.id} value={b.id}>{b.id} · {b.status}</option>)}</select></label>
        {command("Consultar retorno (próxima etapa)", "CONSULT", { batchId })}
        {can("RESET") && <button type="button" disabled={busy} onClick={() => { if (window.confirm("Reiniciar o cenário DEMO? Os XMLs e o histórico anteriores serão preservados.")) void run("RESET"); }}><RotateCcw size={14} /> Reiniciar cenário DEMO</button>}
        <Link href="/rh/esocial?view=origins">Origens de RH e exportações existentes</Link>
        <Link href="/rh/esocial?view=manage">Configuração de conexão oficial</Link>
        <a href="https://www.gov.br/esocial/pt-br/documentacao-tecnica/" target="_blank" rel="noreferrer">Documentação oficial</a>
      </OperationalFilters>
    </>} toolbar={<>
      <label className="sr-only" htmlFor="esocial-tab">Área eSocial</label><select id="esocial-tab" value={tab} onChange={e => switchTab(e.target.value as Tab)}>{Object.entries(tabs).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
       <label className="sr-only" htmlFor="esocial-period">Competência</label><select id="esocial-period" value={state.period} disabled={busy} onChange={e => router.push(`/rh/esocial?competencia=${e.target.value}&tab=${tab}&employerId=${encodeURIComponent(state.employerId)}`)}><option value="2026-10">10/2026</option><option value="2026">Anual 2026 · 13º</option></select>
      <input aria-label="Buscar eSocial" value={search} placeholder="Buscar servidor, matrícula, evento…" onChange={e => { setSearch(e.target.value); setPage(1); }} />
      <OperationalFilters label="Filtros e informações" activeCount={Number(!!type) + Number(!!status)}>
         <p>{DEMO_LABEL}</p><p role="status">{message || `${total} registros · revisão ${state.revision}`}</p>
         <label>Declarante<select value={state.employerId} disabled={busy} onChange={e=>router.push(`/rh/esocial?competencia=${state.period}&tab=${tab}&employerId=${encodeURIComponent(e.target.value)}`)}>{employers.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
        <label>Tipo <select value={type} onChange={e => { setType(e.target.value); setPage(1); }}><option value="">Todos</option>{allTypes.map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Situação <input value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} /></label>
        <button onClick={() => { setType(""); setStatus(""); setSearch(""); setPage(1); }}>Limpar filtros</button>
        {tab === "conciliacao" && <p>CP segurado RGPS mensal: previsto R$ 1.080,00, retorno R$ 1.075,00. Diferença proposital de −R$ 5,00. Bases sintéticas do kit; não representam tributo recolhido.</p>}
      </OperationalFilters>
      {tab === "importacao" && <OperationalFilters label="Importar XML / ZIP"><p>Importação de admissões DEMO do kit (concorrente-novo, duplicado e divergente). Preserva XML original; conflitos mantêm o existente.</p>{can("IMPORT_PREVIEW") && <input aria-label="Arquivos XML ou ZIP" type="file" accept=".xml,.zip" multiple disabled={busy} onChange={e => void importFiles(e.target.files)} />}{command("Confirmar novos / manter existentes", "IMPORT_CONFIRM")}</OperationalFilters>}
      {tab === "automacao" && <OperationalFilters label="Programação e assinaturas"><p>Automação local executada pelo comando autorizado abaixo. Outbox DEMO, sem envio SMTP.</p>{command(state.subscriptions.includes(actorId) ? "Desativar notificações" : "Assinar notificações", "SUBSCRIBE", { enabled: !state.subscriptions.includes(actorId) })}<label>Executar após <input type="datetime-local" value={dueAt} onChange={e => setDueAt(e.target.value)} /></label><label>Estágio <select value={stage} onChange={e => setStage(e.target.value as typeof stage)}><option value="VALIDATE">Pré-validar</option><option value="COMPLETE">Enviar e consultar DEMO</option></select></label>{command("Autorizar programação", "AUTOMATION", { enabled: true, stage, ...(dueAt ? { dueAt: new Date(dueAt).toISOString() } : {}) })}{command("Revogar programação", "AUTOMATION", { enabled: false })}{command("Executar programação devida", "RUN_AUTOMATION")}<p>{JSON.stringify(state.automation)}</p></OperationalFilters>}
       {message && <button type="button" className={styles.iconButton} aria-label={message} title={message} onClick={() => open("Resultado da operação", message)}><Eye size={15} /></button>}
       {tab==='auditoria'&&permissions.includes('ESOCIAL_ADMIN')&&<OperationalFilters label="Permissões eSocial"><form action={saveEsocialPermission}><input type="hidden" name="employerId" value={state.employerId}/><input type="hidden" name="period" value={state.period}/><label>E-mail do usuário<input name="email" type="email" required/></label><label>Permissão<select name="permission">{ESOCIAL_PERMISSIONS.map(p=><option key={p}>{p}</option>)}</select></label><label>Operação<select name="enabled"><option value="true">Conceder</option><option value="false">Revogar</option></select></label><button type="submit">Salvar permissão</button></form></OperationalFilters>}
      <span className="sr-only" role="status" aria-live="polite">{message}</span>
    </>} pagination={<OperationalPagination page={activePage} total={total} onPageChange={setPage} />}>
      <OperationalTable preferenceId={`rh-esocial-demo-${tab}`} columns={columns} rows={rows.slice((activePage - 1) * OPERATIONAL_PAGE_SIZE, activePage * OPERATIONAL_PAGE_SIZE)} caption={`${tabs[tab]} · ${DEMO_LABEL}`} emptyMessage="Nenhum registro. Use Simular recebimento do eSocial para iniciar a demonstração." />
    </OperationalListFrame>
    <Dialog open={!!details} onOpenChange={value => { if (!value) setDetails(null); }}><DialogContent className="flex max-h-[calc(100dvh-24px)] max-w-3xl flex-col overflow-hidden"><DialogHeader><DialogTitle>{details?.title}</DialogTitle><DialogDescription>{DEMO_LABEL}</DialogDescription></DialogHeader>
      <pre className="min-h-0 whitespace-pre-wrap break-all text-xs">{detailChunks[detailPage]}</pre>
      <div className="flex flex-wrap items-center gap-2 text-xs"><button disabled={detailPage === 0} onClick={() => setDetailPage(p => p - 1)}>Anterior</button><span>{detailPage + 1}/{detailChunks.length}</span><button disabled={detailPage >= detailChunks.length - 1} onClick={() => setDetailPage(p => p + 1)}>Próxima</button><button onClick={() => void navigator.clipboard.writeText(detailText)}>Copiar integral</button></div>
      {details?.event && <div className="flex flex-wrap gap-2 text-xs">
        <Link href={details.event.sourceUrl}>Abrir folha / origem</Link>
         {details.event.sentArtifactId && <a href={download(details.event.sentArtifactId)}>XML enviado</a>}{details.event.returnArtifactId && <a href={download(details.event.returnArtifactId)}>XML retorno</a>}
         <a href={`/api/rh/esocial/eventos/${encodeURIComponent(details.event.id)}/export?competencia=${state.period}&employerId=${encodeURIComponent(state.employerId)}&format=html`}>HTML</a><a href={`/api/rh/esocial/eventos/${encodeURIComponent(details.event.id)}/export?competencia=${state.period}&employerId=${encodeURIComponent(state.employerId)}&format=csv`}>CSV</a>
         {!details.event.historical&&details.event.status === "REJECTED" && <><label>Rubrica DEMO <input value={rubric} onChange={e => setRubric(e.target.value)} /></label>{command("Corrigir rubrica e gerar nova tentativa", "CORRECT", { eventId: details.event.id, rubric })}</>}
         {!details.event.historical&&details.event.receipt && <>{command("Demonstrar duplicidade", "DUPLICATE", { eventId: details.event.id })}{['S-1200','S-1202','S-1210','S-2200'].includes(details.event.type)&&command("Solicitar exclusão S-3000", "EXCLUDE", { eventId: details.event.id })}</>}
      </div>}
    </DialogContent></Dialog>
  </>;
}

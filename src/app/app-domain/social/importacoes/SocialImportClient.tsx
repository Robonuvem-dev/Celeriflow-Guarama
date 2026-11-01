"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { socialImportAction } from "./actions";
import type { SocialImportRow } from "@/db/schema/social-workflows";
import type { SocialImportLayout } from "@/lib/social/municipal-contract";
import { localCadunicoHeaders, localCadunicoLayout } from "@/lib/social/cadunico-import";
import { SocialOperationalList } from "../OperationalList";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";

type Layout = {id:string;name:string;version:string;configuration:SocialImportLayout};
type Batch = {id:string;filename:string;status:string;accepted:number;rejected:number;layout:string};
export function SocialImportClient({units,batches,selected,rows,administrator,layouts}:{units:{id:string;name:string}[];batches:Batch[];selected:string;rows:SocialImportRow[];administrator:boolean;layouts:Layout[]}){
  const router=useRouter(),[pending,setPending]=useState(false),[notice,setNotice]=useState(""),[page,setPage]=useState(1),[layoutId,setLayoutId]=useState("");
  const field="h-8 min-w-0 rounded border border-slate-300 bg-white px-2 text-sm";
  async function submit(form:FormData){setPending(true);try{const result=await socialImportAction(form);if(result.error)setNotice(result.error);else{setNotice("Operação concluída.");router.push(`/social/importacoes?batch=${result.id}`);router.refresh();}}catch{setNotice("Falha na comunicação. Confira a situação do lote antes de repetir.");}finally{setPending(false);}}
  function downloadModel(){
    const layout=layouts.find(l=>l.id===layoutId),columns=layout?Object.values(layout.configuration.mapping).filter(value=>!value.startsWith("=")):localCadunicoHeaders;
    const separator=layout&&layout.configuration.delimiter!=="AUTO"?layout.configuration.delimiter:";";
    const quote=(text:string)=>`"${text.replaceAll('"','""')}"`;
    const blob=new Blob(["\uFEFF"+columns.map(quote).join(separator)+"\r\n"],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="cadastro-familiar.csv";a.click();URL.revokeObjectURL(url);
  }
  const batch=batches.find(b=>b.id===selected),batchLabel=(b:Batch)=>b.status==="APPLIED"?"Aplicado":"Em conferência";
  const layoutLabel=(value:string)=>value===localCadunicoLayout?"Cadastro familiar — CelerFlow 1.0":value.replace(/\s\[[^\]]+\]$/,"");
  return <PageFrame className="space-y-3 p-3">
    <PageHeader title="Importação cadastral — Cadastro Único" action={<Link href="/social/gestao/layouts" className="text-xs text-blue-700 underline">Configurar layouts</Link>}/>
    <p className="text-sm">Selecione o layout do arquivo cadastral. As colunas, a codificação, o separador e o formato das datas são configuráveis. A conferência identifica rejeições antes de atualizar pessoas e famílias.</p>
    {administrator&&<form action={submit} className="grid gap-3 rounded border bg-white p-3 md:grid-cols-3">
      <label className="text-xs">Unidade<select required name="unitId" aria-label="Unidade" className={`${field} block w-full`}><option value="">Selecione</option>{units.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
      <label className="text-xs">Layout<select name="layoutId" aria-label="Layout" value={layoutId} onChange={e=>setLayoutId(e.target.value)} className={`${field} block w-full`}><option value="">Cadastro familiar — CelerFlow 1.0</option>{layouts.map(l=><option key={l.id} value={l.id}>{l.name} — {l.version}</option>)}</select></label>
      <label className="text-xs">Arquivo cadastral<input required name="file" type="file" accept=".csv,.txt,text/csv,text/plain" aria-label="Arquivo cadastral" className="block max-w-full text-xs"/></label>
      <div className="flex flex-wrap gap-3 md:col-span-3"><button disabled={pending} className="rounded bg-blue-600 px-3 py-2 text-xs text-white">{pending?"Processando...":"Conferir arquivo"}</button><button type="button" className="text-xs text-blue-700 underline" onClick={downloadModel}>Baixar modelo do layout selecionado</button></div>
    </form>}
    <form className="flex flex-wrap gap-3"><label className="text-xs">Lote<select name="batch" aria-label="Lote" defaultValue={selected} className={`${field} ml-2 max-w-full`}><option value="">Selecione</option>{batches.map(b=><option key={b.id} value={b.id}>{b.filename} — {batchLabel(b)} — {b.accepted} válidos / {b.rejected} rejeitados</option>)}</select></label><button className="rounded border px-3 text-xs">Consultar</button></form>
    {notice&&<p role="status" className="text-sm">{notice}</p>}
    {batch&&<><p className="text-sm">{layoutLabel(batch.layout)} — {batch.accepted} registros válidos / {batch.rejected} rejeitados — {batchLabel(batch)}</p>{administrator&&batch.status==="PREVIEW"&&batch.accepted>0&&<form action={submit}><input type="hidden" name="batchId" value={batch.id}/><button disabled={pending} className="rounded bg-blue-600 px-3 py-2 text-xs text-white">Aplicar registros válidos</button></form>}
      <OperationalTablePanel title="Registros da importação" triggerLabel="Consultar registros e rejeições"><SocialOperationalList id="importacao-linhas" page={page} total={rows.length} onPageChange={setPage} columns={[["line","Linha",80,60],["name","Pessoa",230,100],["cpf","CPF",150,110],["family","Família",150,80],["errors","Resultado",350,140]]} rows={rows.slice((page-1)*20,page*20).map(r=>({id:String(r.line),label:r.name,values:{line:String(r.line),name:r.name,cpf:r.cpf,family:r.familyCode,errors:r.errors.join("; ")||"Válido para conciliação"}}))}/></OperationalTablePanel>
    </>}
  </PageFrame>;
}

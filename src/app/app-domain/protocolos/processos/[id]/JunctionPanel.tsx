import Link from "next/link";
import { and,desc,eq,inArray,or } from "drizzle-orm";
import { db } from "@/db/client";
import { processJunctions } from "@/db/schema/process-junction";
import { processes } from "@/db/schema/processes";
import { type ProtocolContext,protocolScopeCondition } from "@/lib/protocols/access";
import { joinProcessAction,undoProcessJunctionAction } from "./junction-actions";
export async function JunctionPanel({processId,context,canOperate}:{processId:string;context:ProtocolContext;canOperate:boolean}){
 const database=context.database??db;
 const records=await database.select().from(processJunctions).where(or(eq(processJunctions.parentProcessId,processId),eq(processJunctions.childProcessId,processId))).orderBy(desc(processJunctions.createdAt));
 const ids=[...new Set(records.map(row=>row.parentProcessId===processId?row.childProcessId:row.parentProcessId))];
 const visible=ids.length?await database.select({id:processes.id,protocolNumber:processes.protocolNumber}).from(processes).where(and(inArray(processes.id,ids),protocolScopeCondition(context))):[];
 return <section className="space-y-3 rounded border bg-white p-4"><h2 className="font-semibold">Junções de processos</h2><p className="text-sm text-slate-600">Vínculos reversíveis mantêm os processos e seus históricos próprios. Somente processos do mesmo setor podem ser juntados ou separados.</p>{canOperate&&<details><summary>Juntar processo a este protocolo</summary><form action={joinProcessAction} className="mt-3 grid gap-2"><input type="hidden" name="parentId" value={processId}/><label>Protocolo a juntar<input required name="childProtocol" className="ml-2 rounded border p-2 text-sm"/></label><label>Justificativa<textarea required name="reason" minLength={10} maxLength={2000} className="block w-full rounded border p-2 text-sm"/></label><button className="rounded border p-2 text-sm">Confirmar junção</button></form></details>}{records.map(row=>{
 const counterpart=visible.find(item=>item.id===(row.parentProcessId===processId?row.childProcessId:row.parentProcessId));if(!counterpart)return null;
 return <article key={row.id} className="space-y-2 rounded border p-3 text-sm"><p>{row.parentProcessId===processId?"Processo juntado":"Juntado ao processo"}: <Link className="font-semibold underline" href={`/protocolos/processos/${counterpart.id}`}>{counterpart.protocolNumber}</Link> — {row.endedAt?"Desfeita":"Ativa"}</p><p>{row.reason} · {row.createdAt.toLocaleString("pt-BR")}</p>{row.endedAt?<p>Desfeita em {row.endedAt.toLocaleString("pt-BR")}: {row.endReason}</p>:canOperate&&<details><summary>Desfazer junção</summary><form action={undoProcessJunctionAction} className="mt-2 space-y-2"><input type="hidden" name="junctionId" value={row.id}/><textarea name="reason" required minLength={10} maxLength={2000} aria-label="Justificativa para desfazer junção" className="block w-full rounded border p-2"/><button className="rounded border p-2">Confirmar desfazimento</button></form></details>}</article>;
 })}{!records.length&&<p className="text-sm text-slate-500">Nenhuma junção registrada.</p>}</section>;
}

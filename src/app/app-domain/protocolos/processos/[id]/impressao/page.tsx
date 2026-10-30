import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { processPrintSettings } from "@/db/schema/process-reference-catalog";
import { readOperationalProcess } from "@/db/repositories/processes/details";
import { getProtocolContext, protocolScopeCondition } from "@/lib/protocols/access";
import { PrintButton } from "./PrintButton";
export const dynamic="force-dynamic";
export default async function ProcessPrintPage({params}:{params:Promise<{id:string}>}) {
 const {id}=await params,context=await getProtocolContext(),database=context.database??db;
 const process=await readOperationalProcess(database,id,protocolScopeCondition(context));
 if(!process) notFound();
 const [settings]=await database.select().from(processPrintSettings).where(eq(processPrintSettings.processTypeId,process.processTypeId)).limit(1);
 return <main className="space-y-5 bg-white p-6 text-black"><div className="flex gap-3 print:hidden"><Link href={`/protocolos/processos/${id}`}>Voltar ao processo</Link><PrintButton/></div><h1 className="text-xl font-bold">Relatório do processo {process.protocolNumber}</h1>{(settings?.includeOpening??true)&&<section className="space-y-2"><h2 className="font-bold">Abertura</h2><p>Tipo: {process.processType.name}</p><p>Assunto: {process.subject.name}</p><p>Interessado: {process.person?.fullName||process.company?.corporateName||"Não informado"}</p><p>Data: {process.createdAt.toLocaleString("pt-BR")}</p><p className="whitespace-pre-wrap">{process.description}</p></section>}{(settings?.includeMovements??true)&&<section className="space-y-3"><h2 className="font-bold">Movimentações</h2>{process.movements.map(movement=><article key={movement.id} className="break-inside-avoid border-b p-2"><p>{movement.movedAt.toLocaleString("pt-BR")} — {movement.fromDepartment?.name||"Abertura"} → {movement.toDepartment.name}</p><p>Situação: {movement.status}</p>{movement.receivedAt&&<p>Recebimento: {movement.receivedAt.toLocaleString("pt-BR")}</p>}</article>)}{!process.movements.length&&<p>Sem movimentações.</p>}</section>}</main>;
}

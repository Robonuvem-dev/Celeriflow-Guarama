"use client";

import { startTransition, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HealthReadTable } from "../../HealthReadTable";
import { HealthPageTools } from "../../HealthPageTools";
import { healthColumn } from "../../operational-columns";
import { mergeHealthRecords } from "./actions";

export type MergeKind = "ADDRESS" | "PATIENT" | "PROFESSIONAL";
export type MergeCandidate = { id: string; title: string; subtitle: string; facts: string[] };
export type MergeHistory = { id: string; kind: string; targetId: string; sourceIds: string; criteria: string; result: string; actor: string; createdAt: string };

export function UnificationsClient({ kind, candidates, history, canUpdate }: { kind: MergeKind; candidates: MergeCandidate[]; history: MergeHistory[]; canUpdate: boolean }) {
  const router = useRouter();
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const source = candidates.find(candidate => candidate.id === sourceId);
  const target = candidates.find(candidate => candidate.id === targetId);

  async function execute() {
    if (!source || !target) return;
    setPending(true);
    const result = await mergeHealthRecords({ kind, sourceId: source.id, targetId: target.id });
    setPending(false);
    if ("error" in result) return setMessage(result.error);
    setMessage("Unificação concluída e registrada no histórico.");
    setConfirmOpen(false);
    setSourceId("");
    setTargetId("");
    startTransition(() => router.refresh());
  }

  return <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    <HealthPageTools label="Comparar registros"><div className="grid gap-2 text-sm">
      <label className="grid gap-1 text-xs font-semibold">Registro de origem<select value={sourceId} onChange={event => setSourceId(event.target.value)} className="h-9 rounded border bg-white px-2 text-xs"><option value="">Selecione</option>{candidates.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.title} · {candidate.subtitle}</option>)}</select></label>
      <ArrowRightLeft className="mb-2 hidden size-4 text-slate-400 md:block" />
      <label className="grid gap-1 text-xs font-semibold">Registro principal<select value={targetId} onChange={event => setTargetId(event.target.value)} className="h-9 rounded border bg-white px-2 text-xs"><option value="">Selecione</option>{candidates.filter(candidate => candidate.id !== sourceId).map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.title} · {candidate.subtitle}</option>)}</select></label>
      <Button disabled={!canUpdate || !source || !target} onClick={() => { setMessage(""); setConfirmOpen(true); }}>Comparar</Button>
      {message && <p role="status" className="text-xs font-semibold text-emerald-700 md:col-span-4">{message}</p>}
    <p>Pessoa Física usa a <Link className="font-bold text-emerald-700 underline" href="/app-domain/configuracoes/mesclagem-pf">unificação global com aprovação segregada</Link>.</p></div></HealthPageTools>
    <HealthReadTable id="saude-admin-unificacoes" label="Últimas unificações do recorte" columns={[healthColumn("kind", "Tipo", 130, 90), healthColumn("target", "Destino", 240, 120, "identifier"), healthColumn("actor", "Responsável", 180, 110), healthColumn("date", "Data", 180, 125), healthColumn("result", "Resultado", 300, 130)]} rows={history.map(item => ({ id: item.id, label: item.targetId, values: { kind: item.kind, target: item.targetId, actor: item.actor, date: new Date(item.createdAt).toLocaleString("pt-BR"), result: item.result } }))} />
    <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>Confirmar registro principal</DialogTitle><DialogDescription>Os vínculos serão preservados e a operação não exclui o cadastro de origem.</DialogDescription></DialogHeader><div className="grid gap-3 sm:grid-cols-2">{[source, target].map((item, index) => item && <div key={item.id} className={`rounded border p-3 ${index === 1 ? "border-emerald-500 bg-emerald-50" : "border-slate-200"}`}><p className="text-[10px] font-bold uppercase text-slate-500">{index ? "Principal" : "Origem"}</p><h3 className="mt-1 text-sm font-bold">{item.title}</h3><p className="text-xs text-slate-600">{item.subtitle}</p>{item.facts.map(fact => <p key={fact} className="mt-1 flex gap-1 text-xs"><CheckCircle2 className="mt-0.5 size-3 shrink-0 text-emerald-600" />{fact}</p>)}</div>)}</div>{message && <p className="text-xs font-semibold text-rose-700">{message}</p>}<DialogFooter><Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancelar</Button><Button onClick={execute} disabled={pending}>{pending ? "Unificando..." : "Unificar"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

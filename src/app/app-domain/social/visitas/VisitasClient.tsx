"use client";

import { useState } from "react";
import { Eye, Search } from "lucide-react";
import { SocialOperationalList } from "../OperationalList";
import { OPERATIONAL_PAGE_SIZE as PAGE_SIZE } from "@/lib/operational-tables";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type VisitRow = { id: string; date: string; familyName: string; address: string; professionalName: string; objective: string; status: string };

export function VisitasClient({ rows }: { rows: VisitRow[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<VisitRow | null>(null);
  const statuses = Array.from(new Set(rows.map((row) => row.status))).sort();
  const term = search.trim().toLocaleLowerCase("pt-BR");
  const filtered = rows.filter((row) => (!term || [row.familyName, row.address, row.professionalName, row.objective].some((value) => value.toLocaleLowerCase("pt-BR").includes(term))) && (!status || row.status === status));
  const activePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  const visible = filtered.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);

  return <>
    <SocialOperationalList id="visitas" page={activePage} total={filtered.length} onPageChange={setPage}
      columns={[["family", "Família", 200, 110, "identifier"], ["address", "Local", 240, 120], ["professional", "Técnico", 180, 100], ["date", "Data", 110, 90], ["status", "Situação", 130, 90, "status"], ["actions", "Ações", 64, 64, "actions"]]}
      rows={visible.map((row) => ({ id: row.id, label: row.familyName, values: { family: row.familyName, address: row.address, professional: row.professionalName, date: new Date(row.date).toLocaleDateString("pt-BR"), status: row.status }, actions: <Button variant="ghost" size="icon" className="size-7" onClick={() => setDetail(row)} aria-label={`Abrir visita de ${row.familyName}`}><Eye className="size-3.5" /></Button> }))}
      toolbar={<div className="flex w-full min-w-0 gap-2"><label className="relative min-w-0 flex-1"><span className="sr-only">Buscar visitas</span><Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar família, local ou técnico..." className="h-7 w-full rounded border border-slate-200 pl-8 pr-2 text-sm outline-none focus:ring-2 focus:ring-teal-600" /></label><select aria-label="Situação da visita" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="h-7 min-w-0 rounded border border-slate-200 px-2 text-sm"><option value="">Todos os status</option>{statuses.map((value) => <option key={value}>{value}</option>)}</select></div>}
    />
    <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}><DialogContent><DialogHeader><DialogTitle>Detalhes da visita</DialogTitle><DialogDescription>{detail?.familyName} · {detail?.address}</DialogDescription></DialogHeader><div className="whitespace-pre-wrap break-words text-sm text-slate-700">{detail?.objective || "Sem objetivo informado."}</div><DialogFooter><Button onClick={() => setDetail(null)}>Fechar</Button></DialogFooter></DialogContent></Dialog>
  </>;
}


"use client";

import { useState } from "react";
import { Eye, Search } from "lucide-react";
import { SocialOperationalList } from "../OperationalList";
import { OPERATIONAL_PAGE_SIZE as PAGE_SIZE } from "@/lib/operational-tables";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type AttendanceRow = {
  id: string;
  date: string;
  familyName: string;
  personName: string | null;
  type: string;
  unitName: string;
  professionalName: string | null;
  description: string;
  secrecyLevel: string;
};


export function AtendimentosClient({ rows }: { rows: AttendanceRow[] }) {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<AttendanceRow | null>(null);
  const types = Array.from(new Set(rows.map((row) => row.type))).sort();
  const term = search.trim().toLocaleLowerCase("pt-BR");
  const filtered = rows.filter((row) =>
    (!term || [row.familyName, row.personName, row.type, row.unitName, row.professionalName].some((value) => value?.toLocaleLowerCase("pt-BR").includes(term)))
    && (!type || row.type === type)
  );
  const activePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  const visible = filtered.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);

  return <>
    <SocialOperationalList id="atendimentos" page={activePage} total={filtered.length} onPageChange={setPage}
      columns={[["date", "Data", 140, 110], ["subject", "Usuário/família", 200, 110, "identifier"], ["type", "Tipo", 130, 80], ["unit", "Unidade", 160, 90], ["professional", "Técnico", 160, 90], ["status", "Sigilo", 110, 80, "status"], ["actions", "Ações", 64, 64, "actions"]]}
      rows={visible.map((row) => ({ id: row.id, label: row.personName || row.familyName, values: { date: new Date(row.date).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }), subject: row.personName || row.familyName, type: row.type, unit: row.unitName, professional: row.professionalName || "—", status: row.secrecyLevel }, actions: <Button variant="ghost" size="icon" className="size-7" onClick={() => setDetail(row)} aria-label={`Abrir atendimento de ${row.familyName}`}><Eye className="size-3.5" /></Button> }))}
      toolbar={<div className="flex w-full min-w-0 gap-2">
        <label className="relative min-w-0 flex-1"><span className="sr-only">Buscar atendimentos</span><Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar família, unidade ou técnico..." className="h-7 w-full rounded border border-slate-200 pl-8 pr-2 text-sm outline-none focus:ring-2 focus:ring-emerald-600" /></label>
        <select aria-label="Tipo de atendimento" value={type} onChange={(event) => { setType(event.target.value); setPage(1); }} className="h-7 min-w-0 rounded border border-slate-200 px-2 text-sm"><option value="">Todos os tipos</option>{types.map((value) => <option key={value}>{value}</option>)}</select>
      </div>}
    />
    <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}>
      <DialogContent><DialogHeader><DialogTitle>{detail?.type}</DialogTitle><DialogDescription>{detail?.familyName} · {detail?.unitName}</DialogDescription></DialogHeader><div className="whitespace-pre-wrap break-words text-sm text-slate-700">{detail?.description || "Sem relato."}</div><DialogFooter><Button onClick={() => setDetail(null)}>Fechar</Button></DialogFooter></DialogContent>
    </Dialog>
  </>;
}


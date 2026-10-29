"use client";

import { useDeferredValue, useState } from "react";
import { Eye } from "lucide-react";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE as PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Activity = { id: string; nome: string; modalidade: string; publicoAlvo: string | null; startsAt: string; endsAt: string | null; status: string; active: boolean; space: { nome: string; tipo: string; asset: { nome: string; patrimonio: string; realEstate: { inscricao: string | null; endereco: string } | null } | null; realEstate: { inscricao: string | null; endereco: string } | null } | null; instructorName: string | null; agentName: string | null };
const columns: OperationalColumn[] = [
  { key: "nome", label: "Identificação", type: "identifier", initialWidth: 260, minWidth: 120, maxWidth: 650, resizable: true, sortable: false, details: "overflow" },
  { key: "categoria", label: "Categoria", type: "text", initialWidth: 150, minWidth: 90, maxWidth: 400, resizable: true, sortable: false, details: "overflow" },
  { key: "responsavel", label: "Responsável", type: "text", initialWidth: 180, minWidth: 110, maxWidth: 450, resizable: true, sortable: false, details: "overflow" },
  { key: "data", label: "Data", type: "text", initialWidth: 110, minWidth: 95, maxWidth: 200, resizable: true, sortable: false, details: "overflow" },
  { key: "status", label: "Situação", type: "status", initialWidth: 120, minWidth: 85, maxWidth: 300, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 65, minWidth: 50, maxWidth: 80, resizable: false, sortable: false, details: "none" },
];

export default function AtividadesEsporteLazerClient({ activities }: { activities: Activity[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<Activity | null>(null);
  const term = useDeferredValue(search.trim().toLocaleLowerCase("pt-BR"));
  const statuses = Array.from(new Set(activities.map((activity) => activity.active ? activity.status : "Inativa"))).sort();
  const filtered = activities.filter((activity) => {
    const shownStatus = activity.active ? activity.status : "Inativa";
    return (!term || [activity.nome, activity.modalidade, activity.publicoAlvo ?? "", activity.space?.nome ?? "", activity.instructorName ?? "", activity.agentName ?? ""].some((value) => value.toLocaleLowerCase("pt-BR").includes(term))) && (!status || shownStatus === status);
  });
  const activePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  const visible = filtered.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);

  return <>
    <OperationalListFrame label="Atividades" toolbar={<><input aria-label="Buscar atividades" className={styles.searchInput} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar atividade, modalidade ou responsável…" /><select aria-label="Situação da atividade" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">Todos os status</option>{statuses.map((value) => <option key={value}>{value}</option>)}</select></>} pagination={<OperationalPagination page={activePage} total={filtered.length} onPageChange={setPage} />}>
      <OperationalTable columns={columns} preferenceId="cultura.atividades" caption="Atividades de esporte e lazer" emptyMessage="Nenhuma atividade encontrada." rows={visible.map((activity) => ({ id: activity.id, label: activity.nome, values: { nome: activity.nome, categoria: activity.modalidade, responsavel: activity.instructorName ?? activity.agentName ?? "—", data: new Date(activity.startsAt).toLocaleDateString("pt-BR"), status: activity.active ? activity.status : "Inativa" }, actions: <button type="button" className={styles.iconButton} aria-label={`Ver detalhes de ${activity.nome}`} onClick={() => setDetail(activity)}><Eye /></button> }))} />
    </OperationalListFrame>
    <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}><DialogContent><DialogHeader><DialogTitle>{detail?.nome}</DialogTitle><DialogDescription>{detail?.modalidade} · {detail?.status}</DialogDescription></DialogHeader>{detail && <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-xs font-semibold text-slate-500">Público-alvo</dt><dd>{detail.publicoAlvo || "-"}</dd></div><div><dt className="text-xs font-semibold text-slate-500">Período</dt><dd>{new Date(detail.startsAt).toLocaleDateString("pt-BR")}{detail.endsAt ? " a " + new Date(detail.endsAt).toLocaleDateString("pt-BR") : ""}</dd></div><div><dt className="text-xs font-semibold text-slate-500">Espaço</dt><dd>{detail.space?.nome || "-"}</dd></div><div><dt className="text-xs font-semibold text-slate-500">Responsáveis</dt><dd>{[detail.instructorName, detail.agentName].filter(Boolean).join(" · ") || "-"}</dd></div></dl>}<DialogFooter><Button onClick={() => setDetail(null)}>Fechar</Button></DialogFooter></DialogContent></Dialog>
  </>;
}

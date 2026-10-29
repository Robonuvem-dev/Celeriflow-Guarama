"use client";

import { useState } from "react";
import { Eye, Pencil, Plus, Settings } from "lucide-react";
import { format } from "date-fns";
import { OperationalTable, OperationalPagination, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import { OperationalListFrame, OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";

type Sessao = {
  id: string; numero: number; tipo: string; data: Date; local: string | null; status: string; quorum: number | null;
  proposicoes: { numero: string; tipo: string; ementa: string; status: string }[];
  atas: { numero: string; status: string; dataAprovacao: Date | null }[];
};
const column = (key: string, label: string, initialWidth: number, minWidth: number, type: OperationalColumn["type"] = "text"): OperationalColumn => ({ key, label, initialWidth, minWidth, maxWidth: type === "actions" ? 170 : 800, type, resizable: type !== "actions", sortable: false, details: type === "actions" ? "none" : "overflow" });
const columns = {
  sessoes: [column("numero", "Número", 90, 70, "identifier"), column("tipo", "Tipo", 140, 90), column("data", "Data e hora", 165, 135), column("local", "Local", 180, 100), column("quorum", "Quórum", 100, 80), column("status", "Status", 130, 90, "status"), column("actions", "Ações", 100, 90, "actions")],
  pautas: [column("sessao", "Sessão", 90, 70), column("tipoSessao", "Tipo de sessão", 140, 95), column("data", "Data e hora", 165, 135), column("numero", "Matéria", 100, 75, "identifier"), column("tipo", "Tipo de matéria", 140, 100), column("ementa", "Ementa", 330, 120), column("status", "Situação", 130, 85, "status")],
  atas: [column("numero", "Ata", 120, 85, "identifier"), column("sessao", "Sessão", 90, 70), column("tipoSessao", "Tipo de sessão", 150, 100), column("data", "Data da sessão", 130, 105), column("aprovacao", "Aprovação", 130, 100), column("status", "Situação", 120, 85, "status"), column("actions", "Ações", 80, 72, "actions")],
};
export default function SessoesClient({ sessoes }: { sessoes: Sessao[] }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [activeTab, setActiveTab] = useState<keyof typeof columns>("sessoes");
  const [page, setPage] = useState(1);
  const filtered = sessoes.filter((session) => (session.numero.toString().includes(searchTerm) || session.tipo.toLowerCase().includes(searchTerm.toLowerCase())) && (statusFilter === "Todos" || session.status === statusFilter));
  const rows: OperationalRow[] = activeTab === "pautas" ? filtered.flatMap((session) => session.proposicoes.map((prop, index) => ({ id: `${session.id}:${index}`, label: `${prop.tipo} ${prop.numero} — sessão ${session.numero}`, values: { sessao: `${session.numero}ª`, tipoSessao: session.tipo, data: format(new Date(session.data), "dd/MM/yyyy HH:mm"), numero: prop.numero, tipo: prop.tipo, ementa: prop.ementa, status: prop.status } })))
    : activeTab === "atas" ? filtered.flatMap((session) => session.atas.map((ata, index) => ({ id: `${session.id}:${index}`, label: ata.numero, values: { numero: ata.numero, sessao: `${session.numero}ª`, tipoSessao: session.tipo, data: format(new Date(session.data), "dd/MM/yyyy"), aprovacao: ata.dataAprovacao ? format(new Date(ata.dataAprovacao), "dd/MM/yyyy") : "—", status: ata.status }, actions: <div className={styles.rowActions}><button type="button" className={styles.iconButton} aria-label={`Visualizar ata ${ata.numero}`}><Eye /></button><button type="button" className={styles.iconButton} aria-label={`Editar ata ${ata.numero}`}><Pencil /></button></div> })))
    : filtered.map((session) => ({ id: session.id, label: `${session.numero}ª Sessão ${session.tipo}`, values: { numero: `${session.numero}ª`, tipo: session.tipo, data: format(new Date(session.data), "dd/MM/yyyy HH:mm"), local: session.local || "Plenário", quorum: session.quorum === null ? "—" : String(session.quorum), status: session.status }, actions: <button type="button" className={styles.iconButton} aria-label={`Gerenciar ${session.numero}ª sessão`}><Settings /></button> }));
  const activePage = Math.min(page, Math.max(1, Math.ceil(rows.length / OPERATIONAL_PAGE_SIZE)));
  return <OperationalListFrame label="Sessões plenárias" actions={<button type="button" className={styles.newButton}><Plus />Nova Sessão</button>}
    toolbar={<><input aria-label="Buscar sessão" className={styles.searchInput} placeholder="Buscar sessão…" value={searchTerm} onChange={(event) => { setSearchTerm(event.target.value); setPage(1); }} /><select aria-label="Visualização de sessões" value={activeTab} onChange={(event) => { setActiveTab(event.target.value as keyof typeof columns); setPage(1); }}><option value="sessoes">Sessões</option><option value="pautas">Pautas (Ordem do Dia)</option><option value="atas">Atas</option></select><OperationalFilters activeCount={Number(statusFilter !== "Todos")}><label>Situação da sessão<select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}><option>Todos</option>{Array.from(new Set(sessoes.map((item) => item.status))).map((item) => <option key={item}>{item}</option>)}</select></label><button type="button" onClick={() => { setStatusFilter("Todos"); setPage(1); }}>Limpar filtros</button></OperationalFilters></>}
    pagination={<OperationalPagination page={activePage} total={rows.length} onPageChange={setPage} />}>
    <OperationalTable columns={columns[activeTab]} rows={rows.slice((activePage - 1) * OPERATIONAL_PAGE_SIZE, activePage * OPERATIONAL_PAGE_SIZE)} preferenceId={`camara.sessoes.${activeTab}`} caption={`Sessões plenárias — ${activeTab}`} emptyMessage={activeTab === "pautas" ? "Nenhuma matéria pautada nas sessões filtradas." : activeTab === "atas" ? "Nenhuma ata registrada nas sessões filtradas." : "Nenhuma sessão encontrada."} />
  </OperationalListFrame>;
}

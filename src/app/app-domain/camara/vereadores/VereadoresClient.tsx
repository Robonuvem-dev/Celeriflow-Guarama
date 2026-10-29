"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { OperationalTable, OperationalPagination, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import { OperationalListFrame, OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";

type Vereador = {
  id: string; nomeCompleto: string; nomeParlamentar: string; partido: string | null;
  email: string | null; telefone: string | null; status: string;
  gabinete: { sala: string; andar: string | null; telefone: string | null; ramal: string | null } | null;
  cargosMesa: { cargo: string; status: string }[]; legislatura: { numero: number };
};
const column = (key: string, label: string, initialWidth: number, minWidth: number, type: OperationalColumn["type"] = "text"): OperationalColumn => ({ key, label, initialWidth, minWidth, maxWidth: type === "actions" ? 100 : 640, type, resizable: type !== "actions", sortable: false, details: type === "actions" ? "none" : "overflow" });
const columns = {
  vereadores: [column("nome", "Nome parlamentar", 210, 120, "identifier"), column("completo", "Nome completo", 210, 110), column("partido", "Partido", 90, 65), column("legislatura", "Legislatura", 90, 80), column("telefone", "Telefone", 130, 90), column("email", "E-mail", 180, 90), column("status", "Status", 120, 85, "status"), column("actions", "Ações", 80, 65, "actions")],
  mesa: [column("cargo", "Cargo na mesa", 220, 120), column("nome", "Vereador", 260, 120, "identifier"), column("partido", "Partido", 100, 65), column("actions", "Ações", 80, 65, "actions")],
  gabinetes: [column("nome", "Vereador", 230, 120, "identifier"), column("sala", "Sala", 110, 75), column("andar", "Andar", 110, 70), column("telefone", "Telefone do gabinete", 170, 140), column("ramal", "Ramal", 90, 65), column("actions", "Ações", 80, 65, "actions")],
};

export default function VereadoresClient({ vereadores }: { vereadores: Vereador[] }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [activeTab, setActiveTab] = useState<keyof typeof columns>("vereadores");
  const [page, setPage] = useState(1);
  const filtered = vereadores.filter((ver) => (ver.nomeParlamentar.toLowerCase().includes(searchTerm.toLowerCase()) || !!ver.partido?.toLowerCase().includes(searchTerm.toLowerCase())) && (statusFilter === "Todos" || ver.status === statusFilter));
  const rows: OperationalRow[] = activeTab === "mesa"
    ? filtered.flatMap((ver) => ver.cargosMesa.flatMap((cargo, index) => cargo.status === "Ativo" ? [{ id: `${ver.id}:${index}`, label: ver.nomeParlamentar, values: { cargo: cargo.cargo, nome: ver.nomeParlamentar, partido: ver.partido || "—" }, actions: <button type="button" className={styles.iconButton} aria-label={`Alterar cargo de ${ver.nomeParlamentar}`}><Pencil /></button> }] : []))
    : filtered.map((ver): OperationalRow => {
      const values: Record<string, string> = activeTab === "gabinetes"
        ? { nome: ver.nomeParlamentar, sala: ver.gabinete?.sala || "Não alocado", andar: ver.gabinete?.andar || "—", telefone: ver.gabinete?.telefone || "—", ramal: ver.gabinete?.ramal || "—" }
        : { nome: ver.nomeParlamentar, completo: ver.nomeCompleto, partido: ver.partido || "—", legislatura: `${ver.legislatura.numero}ª`, telefone: ver.telefone || "—", email: ver.email || "—", status: ver.status };
      return { id: ver.id, label: ver.nomeParlamentar, values, actions: <button type="button" className={styles.iconButton} aria-label={`${activeTab === "gabinetes" && !ver.gabinete ? "Alocar gabinete de" : "Editar"} ${ver.nomeParlamentar}`}><Pencil /></button> };
    });
  const activePage = Math.min(page, Math.max(1, Math.ceil(rows.length / OPERATIONAL_PAGE_SIZE)));
  return <OperationalListFrame label="Parlamentares" actions={<button type="button" className={styles.newButton}><Plus />Novo Vereador</button>}
    toolbar={<><input aria-label="Buscar parlamentar" className={styles.searchInput} placeholder="Buscar parlamentar…" value={searchTerm} onChange={(event) => { setSearchTerm(event.target.value); setPage(1); }} /><select aria-label="Visualização de parlamentares" value={activeTab} onChange={(event) => { setActiveTab(event.target.value as keyof typeof columns); setPage(1); }}><option value="vereadores">Vereadores</option><option value="mesa">Mesa Diretora</option><option value="gabinetes">Gabinetes</option></select><OperationalFilters activeCount={statusFilter === "Todos" ? 0 : 1}><label>Situação<select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}><option>Todos</option>{Array.from(new Set(vereadores.map((item) => item.status))).map((item) => <option key={item}>{item}</option>)}</select></label><button type="button" onClick={() => { setStatusFilter("Todos"); setPage(1); }}>Limpar filtros</button></OperationalFilters></>}
    pagination={<OperationalPagination page={activePage} total={rows.length} onPageChange={setPage} />}>
    <OperationalTable columns={columns[activeTab]} rows={rows.slice((activePage - 1) * OPERATIONAL_PAGE_SIZE, activePage * OPERATIONAL_PAGE_SIZE)} preferenceId={`camara.parlamentares.${activeTab}`} caption={`Parlamentares — ${activeTab}`} emptyMessage="Nenhum parlamentar encontrado nesta visualização." />
  </OperationalListFrame>;
}

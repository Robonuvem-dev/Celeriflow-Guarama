"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Pencil, Plus } from "lucide-react";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";

type Legislatura = { id: string; numero: number; inicio: Date; fim: Date; status: string; descricao: string | null; _count: { vereadores: number } };
const columns: OperationalColumn[] = [
  { key: "numero", label: "Número", type: "identifier", initialWidth: 180, minWidth: 110, maxWidth: 1200, resizable: true, sortable: false, details: "overflow" },
  { key: "periodo", label: "Período", type: "text", initialWidth: 180, minWidth: 100, maxWidth: 900, resizable: true, sortable: false, details: "overflow" },
  { key: "vereadores", label: "Vereadores", type: "text", initialWidth: 100, minWidth: 90, maxWidth: 200, resizable: true, sortable: false, details: "overflow", align: "right" },
  { key: "status", label: "Status", type: "status", initialWidth: 150, minWidth: 90, maxWidth: 300, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 80, minWidth: 65, maxWidth: 100, resizable: false, sortable: false, details: "none" },
];
export default function LegislaturasClient({ legislaturas }: { legislaturas: Legislatura[] }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [page, setPage] = useState(1);
  const filtered = legislaturas.filter((leg) => (leg.numero.toString().includes(searchTerm) || !!leg.descricao?.toLowerCase().includes(searchTerm.toLowerCase())) && (statusFilter === "Todos" || leg.status === statusFilter));
  const activePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / OPERATIONAL_PAGE_SIZE)));
  return <OperationalListFrame label="Legislaturas" actions={<button type="button" className={styles.newButton}><Plus />Nova Legislatura</button>}
    toolbar={<><input aria-label="Buscar legislatura" className={styles.searchInput} placeholder="Buscar legislatura…" value={searchTerm} onChange={(event) => { setSearchTerm(event.target.value); setPage(1); }} /><select aria-label="Situação da legislatura" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}><option>Todos</option>{Array.from(new Set(legislaturas.map((item) => item.status))).map((item) => <option key={item}>{item}</option>)}</select></>}
    pagination={<OperationalPagination page={activePage} total={filtered.length} onPageChange={setPage} />}>
    <OperationalTable preferenceId="camara.legislaturas" columns={columns} caption="Legislaturas" emptyMessage="Nenhuma legislatura encontrada." rows={filtered.slice((activePage - 1) * OPERATIONAL_PAGE_SIZE, activePage * OPERATIONAL_PAGE_SIZE).map((leg) => ({ id: leg.id, label: `${leg.numero}ª Legislatura`, values: { numero: `${leg.numero}ª Legislatura`, periodo: `${format(new Date(leg.inicio), "yyyy")} – ${format(new Date(leg.fim), "yyyy")}`, vereadores: String(leg._count.vereadores), status: leg.status }, actions: <button type="button" className={styles.iconButton} aria-label={`Editar ${leg.numero}ª legislatura`}><Pencil /></button> }))} />
  </OperationalListFrame>;
}

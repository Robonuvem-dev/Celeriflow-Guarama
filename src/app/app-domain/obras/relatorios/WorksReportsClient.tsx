"use client";

import { useState, type ReactNode } from "react";
import { OperationalListFrame, OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import { operationalColumns } from "../../patrimonio/_components/operational-columns";
import styles from "@/components/app-ui/operational/operational.module.css";

const workColumns = operationalColumns([["status", "Situação", 500, 180, "status"], ["quantity", "Quantidade", 200, 130, "text", "right"]]);
const serviceColumns = operationalColumns([["status", "Situação", 250, 140, "status"], ["type", "Tipo de serviço", 400, 180], ["quantity", "Quantidade", 200, 130, "text", "right"]]);

export function WorksReportsClient({ works, services, summary }: { works: OperationalRow[]; services: OperationalRow[]; summary: ReactNode }) {
  const [view, setView] = useState("works");
  const [page, setPage] = useState(1);
  const rows = view === "works" ? works : services;
  const activePage = Math.min(page, Math.max(1, Math.ceil(rows.length / OPERATIONAL_PAGE_SIZE)));
  return <OperationalListFrame actions={<OperationalFilters label="Resumo operacional">{summary}</OperationalFilters>}
    toolbar={<nav aria-label="Consultas de Obras" className="flex items-center gap-2"><button type="button" aria-pressed={view === "works"} className={styles.dialogButton} onClick={() => { setView("works"); setPage(1); }}>Obras por situação</button><button type="button" aria-pressed={view === "services"} className={styles.dialogButton} onClick={() => { setView("services"); setPage(1); }}>Serviços por situação e tipo</button></nav>}
    pagination={<OperationalPagination page={activePage} total={rows.length} onPageChange={setPage} />}>
    <OperationalTable key={view} preferenceId={`obras-relatorios-${view}`} caption={view === "works" ? "Obras por situação" : "Serviços ativos por situação e tipo"} columns={view === "works" ? workColumns : serviceColumns} rows={rows.slice((activePage - 1) * OPERATIONAL_PAGE_SIZE, activePage * OPERATIONAL_PAGE_SIZE)} emptyMessage={view === "works" ? "Nenhuma obra ativa encontrada." : "Nenhum serviço ativo encontrado."} />
  </OperationalListFrame>;
}

import Link from "next/link";
import { Plus } from "lucide-react";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { biddingStatusLabel } from "@/lib/compras/bidding-workflow";
import { LicitacaoRowActions } from "./LicitacaoRowActions";
import { DispensaRowActions } from "../dispensas/DispensaRowActions";
import { db } from "@/db/client";
import { loadProcurementCompetitionRows } from "@/db/repositories/procurement/direct-contracting";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalLinkPagination, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { ComprasRouteFilters } from "../_components/ComprasRouteFilters";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import { comprasColumn } from "../_components/columns";
import styles from "@/components/app-ui/operational/operational.module.css";

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
type SearchValues = { q?: string | string[]; type?: string | string[]; status?: string | string[]; page?: string | string[] };
function valueOf(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }
const columns = [
  comprasColumn("number", "Certame", 110, 160, "identifier"), comprasColumn("process", "Processo", 100, 140),
  comprasColumn("modality", "Modalidade", 120, 170), comprasColumn("object", "Objeto", 160, 320),
  comprasColumn("session", "Sessão / prazo", 140, 170), comprasColumn("status", "Situação", 110, 150, "status"),
  comprasColumn("actions", "Ações", 100, 120, "actions"),
];

export default async function LicitacoesPage({ searchParams }: { searchParams: Promise<SearchValues> }) {
  const context = await getTenantContextForModule("COMPRAS");
  const filters = await searchParams;
  const query = valueOf(filters.q).trim().toLocaleLowerCase("pt-BR");
  const typeFilter = valueOf(filters.type).trim();
  const statusFilter = valueOf(filters.status).trim();
  const requestedPage = Number(valueOf(filters.page));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const { biddings, directContractings } = await loadProcurementCompetitionRows(context.database ?? db);
  const rows = [
    ...biddings.map((bidding) => ({ kind: "BIDDING" as const, id: bidding.id, number: bidding.number, modality: bidding.modality, status: bidding.status, sessionDate: bidding.sessionDate, createdAt: bidding.createdAt, processNumber: bidding.process.number, object: bidding.process.object })),
    ...directContractings.map((contracting) => ({ kind: "DIRECT" as const, id: contracting.id, number: "Contratação direta", modality: contracting.type, status: contracting.status, sessionDate: null, createdAt: contracting.createdAt, processNumber: contracting.process.number, object: contracting.process.object })),
  ].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || `${left.kind}-${left.id}`.localeCompare(`${right.kind}-${right.id}`));
  const statuses = [...new Set(rows.map((row) => row.status))].sort((left, right) => left.localeCompare(right, "pt-BR"));
  const filteredRows = rows.filter((row) => (!typeFilter || row.kind === typeFilter) && (!statusFilter || row.status === statusFilter) && (!query || [row.number, row.processNumber, row.modality, row.object].join(" ").toLocaleLowerCase("pt-BR").includes(query)));
  const activePage = Math.min(page, Math.max(1, Math.ceil(filteredRows.length / OPERATIONAL_PAGE_SIZE)));
  const visibleRows = filteredRows.slice((activePage - 1) * OPERATIONAL_PAGE_SIZE, activePage * OPERATIONAL_PAGE_SIZE);

  return <OperationalListFrame label="Licitações e dispensas"
    actions={<><Link href="/compras/dispensas/novo" className={styles.filterButton}>Nova dispensa</Link><Link href="/compras/licitacoes/novo" className={styles.newButton} aria-label="Nova licitação" title="Nova licitação"><Plus /><span className={styles.newLabel}>Nova licitação</span></Link></>}
    toolbar={<ComprasRouteFilters key={`${query}:${typeFilter}:${statusFilter}`} pathname="/compras/licitacoes" query={query} placeholder="Número, processo, modalidade ou objeto" filters={[
      { name: "type", label: "Tipo", value: typeFilter, options: [{ value: "BIDDING", label: "Licitações" }, { value: "DIRECT", label: "Dispensas e inexigibilidades" }] },
      { name: "status", label: "Situação", value: statusFilter, options: statuses.map((status) => ({ value: status, label: biddingStatusLabel(status) })) },
    ]} />}
    pagination={<OperationalLinkPagination page={activePage} total={filteredRows.length} pathname="/compras/licitacoes" values={{ q: query, type: typeFilter, status: statusFilter }} />}>
    <OperationalTable columns={columns} preferenceId="compras-licitacoes" caption="Licitações e dispensas" emptyMessage="Nenhum certame corresponde aos filtros selecionados."
      rows={visibleRows.map((row) => ({ id: `${row.kind}-${row.id}`, label: `${row.number} · ${row.processNumber}`, values: { number: row.number, process: row.processNumber, modality: row.modality, object: row.object, session: row.sessionDate ? dateTime.format(row.sessionDate) : "Sem sessão", status: row.kind === "BIDDING" ? biddingStatusLabel(row.status) : row.status }, actions: row.kind === "BIDDING" ? <LicitacaoRowActions id={row.id} /> : <DispensaRowActions id={row.id} /> }))} />
  </OperationalListFrame>;
}

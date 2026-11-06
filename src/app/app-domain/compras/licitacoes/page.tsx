import Link from "next/link";
import { Plus, BarChart3 } from "lucide-react";
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
type SearchValues = {
  q?: string | string[];
  type?: string | string[];
  status?: string | string[];
  modality?: string | string[];
  hasWon?: string | string[];
  material?: string | string[];
  startDate?: string | string[];
  endDate?: string | string[];
  page?: string | string[];
};
function valueOf(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }

const columns = [
  comprasColumn("number", "Certame", 110, 160, "identifier"),
  comprasColumn("process", "Processo", 100, 140),
  comprasColumn("modality", "Modalidade", 120, 170),
  comprasColumn("suppliers", "Fornecedor", 140, 220),
  comprasColumn("materials", "Materiais", 130, 200),
  comprasColumn("object", "Objeto", 160, 320),
  comprasColumn("session", "Sessão / prazo", 130, 160),
  comprasColumn("status", "Situação", 110, 140, "status"),
  comprasColumn("actions", "Ações", 100, 120, "actions"),
];

export default async function LicitacoesPage({ searchParams }: { searchParams: Promise<SearchValues> }) {
  const context = await getTenantContextForModule("COMPRAS");
  const filters = await searchParams;
  const query = valueOf(filters.q).trim().toLocaleLowerCase("pt-BR");
  const typeFilter = valueOf(filters.type).trim();
  const statusFilter = valueOf(filters.status).trim();
  const modalityFilter = valueOf(filters.modality).trim();
  const hasWonFilter = valueOf(filters.hasWon).trim();
  const materialFilter = valueOf(filters.material).trim().toLocaleLowerCase("pt-BR");
  const startDateFilter = valueOf(filters.startDate).trim();
  const endDateFilter = valueOf(filters.endDate).trim();
  const requestedPage = Number(valueOf(filters.page));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const { biddings, directContractings } = await loadProcurementCompetitionRows(context.database ?? db);
  const rows = [
    ...biddings.map((bidding) => ({
      kind: "BIDDING" as const,
      id: bidding.id,
      number: bidding.number,
      modality: bidding.modality,
      status: bidding.status,
      sessionDate: bidding.sessionDate,
      createdAt: bidding.createdAt,
      processNumber: bidding.process.number,
      object: bidding.process.object,
      materials: bidding.materials,
      suppliers: bidding.suppliers,
      hasWon: bidding.hasWon,
    })),
    ...directContractings.map((contracting) => ({
      kind: "DIRECT" as const,
      id: contracting.id,
      number: "Contratação direta",
      modality: contracting.type,
      status: contracting.status,
      sessionDate: null,
      createdAt: contracting.createdAt,
      processNumber: contracting.process.number,
      object: contracting.process.object,
      materials: contracting.materials,
      suppliers: contracting.suppliers,
      hasWon: contracting.hasWon,
    })),
  ].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || `${left.kind}-${left.id}`.localeCompare(`${right.kind}-${right.id}`));

  const statuses = [...new Set(rows.map((row) => row.status))].sort((left, right) => left.localeCompare(right, "pt-BR"));
  const modalities = [...new Set(rows.map((row) => row.modality))].sort((left, right) => left.localeCompare(right, "pt-BR"));

  const filteredRows = rows.filter((row) => {
    if (typeFilter && row.kind !== typeFilter) return false;
    if (statusFilter && row.status !== statusFilter) return false;
    if (modalityFilter && row.modality !== modalityFilter) return false;
    if (hasWonFilter === "SIM" && !row.hasWon) return false;
    if (hasWonFilter === "NAO" && row.hasWon) return false;
    if (materialFilter && !row.materials.some((m) => m.toLocaleLowerCase("pt-BR").includes(materialFilter))) return false;

    if (startDateFilter) {
      const refDate = row.sessionDate ?? row.createdAt;
      const start = new Date(`${startDateFilter}T00:00:00`);
      if (refDate < start) return false;
    }
    if (endDateFilter) {
      const refDate = row.sessionDate ?? row.createdAt;
      const end = new Date(`${endDateFilter}T23:59:59`);
      if (refDate > end) return false;
    }

    if (query) {
      const searchable = [
        row.number,
        row.processNumber,
        row.modality,
        row.object,
        ...row.materials,
        ...row.suppliers.map((s) => s.name),
      ].join(" ").toLocaleLowerCase("pt-BR");
      if (!searchable.includes(query)) return false;
    }

    return true;
  });

  const activePage = Math.min(page, Math.max(1, Math.ceil(filteredRows.length / OPERATIONAL_PAGE_SIZE)));
  const visibleRows = filteredRows.slice((activePage - 1) * OPERATIONAL_PAGE_SIZE, activePage * OPERATIONAL_PAGE_SIZE);

  return (
    <OperationalListFrame
      label="Licitações e dispensas"
      actions={
        <>
          <Link href="/compras/licitacoes/relatorios" className={styles.filterButton} title="Relatório de Licitações">
            <BarChart3 className="h-4 w-4 mr-1 inline" /> Relatórios
          </Link>
          <Link href="/compras/dispensas/novo" className={styles.filterButton}>
            Nova dispensa
          </Link>
          <Link href="/compras/licitacoes/novo" className={styles.newButton} aria-label="Nova licitação" title="Nova licitação">
            <Plus />
            <span className={styles.newLabel}>Nova licitação</span>
          </Link>
        </>
      }
      toolbar={
        <ComprasRouteFilters
          key={`${query}:${typeFilter}:${statusFilter}:${modalityFilter}:${hasWonFilter}:${materialFilter}:${startDateFilter}:${endDateFilter}`}
          pathname="/compras/licitacoes"
          query={query}
          placeholder="Número, processo, modalidade, material ou fornecedor"
          filters={[
            {
              name: "type",
              label: "Tipo",
              value: typeFilter,
              options: [
                { value: "BIDDING", label: "Licitações" },
                { value: "DIRECT", label: "Dispensas e inexigibilidades" },
              ],
            },
            {
              name: "modality",
              label: "Modalidade",
              value: modalityFilter,
              options: modalities.map((m) => ({ value: m, label: m })),
            },
            {
              name: "status",
              label: "Situação",
              value: statusFilter,
              options: statuses.map((status) => ({ value: status, label: biddingStatusLabel(status) })),
            },
            {
              name: "hasWon",
              label: "Já venceu licitação?",
              value: hasWonFilter,
              options: [
                { value: "SIM", label: "Sim (Homologado/Vencedor)" },
                { value: "NAO", label: "Não" },
              ],
            },
            {
              name: "startDate",
              label: "Data inicial",
              value: startDateFilter,
              type: "date",
            },
            {
              name: "endDate",
              label: "Data final",
              value: endDateFilter,
              type: "date",
            },
          ]}
        />
      }
      pagination={
        <OperationalLinkPagination
          page={activePage}
          total={filteredRows.length}
          pathname="/compras/licitacoes"
          values={{
            q: query,
            type: typeFilter,
            status: statusFilter,
            modality: modalityFilter,
            hasWon: hasWonFilter,
            material: materialFilter,
            startDate: startDateFilter,
            endDate: endDateFilter,
          }}
        />
      }
    >
      <OperationalTable
        columns={columns}
        preferenceId="compras-licitacoes"
        caption="Licitações e dispensas"
        emptyMessage="Nenhum certame corresponde aos filtros selecionados."
        rows={visibleRows.map((row) => ({
          id: `${row.kind}-${row.id}`,
          label: `${row.number} · ${row.processNumber}`,
          values: {
            number: row.number,
            process: row.processNumber,
            modality: row.modality,
            suppliers: row.suppliers.map((s) => s.name).join(", ") || "-",
            materials: row.materials.join(", ") || "-",
            object: row.object,
            session: row.sessionDate ? dateTime.format(row.sessionDate) : "Sem sessão",
            status: row.kind === "BIDDING" ? biddingStatusLabel(row.status) : row.status,
          },
          cells: {
            number: (
              <Link
                href={row.kind === "BIDDING" ? `/compras/licitacoes/${row.id}` : `/compras/dispensas/${row.id}`}
                className="font-medium text-blue-600 hover:underline"
              >
                {row.number}
              </Link>
            ),
            suppliers:
              row.suppliers.length > 0 ? (
                <div className="flex flex-col gap-0.5 max-w-[200px] truncate" title={row.suppliers.map((s) => s.name).join(", ")}>
                  {row.suppliers.slice(0, 2).map((s) => (
                    <Link
                      key={s.id}
                      href={`/cadastros/fornecedores/${s.id}`}
                      className="text-xs text-blue-600 hover:underline truncate"
                    >
                      {s.name}
                    </Link>
                  ))}
                  {row.suppliers.length > 2 && (
                    <span className="text-[10px] text-muted-foreground">+{row.suppliers.length - 2} fornecedores</span>
                  )}
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">-</span>
              ),
            materials:
              row.materials.length > 0 ? (
                <div className="max-w-[180px] truncate text-xs" title={row.materials.join(", ")}>
                  {row.materials.slice(0, 2).join(", ")}
                  {row.materials.length > 2 && <span className="text-[10px] text-muted-foreground"> +{row.materials.length - 2}</span>}
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">-</span>
              ),
          },
          actions: row.kind === "BIDDING" ? <LicitacaoRowActions id={row.id} /> : <DispensaRowActions id={row.id} />,
        }))}
      />
    </OperationalListFrame>
  );
}

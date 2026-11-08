"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckSquare, Eye, Plus, Calendar, Globe, Building2, Search } from "lucide-react";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalListFrame, OperationalLinkPagination, OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import type { OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import type { ProcessListFilters } from "@/lib/protocols/process-listing-policy";
import { receiveProcess, receiveProcessesBatch } from "../actions";

type Processo = {
  id: string;
  protocolNumber: string;
  status: string;
  createdAt: Date;
  portalOrigin: string | null;
  currentDepartmentId: string | null;
  processType: { name: string };
  subject: { name: string };
  person: { fullName: string } | null;
  company: { corporateName: string } | null;
};

const columns: OperationalColumn[] = [
  { key: "selection", label: "Selecionar", type: "text", initialWidth: 45, minWidth: 40, maxWidth: 65, resizable: false, sortable: false, details: "none", align: "center" },
  ...([
    ["protocol", "Protocolo", 150, 110],
    ["origin", "Origem", 120, 90],
    ["type", "Tipo", 170, 100],
    ["subject", "Assunto", 220, 110],
    ["interested", "Interessado", 200, 110],
    ["date", "Data", 110, 95],
    ["status", "Status", 130, 90],
  ] as [string, string, number, number][]).map(([key, label, initialWidth, minWidth]): OperationalColumn => ({
    key,
    label,
    initialWidth,
    minWidth,
    maxWidth: 650,
    type: key === "status" ? "status" : key === "protocol" ? "identifier" : "text",
    resizable: true,
    sortable: false,
    details: "overflow",
  })),
  { key: "actions", label: "Ação", type: "actions", initialWidth: 72, minWidth: 72, maxWidth: 100, resizable: false, sortable: false, details: "none" },
];

export default function ProcessosClient({
  processos,
  filters,
  total,
  page,
  canReceive,
  currentDepartmentId,
  canCreate,
  returnTo,
}: {
  processos: Processo[];
  filters: ProcessListFilters;
  total: number;
  page: number;
  pageSize: number;
  canReceive: boolean;
  currentDepartmentId: string | null;
  canCreate: boolean;
  returnTo: string;
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const receivableIds = processos
    .filter(processo => canReceive && processo.currentDepartmentId === currentDepartmentId && processo.status === "Aguardando Recebimento")
    .map(processo => processo.id);
  const selectedReceivableIds = selectedIds.filter(id => receivableIds.includes(id));

  function setSelected(processId: string, selected: boolean) {
    setSelectedIds(current => selected ? [...new Set([...current, processId])] : current.filter(id => id !== processId));
  }

  function processHref(processId: string) {
    return `/protocolos/processos/${processId}?returnTo=${encodeURIComponent(returnTo)}`;
  }

  function handleReceive(processId: string) {
    setNotice(null);
    startTransition(async () => {
      const result = await receiveProcess(processId);
      if (result.error) {
        setNotice(result.error);
        return;
      }
      setSelectedIds(current => current.filter(id => id !== processId));
      setNotice("Recebimento registrado com sucesso.");
      router.refresh();
    });
  }

  function handleBatchReceive() {
    if (!selectedReceivableIds.length) return;
    setNotice(null);
    startTransition(async () => {
      const { results } = await receiveProcessesBatch(selectedReceivableIds);
      const failed = results.filter(result => result.error);
      const received = results.length - failed.length;
      setSelectedIds([]);
      setNotice(
        failed.length
          ? `${received} processo(s) recebido(s). ${failed.length} item(ns) com aviso: ${failed.map(item => item.error).join(" ")}`
          : `${received} processo(s) recebido(s) com sucesso.`
      );
      router.refresh();
    });
  }

  const isTodayActive = filters.period === "HOJE";
  const isPortalActive = filters.origin === "PORTAL";
  const isBalcaoActive = filters.origin === "BALCAO";

  return (
    <OperationalListFrame
      label="Protocolos e Processos"
      actions={
        <>
          {canCreate && (
            <Link className={styles.newButton} href={`/protocolos/processos/novo?returnTo=${encodeURIComponent(returnTo)}`}>
              <Plus />
              Novo protocolo
            </Link>
          )}
          {selectedReceivableIds.length > 0 && (
            <button
              type="button"
              disabled={isPending}
              onClick={handleBatchReceive}
              className={styles.dialogButton}
            >
              <CheckSquare />
              Receber selecionados ({selectedReceivableIds.length})
            </button>
          )}
          {notice && (
            <OperationalFilters label="Aviso">
              <p role="status">{notice}</p>
            </OperationalFilters>
          )}
        </>
      }
      toolbar={
        <div className="flex flex-col gap-2 w-full">
          <div className="flex flex-wrap items-center gap-1.5 text-xs pb-1 border-b border-slate-200 dark:border-slate-800">
            <span className="text-slate-500 font-medium mr-1">Filtros rápidos:</span>
            <Link
              href="/protocolos/processos"
              className={`px-2 py-0.5 rounded text-[11px] font-medium border transition ${
                !filters.origin && !filters.period && (!filters.status || filters.status === "ATIVOS")
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 hover:bg-slate-50 border-slate-300"
              }`}
            >
              Todos ativos
            </Link>
            <Link
              href="/protocolos/processos?period=HOJE"
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border transition ${
                isTodayActive
                  ? "bg-blue-600 text-white border-blue-600 font-semibold"
                  : "bg-white text-blue-700 hover:bg-blue-50 border-blue-200"
              }`}
              title="Processos abertos no dia atual"
            >
              <Calendar className="w-3 h-3" />
              Abertos Hoje (19.98)
            </Link>
            <Link
              href="/protocolos/processos?origin=PORTAL"
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border transition ${
                isPortalActive
                  ? "bg-emerald-600 text-white border-emerald-600 font-semibold"
                  : "bg-white text-emerald-700 hover:bg-emerald-50 border-emerald-200"
              }`}
              title="Processos abertos via portal de serviços online"
            >
              <Globe className="w-3 h-3" />
              Portal Online (19.96)
            </Link>
            <Link
              href="/protocolos/processos?origin=BALCAO"
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border transition ${
                isBalcaoActive
                  ? "bg-amber-600 text-white border-amber-600 font-semibold"
                  : "bg-white text-amber-700 hover:bg-amber-50 border-amber-200"
              }`}
              title="Processos abertos via balcão presencial"
            >
              <Building2 className="w-3 h-3" />
              Balcão (19.97)
            </Link>
          </div>

          <form action="/protocolos/processos" method="GET" className={styles.searchForm}>
            <input
              aria-label="Buscar processo"
              name="q"
              defaultValue={filters.q}
              placeholder="Buscar por protocolo, interessado, CPF/CNPJ, tipo ou assunto…"
              className={styles.searchInput}
            />
            <select
              name="origin"
              aria-label="Origem do processo"
              defaultValue={filters.origin || "TODOS"}
              title="Canal de abertura do processo"
            >
              <option value="TODOS">Todas as origens</option>
              <option value="PORTAL">Portal Online</option>
              <option value="BALCAO">Balcão Presencial</option>
            </select>
            <select
              name="period"
              aria-label="Período de abertura"
              defaultValue={filters.period || "TODOS"}
              title="Data de abertura"
            >
              <option value="TODOS">Todas as datas</option>
              <option value="HOJE">Abertos hoje</option>
            </select>
            <select
              name="status"
              aria-label="Status do processo"
              defaultValue={filters.status || "ATIVOS"}
            >
              <option value="ATIVOS">Todos ativos</option>
              <option value="Aguardando Recebimento">Aguardando recebimento</option>
              <option value="Recebido">Recebido</option>
              <option value="Em Analise">Em análise</option>
              <option value="Concluido">Concluído</option>
              <option value="Arquivado">Arquivado</option>
              <option value="Cancelado">Cancelado</option>
            </select>
            <button type="submit" className={styles.filterButton}>
              <Search className="w-3.5 h-3.5 inline mr-1" />
              Pesquisar
            </button>
            <Link className={styles.filterButton} href="/protocolos/processos">
              Limpar
            </Link>
          </form>
        </div>
      }
      pagination={
        <OperationalLinkPagination
          page={page}
          total={total}
          pathname="/protocolos/processos"
          values={{
            q: filters.q,
            status: filters.status,
            origin: filters.origin,
            period: filters.period,
          }}
        />
      }
    >
      <OperationalTable
        columns={columns}
        preferenceId="protocolos.processos"
        caption="Caixa do setor — protocolos e processos"
        emptyMessage="Nenhum protocolo encontrado com os filtros selecionados."
        rows={processos.map(processo => {
          const isPortal = Boolean(processo.portalOrigin && processo.portalOrigin !== "" && processo.portalOrigin !== "BALCAO");
          return {
            id: processo.id,
            label: processo.protocolNumber,
            values: {
              selection: selectedIds.includes(processo.id) ? "Selecionado" : "",
              protocol: processo.protocolNumber,
              origin: isPortal ? "Portal Online" : "Balcão",
              type: processo.processType.name,
              subject: processo.subject.name,
              interested: processo.person?.fullName || processo.company?.corporateName || "Não informado",
              date: new Date(processo.createdAt).toLocaleDateString("pt-BR"),
              status: processo.status,
            },
            cells: {
              selection: receivableIds.includes(processo.id) ? (
                <input
                  aria-label={`Selecionar ${processo.protocolNumber}`}
                  type="checkbox"
                  checked={selectedIds.includes(processo.id)}
                  onChange={event => setSelected(processo.id, event.target.checked)}
                />
              ) : null,
              origin: (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${
                    isPortal ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-700 border border-slate-200"
                  }`}
                >
                  {isPortal ? <Globe className="w-3 h-3 text-emerald-600" /> : <Building2 className="w-3 h-3 text-slate-500" />}
                  {isPortal ? "Portal Online" : "Balcão"}
                </span>
              ),
            },
            actions: (
              <div className={styles.rowActions}>
                <Link
                  className={styles.iconButton}
                  aria-label={`Ver atendimento ${processo.protocolNumber}`}
                  href={processHref(processo.id)}
                  title="Consultar processo e roteiro em árvore"
                >
                  <Eye />
                </Link>
                {receivableIds.includes(processo.id) && (
                  <button
                    type="button"
                    aria-label={`Receber ${processo.protocolNumber}`}
                    disabled={isPending}
                    onClick={() => handleReceive(processo.id)}
                    className={styles.iconButton}
                    title="Receber no setor"
                  >
                    <CheckSquare />
                  </button>
                )}
              </div>
            ),
          };
        })}
      />
    </OperationalListFrame>
  );
}

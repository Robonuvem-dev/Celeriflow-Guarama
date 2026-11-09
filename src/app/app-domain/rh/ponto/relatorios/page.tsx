import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { generatePontoReport, type PontoReportFilter } from "@/lib/rh/ponto-reports";
import { readEmployeeOptions } from "@/db/repositories/personnel-pages/records";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { rhColumn } from "../../_components/operational-columns";
import { PontoNav } from "../PontoNav";
import { RelatoriosPontoClient } from "./RelatoriosPontoClient";
import styles from "@/components/app-ui/operational/operational.module.css";
import Link from "next/link";
import { FileBarChart, Printer, Download } from "lucide-react";

export const dynamic = "force-dynamic";

const REPORT_OPTIONS = [
  { kind: "INCONSISTENCIAS_PONTO", label: "20.2: Relatório de Inconsistências Ocorridas no Período" },
  { kind: "JUSTIFICATIVA_HORAS_EXTRAS", label: "20.5: Relatório de Justificativa de Horas Extras" },
  { kind: "CONTROLE_FREQUENCIA", label: "20.17: Relatório de Controle de Frequência" },
  { kind: "INFORMACOES_COMPLEMENTARES", label: "20.18: Relatório de Informações Complementares" },
  { kind: "OCORRENCIAS_PONTO", label: "20.19: Relatório de Ocorrências de Ponto" },
  { kind: "PONTO_LOCAL_RELOGIO", label: "20.20: Relatório com Identificação do Local e Relógio" },
  { kind: "FUNCIONARIOS_EQUIPE", label: "20.21: Relatório de Relação de Funcionários por Equipe" },
  { kind: "TIPO_PONTO_SERVIDOR", label: "20.23: Relatório de Tipo de Ponto (Manual / Eletrônico)" },
  { kind: "AUSENCIA_MARCACAO", label: "20.24: Relatório de Ausência de Marcação do Ponto" },
] as const;

export default async function PontoRelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{
    kind?: string;
    from?: string;
    until?: string;
    month?: string;
    employeeId?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const context = await getTenantContextForModule("RH");
  const params = await searchParams;
  const database = context.database ?? db;

  const selectedKind = (params.kind || "INCONSISTENCIAS_PONTO") as PontoReportFilter["kind"];

  const [reportData, employees] = await Promise.all([
    generatePontoReport(database, {
      kind: selectedKind,
      from: params.from,
      until: params.until,
      month: params.month,
      employeeId: params.employeeId,
      q: params.q,
    }),
    readEmployeeOptions(database, context.user).catch(() => []),
  ]);

  const columns = reportData.headers.map((header, idx) =>
    rhColumn(
      `col_${idx}`,
      header,
      idx === 0 ? 220 : idx === 1 ? 110 : 160,
      idx === 0 ? 140 : 100,
      idx === 0 ? "identifier" : "text"
    )
  );

  const rows = reportData.rows.map((row, rowIdx) => ({
    id: `row_${rowIdx}`,
    label: row[0] || `Registro ${rowIdx + 1}`,
    values: Object.fromEntries(row.map((val, colIdx) => [`col_${colIdx}`, val])),
  }));
  const page = Math.min(Math.max(1, Number.parseInt(params.page || "1") || 1), Math.max(1, Math.ceil(rows.length / OPERATIONAL_PAGE_SIZE)));

  return (
    <div className="flex flex-col h-full w-full">
      <PontoNav />
      <OperationalListFrame
        pagination={<OperationalLinkPagination page={page} total={rows.length} pathname="/rh/ponto/relatorios" values={{ kind: selectedKind, from: params.from, until: params.until, month: params.month, employeeId: params.employeeId, q: params.q }} />}
        label={reportData.title}
        actions={
          <div className="flex items-center gap-2">
            <RelatoriosPontoClient reportTitle={reportData.title} headers={reportData.headers} rows={reportData.rows} />
            <Link
              href="/rh/relatorios"
              className={styles.filterButton}
              title="Acessar o Catálogo Central Geral de Relatórios de RH"
            >
              Catálogo Geral RH
            </Link>
          </div>
        }
        toolbar={
          <form action="/rh/ponto/relatorios" method="GET" className="flex flex-col gap-2 w-full text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
                <span>Relatório:</span>
                <select
                  name="kind"
                  defaultValue={selectedKind}
                  className="rounded border border-slate-300 px-2 py-1 bg-white text-slate-900 font-semibold"
                >
                  {REPORT_OPTIONS.map((opt) => (
                    <option key={opt.kind} value={opt.kind}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-1">
                <span>Mês:</span>
                <input
                  type="month"
                  name="month"
                  defaultValue={params.month}
                  className="rounded border border-slate-300 px-2 py-1 bg-white"
                />
              </label>

              <label className="flex items-center gap-1">
                <span>De:</span>
                <input
                  type="date"
                  name="from"
                  defaultValue={params.from}
                  className="rounded border border-slate-300 px-2 py-1 bg-white"
                />
              </label>

              <label className="flex items-center gap-1">
                <span>Até:</span>
                <input
                  type="date"
                  name="until"
                  defaultValue={params.until}
                  className="rounded border border-slate-300 px-2 py-1 bg-white"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1">
                <span>Servidor:</span>
                <select
                  name="employeeId"
                  defaultValue={params.employeeId || ""}
                  className="rounded border border-slate-300 px-2 py-1 bg-white"
                >
                  <option value="">Todos os servidores</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.registration || emp.cpf})
                    </option>
                  ))}
                </select>
              </label>

              <input
                name="q"
                defaultValue={params.q}
                placeholder="Buscar por termo ou matrícula..."
                className="rounded border border-slate-300 px-2 py-1 min-w-[220px]"
              />

              <button type="submit" className={styles.filterButton}>
                Emitir Relatório
              </button>

              <Link href="/rh/ponto/relatorios" className={styles.filterButton}>
                Limpar Filtros
              </Link>
            </div>
          </form>
        }
      >
        <OperationalTable
          preferenceId={`ponto-relatorio-${selectedKind}`}
          columns={columns}
          caption={reportData.title}
          emptyMessage="Nenhum dado encontrado para os critérios e período selecionados."
          rows={rows.slice((page - 1) * OPERATIONAL_PAGE_SIZE, page * OPERATIONAL_PAGE_SIZE)}
        />
      </OperationalListFrame>
    </div>
  );
}

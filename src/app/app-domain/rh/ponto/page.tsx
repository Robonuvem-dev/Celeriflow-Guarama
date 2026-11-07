import Link from "next/link";
import { format } from "date-fns";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { PontoRowActions } from "./PontoRowActions";
import { UploadCSVButton } from "./UploadCSVButton";
import { PrintReportButton } from "./PrintReportButton";
import { db } from "@/db/client";
import { readAttendancePage, readEmployeeOptions } from "@/db/repositories/personnel-pages/records";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalFilters, OperationalLinkPagination, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import styles from "@/components/app-ui/operational/operational.module.css";
import { rhColumn } from "../_components/operational-columns";
import { RhNewLink } from "../_components/RhNewLink";
import { AlertTriangle, Clock, UserCheck, Search } from "lucide-react";

const columns = [
  rhColumn("date", "Data", 110, 95),
  rhColumn("employee", "Servidor", 200, 130),
  rhColumn("entry", "Entrada", 85, 70),
  rhColumn("exit", "Saída", 85, 70),
  rhColumn("hours", "Horas dia", 90, 75, "text", "right"),
  rhColumn("extra", "H. extra", 85, 70, "text", "right"),
  rhColumn("bank", "Banco h.", 85, 70, "text", "right"),
  rhColumn("status", "Status", 95, 80, "status"),
  rhColumn("inconsistency", "Inconsistência", 150, 120),
  rhColumn("actions", "Ações", 90, 80, "actions", "right"),
];

function getInconsistencyReason(rec: { entryTime: Date | null; exitTime: Date | null; hoursWorked: number; status: string }) {
  if (rec.entryTime && !rec.exitTime) return "Entrada sem batida de saída";
  if (!rec.entryTime && rec.exitTime) return "Saída sem batida de entrada";
  if (rec.status === "Presente" && rec.hoursWorked === 0) return "Carga horária nula / zerada";
  if (rec.status === "Falta") return "Falta a justificar";
  if (rec.status === "Atraso") return "Atraso registrado no dia";
  return null;
}

export default async function PontoPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; month?: string; employeeId?: string; aba?: string; page?: string }>;
}) {
  const context = await getTenantContextForModule("RH");
  const { q, month, employeeId, aba, page } = await searchParams;
  const isInconsistenciesTab = aba === "inconsistencias";

  const database = context.database ?? db;

  const [{ total, pagination, records }, employeesList] = await Promise.all([
    readAttendancePage(database, {
      q,
      month,
      employeeId,
      inconsistenciesOnly: isInconsistenciesTab,
      page,
      user: context.user,
    }),
    readEmployeeOptions(database, context.user).catch(() => []),
  ]);

  const selectedEmployee = employeeId ? employeesList.find((e) => e.id === employeeId) : null;

  return (
    <OperationalListFrame
      label={
        isInconsistenciesTab
          ? "Consulta de Inconsistências do Ponto para Ajuste (20.7)"
          : selectedEmployee
          ? `Marcações de Ponto: ${selectedEmployee.name} (20.6)`
          : "Registro e Espelho de Ponto Eletrônico"
      }
      actions={
        <>
          <PrintReportButton
            label={isInconsistenciesTab ? "Emitir Relatório de Inconsistências" : "Emitir Espelho de Ponto"}
            inconsistenciesOnly={isInconsistenciesTab}
          />
          <UploadCSVButton />
          <RhNewLink href="/rh/ponto/novo">Apontamento manual</RhNewLink>
        </>
      }
      toolbar={
        <div className="flex flex-col gap-2 w-full">
          {/* Abas e Filtros Rápidos (Requisitos 20.6 e 20.7) */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs pb-1 border-b border-slate-200 dark:border-slate-800">
            <span className="text-slate-500 font-medium mr-1">Visão operacional:</span>
            <Link
              href="/rh/ponto"
              className={`px-2 py-0.5 rounded text-[11px] font-medium border transition ${
                !isInconsistenciesTab && !employeeId
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 hover:bg-slate-50 border-slate-300"
              }`}
            >
              Todas as Marcações
            </Link>
            <Link
              href={`/rh/ponto?aba=inconsistencias${month ? `&month=${month}` : ""}`}
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium border transition ${
                isInconsistenciesTab
                  ? "bg-amber-600 text-white border-amber-600 font-bold"
                  : "bg-amber-50 text-amber-800 hover:bg-amber-100 border-amber-300"
              }`}
              title="Filtrar registros com divergências de batida, horas nulas ou faltas para ajuste (20.7)"
            >
              <AlertTriangle className="w-3 h-3 text-amber-500" />
              Inconsistências para Ajuste (20.7)
            </Link>
          </div>

          <form action="/rh/ponto" method="GET" className={styles.searchForm}>
            {isInconsistenciesTab && <input type="hidden" name="aba" value="inconsistencias" />}
            <input
              name="q"
              aria-label="Buscar servidor por nome"
              defaultValue={q}
              placeholder="Buscar servidor…"
              className={styles.searchInput}
            />
            <select
              name="employeeId"
              aria-label="Selecionar funcionário para consulta (20.6)"
              defaultValue={employeeId || ""}
              title="Consulta das marcações de ponto do funcionário específico (20.6)"
            >
              <option value="">Todos os servidores (20.6)</option>
              {employeesList.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.registration || emp.cpf})
                </option>
              ))}
            </select>
            <input
              type="month"
              name="month"
              aria-label="Mês de competência"
              defaultValue={month}
              title="Competência mensal"
            />
            <button type="submit" className={styles.filterButton}>
              <Search className="w-3.5 h-3.5 inline mr-1" />
              Consultar
            </button>
            <Link className={styles.filterButton} href="/rh/ponto">
              Limpar
            </Link>
          </form>
        </div>
      }
      pagination={
        <OperationalLinkPagination
          page={pagination.page}
          total={total}
          pathname="/rh/ponto"
          values={{ q, month, employeeId, aba }}
        />
      }
    >
      <OperationalTable
        preferenceId="rh-ponto"
        columns={columns}
        caption="Registro e inconsistências de ponto"
        emptyMessage={
          isInconsistenciesTab
            ? "Nenhuma inconsistência de ponto pendente de ajuste encontrada."
            : "Nenhum registro de ponto encontrado para os critérios pesquisados."
        }
        rows={records.map((rec) => {
          const reason = getInconsistencyReason(rec);
          return {
            id: rec.id,
            label: rec.employee?.name || rec.id,
            values: {
              date: format(new Date(rec.date), "dd/MM/yyyy"),
              employee: rec.employee?.name || "—",
              entry: rec.entryTime ? format(new Date(rec.entryTime), "HH:mm") : "—",
              exit: rec.exitTime ? format(new Date(rec.exitTime), "HH:mm") : "—",
              hours: `${rec.hoursWorked.toFixed(2)}h`,
              extra: rec.extraHours ? `${rec.extraHours.toFixed(2)}h` : "—",
              bank: rec.bankHours ? `${rec.bankHours.toFixed(2)}h` : "—",
              status: rec.status,
              inconsistency: reason || "Regular",
            },
            cells: {
              inconsistency: reason ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                  <AlertTriangle className="w-3 h-3 text-amber-600" />
                  {reason}
                </span>
              ) : (
                <span className="text-slate-400 text-xs">Regular</span>
              ),
            },
            actions: <PontoRowActions record={rec} inconsistency={reason} />,
          };
        })}
      />
    </OperationalListFrame>
  );
}

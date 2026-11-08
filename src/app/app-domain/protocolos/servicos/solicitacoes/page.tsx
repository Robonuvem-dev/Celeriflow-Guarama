import Link from "next/link";
import { Eye, FileSpreadsheet, Printer, RotateCcw } from "lucide-react";
import { getProtocolContext, protocolScopeCondition } from "@/lib/protocols/access";
import { db } from "@/db/client";
import { and, asc, count, desc, eq, gte, ilike, lte } from "drizzle-orm";
import { portalServiceRequests } from "@/db/schema/portal-services";
import { processes, processSubjects } from "@/db/schema/processes";
import { serviceQueueSubjectCondition } from "@/lib/protocols/service-queue-filters";
import { departments } from "@/db/schema/administration";
import { readPortalScheduleResources } from "@/db/repositories/portal-content/services";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { ProgramRequestsForm } from "../ProgramRequestsForm";
import { PortalRequestsExportButtons } from "./PortalRequestsExportButtons";

export const dynamic = "force-dynamic";

const columns: OperationalColumn[] = [
  ...([
    ["protocol", "Protocolo", 160, 110],
    ["service", "Serviço", 290, 130],
    ["status", "Situação", 180, 110],
    ["department", "Setor", 200, 110],
    ["date", "Abertura", 110, 95],
  ] as [string, string, number, number][]).map(
    ([key, label, initialWidth, minWidth]): OperationalColumn => ({
      key,
      label,
      initialWidth,
      minWidth,
      maxWidth: 700,
      type: key === "status" ? "status" : "text",
      resizable: true,
      sortable: false,
      details: "overflow",
    })
  ),
  { key: "actions", label: "Ações", type: "actions", initialWidth: 75, minWidth: 65, maxWidth: 90, resizable: false, sortable: false, details: "none" },
];

export default async function ServiceQueuePage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    subjectId?: string;
    numInicio?: string;
    numFim?: string;
    dataInicio?: string;
    dataFim?: string;
    export?: string;
    page?: string;
    view?: string;
  }>;
}) {
  const context = await getProtocolContext();
  const query = await searchParams;
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 100) : "";
  const status = typeof query.status === "string" ? query.status : "";
  const subjectId = typeof query.subjectId === "string" ? query.subjectId.trim().slice(0, 200) : "";
  const numInicio = typeof query.numInicio === "string" ? query.numInicio.trim() : "";
  const numFim = typeof query.numFim === "string" ? query.numFim.trim() : "";
  const dataInicio = typeof query.dataInicio === "string" ? query.dataInicio.trim() : "";
  const dataFim = typeof query.dataFim === "string" ? query.dataFim.trim() : "";
  const exportFormat = query.export;

  const subjects = await db
    .select({ id: processSubjects.id, name: processSubjects.name })
    .from(processSubjects)
    .orderBy(asc(processSubjects.name));

  const where = and(
    protocolScopeCondition(context),
    q ? ilike(processes.protocolNumber, `%${q.replace(/[\\%_]/g, "\\$&")}%`) : undefined,
    status ? eq(portalServiceRequests.status, status) : undefined,
    serviceQueueSubjectCondition(subjectId),
    numInicio ? gte(processes.protocolNumber, numInicio) : undefined,
    numFim ? lte(processes.protocolNumber, numFim) : undefined,
    dataInicio ? gte(portalServiceRequests.createdAt, new Date(dataInicio + "T00:00:00")) : undefined,
    dataFim ? lte(portalServiceRequests.createdAt, new Date(dataFim + "T23:59:59")) : undefined
  );

  const [{ total }] = await db
    .select({ total: count() })
    .from(portalServiceRequests)
    .innerJoin(processes, eq(processes.id, portalServiceRequests.processId))
    .where(where);

  const page = Math.min(
    Math.max(1, Math.ceil(total / OPERATIONAL_PAGE_SIZE)),
    Math.max(1, Number.parseInt(query.page || "1", 10) || 1)
  );

  // If HTML export requested (19.116)
  if (exportFormat === "html") {
    const exportRows = await db
      .select({
        request: portalServiceRequests,
        process: { protocolNumber: processes.protocolNumber },
        department: { name: departments.name },
      })
      .from(portalServiceRequests)
      .innerJoin(processes, eq(processes.id, portalServiceRequests.processId))
      .leftJoin(departments, eq(departments.id, processes.currentDepartmentId))
      .where(where)
      .orderBy(desc(portalServiceRequests.createdAt))
      .limit(500);

    return (
      <main className="p-8 bg-white min-h-screen text-black">
        <div className="flex justify-between items-center border-b pb-4 mb-6">
          <div>
            <h1 className="text-xl font-bold">Relatório de Solicitações do Portal de Serviços (19.116)</h1>
            <p className="text-xs text-slate-600">
              Emitido em: {new Date().toLocaleString("pt-BR")} · Total de registros: {exportRows.length}
            </p>
          </div>
          <Link href="/protocolos/servicos/solicitacoes" className="text-sm underline text-emerald-700">
            ← Voltar
          </Link>
        </div>
        <table className="w-full text-xs text-left border-collapse border border-slate-300">
          <thead className="bg-slate-100 uppercase font-bold">
            <tr>
              <th className="border p-2">Protocolo</th>
              <th className="border p-2">Serviço</th>
              <th className="border p-2">Situação</th>
              <th className="border p-2">Setor Competente</th>
              <th className="border p-2">Data de Abertura</th>
            </tr>
          </thead>
          <tbody>
            {exportRows.map((row) => (
              <tr key={row.request.id}>
                <td className="border p-2 font-mono font-bold">{row.process.protocolNumber}</td>
                <td className="border p-2">{(row.request.snapshot as { name: string }).name}</td>
                <td className="border p-2">{row.request.status}</td>
                <td className="border p-2">{row.department?.name || "—"}</td>
                <td className="border p-2">{row.request.createdAt.toLocaleString("pt-BR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    );
  }

  const requestRows = await db
    .select({
      request: portalServiceRequests,
      process: { protocolNumber: processes.protocolNumber, currentDepartmentId: processes.currentDepartmentId },
      department: { name: departments.name },
    })
    .from(portalServiceRequests)
    .innerJoin(processes, eq(processes.id, portalServiceRequests.processId))
    .leftJoin(departments, eq(departments.id, processes.currentDepartmentId))
    .where(where)
    .orderBy(desc(portalServiceRequests.createdAt), asc(portalServiceRequests.id))
    .limit(OPERATIONAL_PAGE_SIZE)
    .offset((page - 1) * OPERATIONAL_PAGE_SIZE);

  const requests = requestRows.map((row) => ({
    ...row.request,
    process: { ...row.process, currentDepartment: row.department },
  }));

  const [employees, teams, assets] = context.protocolAccess.canUpdate
    ? await readPortalScheduleResources(
        db,
        context.protocolAccess.isAdmin ? undefined : context.user.departmentId || "__NONE__"
      )
    : [[], [], []];

  const currentParams = { q, status, subjectId, numInicio, numFim, dataInicio, dataFim, page: String(page) };
  const listHref = `/protocolos/servicos/solicitacoes?${new URLSearchParams(currentParams)}`;

  if (query.view === "programar") {
    return (
      <main className="space-y-4 p-4">
        <Link href={listHref}>Voltar à fila</Link>
        {context.protocolAccess.canUpdate && (
          <ProgramRequestsForm
            requests={requests
              .filter((item) => !["CONCLUIDO", "CANCELADO"].includes(item.status))
              .map((item) => ({
                id: item.id,
                label: `${item.process.protocolNumber} — ${(item.snapshot as { name: string }).name}`,
              }))}
            employees={employees}
            teams={teams}
            assets={assets.map((asset) => ({ id: asset.id, name: asset.description }))}
          />
        )}
      </main>
    );
  }

  return (
    <OperationalListFrame
      label="Solicitações do Portal de Serviços Online"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {/* Botões de Exportação CSV e HTML (19.116) */}
          <PortalRequestsExportButtons
            data={requests.map((r) => ({
              protocolNumber: r.process.protocolNumber,
              serviceName: (r.snapshot as { name: string }).name,
              status: r.status,
              departmentName: r.process.currentDepartment?.name || "—",
              createdAt: r.createdAt.toLocaleDateString("pt-BR"),
            }))}
            searchParamsString={new URLSearchParams(currentParams).toString()}
          />
          <Link className={styles.dialogButton} href="/protocolos/servicos">
            Catálogo e Configuração
          </Link>
          {context.protocolAccess.canUpdate && (
            <Link className={styles.newButton} href={`${listHref}&view=programar`}>
              Programar Atendimento
            </Link>
          )}
        </div>
      }
      toolbar={
        <form className="flex flex-wrap items-center gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar protocolo..."
            aria-label="Protocolo"
            className="rounded border border-slate-300 px-2.5 py-1.5 bg-white w-40"
          />
          <input
            name="numInicio"
            defaultValue={numInicio}
            placeholder="Nº Inicial (19.116)"
            aria-label="Número Inicial"
            className="rounded border border-slate-300 px-2 py-1.5 bg-white w-32"
          />
          <input
            name="numFim"
            defaultValue={numFim}
            placeholder="Nº Final (19.116)"
            aria-label="Número Final"
            className="rounded border border-slate-300 px-2 py-1.5 bg-white w-32"
          />
          <div className="flex items-center gap-1">
            <span className="text-slate-500">De:</span>
            <input
              name="dataInicio"
              type="date"
              defaultValue={dataInicio}
              aria-label="Data Inicial"
              className="rounded border border-slate-300 px-2 py-1 bg-white"
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-slate-500">Até:</span>
            <input
              name="dataFim"
              type="date"
              defaultValue={dataFim}
              aria-label="Data Final"
              className="rounded border border-slate-300 px-2 py-1 bg-white"
            />
          </div>
          <select name="status" defaultValue={status} aria-label="Situação" className="rounded border border-slate-300 px-2 py-1.5 bg-white">
            <option value="">Todas situações</option>
            {["RECEBIDO", "EM_ANALISE", "AGUARDANDO_COMPLEMENTO", "PROGRAMADO", "RESPONDIDO", "CONCLUIDO", "CANCELADO"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select name="subjectId" defaultValue={subjectId} aria-label="Assunto" className="rounded border border-slate-300 px-2 py-1.5 bg-white">
            <option value="">Todos os assuntos</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
          <button className="rounded bg-emerald-700 px-3 py-1.5 font-semibold text-white hover:bg-emerald-800">
            Filtrar
          </button>
          <Link href="/protocolos/servicos/solicitacoes" className="rounded border bg-white px-2.5 py-1.5 text-slate-600 hover:bg-slate-50 flex items-center gap-1">
            <RotateCcw className="w-3.5 h-3.5" />
            Limpar (19.107)
          </Link>
        </form>
      }
      pagination={
        <OperationalLinkPagination
          page={page}
          total={total}
          pathname="/protocolos/servicos/solicitacoes"
          values={{ q, status, subjectId, numInicio, numFim, dataInicio, dataFim }}
        />
      }
    >
      <OperationalTable
        columns={columns}
        preferenceId="protocolos.servicos.solicitacoes"
        caption="Solicitações de serviços — origem Autoatendimento"
        emptyMessage="Nenhuma solicitação encontrada."
        rows={requests.map((request) => ({
          id: request.id,
          label: request.process.protocolNumber,
          values: {
            protocol: request.process.protocolNumber,
            service: (request.snapshot as { name: string }).name,
            status: request.status,
            department: request.process.currentDepartment?.name || "—",
            date: request.createdAt.toLocaleDateString("pt-BR"),
          },
          cells: {
            protocol: (
              <Link href={`/protocolos/servicos/solicitacoes/${request.id}`} className="font-semibold text-emerald-700 hover:underline">
                {request.process.protocolNumber}
              </Link>
            ),
          },
          actions: (
            <Link
              className={styles.iconButton}
              aria-label={`Abrir solicitação ${request.process.protocolNumber}`}
              href={`/protocolos/servicos/solicitacoes/${request.id}`}
            >
              <Eye />
            </Link>
          ),
        }))}
      />
    </OperationalListFrame>
  );
}

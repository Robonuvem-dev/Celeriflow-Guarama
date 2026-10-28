import { getTenantContextForModuleOperation, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { listSstUnits } from "@/db/repositories/sst/scope";
import { sstDatabase } from "@/lib/sst/database";
import { certificateReport, reportCivilRange } from "@/lib/sst/report-service";
import { SstValidationError } from "@/lib/sst/errors";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { z } from "zod";

export default async function SstReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const context = await getTenantContextForModuleOperation("SST", "issueReports");
  const filters = await searchParams;
  const units = await listSstUnits(sstDatabase(context), context);
  let report: Awaited<ReturnType<typeof certificateReport>> | null = null;
  let error: string | null = null;
  let costs: Record<string, number | null> | null = null;
  if (filters.budgetUnitId && filters.from && filters.until) {
    try {
      report = await certificateReport(context, { ...filters, ...reportCivilRange(filters.from, filters.until), page: Math.max(1, Math.trunc(Number(filters.page)) || 1) });
      if (filters.cost === "1") {
        await getTenantContextForModule("RH");
        costs = Object.fromEntries(report.statistics.map((item) => [item.employeeId, null]));
      }
      await writeAuditEvent(sstDatabase(context), { actorUsuarioId: context.user.id, eventType: auditEventTypes.reportIssued, targetType: "SST_CERTIFICATES_REPORT", targetId: filters.budgetUnitId });
    } catch (cause) {
      if (cause instanceof z.ZodError) error = cause.issues[0]?.message || "Confira os filtros.";
      else if (cause instanceof SstValidationError) error = cause.message;
      else throw cause;
    }
  }
  const page = report?.page || 1;
  const values = Object.fromEntries(Object.entries(filters).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const href = (value: number) => `/sst/relatorios?${new URLSearchParams({ ...values, page: String(value) })}`;
  const exportHref = (kind: string, format = "csv") => `/api/sst/relatorios?${new URLSearchParams({ ...values, kind, format })}`;
  const plannedMinutes = report?.statistics.reduce((sum, item) => sum + item.plannedMinutes, 0) || 0;
  const absentMinutes = report?.statistics.reduce((sum, item) => sum + item.absentMinutes, 0) || 0;
  const days = report?.statistics.reduce((sum, item) => sum + item.acceptedCalendarDays, 0) || 0;
  const formatDate = (date: Date) => date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const field = (name: string, label: string, type = "text") => <label>{label}<input type={type} name={name} defaultValue={filters[name]} className="block w-full rounded border p-2"/></label>;

  return <div className="space-y-4 p-4">
    <h1 className="text-xl font-semibold">Atestados e absenteísmo — relatórios</h1>
    <form className="grid gap-3 rounded border p-4 sm:grid-cols-3">
      <label>UG<select required name="budgetUnitId" defaultValue={filters.budgetUnitId} className="block w-full rounded border p-2"><option value="">Selecione</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
      {field("from", "Início", "date")}{field("until", "Fim", "date")}
      {field("employeeId", "Identificador do servidor")}{field("roleId", "Identificador do cargo")}
      {field("departmentId", "Identificador do departamento")}{field("employmentRegimeId", "Identificador do regime histórico RH")}
      {field("localId", "Identificador do local histórico")}{field("costCenterId", "Identificador do centro de custo histórico")}
      {field("reasonId", "Identificador do motivo")}{field("issuerPersonId", "Identificador do profissional")}{field("cid", "CID")}
      <label>Situação<select name="status" defaultValue={filters.status} className="block rounded border p-2"><option value="">Todas</option><option value="RECEIVED">Recebido</option><option value="APPROVED">Deferido</option><option value="REJECTED">Indeferido</option></select></label>
      <label><input name="cost" value="1" type="checkbox" defaultChecked={filters.cost === "1"} className="mr-2"/>Exibir custo estimado (exige acesso RH)</label>
      <button className="rounded bg-teal-700 p-2 text-white">Consultar</button>
    </form>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {report && <>
      <section className="grid gap-3 rounded border p-4 sm:grid-cols-3">
        <p>{report.total} atestados</p><p>Horas planejadas: {(plannedMinutes / 60).toFixed(2)}</p>
        <p>Horas atestadas aceitas: {(absentMinutes / 60).toFixed(2)}</p>
        <p>Índice: {plannedMinutes ? `${(absentMinutes / plannedMinutes * 100).toFixed(2)}%` : "Indisponível — sem jornada planejada"}</p>
        <p>Dias corridos aceitos: {days.toFixed(2)}</p>
        <p>Idade média dos servidores com atestado: {report.meanAge?.toFixed(1) || "Não informada"}</p>
      </section>
      <p className="text-sm">Intervalos sobrepostos são unidos e intersectados com a jornada planejada no período. Apenas atestados deferidos integram as horas de ausência aceita. Servidores com turnos planejados e sem atestados também integram o denominador.</p>
      <section className="rounded border p-4"><h2 className="font-semibold">CIDs por frequência de atestados</h2><p>{Object.entries(report.cidCounts).sort((a, b) => b[1] - a[1]).map(([cid, count]) => `${cid}: ${count}`).join(" · ") || "Sem CIDs"}</p></section>
      {!!report.missingHistoricalSourceCount && <p role="status">{report.missingHistoricalSourceCount} atestado(s) sem fonte funcional histórica: preservados na consulta, excluídos das horas aceitas. Não foi inferida lotação/UG retroativa.</p>}
      {!!report.unverifiedPlannedShiftCount && <p role="status">{report.unverifiedPlannedShiftCount} turno(s) sem cobertura funcional histórica integral. Horas e índice usam somente as partes comprovadas; a apuração permanece incompleta até regularizar as fontes RH.</p>}
      {costs && <section className="rounded border p-4"><h2 className="font-semibold">Custo histórico indisponível</h2><p className="text-sm">Aguarda origem canônica e conciliação de remuneração/rubricas por regime e competência. Salário base atual não substitui a folha histórica; nenhum desconto ou pagamento foi inferido.</p></section>}
      <nav className="flex flex-wrap gap-3" aria-label="Exportação de relatórios">
        <a href={exportHref("atestados")} className="rounded border p-2 text-sm">Exportar todos os atestados (CSV)</a>
        <a href={exportHref("absenteismo")} className="rounded border p-2 text-sm">Exportar absenteísmo por servidor (CSV)</a>
        <a href={exportHref("atestados", "pdf")} className="rounded border p-2 text-sm">Atestados (PDF restrito)</a>
        <a href={exportHref("absenteismo", "pdf")} className="rounded border p-2 text-sm">Absenteísmo (PDF restrito)</a>
      </nav>
      <table className="w-full table-fixed text-left text-xs">
        <thead><tr><th className="p-2">Servidor</th><th className="p-2">Emitente/motivo</th><th className="p-2">Período</th><th className="p-2">CIDs</th><th className="p-2">Situação</th></tr></thead>
        <tbody>{report.records.map((record) => <tr className="border-b" key={record.id}>
          <td className="break-words p-2">{record.employee.name} · {record.employee.registration}<br/>{record.regimeName || "Regime não documentado"} · {record.localName || "Local não documentado"}<br/>Centro: {record.costCenterName || "Não documentado"}</td>
          <td className="break-words p-2">{record.issuer.fullName}<br/>{record.reason.name}</td>
          <td className="p-2">{formatDate(record.startsAt)} — {formatDate(record.endsAt)}</td>
          <td className="p-2">{record.cidCodes.join(", ")}</td><td className="p-2">{record.status}</td>
        </tr>)}</tbody>
      </table>
      <ErpPagination page={page} total={report.total} pageSize={20} previousHref={href(page - 1)} nextHref={href(page + 1)} jumpTo={{ pathname: "/sst/relatorios", values }}/>
    </>}
  </div>;
}

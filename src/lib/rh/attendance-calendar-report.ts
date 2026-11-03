import { sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import type { OperationalReportInput, PersonnelReport } from "./operational-reports";
import { reportContractPredicate, reportEmployeePredicate } from "./report-filters";
import { personnelBudgetEmployeeWhere } from "./personnel-budget-scope";
import { referenceRecordsObservedAt } from "./reference-timeline-query";

export async function buildAttendanceCalendarReport(db: DatabaseExecutor, input: OperationalReportInput, budgetUnitIds?: readonly string[]): Promise<PersonnelReport> {
  const current = new Date().toISOString().slice(0, 10);
  const from = input.from ?? (input.competence ? `${input.competence.slice(3)}-${input.competence.slice(0, 2)}-01` : `${current.slice(0, 7)}-01`);
  const until = input.until ?? (input.competence ? new Date(Date.UTC(Number(input.competence.slice(3)), Number(input.competence.slice(0, 2)), 0)).toISOString().slice(0, 10) : current);
  if (from > until || new Date(until).getTime() - new Date(from).getTime() > 366 * 86400000) throw new Error("Selecione um período de até 367 dias.");
  const result = await db.execute<Record<string, unknown>>(sql`
    SELECT e.id,e.name,e.registration,to_char(day,'YYYY-MM-DD') date,extract(isodow FROM day)::int weekday,
      concat_ws('; ',holidays.names,workfree.names) holiday,coalesce(vacations.periods,'') vacation,coalesce(absences.periods,'') absence,
      coalesce(employment.departments,'') department,coalesce(exemption.names,'') exemption,
      coalesce(schedule.name,'Sem escala cadastrada') schedule,coalesce(schedule.details->>'weekdays','') weekdays,
      coalesce(hours.details->>'start','') expected_entry,coalesce(hours.details->>'end','') expected_exit,
      CASE WHEN holidays.names IS NOT NULL OR workfree.names IS NOT NULL OR vacations.periods IS NOT NULL OR absences.periods IS NOT NULL THEN 0
        WHEN schedule.id IS NULL THEN NULL
        WHEN extract(isodow FROM day)::text=ANY(string_to_array(schedule.details->>'weekdays',',')) THEN
          round((extract(epoch FROM ((hours.details->>'end')::time-(hours.details->>'start')::time+CASE WHEN hours.details->>'end'<hours.details->>'start' THEN interval '1 day' ELSE interval '0 day' END))/3600-coalesce((hours.details->>'breakMinutes')::numeric,0)/60)::numeric,4)
        ELSE 0 END planned,
      CASE WHEN day::date>${current}::date THEN CASE WHEN exemption.names IS NOT NULL THEN 'Previsto — dispensado de ponto' ELSE 'Previsto' END ELSE coalesce(record.status,CASE WHEN exemption.names IS NOT NULL THEN 'Dispensado de registro' ELSE 'Sem registro' END) END status,
      CASE WHEN day::date<=${current}::date THEN coalesce(record.entry,'') ELSE '' END entry,
      CASE WHEN day::date<=${current}::date THEN coalesce(record.exit,'') ELSE '' END exit,
      CASE WHEN day::date<=${current}::date THEN coalesce(record.worked,0) ELSE 0 END worked,
      CASE WHEN day::date<=${current}::date THEN coalesce(record.extra,0) ELSE 0 END extra,
      CASE WHEN day::date<=${current}::date THEN coalesce(record.bank,0) ELSE 0 END bank
    FROM "Employee" e CROSS JOIN generate_series(${from}::date,${until}::date,interval '1 day') day
    JOIN LATERAL (SELECT string_agg(DISTINCT coalesce(d.name,'Sem lotação'),'; ') departments,array_agg(DISTINCT v.snapshot->>'departmentId') department_ids FROM "HrEmploymentContract" c JOIN LATERAL (SELECT snapshot FROM "HrEmploymentRevision" WHERE "contractId"=c.id AND "effectiveFrom"<day+interval '1 day' ORDER BY "effectiveFrom" DESC,version DESC LIMIT 1) v ON true LEFT JOIN "Department" d ON d.id=v.snapshot->>'departmentId' WHERE c."employeeId"=e.id AND v.snapshot->>'status'='ATIVO' AND (v.snapshot->>'admittedAt')::date<=day::date AND (v.snapshot->>'endsAt' IS NULL OR (v.snapshot->>'endsAt')::date>=day::date)
      AND ${reportContractPredicate(input, sql`v.snapshot`, sql`day::date`)}
      AND NOT EXISTS(SELECT 1 FROM "HrFunctionalRecord" category WHERE category."contractId"=c.id AND category.kind='CATEGORIA_FOLHA' AND category.status<>'CANCELADO' AND category.data->>'category'<>'ATIVO' AND category."startsAt"::date<=day::date AND (category."endsAt" IS NULL OR category."endsAt"::date>=day::date)) HAVING count(*)>0) employment ON true
    LEFT JOIN LATERAL (SELECT string_agg(f.name||': '||(f.data->>'reason'),'; ' ORDER BY f.id) names FROM "HrFunctionalRecord" f WHERE f.kind='DIA_SEM_EXPEDIENTE' AND f.status<>'CANCELADO' AND f."startsAt"::date<=day::date AND (f."endsAt" IS NULL OR f."endsAt"::date>=day::date) AND (coalesce(f.data->>'departmentId','')='' OR f.data->>'departmentId'=ANY(employment.department_ids))) workfree ON true
    LEFT JOIN LATERAL (SELECT string_agg(f.name||': '||(f.data->>'reason'),'; ' ORDER BY f.id) names FROM "HrFunctionalRecord" f WHERE f.kind='DISPENSA_PONTO' AND f."employeeId"=e.id AND f.status<>'CANCELADO' AND f."startsAt"::date<=day::date AND (f."endsAt" IS NULL OR f."endsAt"::date>=day::date)) exemption ON true
    LEFT JOIN LATERAL (SELECT s.* FROM ${referenceRecordsObservedAt(sql`least(day::date,${current}::date)`)} s WHERE s.kind='ESCALA' AND s.details->>'employeeId'=e.id AND day::date BETWEEN (s.details->>'from')::date AND (s.details->>'until')::date ORDER BY s.details->>'from' DESC,s.id LIMIT 1) schedule ON true
    LEFT JOIN LATERAL (SELECT h.* FROM ${referenceRecordsObservedAt(sql`least(day::date,${current}::date)`)} h WHERE h.id=schedule.details->>'rangeId' AND h.kind='FAIXA') hours ON true
    LEFT JOIN LATERAL (SELECT string_agg(h.name,'; ' ORDER BY h.id) names FROM ${referenceRecordsObservedAt(sql`least(day::date,${current}::date)`)} h WHERE h.kind='FERIADO' AND h.details->>'date'=to_char(day,'YYYY-MM-DD')) holidays ON true
    LEFT JOIN LATERAL (SELECT string_agg(v."enjoymentStart"::date::text||' a '||v."enjoymentEnd"::date::text,'; ' ORDER BY v.id) periods FROM "Vacation" v WHERE v."employeeId"=e.id AND day::date BETWEEN v."enjoymentStart"::date AND v."enjoymentEnd"::date AND v.status NOT IN ('Cancelada','Cancelado')) vacations ON true
    LEFT JOIN LATERAL (SELECT string_agg(l.type||': '||l."startDate"::date::text||' a '||l."endDate"::date::text,'; ' ORDER BY l.id) periods FROM "Leave" l WHERE l."employeeId"=e.id AND day::date BETWEEN l."startDate"::date AND l."endDate"::date AND l.status NOT IN ('Cancelada','Cancelado','Indeferida')) absences ON true
    LEFT JOIN LATERAL (SELECT string_agg(a.status,'; ' ORDER BY a.id) status,string_agg(to_char(a."entryTime" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo','HH24:MI'),'; ' ORDER BY a.id) entry,string_agg(to_char(a."exitTime" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo','HH24:MI'),'; ' ORDER BY a.id) exit,sum(a."hoursWorked") worked,sum(a."extraHours") extra,sum(a."bankHours") bank FROM "AttendanceRecord" a WHERE a."employeeId"=e.id AND a.date::date=day::date) record ON true
    WHERE (${input.q}='' OR strpos(lower(e.name),lower(${input.q}))>0 OR strpos(coalesce(e.registration,''),${input.q})>0)
      AND ${reportEmployeePredicate(input, sql`e.id`, sql`day::date`)}
      ${input.employeeId ? sql`AND e.id=${input.employeeId}` : sql``}
      ${input.departmentId ? sql`AND ${input.departmentId}=ANY(employment.department_ids)` : sql``}
      AND ${personnelBudgetEmployeeWhere(sql`e.id`, budgetUnitIds)}
    ORDER BY e.name,e.id,day`);
  const columns = [["name", "Servidor"], ["registration", "Matrícula"], ["date", "Data"], ["department", "Lotação na data"], ["weekday", "Dia da semana (1=segunda)"], ["holiday", "Feriados / dias sem expediente"], ["vacation", "Férias"], ["absence", "Afastamentos"], ["schedule", "Escala"], ["weekdays", "Dias da escala"], ["expected_entry", "Entrada prevista"], ["expected_exit", "Saída prevista"], ["planned", "Horas previstas"], ["exemption", "Dispensa de ponto / fundamento"], ["status", "Situação registrada / previsão"], ["entry", "Entrada registrada"], ["exit", "Saída registrada"], ["worked", "Horas realizadas"], ["extra", "Horas extras"], ["bank", "Banco de horas"]];
  const groups = new Map<string, typeof result.rows>();
  for (const row of result.rows) groups.set(String(row.id), [...(groups.get(String(row.id)) ?? []), row]);
  const rows = [...groups.values()].flatMap(group => {
    const details = group.map(row => columns.map(([key]) => row[key] == null ? "" : String(row[key])));
    const total = (key: string) => group.reduce((sum, row) => sum + Number(row[key] ?? 0), 0).toFixed(4);
    return [...details, columns.map(([key]) => key === "name" ? String(group[0].name) : key === "registration" ? String(group[0].registration ?? "") : key === "date" ? "TOTAL" : key === "schedule" ? `${group.filter(row => row.planned == null).length} dias sem previsão documental; soma apenas dos dias apurados` : ["planned", "worked", "extra", "bank"].includes(key) ? total(key) : "")];
  });
  return { title: "Cartão de ponto e calendário personalizado — previsões e registros efetivos separados", headers: columns.map(([, label]) => label), rows };
}

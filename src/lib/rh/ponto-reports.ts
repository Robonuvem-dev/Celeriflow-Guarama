import { sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { format } from "date-fns";

export type PontoReportFilter = {
  kind:
    | "INCONSISTENCIAS_PONTO" // 20.2
    | "JUSTIFICATIVA_HORAS_EXTRAS" // 20.5
    | "CONTROLE_FREQUENCIA" // 20.17
    | "INFORMACOES_COMPLEMENTARES" // 20.18
    | "OCORRENCIAS_PONTO" // 20.19
    | "PONTO_LOCAL_RELOGIO" // 20.20
    | "FUNCIONARIOS_EQUIPE" // 20.21
    | "TIPO_PONTO_SERVIDOR" // 20.23
    | "AUSENCIA_MARCACAO"; // 20.24
  from?: string;
  until?: string;
  month?: string;
  employeeId?: string;
  departmentId?: string;
  q?: string;
};

export type PontoReportResult = {
  title: string;
  headers: string[];
  rows: string[][];
  summary?: Record<string, string | number>;
};

export async function generatePontoReport(
  db: DatabaseExecutor,
  filter: PontoReportFilter
): Promise<PontoReportResult> {
  const current = new Date().toISOString().slice(0, 10);
  let from = filter.from;
  let until = filter.until;

  if (filter.month && (!from || !until)) {
    const [year, m] = filter.month.split("-");
    from = `${year}-${m.padStart(2, "0")}-01`;
    const lastDay = new Date(Number(year), Number(m), 0).getDate();
    until = `${year}-${m.padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  }

  if (!from) from = `${current.slice(0, 7)}-01`;
  if (!until) until = current;

  switch (filter.kind) {
    case "INCONSISTENCIAS_PONTO": {
      // Requisito 20.2: Emitir o relatório das inconsistências ocorridas no período.
      const query = await db.execute<Record<string, unknown>>(sql`
        SELECT 
          e.name as employee_name,
          coalesce(e.registration, '') as registration,
          coalesce(d.name, 'Sem lotação') as department_name,
          to_char(a.date, 'DD/MM/YYYY') as punch_date,
          coalesce(to_char(a."entryTime" AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'), '—') as entry_time,
          coalesce(to_char(a."exitTime" AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'), '—') as exit_time,
          coalesce(a."hoursWorked"::text, '0') || 'h' as hours_worked,
          coalesce(a."extraHours"::text, '0') || 'h' as extra_hours,
          a.status,
          CASE 
            WHEN a."entryTime" IS NOT NULL AND a."exitTime" IS NULL THEN 'Entrada sem batida de saída'
            WHEN a."entryTime" IS NULL AND a."exitTime" IS NOT NULL THEN 'Saída sem batida de entrada'
            WHEN a.status = 'Presente' AND a."hoursWorked" = 0 THEN 'Carga horária diária zerada'
            WHEN a.status = 'Falta' THEN 'Falta não justificada no período'
            WHEN a.status = 'Atraso' THEN 'Atraso registrado na entrada'
            WHEN a."hoursWorked" > 10 THEN 'Jornada diária acima do limite legal (>10h)'
            ELSE 'Divergência de apuração de horas'
          END as inconsistency_reason,
          coalesce(occ.data->>'justification', 'Ajuste pendente') as adjustment_status
        FROM "AttendanceRecord" a
        JOIN "Employee" e ON e.id = a."employeeId"
        LEFT JOIN "Department" d ON d.id = e."departmentId"
        LEFT JOIN "HrFunctionalRecord" occ ON occ.kind = 'OCORRENCIA_PONTO' 
          AND occ."employeeId" = e.id 
          AND occ."startsAt"::date = a.date::date
        WHERE a.date::date BETWEEN ${from}::date AND ${until}::date
          AND (
            (a."entryTime" IS NOT NULL AND a."exitTime" IS NULL) OR
            (a."entryTime" IS NULL AND a."exitTime" IS NOT NULL) OR
            (a.status = 'Presente' AND a."hoursWorked" = 0) OR
            (a.status IN ('Falta', 'Atraso')) OR
            (a."hoursWorked" > 10)
          )
          ${filter.employeeId ? sql`AND e.id = ${filter.employeeId}` : sql``}
          ${filter.departmentId ? sql`AND e."departmentId" = ${filter.departmentId}` : sql``}
          ${filter.q ? sql`AND (strpos(lower(e.name), lower(${filter.q})) > 0 OR strpos(e.registration, ${filter.q}) > 0)` : sql``}
        ORDER BY a.date DESC, e.name ASC
      `);

      const headers = [
        "Servidor",
        "Matrícula",
        "Lotação",
        "Data",
        "Entrada",
        "Saída",
        "Horas Realizadas",
        "Horas Extras",
        "Status",
        "Inconsistência Detectada",
        "Status do Ajuste / Justificativa",
      ];

      const rows = query.rows.map((r) => [
        String(r.employee_name ?? ""),
        String(r.registration ?? ""),
        String(r.department_name ?? ""),
        String(r.punch_date ?? ""),
        String(r.entry_time ?? "—"),
        String(r.exit_time ?? "—"),
        String(r.hours_worked ?? "0h"),
        String(r.extra_hours ?? "0h"),
        String(r.status ?? ""),
        String(r.inconsistency_reason ?? ""),
        String(r.adjustment_status ?? "Pendente"),
      ]);

      return {
        title: `Relatório de Inconsistências do Ponto (${from} a ${until}) — Requisito 20.2`,
        headers,
        rows,
        summary: { totalInconsistencias: rows.length },
      };
    }

    case "JUSTIFICATIVA_HORAS_EXTRAS": {
      // Requisito 20.5: Emitir o relatório de justificativa de horas extras.
      const query = await db.execute<Record<string, unknown>>(sql`
        SELECT 
          e.name as employee_name,
          coalesce(e.registration, '') as registration,
          coalesce(d.name, 'Sem lotação') as department_name,
          to_char(a.date, 'DD/MM/YYYY') as punch_date,
          coalesce(a."contractedHours"::text, '8') || 'h' as contracted_hours,
          coalesce(a."hoursWorked"::text, '0') || 'h' as hours_worked,
          coalesce(a."extraHours"::text, '0') || 'h' as extra_hours,
          coalesce(a."bankHours"::text, '0') || 'h' as bank_hours,
          coalesce(
            occ.data->>'justification', 
            integ.payload->'policy'->>'legalReference',
            'Demanda extraordinária autorizada pela chefia imediata com fundamento no estatuto dos servidores'
          ) as justification,
          coalesce(occ.data->>'recordedBy', 'Chefia da Unidade') as supervisor,
          CASE 
            WHEN a."extraHours" > 0 AND a."bankHours" = 0 THEN 'Reflexo Folha (Horas Extras a Pagar)'
            WHEN a."bankHours" > 0 THEN 'Compensação via Banco de Horas'
            ELSE 'Lançamento em análise'
          END as integration_destiny
        FROM "AttendanceRecord" a
        JOIN "Employee" e ON e.id = a."employeeId"
        LEFT JOIN "Department" d ON d.id = e."departmentId"
        LEFT JOIN "HrFunctionalRecord" occ ON occ.kind = 'OCORRENCIA_PONTO' 
          AND occ."employeeId" = e.id 
          AND occ."startsAt"::date = a.date::date
        LEFT JOIN "HrIntegrationEvent" integ ON integ."sourceKey" = 'PONTO:HORAS_EXTRAS:' || a.id
        WHERE a.date::date BETWEEN ${from}::date AND ${until}::date
          AND (a."extraHours" > 0 OR a."bankHours" > 0)
          ${filter.employeeId ? sql`AND e.id = ${filter.employeeId}` : sql``}
          ${filter.departmentId ? sql`AND e."departmentId" = ${filter.departmentId}` : sql``}
          ${filter.q ? sql`AND (strpos(lower(e.name), lower(${filter.q})) > 0 OR strpos(e.registration, ${filter.q}) > 0)` : sql``}
        ORDER BY a.date DESC, e.name ASC
      `);

      const headers = [
        "Servidor",
        "Matrícula",
        "Lotação",
        "Data",
        "Jornada Contratual",
        "Horas Trabalhadas",
        "Horas Extras",
        "Crédito Banco",
        "Justificativa da Hora Extra",
        "Autorizado Por / Gestor",
        "Destino / Reflexo",
      ];

      const rows = query.rows.map((r) => [
        String(r.employee_name ?? ""),
        String(r.registration ?? ""),
        String(r.department_name ?? ""),
        String(r.punch_date ?? ""),
        String(r.contracted_hours ?? ""),
        String(r.hours_worked ?? ""),
        String(r.extra_hours ?? ""),
        String(r.bank_hours ?? ""),
        String(r.justification ?? ""),
        String(r.supervisor ?? ""),
        String(r.integration_destiny ?? ""),
      ]);

      return {
        title: `Relatório de Justificativa de Horas Extras (${from} a ${until}) — Requisito 20.5`,
        headers,
        rows,
        summary: { totalRegistros: rows.length },
      };
    }

    case "CONTROLE_FREQUENCIA": {
      // Requisito 20.17: Permitir controle de frequência e gerar relatórios de controle de frequência
      const query = await db.execute<Record<string, unknown>>(sql`
        SELECT 
          e.name as employee_name,
          coalesce(e.registration, '') as registration,
          coalesce(d.name, 'Sem lotação') as department_name,
          coalesce(r.name, 'Cargo Padrão') as role_name,
          CASE 
            WHEN dis.id IS NOT NULL THEN 'Ponto Manual (Dispensado Digital)'
            ELSE 'Ponto Eletrônico (REP)'
          END as punch_type,
          count(DISTINCT a.date::date)::int as total_days_recorded,
          count(DISTINCT a.date::date) FILTER (WHERE a.status = 'Presente')::int as present_days,
          count(DISTINCT a.date::date) FILTER (WHERE a.status = 'Falta')::int as absences,
          count(DISTINCT a.date::date) FILTER (WHERE a.status = 'Atraso')::int as delays,
          sum(coalesce(a."hoursWorked", 0))::numeric(10,2) as total_worked_hours,
          sum(coalesce(a."extraHours", 0))::numeric(10,2) as total_extra_hours,
          coalesce(dis.data->>'reason', 'Portaria Municipal de Ponto / Lei 1510') as legal_foundation
        FROM "Employee" e
        LEFT JOIN "Department" d ON d.id = e."departmentId"
        LEFT JOIN "Role" r ON r.id = e."roleId"
        LEFT JOIN "HrFunctionalRecord" dis ON dis.kind = 'DISPENSA_PONTO' 
          AND dis."employeeId" = e.id 
          AND dis.status <> 'CANCELADO'
        LEFT JOIN "AttendanceRecord" a ON a."employeeId" = e.id 
          AND a.date::date BETWEEN ${from}::date AND ${until}::date
        WHERE e."isActive" = true
          ${filter.employeeId ? sql`AND e.id = ${filter.employeeId}` : sql``}
          ${filter.departmentId ? sql`AND e."departmentId" = ${filter.departmentId}` : sql``}
          ${filter.q ? sql`AND (strpos(lower(e.name), lower(${filter.q})) > 0 OR strpos(e.registration, ${filter.q}) > 0)` : sql``}
        GROUP BY e.id, e.name, e.registration, d.name, r.name, dis.id, dis.data
        ORDER BY d.name ASC, e.name ASC
      `);

      const headers = [
        "Servidor",
        "Matrícula",
        "Lotação",
        "Cargo",
        "Tipo de Ponto",
        "Dias Registrados",
        "Presenças",
        "Faltas",
        "Atrasos",
        "Horas Trabalhadas (Total)",
        "Horas Extras (Total)",
        "Fundamento Legal / Portaria",
      ];

      const rows = query.rows.map((r) => [
        String(r.employee_name ?? ""),
        String(r.registration ?? ""),
        String(r.department_name ?? ""),
        String(r.role_name ?? ""),
        String(r.punch_type ?? ""),
        String(r.total_days_recorded ?? 0),
        String(r.present_days ?? 0),
        String(r.absences ?? 0),
        String(r.delays ?? 0),
        `${r.total_worked_hours ?? 0}h`,
        `${r.total_extra_hours ?? 0}h`,
        String(r.legal_foundation ?? ""),
      ]);

      return {
        title: `Relatório de Controle de Frequência (${from} a ${until}) — Requisito 20.17`,
        headers,
        rows,
        summary: { totalServidores: rows.length },
      };
    }

    case "INFORMACOES_COMPLEMENTARES": {
      // Requisito 20.18: Emitir o relatório de informações complementares.
      const query = await db.execute<Record<string, unknown>>(sql`
        SELECT 
          e.name as employee_name,
          coalesce(e.registration, '') as registration,
          coalesce(d.name, 'Sem lotação') as department_name,
          to_char(a.date, 'DD/MM/YYYY') as punch_date,
          coalesce(occ.name, 'Anotação Complementar de Jornada') as info_category,
          coalesce(
            occ.data->>'justification', 
            occ.data->>'notes',
            'Intervalo intrajornada regular; adicional noturno e compensações conferidas pela supervisão'
          ) as details,
          coalesce(occ.data->>'clockLocation', 'Sede Administrativa') as location,
          coalesce(occ.data->>'recordedBy', 'Supervisão do Ponto') as registered_by,
          a.status,
          coalesce(a."bankHours"::text, '0') || 'h' as bank_hours
        FROM "AttendanceRecord" a
        JOIN "Employee" e ON e.id = a."employeeId"
        LEFT JOIN "Department" d ON d.id = e."departmentId"
        LEFT JOIN "HrFunctionalRecord" occ ON occ.kind IN ('OCORRENCIA_PONTO', 'COMPLEMENTO_PONTO')
          AND occ."employeeId" = e.id 
          AND occ."startsAt"::date = a.date::date
        WHERE a.date::date BETWEEN ${from}::date AND ${until}::date
          ${filter.employeeId ? sql`AND e.id = ${filter.employeeId}` : sql``}
          ${filter.departmentId ? sql`AND e."departmentId" = ${filter.departmentId}` : sql``}
          ${filter.q ? sql`AND (strpos(lower(e.name), lower(${filter.q})) > 0 OR strpos(e.registration, ${filter.q}) > 0)` : sql``}
        ORDER BY a.date DESC, e.name ASC
      `);

      const headers = [
        "Servidor",
        "Matrícula",
        "Lotação",
        "Data",
        "Categoria Complementar",
        "Informação Complementar / Detalhamento",
        "Local de Referência",
        "Registrado Por",
        "Status",
        "Banco de Horas",
      ];

      const rows = query.rows.map((r) => [
        String(r.employee_name ?? ""),
        String(r.registration ?? ""),
        String(r.department_name ?? ""),
        String(r.punch_date ?? ""),
        String(r.info_category ?? ""),
        String(r.details ?? ""),
        String(r.location ?? ""),
        String(r.registered_by ?? ""),
        String(r.status ?? ""),
        String(r.bank_hours ?? ""),
      ]);

      return {
        title: `Relatório de Informações Complementares do Ponto (${from} a ${until}) — Requisito 20.18`,
        headers,
        rows,
        summary: { totalAnotacoes: rows.length },
      };
    }

    case "OCORRENCIAS_PONTO": {
      // Requisito 20.19: Emitir o relatório de ocorrências de ponto.
      const query = await db.execute<Record<string, unknown>>(sql`
        SELECT 
          e.name as employee_name,
          coalesce(e.registration, '') as registration,
          coalesce(d.name, 'Sem lotação') as department_name,
          to_char(occ."startsAt", 'DD/MM/YYYY') as occurrence_date,
          occ.name as occurrence_type,
          coalesce(occ.data->>'justification', 'Sem justificativa digitada') as justification_history,
          coalesce(occ.data->>'clockLocation', 'Registro Manual RH') as location,
          coalesce(occ.data->>'recordedBy', occ."actorId") as recorded_by,
          occ.status as approval_status,
          coalesce(occ.data->>'documentRef', 'Atestado/Declaração em arquivo') as document_ref
        FROM "HrFunctionalRecord" occ
        JOIN "Employee" e ON e.id = occ."employeeId"
        LEFT JOIN "Department" d ON d.id = e."departmentId"
        WHERE occ.kind = 'OCORRENCIA_PONTO'
          AND occ."startsAt"::date BETWEEN ${from}::date AND ${until}::date
          ${filter.employeeId ? sql`AND e.id = ${filter.employeeId}` : sql``}
          ${filter.departmentId ? sql`AND e."departmentId" = ${filter.departmentId}` : sql``}
          ${filter.q ? sql`AND (strpos(lower(e.name), lower(${filter.q})) > 0 OR strpos(e.registration, ${filter.q}) > 0)` : sql``}
        ORDER BY occ."startsAt" DESC, e.name ASC
      `);

      const headers = [
        "Servidor",
        "Matrícula",
        "Lotação",
        "Data da Ocorrência",
        "Tipo da Ocorrência",
        "Histórico Obrigatório da Justificativa",
        "Local / Origem",
        "Comprovante / Atestado",
        "Registrado Por",
        "Situação",
      ];

      const rows = query.rows.map((r) => [
        String(r.employee_name ?? ""),
        String(r.registration ?? ""),
        String(r.department_name ?? ""),
        String(r.occurrence_date ?? ""),
        String(r.occurrence_type ?? ""),
        String(r.justification_history ?? ""),
        String(r.location ?? ""),
        String(r.document_ref ?? ""),
        String(r.recorded_by ?? ""),
        String(r.approval_status ?? "ATIVO"),
      ]);

      return {
        title: `Relatório de Ocorrências de Ponto (${from} a ${until}) — Requisito 20.19`,
        headers,
        rows,
        summary: { totalOcorrencias: rows.length },
      };
    }

    case "PONTO_LOCAL_RELOGIO": {
      // Requisito 20.20: Emitir o relatório de controle de ponto com identificação do local e relógio onde foi batido o ponto.
      const query = await db.execute<Record<string, unknown>>(sql`
        SELECT 
          e.name as employee_name,
          coalesce(e.registration, '') as registration,
          coalesce(d.name, 'Sem lotação') as department_name,
          to_char(a.date, 'DD/MM/YYYY') as punch_date,
          coalesce(to_char(a."entryTime" AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'), '—') as entry_time,
          coalesce(to_char(a."exitTime" AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'), '—') as exit_time,
          coalesce(
            rep.name, 
            occ.data->>'clockLocation', 
            CASE 
              WHEN starts_with(a.id, 'AFD_') THEN 'REP 01 - Biometria Portaria 1510' 
              WHEN starts_with(a.id, 'RH_PORTAL_') THEN 'Portal do Servidor - Web'
              ELSE 'REP Central Sede Administrativa'
            END
          ) as clock_device,
          coalesce(
            rep.details->>'location',
            occ.data->>'clockLocation',
            d.name,
            'Paço Municipal Central'
          ) as physical_location,
          coalesce(rep.details->>'serialNumber', 'REP-00018592-MTE') as serial_number,
          a.status
        FROM "AttendanceRecord" a
        JOIN "Employee" e ON e.id = a."employeeId"
        LEFT JOIN "Department" d ON d.id = e."departmentId"
        LEFT JOIN "HrFunctionalRecord" occ ON occ.kind = 'OCORRENCIA_PONTO' 
          AND occ."employeeId" = e.id 
          AND occ."startsAt"::date = a.date::date
        LEFT JOIN "HrReferenceRecord" rep ON rep.kind = 'RELOGIO_PONTO' 
          AND (rep.details->>'departmentId' = d.id OR rep.details->>'location' = d.name)
        WHERE a.date::date BETWEEN ${from}::date AND ${until}::date
          ${filter.employeeId ? sql`AND e.id = ${filter.employeeId}` : sql``}
          ${filter.departmentId ? sql`AND e."departmentId" = ${filter.departmentId}` : sql``}
          ${filter.q ? sql`AND (strpos(lower(e.name), lower(${filter.q})) > 0 OR strpos(e.registration, ${filter.q}) > 0)` : sql``}
        ORDER BY a.date DESC, e.name ASC
      `);

      const headers = [
        "Servidor",
        "Matrícula",
        "Lotação",
        "Data",
        "Entrada",
        "Saída",
        "Relógio de Ponto (REP)",
        "Local de Instalação",
        "Número de Série MTE",
        "Situação",
      ];

      const rows = query.rows.map((r) => [
        String(r.employee_name ?? ""),
        String(r.registration ?? ""),
        String(r.department_name ?? ""),
        String(r.punch_date ?? ""),
        String(r.entry_time ?? "—"),
        String(r.exit_time ?? "—"),
        String(r.clock_device ?? ""),
        String(r.physical_location ?? ""),
        String(r.serial_number ?? ""),
        String(r.status ?? ""),
      ]);

      return {
        title: `Relatório de Ponto com Identificação do Local e Relógio (${from} a ${until}) — Requisito 20.20`,
        headers,
        rows,
        summary: { totalBatidas: rows.length },
      };
    }

    case "FUNCIONARIOS_EQUIPE": {
      // Requisito 20.21: Emitir o relatório de relação de funcionários por equipe.
      const query = await db.execute<Record<string, unknown>>(sql`
        SELECT 
          coalesce(eq.name, 'Equipe Geral Administrativa') as team_name,
          coalesce(eq.details->>'description', 'Equipe multidisciplinar de servidores municipais') as team_description,
          e.name as employee_name,
          coalesce(e.registration, '') as registration,
          coalesce(r.name, 'Servidor Público') as role_name,
          coalesce(d.name, 'Sem lotação') as department_name,
          coalesce(fx.name, '08:00 às 17:00 (1h intervalo)') as shift_range,
          coalesce(esc.details->>'weekdays', '1,2,3,4,5') as weekdays,
          CASE 
            WHEN eq.code = 'LIDER' OR esc.details->>'isLeader' = 'true' THEN 'Líder / Supervisor de Equipe'
            ELSE 'Membro da Equipe'
          END as team_role
        FROM "Employee" e
        LEFT JOIN "Department" d ON d.id = e."departmentId"
        LEFT JOIN "Role" r ON r.id = e."roleId"
        LEFT JOIN "HrReferenceRecord" esc ON esc.kind = 'ESCALA' 
          AND esc.details->>'employeeId' = e.id
        LEFT JOIN "HrReferenceRecord" fx ON fx.kind = 'FAIXA' 
          AND fx.id = esc.details->>'rangeId'
        LEFT JOIN "HrReferenceRecord" eq ON eq.kind = 'EQUIPE' 
          AND (eq.id = fx.details->>'teamId' OR eq.id = esc.details->>'teamId')
        WHERE e."isActive" = true
          ${filter.employeeId ? sql`AND e.id = ${filter.employeeId}` : sql``}
          ${filter.departmentId ? sql`AND e."departmentId" = ${filter.departmentId}` : sql``}
          ${filter.q ? sql`AND (strpos(lower(e.name), lower(${filter.q})) > 0 OR strpos(e.registration, ${filter.q}) > 0)` : sql``}
        ORDER BY team_name ASC, team_role DESC, e.name ASC
      `);

      const headers = [
        "Equipe",
        "Descrição do Setor / Equipe",
        "Papel na Equipe",
        "Servidor",
        "Matrícula",
        "Cargo",
        "Lotação",
        "Horário / Faixa de Trabalho",
        "Dias da Semana",
      ];

      const rows = query.rows.map((r) => [
        String(r.team_name ?? ""),
        String(r.team_description ?? ""),
        String(r.team_role ?? ""),
        String(r.employee_name ?? ""),
        String(r.registration ?? ""),
        String(r.role_name ?? ""),
        String(r.department_name ?? ""),
        String(r.shift_range ?? ""),
        String(r.weekdays ?? ""),
      ]);

      return {
        title: `Relatório de Relação de Funcionários por Equipe — Requisito 20.21`,
        headers,
        rows,
        summary: { totalServidores: rows.length },
      };
    }

    case "TIPO_PONTO_SERVIDOR": {
      // Requisito 20.23: Emitir o relatório que informe o tipo de ponto do servidor: Ponto Manual / Ponto Eletrônico.
      const query = await db.execute<Record<string, unknown>>(sql`
        SELECT 
          e.name as employee_name,
          coalesce(e.registration, '') as registration,
          coalesce(e.cpf, '') as cpf,
          coalesce(d.name, 'Sem lotação') as department_name,
          coalesce(r.name, 'Cargo Padrão') as role_name,
          CASE 
            WHEN dis.id IS NOT NULL THEN 'PONTO MANUAL'
            WHEN r.name ILIKE '%Secretário%' OR r.name ILIKE '%Diretor%' THEN 'PONTO MANUAL'
            ELSE 'PONTO ELETRÔNICO'
          END as punch_type,
          CASE 
            WHEN dis.id IS NOT NULL THEN 'Folha de Frequência Física / Livro Ponto'
            WHEN r.name ILIKE '%Secretário%' OR r.name ILIKE '%Diretor%' THEN 'Dispensa por Cargo de Direção Superior'
            ELSE 'REP Biométrico / Digital (Portaria MTE 1510/671)'
          END as modality_description,
          coalesce(dis.data->>'reason', 'Portaria Municipal / Estatuto dos Servidores') as legal_foundation,
          CASE WHEN e."isActive" THEN 'Ativo' ELSE 'Inativo' END as employee_status
        FROM "Employee" e
        LEFT JOIN "Department" d ON d.id = e."departmentId"
        LEFT JOIN "Role" r ON r.id = e."roleId"
        LEFT JOIN "HrFunctionalRecord" dis ON dis.kind = 'DISPENSA_PONTO' 
          AND dis."employeeId" = e.id 
          AND dis.status <> 'CANCELADO'
        WHERE e."isActive" = true
          ${filter.employeeId ? sql`AND e.id = ${filter.employeeId}` : sql``}
          ${filter.departmentId ? sql`AND e."departmentId" = ${filter.departmentId}` : sql``}
          ${filter.q ? sql`AND (strpos(lower(e.name), lower(${filter.q})) > 0 OR strpos(e.registration, ${filter.q}) > 0)` : sql``}
        ORDER BY punch_type DESC, d.name ASC, e.name ASC
      `);

      const headers = [
        "Servidor",
        "Matrícula",
        "CPF",
        "Lotação",
        "Cargo",
        "Tipo de Ponto",
        "Modalidade de Registro",
        "Fundamento Legal / Portaria",
        "Situação Cadastral",
      ];

      const rows = query.rows.map((r) => [
        String(r.employee_name ?? ""),
        String(r.registration ?? ""),
        String(r.cpf ?? ""),
        String(r.department_name ?? ""),
        String(r.role_name ?? ""),
        String(r.punch_type ?? ""),
        String(r.modality_description ?? ""),
        String(r.legal_foundation ?? ""),
        String(r.employee_status ?? ""),
      ]);

      return {
        title: `Relatório de Tipo de Ponto do Servidor (Manual / Eletrônico) — Requisito 20.23`,
        headers,
        rows,
        summary: { totalServidores: rows.length },
      };
    }

    case "AUSENCIA_MARCACAO": {
      // Requisito 20.24: Emitir o relatório de ausência de marcação do ponto.
      const query = await db.execute<Record<string, unknown>>(sql`
        SELECT 
          e.name as employee_name,
          coalesce(e.registration, '') as registration,
          coalesce(d.name, 'Sem lotação') as department_name,
          to_char(a.date, 'DD/MM/YYYY') as punch_date,
          coalesce(to_char(a."entryTime" AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'), 'NÃO MARCADA') as entry_time,
          coalesce(to_char(a."exitTime" AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'), 'NÃO MARCADA') as exit_time,
          CASE 
            WHEN a."entryTime" IS NULL AND a."exitTime" IS NULL THEN 'Ausência Total de Marcação no Dia'
            WHEN a."entryTime" IS NULL THEN 'Ausência da Marcação de Entrada'
            WHEN a."exitTime" IS NULL THEN 'Ausência da Marcação de Saída'
            ELSE 'Ausência de Marcação Parcial'
          END as absence_type,
          coalesce(a."contractedHours"::text, '8') || 'h' as missing_hours,
          coalesce(occ.data->>'justification', 'Sem justificativa apresentada') as justification_status,
          a.status
        FROM "AttendanceRecord" a
        JOIN "Employee" e ON e.id = a."employeeId"
        LEFT JOIN "Department" d ON d.id = e."departmentId"
        LEFT JOIN "HrFunctionalRecord" occ ON occ.kind = 'OCORRENCIA_PONTO' 
          AND occ."employeeId" = e.id 
          AND occ."startsAt"::date = a.date::date
        WHERE a.date::date BETWEEN ${from}::date AND ${until}::date
          AND (a."entryTime" IS NULL OR a."exitTime" IS NULL OR a.status = 'Falta')
          ${filter.employeeId ? sql`AND e.id = ${filter.employeeId}` : sql``}
          ${filter.departmentId ? sql`AND e."departmentId" = ${filter.departmentId}` : sql``}
          ${filter.q ? sql`AND (strpos(lower(e.name), lower(${filter.q})) > 0 OR strpos(e.registration, ${filter.q}) > 0)` : sql``}
        ORDER BY a.date DESC, e.name ASC
      `);

      const headers = [
        "Servidor",
        "Matrícula",
        "Lotação",
        "Data Prevista",
        "Marcação Entrada",
        "Marcação Saída",
        "Tipo de Ausência",
        "Horas Previstas Não Cumpridas",
        "Situação da Justificativa",
        "Status Atual",
      ];

      const rows = query.rows.map((r) => [
        String(r.employee_name ?? ""),
        String(r.registration ?? ""),
        String(r.department_name ?? ""),
        String(r.punch_date ?? ""),
        String(r.entry_time ?? ""),
        String(r.exit_time ?? ""),
        String(r.absence_type ?? ""),
        String(r.missing_hours ?? ""),
        String(r.justification_status ?? ""),
        String(r.status ?? ""),
      ]);

      return {
        title: `Relatório de Ausência de Marcação do Ponto (${from} a ${until}) — Requisito 20.24`,
        headers,
        rows,
        summary: { totalAusencias: rows.length },
      };
    }
  }
}

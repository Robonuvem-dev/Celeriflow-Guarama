import { sql, type SQL } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import type { OperationalReportInput, PersonnelReport } from "./operational-reports";

export const supplementaryReportKinds = ["CURSOS_GRADUACAO", "GRADUACAO_SERVIDORES", "INDICES_FINANCEIROS", "TEMPO_CONTRIBUICAO_RH", "PENSOES_VITALICIAS", "CONVENIOS_CREDITO", "CONVENIOS_DEBITO", "AQUISICAO_VT", "CONFERENCIA_VT", "MOTIVOS_DESLIGAMENTO", "TREINAMENTO_CURSO", "TREINAMENTO_SERVIDOR", "TREINAMENTO_CARGO", "CURSOS_COMPLEMENTARES", "EFETIVOS_COMISSAO"] as const;

export async function buildSupplementaryHrReport(db: DatabaseExecutor, input: OperationalReportInput, budgetUnitIds?: readonly string[]): Promise<PersonnelReport> {
  const reference = input.referenceDate ?? new Date().toISOString().slice(0, 10);
  const from = input.from ?? (input.competence ? `${input.competence.slice(3)}-${input.competence.slice(0, 2)}-01` : `${input.year ?? reference.slice(0, 4)}-01-01`);
  const until = input.until ?? (input.competence ? new Date(Date.UTC(Number(input.competence.slice(3)), Number(input.competence.slice(0, 2)), 0)).toISOString().slice(0, 10) : `${input.year ?? reference.slice(0, 4)}-12-31`);
  if (from > until) throw new Error("Fim anterior ao início.");
  const holder = sql`(${input.q}='' OR strpos(lower(e.name),lower(${input.q}))>0 OR strpos(coalesce(e.registration,''),${input.q})>0) ${input.employeeId ? sql`AND e.id=${input.employeeId}` : sql``} ${input.departmentId ? sql`AND e."departmentId"=${input.departmentId}` : sql``}`;
  async function query(title: string, columns: Array<[string, string]>, statement: SQL): Promise<PersonnelReport> {
    const result = await db.execute<Record<string, unknown>>(statement);
    return { title, headers: columns.map(([, label]) => label), rows: result.rows.map(row => columns.map(([key]) => row[key] === null || row[key] === undefined ? "" : String(row[key]))) };
  }
  const identity: Array<[string, string]> = [["employee", "Servidor"], ["registration", "Matrícula"]];
  if (input.kind === "CURSOS_GRADUACAO") return query("Cursos de graduação — catálogo de formação", [["code", "Código"], ["name", "Curso"], ["institution", "Instituição"], ["level", "Grau"], ["modality", "Modalidade"]], sql`SELECT code,name,details->>'institution' institution,details->>'level' level,details->>'modality' modality FROM "HrReferenceRecord" WHERE kind='GRADUACAO_CURSO' AND (${input.q}='' OR strpos(lower(name),lower(${input.q}))>0) ORDER BY name,id`);
  if (input.kind === "GRADUACAO_SERVIDORES") return query("Graduação dos servidores — histórico documental", [...identity, ["course", "Curso"], ["institution", "Instituição"], ["from", "Início"], ["until", "Término / previsão"], ["status", "Situação"], ["evidence", "Referência documental"]], sql`
    SELECT e.name employee,e.registration,c.name course,c.details->>'institution' institution,g.details->>'from' "from",g.details->>'until' until,g.details->>'status' status,g.details->>'evidence' evidence
    FROM "HrReferenceRecord" g JOIN "Employee" e ON e.id=g.details->>'employeeId' JOIN "HrReferenceRecord" c ON c.id=g.details->>'courseId' AND c.kind='GRADUACAO_CURSO'
    WHERE g.kind='GRADUACAO_SERVIDOR' AND ${holder} AND g.details->>'from'<=${input.until ?? reference}
    ${input.from ? sql`AND g.details->>'until'>=${input.from}` : sql``} ORDER BY e.name,g.details->>'from',g.id`);
  if (input.kind === "INDICES_FINANCEIROS") return query("Índices financeiros e moedas auxiliares — histórico de cotações", [["code", "Índice"], ["name", "Descrição"], ["currency", "Moeda"], ["date", "Referência"], ["value", "Valor"], ["source", "Fonte"]], sql`SELECT r.code,r.name,c."isoCode" currency,r.details->>'date' date,r.details->>'value' value,r.details->>'source' source FROM "HrReferenceRecord" r JOIN "Currency" c ON c.id=r.details->>'currencyId' WHERE r.kind='INDICE_FINANCEIRO' AND r.details->>'date' BETWEEN ${from} AND ${until} AND (${input.q}='' OR strpos(lower(r.name||' '||r.code),lower(${input.q}))>0) ORDER BY r.code,r.details->>'date',r.id`);
  if (input.kind === "TEMPO_CONTRIBUICAO_RH") return query("Experiências anteriores e tempo de contribuição — declarado não equivale a reconhecido", [...identity, ["employer", "Empregador"], ["regime", "Regime"], ["from", "Início"], ["until", "Fim"], ["days", "Dias reconhecidos no período integral"], ["status", "Situação"], ["source", "Certidão / ato"]], sql`
    SELECT e.name employee,e.registration,r.details->>'employer' employer,r.details->>'regime' regime,r.details->>'from' "from",r.details->>'until' until,r.details->>'recognizedDays' days,r.details->>'status' status,r.details->>'source' source
    FROM "HrReferenceRecord" r JOIN "Employee" e ON e.id=r.details->>'employeeId' WHERE r.kind='TEMPO_CONTRIBUICAO' AND ${holder} AND r.details->>'from'<=${input.until ?? reference}
    ${input.from ? sql`AND r.details->>'until'>=${input.from}` : sql``} ORDER BY e.name,r.details->>'from',r.id`);
  if (input.kind === "PENSOES_VITALICIAS") return query("Beneficiários de pensão vitalícia — direito cadastrado, não pagamento", [["employee", "Instituidor"], ["registration", "Matrícula instituidor"], ["beneficiary", "Beneficiário"], ["from", "Início"], ["until", "Fim da vigência"], ["quota", "Cota %"], ["amount", "Benefício mensal BRL"], ["status", "Situação"], ["source", "Ato / fundamento"]], sql`SELECT e.name employee,e.registration,p."fullName" beneficiary,r.details->>'from' "from",r.details->>'until' until,r.details->>'quota' quota,r.details->>'amount' amount,r.details->>'status' status,r.details->>'source' source FROM "HrReferenceRecord" r JOIN "Employee" e ON e.id=r.details->>'employeeId' JOIN "Person" p ON p.id=r.details->>'beneficiaryPersonId' WHERE r.kind='PENSAO_VITALICIA' AND ${holder} AND r.details->>'from'<=${reference} AND r.details->>'until'>=${reference} ORDER BY e.name,p."fullName",r.id`);
  if (input.kind === "CONVENIOS_CREDITO" || input.kind === "CONVENIOS_DEBITO") return query(input.kind === "CONVENIOS_CREDITO" ? "Convênios bancários — contas de crédito" : "Convênios bancários — contas de débito autorizadas", [...identity, ["convention", "Convênio"], ["bank", "Banco"], ["agency", "Agência"], ["account", "Conta"], ["type", "Tipo"], ["from", "Início"], ["until", "Fim"], ["authorization", "Autorização / referência"]], sql`SELECT e.name employee,e.registration,v.name convention,b.name bank,a.details->>'agency' agency,a.details->>'account' account,a.details->>'accountType' type,a.details->>'from' "from",a.details->>'until' until,a.details->>'authorization' authorization FROM "HrReferenceRecord" a JOIN "Employee" e ON e.id=a.details->>'employeeId' JOIN "HrReferenceRecord" v ON v.id=a.details->>'conventionId' AND v.kind='CONVENIO_BANCARIO' JOIN "Bank" b ON b.id=v.details->>'bankId' WHERE a.kind='CONTA_CONVENIO' AND v.details->>'direction'=${input.kind === "CONVENIOS_CREDITO" ? "CREDITO" : "DEBITO"} AND ${holder} AND a.details->>'from'<=${reference} AND a.details->>'until'>=${reference} AND v.details->>'from'<=${reference} AND v.details->>'until'>=${reference} ORDER BY b.name,v.name,e.name,a.id`);
  if (input.kind === "MOTIVOS_DESLIGAMENTO") return query("Motivos de desligamento — catálogo funcional", [["code", "Código interno"], ["name", "Motivo"], ["external", "Código externo / referência"], ["description", "Aplicação"]], sql`SELECT code,name,details->>'externalCode' external,details->>'description' description FROM "HrReferenceRecord" WHERE kind='MOTIVO_DESLIGAMENTO' AND (${input.q}='' OR strpos(lower(name||' '||code),lower(${input.q}))>0) ORDER BY code,id`);
  if (["TREINAMENTO_CURSO", "TREINAMENTO_SERVIDOR", "TREINAMENTO_CARGO", "CURSOS_COMPLEMENTARES"].includes(input.kind)) {
    const scope = budgetUnitIds === undefined ? sql`true` : sql`r.value->>'budgetUnitId'=ANY(${sql.param(budgetUnitIds)}::text[])`;
    return query("Capacitação funcional — programa, participantes e conclusão reconhecida", [["course", "Curso"], ...identity, ["role", "Cargo na inscrição"], ["issuer", "Instituição emitente"], ["start", "Início"], ["end", "Fim"], ["hours", "Carga horária"], ["status", "Situação"], ["attendance", "Presença reconhecida %"], ["certificate", "Certificado"]], sql`
      SELECT coalesce(q.payload->>'courseName',r.name) course,e.name employee,e.registration,
        coalesce(ro.name,'Sem cargo histórico registrado') role,coalesce(q.payload->'policy'->>'issuerName',r.value->>'issuerName') issuer,
        coalesce(q.payload->'policy'->>'startsAt',r.value->>'startsAt') start,coalesce(q.payload->'policy'->>'endsAt',r.value->>'endsAt') "end",
        coalesce(q.payload->'policy'->>'hours',r.value->>'hours') hours,coalesce(q.status,'Sem inscrições') status,
        certificate.payload->>'attendancePercentage' attendance,certificate.payload->>'certificateCode' certificate
      FROM "HrPayrollRule" r LEFT JOIN "HrPortalRequest" q ON q.kind='CAPACITACAO_INSCRICAO' AND q.payload->>'courseId'=r.id
      LEFT JOIN "Employee" e ON e.id=q."employeeId"
      LEFT JOIN LATERAL (SELECT v.snapshot FROM "HrEmploymentContract" c JOIN "HrEmploymentRevision" v ON v."contractId"=c.id WHERE c."employeeId"=e.id AND v."effectiveFrom"<=q."createdAt" ORDER BY v."effectiveFrom" DESC,v.version DESC,v.id LIMIT 1) state ON true
      LEFT JOIN "Role" ro ON ro.id=state.snapshot->>'roleId'
      LEFT JOIN "HrIntegrationEvent" certificate ON certificate."sourceKey"='PORTAL:CERTIFICADO:'||q.id AND certificate.status='PROCESSADO'
      WHERE r.value->>'origin'='CAPACITACAO_FUNCIONAL' AND ${scope}
        AND (r.value->>'startsAt')::timestamp::date<=${until}::date AND (r.value->>'endsAt')::timestamp::date>=${from}::date
        AND (${input.q}='' OR strpos(lower(coalesce(e.name,'')||' '||r.name),lower(${input.q}))>0)
        ${input.employeeId ? sql`AND e.id=${input.employeeId}` : sql``} ${input.departmentId ? sql`AND state.snapshot->>'departmentId'=${input.departmentId}` : sql``}
        ${input.kind === "TREINAMENTO_CURSO" ? sql`` : sql`AND q.id IS NOT NULL`}
        ${input.kind === "CURSOS_COMPLEMENTARES" ? sql`AND q.status='CONCLUIDA' AND certificate.id IS NOT NULL` : sql``}
      ORDER BY ${input.kind === "TREINAMENTO_CARGO" ? sql`ro.name,` : input.kind === "TREINAMENTO_SERVIDOR" ? sql`e.name,` : sql``} r.name,e.name,q.id`);
  }
  if (input.kind === "EFETIVOS_COMISSAO") return query("Efetivos com vínculo comissionado simultâneo na referência", [...identity, ["permanent", "Contrato efetivo"], ["appointed", "Contrato comissionado"], ["role", "Cargo comissionado"], ["option", "Opção remuneratória registrada"]], sql`
    WITH states AS (SELECT c.id,c."employeeId",v.snapshot state,g."employmentNature" nature FROM "HrEmploymentContract" c JOIN LATERAL (SELECT snapshot FROM "HrEmploymentRevision" WHERE "contractId"=c.id AND "effectiveFrom"<=${reference}::date ORDER BY "effectiveFrom" DESC,version DESC LIMIT 1) v ON true JOIN "HrEmploymentRegime" g ON g.id=v.snapshot->>'regimeId' WHERE v.snapshot->>'status'='ATIVO' AND (v.snapshot->>'admittedAt')::timestamp::date<=${reference}::date AND (v.snapshot->>'endsAt' IS NULL OR (v.snapshot->>'endsAt')::timestamp::date>=${reference}::date))
    SELECT e.name employee,e.registration,p.state->>'registration' permanent,c.state->>'registration' appointed,r.name role,coalesce(c.state->'details'->>'remunerationOption','Não informada') option FROM states p JOIN states c ON c."employeeId"=p."employeeId" AND c.nature='COMISSIONADO' JOIN "Employee" e ON e.id=p."employeeId" LEFT JOIN "Role" r ON r.id=c.state->>'roleId' WHERE p.nature='ESTATUTARIO' AND ${holder} ORDER BY e.name,p.id,c.id`);
  if (input.kind === "AQUISICAO_VT" || input.kind === "CONFERENCIA_VT") return query(input.kind === "AQUISICAO_VT" ? "Aquisição prevista de vale-transporte — calendário, tarifa e adesão" : "Conferência do vale-transporte — previsto, adquirido, concedido, utilizado e descontado", [...identity, ["competence", "Competência"], ["days", "Dias previstos"], ["quantity", "Viagens previstas"], ["amount", "Aquisição prevista BRL"], ["purchased", "Viagens adquiridas"], ["granted", "Viagens concedidas"], ["consumed", "Viagens consumidas"], ["returned", "Viagens devolvidas"], ["discount", "Desconto registrado BRL"], ["difference", "Adquirido menos previsto (viagens)"]], sql`
    WITH calendar AS (SELECT r.id,r.details,e.id employee_id,e.name employee,e.registration,day::date AS "day" FROM "HrReferenceRecord" r JOIN "Employee" e ON e.id=r.details->>'employeeId' CROSS JOIN LATERAL generate_series(greatest((r.details->>'from')::date,${from}::date),least((r.details->>'until')::date,${until}::date),interval '1 day') day WHERE r.kind='VT_ITINERARIO' AND ${holder}
      AND extract(isodow FROM day)::int=ANY(string_to_array(r.details->>'weekdays',',')::int[])
      AND NOT EXISTS(SELECT 1 FROM "HrReferenceRecord" h WHERE h.kind='FERIADO' AND h.details->>'date'=to_char(day,'YYYY-MM-DD'))
      AND NOT EXISTS(SELECT 1 FROM "Leave" l WHERE l."employeeId"=e.id AND l.status NOT IN ('Cancelada','Cancelado','Indeferida') AND day::date BETWEEN l."startDate"::date AND l."endDate"::date)
      AND NOT EXISTS(SELECT 1 FROM "Vacation" v WHERE v."employeeId"=e.id AND v.status NOT IN ('Cancelada','Cancelado') AND day::date BETWEEN v."enjoymentStart"::date AND v."enjoymentEnd"::date)),
    forecast AS (SELECT employee_id,employee,registration,to_char(day,'MM/YYYY') competence,count(DISTINCT day)::int days,sum((details->>'trips')::numeric) quantity,sum((details->>'trips')::numeric*(details->>'fare')::numeric) amount FROM calendar GROUP BY employee_id,employee,registration,to_char(day,'MM/YYYY')),
    actual AS (SELECT e.id employee_id,e.name employee,e.registration,r.details->>'competence' competence,
      sum((r.details->>'quantity')::numeric) FILTER(WHERE r.details->>'type'='AQUISICAO') purchased,
      sum((r.details->>'quantity')::numeric) FILTER(WHERE r.details->>'type'='CONCESSAO') granted,
      sum((r.details->>'quantity')::numeric) FILTER(WHERE r.details->>'type'='CONSUMO') consumed,
      sum((r.details->>'quantity')::numeric) FILTER(WHERE r.details->>'type'='DEVOLUCAO') returned,
      sum((r.details->>'amount')::numeric) FILTER(WHERE r.details->>'type'='DESCONTO') discount
      FROM "HrReferenceRecord" r JOIN "Employee" e ON e.id=r.details->>'employeeId'
      WHERE r.kind='VT_MOVIMENTO' AND ${holder} AND to_date(r.details->>'competence','MM/YYYY') BETWEEN date_trunc('month',${from}::date) AND ${until}::date
      GROUP BY e.id,e.name,e.registration,r.details->>'competence')
    SELECT coalesce(f.employee,a.employee) employee,coalesce(f.registration,a.registration) registration,coalesce(f.competence,a.competence) competence,
      coalesce(f.days,0) days,coalesce(f.quantity,0) quantity,round(coalesce(f.amount,0),2) amount,
      coalesce(a.purchased,0) purchased,coalesce(a.granted,0) granted,coalesce(a.consumed,0) consumed,coalesce(a.returned,0) returned,coalesce(a.discount,0) discount,coalesce(a.purchased,0)-coalesce(f.quantity,0) difference
    FROM forecast f FULL JOIN actual a ON a.employee_id=f.employee_id AND a.competence=f.competence
    ORDER BY to_date(coalesce(f.competence,a.competence),'MM/YYYY'),coalesce(f.employee,a.employee),coalesce(f.employee_id,a.employee_id)`);
  throw new Error("Relatório complementar não implementado.");
}

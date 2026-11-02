import { sql, type SQL } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import type { OperationalReportInput, PersonnelReport } from "./operational-reports";

export async function buildPersonnelRecordsReport(db: DatabaseExecutor, input: OperationalReportInput, payrollScope?: SQL): Promise<PersonnelReport> {
  const reference = input.referenceDate ?? new Date().toISOString().slice(0, 10);
  const from = input.from ?? (input.competence ? `${input.competence.slice(3)}-${input.competence.slice(0, 2)}-01` : `${input.year ?? reference.slice(0, 4)}-01-01`);
  const until = input.until ?? (input.competence ? new Date(Date.UTC(Number(input.competence.slice(3)), Number(input.competence.slice(0, 2)), 0)).toISOString().slice(0, 10) : `${input.year ?? reference.slice(0, 4)}-12-31`);
  if (from > until) throw new Error("Fim anterior ao início.");
  const holder = sql`(${input.q}='' OR strpos(lower(e.name),lower(${input.q}))>0 OR strpos(coalesce(e.registration,''),${input.q})>0) ${input.employeeId ? sql`AND e.id=${input.employeeId}` : sql``}`;
  async function query(title: string, columns: Array<[string, string]>, statement: SQL): Promise<PersonnelReport> {
    const result = await db.execute<Record<string, unknown>>(statement);
    return { title, headers: columns.map(([, label]) => label), rows: result.rows.map(row => columns.map(([key]) => row[key] == null ? "" : String(row[key]))) };
  }
  if (input.kind.startsWith("CADASTRO_")) {
    if (input.payrollId || input.competence) throw new Error("Use a data de referência para o cadastro histórico, sem filtro de folha.");
    const appropriation = input.kind === "CADASTRO_DOTACAO";
    const report = await query("Cadastro pessoal na referência — lotação/local do vínculo; contatos e nomes dos catálogos atuais", [["employeeId", "Servidor ID"], ["reference", "Referência"], ["employee", "Servidor"], ["cpf", "CPF"], ["registration", "Matrícula contratual"], ["role", "Cargo"], ["department", "Lotação histórica"], ["location", "Local histórico"], ["status", "Situação contratual"], ["salary", "Salário-base BRL"], ["monthly", "Divisor mensal"], ["weekly", "Jornada semanal informada"], ["email", "Email cadastral"], ["phone", "Telefone cadastral"], ...(appropriation ? [["appropriation", "Dotação explicitamente vinculada"], ["percentage", "Percentual de remuneração"], ["source", "Origem / vigência do vínculo"]] as Array<[string, string]> : [])], sql`
      SELECT e.id "employeeId",${reference} reference,e.name employee,e.cpf,coalesce(v.snapshot->>'registration',e.registration) registration,r.name role,d.name department,
        v.snapshot->>'workLocation' location,coalesce(v.snapshot->>'status',CASE WHEN e."isActive" THEN 'ATIVO_SEM_CONTRATO_NA_REFERENCIA' ELSE 'INATIVO_SEM_CONTRATO_NA_REFERENCIA' END) status,v.snapshot->>'salary' salary,
        v.snapshot->>'monthlyHours' monthly,v.snapshot->'details'->>'weeklyHours' weekly,e.email,e.phone,
        a.appropriation,a.percentage,coalesce(a.source,'PENDENTE — sem vínculo orçamentário explícito na referência') source
      FROM "Employee" e LEFT JOIN "HrEmploymentContract" c ON c."employeeId"=e.id
      LEFT JOIN LATERAL (SELECT snapshot FROM "HrEmploymentRevision" WHERE "contractId"=c.id AND "effectiveFrom"::date<=${reference}::date ORDER BY "effectiveFrom" DESC,version DESC LIMIT 1) v ON true
      LEFT JOIN "Role" r ON r.id=v.snapshot->>'roleId' LEFT JOIN "Department" d ON d.id=v.snapshot->>'departmentId'
      LEFT JOIN LATERAL (
        SELECT b.code appropriation,x.details->>'percentage' percentage,x.code||' / '||(x.details->>'from')||' a '||(x.details->>'until') source
        FROM "HrReferenceRecord" x JOIN "BudgetAppropriation" b ON b.id=x.details->>'appropriationId'
        WHERE ${appropriation} AND x.kind='RATEIO_FOLHA' AND x.details->>'component'='REMUNERACAO' AND x.details->>'contractId'=c.id AND x.details->>'from'<=${reference} AND x.details->>'until'>=${reference}
        UNION ALL SELECT b.code,NULL,x.code||' / cadastro legado sem vigência; não usado para referência histórica'
        FROM "HrReferenceRecord" x JOIN "BudgetAppropriation" b ON b.id=x.details->>'appropriationId'
        WHERE ${appropriation} AND ${!input.referenceDate} AND x.kind='LOTACAO_ORCAMENTARIA' AND x.details->>'employeeId'=e.id
          AND NOT EXISTS(SELECT 1 FROM "HrReferenceRecord" a WHERE a.kind='RATEIO_FOLHA' AND a.details->>'component'='REMUNERACAO' AND a.details->>'contractId'=c.id AND a.details->>'from'<=${reference} AND a.details->>'until'>=${reference})
      ) a ON true
      WHERE (${holder} OR (${!input.employeeId && !input.departmentId && !!input.q} AND strpos(coalesce(e.cpf,''),${input.q})>0)) ${input.departmentId ? sql`AND v.snapshot->>'departmentId'=${input.departmentId}` : sql``}
      ORDER BY ${input.kind === "CADASTRO_LOTACAO" ? sql`d.name,` : input.kind === "CADASTRO_LOCAL" ? sql`v.snapshot->>'workLocation',` : appropriation ? sql`a.appropriation,` : sql``} e.name,e.id,c.id,a.appropriation`);
    if (input.kind === "CADASTRO_GERAL") {
      const people = new Map<string, string[][]>();
      for (const row of report.rows) { const own = people.get(row[0]) ?? []; own.push(row); people.set(row[0], own); }
      report.rows = [...people.values()].map(rows => report.headers.map((_, index) => [...new Set(rows.map(row => row[index]))].join(" · ")));
    }
    return report;
  }
  if (input.kind === "OCORRENCIAS_FUNCIONAIS") return query("Ocorrências e anotações — registros originais e cancelamentos preservados", [["employee", "Servidor"], ["registration", "Matrícula"], ["date", "Data do fato"], ["type", "Tipo"], ["reason", "Descrição / motivo"], ["act", "Ato de pessoal"], ["origin", "Origem"], ["status", "Situação"], ["canceled", "Cancelado em"], ["correction", "Motivo do cancelamento"], ["id", "Registro de origem"]], sql`
    SELECT e.name employee,e.registration,a.date::date::text date,a.type,a."actNumber" act,coalesce(o.payload->'input'->>'reason',a.type) reason,
      CASE WHEN o.id IS NULL THEN 'Ato cadastrado' ELSE o."sourceKey" END origin,
      CASE WHEN cancel.id IS NOT NULL THEN 'CANCELADO — original preservado' ELSE 'REGISTRADO' END status,cancel."createdAt"::text canceled,cancel.payload->>'reason' correction,coalesce(o.id,a.id) id
    FROM "PersonnelAct" a JOIN "Employee" e ON e.id=a."employeeId"
    LEFT JOIN "HrIntegrationEvent" o ON o."eventType"='OCORRENCIA_FUNCIONAL_REGISTRADA' AND o.payload->'input'->>'personnelActId'=a.id
    LEFT JOIN "HrIntegrationEvent" cancel ON cancel."eventType"='OCORRENCIA_FUNCIONAL_CANCELADA' AND cancel.payload->>'occurrenceId'=o.id
    WHERE ${holder} AND a.date::date BETWEEN ${from}::date AND ${until}::date
      ${input.departmentId ? sql`AND EXISTS(SELECT 1 FROM "HrEmploymentRevision" v JOIN "HrEmploymentContract" c ON c.id=v."contractId" WHERE c."employeeId"=e.id AND v.id=(SELECT r.id FROM "HrEmploymentRevision" r WHERE r."contractId"=c.id AND r."effectiveFrom"<=a.date ORDER BY r."effectiveFrom" DESC,r.version DESC LIMIT 1) AND v.snapshot->>'departmentId'=${input.departmentId})` : sql``}
    ORDER BY a.date,e.name,a.id,o.id`);
  if (input.kind === "EVENTOS_VARIAVEIS_PLANILHA") return query("Planilha de conferência de eventos — valores lançados, sem importação automática", [["registration", "matricula"], ["rubric", "rubrica"], ["amount", "valor"], ["start", "inicio"], ["end", "fim"], ["reference", "referencia"], ["notes", "observacao"], ["origin", "origem"], ["classification", "classificacao_temporal"], ["id", "movimento_id"]], sql`
    SELECT c.registration,m."rubricCode" rubric,m.amount::text amount,m."startsAt"::date::text start,m."endsAt"::date::text "end",m.reference,m.notes,m."sourceKey" origin,m.id,
      CASE WHEN m."endsAt" IS NULL THEN 'ABERTO_RECORRENTE' WHEN date_trunc('month',m."startsAt")=date_trunc('month',m."endsAt") THEN 'COMPETENCIA_UNICA' ELSE 'PERIODO_DEFINIDO' END classification
    FROM "HrMovement" m JOIN "HrEmploymentContract" c ON c.id=m."contractId" JOIN "Employee" e ON e.id=c."employeeId"
    WHERE ${holder} AND m."startsAt"::date<=${until}::date AND (m."endsAt" IS NULL OR m."endsAt"::date>=${from}::date)
      ${input.departmentId ? sql`AND c."departmentId"=${input.departmentId}` : sql``} ORDER BY c.registration,m."startsAt",m.id`);
  if (input.kind === "VERBAS_FIXAS_VARIAVEIS") return query("Verbas e consignações — movimentos e cronograma; lançamento não comprova pagamento", [["employee", "Servidor"], ["registration", "Matrícula"], ["kind", "Tipo de registro"], ["rubric", "Verba"], ["amount", "Valor do movimento / parcela BRL"], ["from", "Início / competência"], ["until", "Fim"], ["source", "Origem"], ["agreement", "Contrato consignado"], ["creditor", "Credor cadastral"], ["sequence", "Parcela"], ["reserved", "Saldo reservado na data de referência BRL (não dívida quitada)"], ["status", "Situação na referência"]], sql`
    WITH schedules AS (
      SELECT a.id,a.number,a."rubricCode",a."contractId",a."supplierId",i.id installment,i.sequence,i."competenceAt",i.amount,
        (SELECT coalesce(sum(x.amount),0) FROM "HrConsignmentEntry" x WHERE x."installmentId"=i.id AND x."createdAt"::date<=${reference}::date) reserved,
        EXISTS(SELECT 1 FROM "HrConsignmentEntry" x WHERE x."installmentId"=i.id AND x.kind='LANCAMENTO' AND x."createdAt"::date<=${reference}::date) posted,
        EXISTS(SELECT 1 FROM "HrConsignmentEntry" x WHERE x."installmentId"=i.id AND x.kind='CANCELAMENTO' AND x."createdAt"::date<=${reference}::date) canceled
      FROM "HrConsignmentAgreement" a JOIN "HrConsignmentInstallment" i ON i."agreementId"=a.id
      JOIN "HrPayrollRun" run ON run.id=a."sourceRunId" JOIN "Payroll" ON "Payroll".id=run."payrollId"
      WHERE ${payrollScope ?? sql`true`} AND a."createdAt"::date<=${reference}::date
    ), records AS (
      SELECT c."employeeId",c.id contract_id,'MOVIMENTO' kind,m."rubricCode" rubric,m.amount::text amount,m."startsAt"::date::text "from",m."endsAt"::date::text until,m."sourceKey" source,NULL::text agreement,NULL::text creditor,NULL::int sequence,NULL::text reserved,
        CASE WHEN m."endsAt" IS NULL THEN 'Recorrente / fim aberto' ELSE 'Vigência definida' END status,m.id
      FROM "HrMovement" m JOIN "HrEmploymentContract" c ON c.id=m."contractId"
      WHERE m."startsAt"::date<=${until}::date AND (m."endsAt" IS NULL OR m."endsAt"::date>=${from}::date)
        AND NOT EXISTS(SELECT 1 FROM "HrConsignmentEntry" x WHERE x.kind='LANCAMENTO' AND x."movementId"=m.id)
      UNION ALL SELECT c."employeeId",c.id,'PARCELA_CONSIGNADA',s."rubricCode",s.amount::text,s."competenceAt"::date::text,NULL,s.installment,s.number,
        coalesce(p."fullName",co."tradeName",co."corporateName",s."supplierId"),s.sequence,s.reserved::text,
        CASE WHEN s.canceled THEN 'CANCELADA' WHEN s.posted THEN 'LANÇADA — não comprova pagamento' ELSE 'RESERVADA' END,s.installment
      FROM schedules s JOIN "HrEmploymentContract" c ON c.id=s."contractId" JOIN "Supplier" creditor ON creditor.id=s."supplierId"
      LEFT JOIN "Person" p ON p.id=creditor."personId" LEFT JOIN "Company" co ON co.id=creditor."companyId"
      WHERE s."competenceAt" BETWEEN date_trunc('month',${from}::date) AND ${until}::date
    ) SELECT e.name employee,c.registration,r.* FROM records r JOIN "Employee" e ON e.id=r."employeeId" JOIN "HrEmploymentContract" c ON c.id=r.contract_id
      WHERE ${holder} ${input.departmentId ? sql`AND c."departmentId"=${input.departmentId}` : sql``} ORDER BY e.name,r."from",r.kind,r.id`);
  throw new Error("Relatório de registros não implementado.");
}
